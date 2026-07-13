import { ipcMain } from 'electron'
import { dashboardStore } from './store'
import { syncQuestCatalogOnce } from './quest-catalog'
import { pullCloudSyncIfRegistered, registerGameAccount } from './cloud-sync'
import type { Settings, TaskPeriod, TaskState } from '../shared/types'

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
    const state = dashboardStore.addCharacter(displayName)
    broadcast()
    return state
  })

  ipcMain.handle('store:remove-character', (_e, characterId: string) => {
    const state = dashboardStore.removeCharacter(characterId)
    broadcast()
    return state
  })

  ipcMain.handle('store:rename-character', (_e, characterId: string, displayName: string) => {
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
    'store:add-task',
    (
      _e,
      characterId: string,
      displayName: string,
      period: TaskPeriod,
      targetCount?: number,
      category?: import('../shared/types').QuestCategory | null,
      location?: string | null
    ) => {
      const state = dashboardStore.addTask(
        characterId,
        displayName,
        period,
        null,
        targetCount,
        category ?? null,
        location ?? null
      )
      broadcast()
      return state
    }
  )

  ipcMain.handle(
    'store:increment-task',
    (_e, characterId: string, taskId: string, delta: number) => {
      const state = dashboardStore.incrementTask(characterId, taskId, delta)
      broadcast()
      return state
    }
  )

  ipcMain.handle(
    'store:set-task-excluded',
    (_e, characterId: string, taskId: string, excluded: boolean) => {
      const state = dashboardStore.setTaskExcluded(characterId, taskId, excluded)
      broadcast()
      return state
    }
  )

  ipcMain.handle('store:remove-task', (_e, characterId: string, taskId: string) => {
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
      patch: Partial<Pick<TaskState, 'displayName' | 'period' | 'category' | 'targetCount' | 'location'>>
    ) => {
      const state = dashboardStore.updateTask(characterId, taskId, patch)
      broadcast()
      return state
    }
  )

  ipcMain.handle('store:set-task-done', (_e, characterId: string, taskId: string, done: boolean) => {
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
    if (result.ok) broadcast()
    return result
  })

  // ── 게임계정 ID 기반 Firestore 동기화 (#26) ─────────────

  ipcMain.handle('cloud:register', async (_e, gameAccountId: string) => {
    const result = await registerGameAccount(gameAccountId)
    if (result.ok) broadcast()
    return result
  })

  ipcMain.handle('cloud:pull', async () => {
    const result = await pullCloudSyncIfRegistered()
    if (result.ok) broadcast()
    return result
  })
}
