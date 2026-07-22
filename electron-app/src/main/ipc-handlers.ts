import { app, ipcMain } from 'electron'
import { clearHistory, historyState, recordHistory, redoHistory, undoHistory } from './history'
import { dashboardStore } from './store'
import { getDefaultProjectId, syncQuestCatalogOnce } from './quest-catalog'
import { pullCloudSyncIfRegistered, registerGameAccount } from './cloud-sync'
import { installUpdateNow } from './auto-update'
import type { Settings, TaskPeriod, TaskState, UpdateDownloadedNotice } from '../shared/types'

/**
 * renderer ↔ main IPC.
 * 모든 store mutation은 최신 전체 상태를 반환하고,
 * 동시에 'store:changed'로 전체 창에 브로드캐스트한다 (#17 — 두 창 상태 공유).
 */
export function registerIpcHandlers(broadcastAll: (channel: string, payload: unknown) => void): void {
  const broadcast = (): void => {
    broadcastAll('store:changed', dashboardStore.getState())
  }

  ipcMain.handle('store:get-state', () => dashboardStore.getState())

  ipcMain.handle('store:add-character', (_e, displayName: string) => {
    clearHistory()
    const state = dashboardStore.addCharacter(displayName)
    broadcast()
    return state
  })

  ipcMain.handle('store:remove-character', (_e, characterId: string) => {
    clearHistory()
    const state = dashboardStore.removeCharacter(characterId)
    broadcast()
    return state
  })

  ipcMain.handle('store:rename-character', (_e, characterId: string, displayName: string) => {
    clearHistory()
    const state = dashboardStore.renameCharacter(characterId, displayName)
    broadcast()
    return state
  })

  ipcMain.handle('store:reorder-characters', (_e, order: string[]) => {
    const state = dashboardStore.reorderCharacters(order)
    broadcast()
    return state
  })

  ipcMain.handle(
    'store:reorder-tasks',
    (_e, characterId: string, orderedTaskIds: string[]) => {
      const state = dashboardStore.reorderTasks(characterId, orderedTaskIds)
      broadcast()
      return state
    }
  )

  ipcMain.handle(
    'store:add-task',
    (
      _e,
      characterId: string,
      displayName: string,
      period: TaskPeriod,
      targetCount?: number,
      category?: import('../shared/types').QuestCategory | null,
      location?: string | null,
      isRaid?: boolean
    ) => {
      clearHistory()
      const state = dashboardStore.addTask(
        characterId,
        displayName,
        period,
        null,
        targetCount,
        category ?? null,
        location ?? null,
        isRaid ?? false
      )
      broadcast()
      return state
    }
  )

  ipcMain.handle(
    'store:increment-task',
    (_e, characterId: string, taskId: string, delta: number) => {
      recordHistory() // 실행취소 지점 (#undo)
      const state = dashboardStore.incrementTask(characterId, taskId, delta)
      broadcast()
      return state
    }
  )

  ipcMain.handle(
    'store:set-task-excluded',
    (_e, characterId: string, taskId: string, excluded: boolean) => {
      clearHistory()
      const state = dashboardStore.setTaskExcluded(characterId, taskId, excluded)
      broadcast()
      return state
    }
  )

  ipcMain.handle('store:remove-task', (_e, characterId: string, taskId: string) => {
    clearHistory()
    const state = dashboardStore.removeTask(characterId, taskId)
    broadcast()
    return state
  })

  ipcMain.handle(
    'store:update-task',
    (
      _e,
      characterId: string,
      taskId: string,
      patch: Partial<
        Pick<TaskState, 'displayName' | 'period' | 'category' | 'targetCount' | 'location' | 'isRaid'>
      >
    ) => {
      clearHistory()
      const state = dashboardStore.updateTask(characterId, taskId, patch)
      broadcast()
      return state
    }
  )

  ipcMain.handle('store:set-task-done', (_e, characterId: string, taskId: string, done: boolean) => {
    recordHistory() // 실행취소 지점 (#undo)
    const state = dashboardStore.setTaskDone(characterId, taskId, done)
    broadcast()
    return state
  })

  ipcMain.handle('store:update-settings', (_e, patch: Partial<Settings>) => {
    const state = dashboardStore.updateSettings(patch)
    broadcast()
    return state
  })

  // ── 퀘스트 카탈로그 동기화 (#4) ─────────────────────────

  ipcMain.handle('catalog:sync', async () => {
    const result = await syncQuestCatalogOnce()
    if (result.ok) {
      clearHistory()
      broadcast()
    }
    return result
  })

  /** .env(MAIN_VITE_FIREBASE_PROJECT_ID) 기본값 — 설정 UI 입력창 표시용 (#14) */
  ipcMain.handle('catalog:default-project-id', () => getDefaultProjectId())

  // ── 게임계정 ID 기반 Firestore 동기화 (#26) ─────────────

  ipcMain.handle('cloud:register', async (_e, gameAccountId: string) => {
    const result = await registerGameAccount(gameAccountId)
    if (result.ok) {
      clearHistory()
      broadcast()
    }
    return result
  })

  ipcMain.handle('cloud:pull', async () => {
    const result = await pullCloudSyncIfRegistered()
    if (result.ok) {
      clearHistory()
      broadcast()
    }
    return result
  })

  // ── 실행취소/다시실행 (#undo) — 오버레이 체크/카운트 조작 대상 ──

  ipcMain.handle('history:state', () => historyState())

  ipcMain.handle('history:undo', () => {
    if (!undoHistory()) return null
    broadcast()
    return dashboardStore.getState()
  })

  ipcMain.handle('history:redo', () => {
    if (!redoHistory()) return null
    broadcast()
    return dashboardStore.getState()
  })

  // ── 자동 업데이트 (#auto-update-notice) — 설치는 유저가 버튼을 눌러야만 진행 ──

  /** 관리 창 마운트 시 1회 조회 — 재시작해도 설치 대기 중인 버전이 있으면 안내를 다시 띄운다.
   *  이미 그 버전으로 실행 중이면(=설치 완료) 대기 상태를 정리하고 null 반환 */
  ipcMain.handle('update:get-pending', () => {
    const pending = dashboardStore.getPendingUpdateVersion()
    if (!pending) return null
    if (pending === app.getVersion()) {
      dashboardStore.clearPendingUpdateVersion()
      return null
    }
    const notice: UpdateDownloadedNotice = { version: pending }
    return notice
  })

  ipcMain.handle('update:install', () => installUpdateNow())

  // ── 앱 정보 ──────────────────────────────────────────────

  /** 설정 화면에 표시할 현재 실행 중인 버전 */
  ipcMain.handle('app:get-version', () => app.getVersion())
}
