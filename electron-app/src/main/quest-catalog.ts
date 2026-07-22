import { dashboardStore } from './store'
import { getFirestoreDocument } from './firestore-rest'
import {
  isQuestCategory,
  type CatalogSyncResult,
  type QuestCatalogItem,
  type TaskPeriod
} from '../shared/types'

/**
 * Firestore 퀘스트 카탈로그 연동 (#4).
 *
 * 데이터 계약:
 * - 컬렉션: `quests` (공개 읽기 규칙 필요)
 * - 문서 필드: { name: string, period: 'daily'|'weekly', order?: number,
 *               targetCount?: number, category?: '전투'|'물물교환'|'알바' }
 * - 문서 id가 catalogId로 사용된다
 *
 * 인증 없는 REST 읽기만 사용 — API 키/SDK 불필요.
 */

const FIRESTORE_TIMEOUT_MS = 10_000

/** Firestore REST 응답(documents 배열)을 카탈로그 항목으로 파싱 (순수 함수 — 테스트 대상) */
export function parseQuestDocuments(body: unknown): QuestCatalogItem[] {
  const documents = (body as { documents?: unknown[] })?.documents
  if (!Array.isArray(documents)) return []

  const items: Array<QuestCatalogItem & { order: number }> = []
  for (const doc of documents) {
    const d = doc as {
      name?: string
      fields?: Record<
        string,
        { stringValue?: string; integerValue?: string; doubleValue?: number; booleanValue?: boolean }
      >
    }
    if (!d.name || !d.fields) continue

    const id = d.name.split('/').pop()
    const name = d.fields.name?.stringValue?.trim()
    if (!id || !name) continue // 필수 필드 없는 문서는 스킵

    const periodRaw = d.fields.period?.stringValue
    const period: TaskPeriod = periodRaw === 'weekly' ? 'weekly' : 'daily'

    const order = d.fields.order
      ? Number(d.fields.order.integerValue ?? d.fields.order.doubleValue ?? 0)
      : Number.MAX_SAFE_INTEGER // order 없으면 뒤로

    // 카운트형 퀘스트 (#7): targetCount ≥ 2면 N회 반복 퀘스트
    const targetRaw = d.fields.targetCount
      ? Number(d.fields.targetCount.integerValue ?? d.fields.targetCount.doubleValue ?? 1)
      : 1
    const targetCount = Number.isFinite(targetRaw) ? Math.max(1, Math.floor(targetRaw)) : 1

    // 카테고리 태그 (#13) — 허용 목록 외 값은 무시
    const categoryRaw = d.fields.category?.stringValue?.trim()
    const category = isQuestCategory(categoryRaw) ? categoryRaw : null

    // 지역 태그 (#24) — 자유 문자열
    const location = d.fields.location?.stringValue?.trim() || null

    // 주간 풀형 퀘스트 (검은/심층 구멍)
    const dailyPool = d.fields.dailyPool?.booleanValue === true

    // 연동 퀘스트 — 이 일일 퀘스트의 체크가 linkedTo(주간 문서 id) 카운트에 ±1 반영
    const linkedCatalogId = d.fields.linkedTo?.stringValue?.trim() || null

    // 레이드 보스 퀘스트 여부 (#raid-flag) — 대시보드 '레이드' 섹션 대상 판정용
    const isRaid = d.fields.isRaid?.booleanValue === true

    items.push({
      id,
      name,
      period,
      targetCount,
      category,
      location,
      dailyPool,
      linkedCatalogId,
      order,
      isRaid
    })
  }

  // order → 이름 순 정렬 (order는 그대로 캐릭터 태스크에 저장돼 관리 화면/오버레이 정렬에 쓰인다 #quest-order)
  items.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'ko'))
  return items.map(
    ({ id, name, period, targetCount, category, location, dailyPool, linkedCatalogId, order, isRaid }) => ({
      id,
      name,
      period,
      targetCount,
      category,
      location,
      dailyPool,
      linkedCatalogId,
      order,
      isRaid
    })
  )
}

/** 추천 퀘스트 컬렉션 이름 (#15) — quests와 동일한 문서 형식 */
const RECOMMENDED_COLLECTION = 'recommended_quests'

/** Firestore에서 퀘스트 형식 컬렉션을 읽는다. 실패 시 throw. */
async function fetchQuestCollection(
  projectId: string,
  collection: string
): Promise<QuestCatalogItem[]> {
  const url =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    `/databases/(default)/documents/${encodeURIComponent(collection)}?pageSize=300`

  const res = await fetch(url, { signal: AbortSignal.timeout(FIRESTORE_TIMEOUT_MS) })
  if (!res.ok) {
    throw new Error(`Firestore 응답 오류 (HTTP ${res.status}) — 프로젝트 ID/읽기 규칙 확인`)
  }
  return parseQuestDocuments(await res.json())
}

export async function fetchQuestCatalog(projectId: string): Promise<QuestCatalogItem[]> {
  return fetchQuestCollection(projectId, 'quests')
}

/** 빌드 시 .env(MAIN_VITE_FIREBASE_PROJECT_ID)에서 주입되는 기본 프로젝트 ID (#14). git 미포함 */
const DEFAULT_PROJECT_ID: string | null = import.meta.env.MAIN_VITE_FIREBASE_PROJECT_ID ?? null

