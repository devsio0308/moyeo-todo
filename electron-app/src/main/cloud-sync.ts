/**
 * 게임계정 ID 기반 Firestore 동기화 (#26).
 * 인증 없이 계정 ID를 문서 키로 사용 — 같은 사람이 여러 기기(향후 웹 오버레이 포함)에서
 * 같은 ID로 접속하면 같은 데이터가 보이게 하는 것이 목적. Firestore 규칙은
 * players/{id}에 대해 영구적으로 공개 read/write여야 한다 (README 참고).
 */

import { dashboardStore } from './store'
import { getEffectiveProjectId } from './quest-catalog'
import { getFirestoreDocument, putFirestoreDocument } from './firestore-rest'
import type { CloudPlayerData, CloudRegisterResult, CloudSyncResult } from '../shared/types'

function playerDocPath(gameAccountId: string): string {
  return `players/${encodeURIComponent(gameAccountId)}`
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
      dashboardStore.applyCloudSnapshot(remote as unknown as CloudPlayerData)
      dashboardStore.updateSettings({ gameAccountId: trimmed })
      return { ok: true, message: '기존에 등록된 데이터를 불러왔습니다', pulled: true }
    }

    dashboardStore.updateSettings({ gameAccountId: trimmed })
    await putFirestoreDocument(
      projectId,
      playerDocPath(trimmed),
      dashboardStore.getCloudSyncPayload() as unknown as Record<string, unknown>
    )
    return { ok: true, message: '현재 데이터를 클라우드에 업로드했습니다', pulled: false }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `연동 실패: ${msg}` }
  }
}

/**
 * 클라우드에서 최신 데이터를 가져와 로컬을 덮어쓴다 (#28 — 오버레이 수동 동기화 버튼).
 * 변경 시마다 자동 푸시는 하지만 자동 풀(polling)은 하지 않는다 — 트래픽을 아끼기 위해
 * "버튼을 눌렀을 때만" 가져오는 구조. 다른 기기(폰 등)에서 바꾼 내용을 반영할 때 사용.
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
    dashboardStore.applyCloudSnapshot(remote as unknown as CloudPlayerData)
    return { ok: true, message: '최신 데이터를 가져왔습니다' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `동기화 실패: ${msg}` }
  }
}

/**
 * store 변경 시마다 호출 — 등록된 계정이 있으면 현재 상태를 Firestore에 반영한다.
 * fire-and-forget: 네트워크 실패해도 로컬 동작에는 영향 없음.
 */
export async function pushCloudSyncIfRegistered(): Promise<void> {
  const { settings } = dashboardStore.getState()
  const gameAccountId = settings.gameAccountId?.trim()
  if (!gameAccountId) return

  const projectId = getEffectiveProjectId()
  if (!projectId) return

  try {
    await putFirestoreDocument(
      projectId,
      playerDocPath(gameAccountId),
      dashboardStore.getCloudSyncPayload() as unknown as Record<string, unknown>
    )
  } catch (e) {
    console.warn('[cloud-sync] 푸시 실패:', e)
  }
}
