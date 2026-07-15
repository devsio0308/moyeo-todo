/**
 * 게임계정 ID 기반 Firestore 동기화 (#26).
 * 인증 없이 계정 ID를 문서 키로 사용 — 같은 사람이 여러 기기(웹 오버레이 포함)에서
 * 같은 ID로 접속하면 같은 데이터가 보이게 하는 것이 목적. Firestore 규칙은
 * players/{id}에 대해 영구적으로 공개 read/write여야 한다 (README 참고).
 *
 * 충돌 정책: 시작 시 원격 updatedAt이 로컬이 마지막으로 알던 값과 다르면
 * 원격 우선으로 pull 하고 나서야 푸시를 허용한다 — 꺼져 있던 기기가 켜지면서
 * 낡은 로컬 상태로 다른 기기의 변경을 덮어쓰는 사고 방지.
 */

import { dashboardStore } from './store'
import { getEffectiveProjectId } from './quest-catalog'
import { getFirestoreDocument, putFirestoreDocument } from './firestore-rest'
import type { CloudPlayerData, CloudRegisterResult, CloudSyncResult } from '../shared/types'

function playerDocPath(gameAccountId: string): string {
  return `players/${encodeURIComponent(gameAccountId)}`
}

/** 시작 시 화해(reconcile)가 끝나기 전에는 푸시를 내보내지 않는 게이트 */
let startupGate: Promise<unknown> = Promise.resolve()

export type ReconcileResult = 'pulled' | 'up-to-date' | 'skipped'

/**
 * 시작 시 1회: 원격 updatedAt이 로컬이 마지막으로 알던 값과 다르면
 * 다른 기기가 그 사이 썼다는 뜻 — 원격 우선으로 pull 한다.
 * 게이트를 동기적으로 설정하므로 푸시를 유발할 수 있는 어떤 코드보다 먼저 호출할 것.
 */
export function reconcileCloudSyncOnStartup(): Promise<ReconcileResult> {
  const run = (async (): Promise<ReconcileResult> => {
    const { settings } = dashboardStore.getState()
    const gameAccountId = settings.gameAccountId?.trim()
    const projectId = getEffectiveProjectId()
    if (!gameAccountId || !projectId) return 'skipped'

    const remote = (await getFirestoreDocument(
      projectId,
      playerDocPath(gameAccountId)
    )) as unknown as CloudPlayerData | null
    if (!remote || typeof remote.updatedAt !== 'number') return 'skipped'

    const lastKnown = dashboardStore.getLastCloudSyncAt()
    // 부등호가 아니라 '다름' 비교 — 기기 간 시계 오차에 영향받지 않음.
    // lastKnown이 없으면(업데이트 전 데이터) 원격 우선으로 한 번 pull 한다.
    if (lastKnown !== null && remote.updatedAt === lastKnown) return 'up-to-date'

    dashboardStore.applyCloudSnapshot(remote)
    dashboardStore.markCloudSync(remote.updatedAt)
    console.log('[cloud-sync] 시작 시 원격 변경 감지 — 클라우드 데이터를 가져왔습니다')
    return 'pulled'
  })()

  // 실패(네트워크 등)해도 게이트는 풀린다 — 가용성 우선, 이후 푸시는 정상 진행
  startupGate = run.catch(() => {})
  return run.catch((e) => {
    console.warn('[cloud-sync] 시작 시 화해 실패 (무시하고 진행):', e)
    return 'skipped' as const
  })
}

/**
 * 게임계정 ID 등록/연동.
 * - 원격에 이미 문서가 있으면(다른 기기에서 먼저 등록) 원격 우선 — 로컬을 덮어쓴다.
 * - 없으면 최초 등록으로 간주하고 현재 로컬 데이터를 업로드한다.
 */
export async function registerGameAccount(gameAccountId: string): Promise<CloudRegisterResult> {
  const trimmed = gameAccountId.trim()
  if (!trimmed) return { ok: false, message: '게임계정 ID를 입력하세요' }

  const projectId = getEffectiveProjectId()
  if (!projectId) return { ok: false, message: 'Firebase 프로젝트 ID가 설정되지 않았습니다' }

  try {
    const remote = await getFirestoreDocument(projectId, playerDocPath(trimmed))

    if (remote) {
      const data = remote as unknown as CloudPlayerData
      dashboardStore.applyCloudSnapshot(data)
      dashboardStore.markCloudSync(data.updatedAt)
      dashboardStore.updateSettings({ gameAccountId: trimmed })
      return { ok: true, message: '기존에 등록된 데이터를 불러왔습니다', pulled: true }
    }

    dashboardStore.updateSettings({ gameAccountId: trimmed })
    const payload = dashboardStore.getCloudSyncPayload()
    await putFirestoreDocument(
      projectId,
      playerDocPath(trimmed),
      payload as unknown as Record<string, unknown>
    )
    dashboardStore.markCloudSync(payload.updatedAt)
    return { ok: true, message: '현재 데이터를 클라우드에 업로드했습니다', pulled: false }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `연동 실패: ${msg}` }
  }
}

/**
 * 클라우드에서 최신 데이터를 가져와 로컬을 덮어쓴다 (#28 — 오버레이 수동 동기화 버튼).
 * 변경 시마다 자동 푸시는 하지만 실행 중 자동 풀(polling)은 하지 않는다 — 트래픽을
 * 아끼기 위해 "버튼을 눌렀을 때만" 가져오는 구조. (시작 시 1회 화해는 예외)
 */
export async function pullCloudSyncIfRegistered(): Promise<CloudSyncResult> {
  const { settings } = dashboardStore.getState()
  const gameAccountId = settings.gameAccountId?.trim()
  if (!gameAccountId) {
    return { ok: false, message: '동기화 ID가 등록되지 않았습니다 — 설정에서 먼저 연동하세요' }
  }

  const projectId = getEffectiveProjectId()
  if (!projectId) return { ok: false, message: 'Firebase 프로젝트 ID가 설정되지 않았습니다' }

  try {
    const remote = await getFirestoreDocument(projectId, playerDocPath(gameAccountId))
    if (!remote) {
      return { ok: false, message: '클라우드에 데이터가 없습니다' }
    }
    const data = remote as unknown as CloudPlayerData
    dashboardStore.applyCloudSnapshot(data)
    dashboardStore.markCloudSync(data.updatedAt)
    return { ok: true, message: '최신 데이터를 가져왔습니다' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `동기화 실패: ${msg}` }
  }
}

/**
 * store 변경 시마다 호출 — 등록된 계정이 있으면 현재 상태를 Firestore에 반영한다.
 * fire-and-forget: 네트워크 실패해도 로컬 동작에는 영향 없음.
 * 시작 시 화해가 끝나기 전에는 대기한다 (게이트) — 대기 후 최신 상태로 페이로드를 만든다.
 */
export async function pushCloudSyncIfRegistered(): Promise<void> {
  await startupGate

  const { settings } = dashboardStore.getState()
  const gameAccountId = settings.gameAccountId?.trim()
  if (!gameAccountId) return

  const projectId = getEffectiveProjectId()
  if (!projectId) return

  try {
    const payload = dashboardStore.getCloudSyncPayload()
    await putFirestoreDocument(
      projectId,
      playerDocPath(gameAccountId),
      payload as unknown as Record<string, unknown>
    )
    dashboardStore.markCloudSync(payload.updatedAt)
  } catch (e) {
    console.warn('[cloud-sync] 푸시 실패:', e)
  }
}
