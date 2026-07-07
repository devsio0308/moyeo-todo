import { BrowserWindow, ipcMain } from 'electron'
import { dashboardStore } from './store'
import type { Settings, TaskMode, TaskPeriod, TaskState } from '../shared/types'

/**
 * renderer ↔ main IPC.
 * 모든 store mutation은 최신 전체 상태를 반환하고,
 * 동시에 'store:changed'로 브로드캐스트한다 (자동 감지 등 main발 변경도 동일 경로로 수신).
 */
export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  const broadcast = (): void => {
    getWindow()?.webContents.send('store:changed', dashboardStore.getState())
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
    (_e, characterId: string, displayName: string, period: TaskPeriod) => {
      const state = dashboardStore.addTask(characterId, displayName, period)
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
      patch: Partial<Pick<TaskState, 'displayName' | 'period' | 'threshold'>>
    ) => {
      const state = dashboardStore.updateTask(characterId, taskId, patch)
      broadcast()
      return state
    }
  )

  ipcMain.handle(
    'store:set-task-done',
    (_e, characterId: string, taskId: string, done: boolean, mode: TaskMode) => {
      const state = dashboardStore.setTaskDone(characterId, taskId, done, mode)
      broadcast()
      return state
    }
  )

  ipcMain.handle('store:update-settings', (_e, patch: Partial<Settings>) => {
    const state = dashboardStore.updateSettings(patch)
    broadcast()
    return state
  })
}
