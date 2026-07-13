import { contextBridge, ipcRenderer } from 'electron'
import type {
  CatalogSyncResult,
  CloudRegisterResult,
  CloudSyncResult,
  QuestCategory,
  Settings,
  StoreShape,
  TaskPeriod,
  TaskState
} from '../shared/types'

/** 렌더러에 노출하는 최소 API 표면 */
const api = {
  window: {
    /** 오버레이 표시 (#17 — 관리 창의 '오버레이 띄우기') */
    showOverlay: (): void => ipcRenderer.send('overlay:show'),
    /** 오버레이 닫기 (오버레이 타이틀바 버튼) — 관리 프로그램이 떠 있는 동안은 숨김,
     *  프로그램 종료 시 함께 사라짐 */
    closeOverlay: (): void => ipcRenderer.send('overlay:close'),
    quit: (): void => ipcRenderer.send('app:quit')
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
    addTask: (
      characterId: string,
      displayName: string,
      period: TaskPeriod,
      targetCount?: number,
      category?: QuestCategory | null,
      location?: string | null
    ): Promise<StoreShape> =>
      ipcRenderer.invoke(
        'store:add-task',
        characterId,
        displayName,
        period,
        targetCount,
        category ?? null,
        location ?? null
      ),
    incrementTask: (characterId: string, taskId: string, delta: number): Promise<StoreShape> =>
      ipcRenderer.invoke('store:increment-task', characterId, taskId, delta),
    setTaskExcluded: (
      characterId: string,
      taskId: string,
      excluded: boolean
    ): Promise<StoreShape> =>
      ipcRenderer.invoke('store:set-task-excluded', characterId, taskId, excluded),
    removeTask: (characterId: string, taskId: string): Promise<StoreShape> =>
      ipcRenderer.invoke('store:remove-task', characterId, taskId),
    updateTask: (
      characterId: string,
      taskId: string,
      patch: Partial<Pick<TaskState, 'displayName' | 'period' | 'category' | 'targetCount' | 'location'>>
    ): Promise<StoreShape> => ipcRenderer.invoke('store:update-task', characterId, taskId, patch),
    setTaskDone: (characterId: string, taskId: string, done: boolean): Promise<StoreShape> =>
      ipcRenderer.invoke('store:set-task-done', characterId, taskId, done),
    updateSettings: (patch: Partial<Settings>): Promise<StoreShape> =>
      ipcRenderer.invoke('store:update-settings', patch),
    onChanged: (cb: (state: StoreShape) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, state: StoreShape): void => cb(state)
      ipcRenderer.on('store:changed', listener)
      return () => ipcRenderer.removeListener('store:changed', listener)
    }
  },
  catalog: {
    /** Firestore 퀘스트 카탈로그 수동 동기화 (#4) */
    sync: (): Promise<CatalogSyncResult> => ipcRenderer.invoke('catalog:sync')
  },
  cloud: {
    /** 게임계정 ID 등록/연동 (#26) — 원격 있으면 불러오기, 없으면 로컬 업로드 */
    register: (gameAccountId: string): Promise<CloudRegisterResult> =>
      ipcRenderer.invoke('cloud:register', gameAccountId),
    /** 수동 동기화 (#28) — 클릭했을 때만 클라우드에서 최신 데이터를 가져옴 (자동 폴링 없음) */
    pull: (): Promise<CloudSyncResult> => ipcRenderer.invoke('cloud:pull')
  }
}

export type PreloadApi = typeof api

contextBridge.exposeInMainWorld('api', api)