/** 유효 프로젝트 ID 해석 — 설정 UI 입력값 > .env 기본값. cloud-sync.ts(#26)와 공유 */
export function getEffectiveProjectId(): string | null {
  const { settings } = dashboardStore.getState()
  return settings.firebaseProjectId?.trim() || DEFAULT_PROJECT_ID
}

/** .env 기본값만 반환 (설정 UI 입력값 제외) — 입력창에 기본값을 표시하는 용도 */
export function getDefaultProjectId(): string | null {
  return DEFAULT_PROJECT_ID
}

/** 설정된 프로젝트에서 카탈로그를 가져와 전체 캐릭터에 동기화.
 *  우선순위: 설정 UI 입력값 > .env 기본값 */
export async function syncQuestCatalogOnce(): Promise<CatalogSyncResult> {
  const projectId = getEffectiveProjectId()
  if (!projectId) {
    return { ok: false, message: 'Firebase 프로젝트 ID가 설정되지 않았습니다' }
  }

  try {
    const catalog = await fetchQuestCatalog(projectId)
    if (catalog.length === 0) {
      return { ok: false, message: 'quests 컬렉션이 비어 있거나 읽을 수 없습니다' }
    }
    const { added, updated, removed, addedNames, removedNames } =
      dashboardStore.syncQuestCatalog(catalog)

    // 추천 퀘스트 목록(#15)도 함께 갱신 — 실패해도 본 동기화 결과에는 영향 없음
    let recommendedNote = ''
    try {
      const recommended = await fetchQuestCollection(projectId, RECOMMENDED_COLLECTION)
      dashboardStore.setRecommendedQuests(recommended)
      if (recommended.length > 0) recommendedNote = ` · 추천 ${recommended.length}개`
    } catch (e) {
      console.warn('[catalog] 추천 목록 갱신 실패 (기존 캐시 유지):', e)
    }

    return {
      ok: true,
      message: `카탈로그 ${catalog.length}개 동기화 완료 (추가 ${added} · 갱신 ${updated} · 삭제 ${removed})${recommendedNote}`,
      added,
      updated,
      removed,
      addedNames,
      removedNames
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[catalog] 동기화 실패:', msg)
    return { ok: false, message: `동기화 실패: ${msg}` }
  }
}

/** 카탈로그 변경 감지용 메타 문서 (#catalog-watch) — quests/recommended_quests와 동일한
 *  공개 읽기 규칙이 `meta/{document=**}` 경로에도 필요하다. 관리자가 quests 컬렉션을
 *  고칠 때마다 이 문서의 CATALOG_META_FIELD 필드(문자열/숫자/timestamp 아무 타입이나)도
 *  반드시 함께 갱신해야 변경이 감지된다 — 값 자체의 의미는 없고 "달라졌는지"만 비교한다.
 *  필드 이름은 고정이어야 한다(예전엔 아무 이름이나 된다고 안내했으나 실수 — 이름이
 *  바뀌면 값을 못 읽어서 항상 폴백(전체 동기화)로 빠진다). */
const CATALOG_META_PATH = 'meta/catalog'
const CATALOG_META_FIELD = 'questsUpdatedAt'

async function fetchCatalogMetaUpdatedAt(projectId: string): Promise<string | number | null> {
  const doc = await getFirestoreDocument(projectId, CATALOG_META_PATH)
  const value = doc?.[CATALOG_META_FIELD]
  return typeof value === 'string' || typeof value === 'number' ? value : null
}

/**
 * meta/catalog 문서의 updatedAt만 먼저 읽어(read 1회) 이전에 본 값과 다를 때만
 * quests 전체를 다시 동기화한다 (#catalog-watch). 앱 시작 시 + 주기적 백그라운드
 * 체크에서 사용 — 수동 동기화 버튼(catalog:sync)은 항상 전체를 동기화하므로 이 함수를
 * 거치지 않는다.
 * 메타 문서가 없거나(관리자가 아직 안 만든 경우) 필드가 비어 있으면 안전하게
 * 매번 전체 동기화로 폴백한다.
 * @returns 변경이 없어 스킵했으면 null, 동기화를 시도했으면 그 결과
 */
export async function syncQuestCatalogIfChanged(): Promise<CatalogSyncResult | null> {
  const projectId = getEffectiveProjectId()
  if (!projectId) return null

  let metaUpdatedAt: string | number | null = null
  try {
    metaUpdatedAt = await fetchCatalogMetaUpdatedAt(projectId)
  } catch (e) {
    console.warn('[catalog] 변경 확인용 메타 문서 읽기 실패 (전체 동기화로 폴백):', e)
  }

  const lastKnown = dashboardStore.getLastCatalogMetaAt()
  if (metaUpdatedAt !== null && lastKnown !== null && metaUpdatedAt === lastKnown) {
    return null // 변경 없음 확인됨 — 전체 재조회 생략
  }

  const result = await syncQuestCatalogOnce()
  if (result.ok && metaUpdatedAt !== null) {
    dashboardStore.markCatalogMetaAt(metaUpdatedAt)
  }
  return result
}
