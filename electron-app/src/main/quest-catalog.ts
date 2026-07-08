import { dashboardStore } from './store'
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
      fields?: Record<string, { stringValue?: string; integerValue?: string; doubleValue?: number }>
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

    items.push({ id, name, period, targetCount, category, order })
  }

  // order → 이름 순 정렬 후 order 필드 제거
  items.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'ko'))
  return items.map(({ id, name, period, targetCount, category }) => ({
    id,
    name,
    period,
    targetCount,
    category
  }))
}

/** Firestore에서 quests 컬렉션을 읽는다. 실패 시 throw. */
export async function fetchQuestCatalog(projectId: string): Promise<QuestCatalogItem[]> {
  const url =
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` +
    `/databases/(default)/documents/quests?pageSize=300`

  const res = await fetch(url, { signal: AbortSignal.timeout(FIRESTORE_TIMEOUT_MS) })
  if (!res.ok) {
    throw new Error(`Firestore 응답 오류 (HTTP ${res.status}) — 프로젝트 ID/읽기 규칙 확인`)
  }
  return parseQuestDocuments(await res.json())
}

/** 설정된 프로젝트에서 카탈로그를 가져와 전체 캐릭터에 동기화 */
export async function syncQuestCatalogOnce(): Promise<CatalogSyncResult> {
  const { settings } = dashboardStore.getState()
  const projectId = settings.firebaseProjectId?.trim()
  if (!projectId) {
    return { ok: false, message: 'Firebase 프로젝트 ID가 설정되지 않았습니다' }
  }

  try {
    const catalog = await fetchQuestCatalog(projectId)
    if (catalog.length === 0) {
      return { ok: false, message: 'quests 컬렉션이 비어 있거나 읽을 수 없습니다' }
    }
    const { added, updated } = dashboardStore.syncQuestCatalog(catalog)
    return {
      ok: true,
      message: `카탈로그 ${catalog.length}개 동기화 완료 (추가 ${added} · 갱신 ${updated})`,
      added,
      updated
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('[catalog] 동기화 실패:', msg)
    return { ok: false, message: `동기화 실패: ${msg}` }
  }
}
