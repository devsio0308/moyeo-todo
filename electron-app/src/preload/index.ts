import { contextBridge, ipcRenderer } from 'electron'
import type {
  Settings,
  StoreShape,
  TaskMode,
  TaskPeriod,
  TaskState
} from '../shared/types'

/** 렌더러에 노출하는 최소 API 표면 */
const api = {
  window: {
    hide: (): void => ipcRenderer.send('window:hide'),
    minimize: (): void => ipcRenderer.send('window:minimize'),
    quit: (): void => ipcRenderer.send('app:quit')
  },
  capture: {
    onPausedChanged: (cb: (paused: boolean) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, paused: boolean): void => cb(paused)
      ipcRenderer.on('capture:paused-changed', listener)
      return () => ipcRenderer.removeListener('capture:paused-changed', listener)
    }
  },
  store: {
    getState: (): Promise<StoreShape> => ipcRenderer.invoke('store:get-state'),
    addCharacter: (displayName: string): Promise<StoreShape> =>
      ipcRenderer.invoke('store:add-character', displayName),
    removeCharacter: (characterId: string): Promise<StoreShape> =>
      ipcRenderer.invoke('store:remove-character', characterId),
    renameCharacter: (characterId: string, displayName: string): Promise<StoreShape> =>
      ipcRenderer.invoke('store:rename-character', characterId, displayName),
    reorderCharacters: (order: string[]): Promise<StoreShape> =>
      ipcRenderer.invoke('store:reorder-characters', order),
    addTask: (characterId: string, displayName: string, period: TaskPeriod): Promise<StoreShape> =>
      ipcRenderer.invoke('store:add-task', characterId, displayName, period),
    removeTask: (characterId: string, taskId: string): Promise<StoreShape> =>
      ipcRenderer.invoke('store:remove-task', characterId, taskId),
    updateTask: (
      characterId: string,
      taskId: string,
      patch: Partial<Pick<TaskState, 'displayName' | 'period' | 'threshold'>>
    ): Promise<StoreShape> => ipcRenderer.invoke('store:update-task', characterId, taskId, patch),
    setTaskDone: (
      characterId: string,
      taskId: string,
      done: boolean,
      mode: TaskMode
    ): Promise<StoreShape> =>
      ipcRenderer.invoke('store:set-task-done', characterId, taskId, done, mode),
    updateSettings: (patch: Partial<Settings>): Promise<StoreShape> =>
      ipcRenderer.invoke('store:update-settings', patch),
    onChanged: (cb: (state: StoreShape) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, state: StoreShape): void => cb(state)
      ipcRenderer.on('store:changed', listener)
      return () => ipcRenderer.removeListener('store:changed', listener)
    }
  }
}

export type PreloadApi = typeof api

contextBridge.exposeInMainWorld('api', api)
