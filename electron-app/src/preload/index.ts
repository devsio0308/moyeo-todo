import { contextBridge, ipcRenderer } from 'electron'
import type { HistoryState } from '../main/history'
import type {
  CatalogNotice,
  CatalogSyncResult,
  CloudRegisterResult,
  CloudSyncResult,
  QuestCategory,
  Settings,
  StoreShape,
  TaskPeriod,
  TaskState,
  UpdateDownloadedNotice
} from '../shared/types'

/** 렌더러에 노출하는 최소 API 표면 */
const api = {
  window: {
    /** 오버레이 표시 (#17 — 관리 창의 '오버레이 띄우기') */
    showOverlay: (): void => ipcRenderer.send('overlay:show'),
    /** 오버레이 닫기 (오버레이 타이틀바 버튼) — 관리 프로그램이 떠 있는 동안은 숨김,
     *  관리 창을 닫으면(전체 종료) 함께 사라짐 */
    closeOverlay: (): void => ipcRenderer.send('overlay:close')
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
    /** 같은 (period, category) 그룹 내 커스텀 퀘스트 드래그 순서 변경 (#quest-order) */
    reorderTasks: (characterId: string, orderedTaskIds: string[]): Promise<StoreShape> =>
      ipcRenderer.invoke('store:reorder-tasks', characterId, orderedTaskIds),
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
    sync: (): Promise<CatalogSyncResult> => ipcRenderer.invoke('catalog:sync'),
    /** .env 기본 프로젝트 ID (#14) — 설정 UI 입력창 표시용 */
    getDefaultProjectId: (): Promise<string | null> =>
      ipcRenderer.invoke('catalog:default-project-id'),
    /** 백그라운드 카탈로그 감시(#catalog-watch)가 추가/삭제를 반영했을 때 알림 */
    onNotice: (cb: (notice: CatalogNotice) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, notice: CatalogNotice): void => cb(notice)
      ipcRenderer.on('catalog:notice', listener)
      return () => ipcRenderer.removeListener('catalog:notice', listener)
    }
  },
  history: {
    /** 실행취소/다시실행 (#undo) — 오버레이 체크/카운트 조작 대상 */
    undo: (): Promise<StoreShape | null> => ipcRenderer.invoke('history:undo'),
    redo: (): Promise<StoreShape | null> => ipcRenderer.invoke('history:redo'),
    getState: (): Promise<HistoryState> => ipcRenderer.invoke('history:state'),
    onChanged: (cb: (state: HistoryState) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, state: HistoryState): void => cb(state)
      ipcRenderer.on('history:changed', listener)
      return () => ipcRenderer.removeListener('history:changed', listener)
    }
  },
  cloud: {
    /** 게임계정 ID 등록/연동 (#26) — 원격 있으면 불러오기, 없으면 로컬 업로드 */
    register: (gameAccountId: string): Promise<CloudRegisterResult> =>
      ipcRenderer.invoke('cloud:register', gameAccountId),
    /** 수동 동기화 (#28) — 클릭했을 때만 클라우드에서 최신 데이터를 가져옴 (자동 폴링 없음) */
    pull: (): Promise<CloudSyncResult> => ipcRenderer.invoke('cloud:pull')
  },
  update: {
    /** 백그라운드 다운로드가 끝나면 알림 (#auto-update-notice) — 관리 창 말풍선용 */
    onDownloaded: (cb: (notice: UpdateDownloadedNotice) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, notice: UpdateDownloadedNotice): void =>
        cb(notice)
      ipcRenderer.on('update:downloaded', listener)
      return () => ipcRenderer.removeListener('update:downloaded', listener)
    },
    /** 관리 창 마운트 시 조회 — 재시작해도 설치 안 한 버전이 있으면 안내를 다시 띄운다 */
    getPending: (): Promise<UpdateDownloadedNotice | null> =>
      ipcRenderer.invoke('update:get-pending'),
    /** 알림의 '업데이트' 버튼 — 지금 설치하고 재시작 (#auto-update-notice) */
    install: (): Promise<void> => ipcRenderer.invoke('update:install')
  }
}

export type PreloadApi = typeof api

contextBridge.exposeInMainWorld('api', api)
