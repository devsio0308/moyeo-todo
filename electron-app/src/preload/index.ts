import { contextBridge, ipcRenderer } from 'electron'
import type {
  CaptureRegion,
  CatalogSyncResult,
  EngineStatus,
  QuestCategory,
  Screenshot,
  Settings,
  StoreShape,
  TaskMode,
  TaskPeriod,
  TaskState,
  TemplateIndex
} from '../shared/types'

/** 렌더러에 노출하는 최소 API 표면 */
const api = {
  window: {
    /** 오버레이 표시 (#17 — 관리 창의 '오버레이 띄우기') */
    showOverlay: (): void => ipcRenderer.send('overlay:show'),
    /** 오버레이 숨기기 (오버레이 타이틀바 버튼) */
    hideOverlay: (): void => ipcRenderer.send('overlay:hide'),
    /** 관리 창 열기/포커스 (오버레이에서 접근) */
    openManage: (): void => ipcRenderer.send('manage:show'),
    quit: (): void => ipcRenderer.send('app:quit')
  },
  capture: {
    onPausedChanged: (cb: (paused: boolean) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, paused: boolean): void => cb(paused)
      ipcRenderer.on('capture:paused-changed', listener)
      return () => ipcRenderer.removeListener('capture:paused-changed', listener)
    }
  },
  engine: {
    /** 활성 캐릭터 알림 — 엔진이 매칭 대상을 좁힐 수 있게 (명세서 §2, 선택사항) */
    setActiveCharacter: (character: string | null): void =>
      ipcRenderer.send('engine:set-active-character', character),
    onStatus: (cb: (status: EngineStatus) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, status: EngineStatus): void => cb(status)
      ipcRenderer.on('engine:status', listener)
      return () => ipcRenderer.removeListener('engine:status', listener)
    }
  },
  store: {
    getState: (): Promise<StoreShape> => ipcRenderer.invoke('store:get-state'),
    addCharacter: (
      displayName: string,
      copyFromCharacterId?: string | null
    ): Promise<StoreShape> =>
      ipcRenderer.invoke('store:add-character', displayName, copyFromCharacterId ?? null),
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
      category?: QuestCategory | null
    ): Promise<StoreShape> =>
      ipcRenderer.invoke(
        'store:add-task',
        characterId,
        displayName,
        period,
        targetCount,
        category ?? null
      ),
    incrementTask: (characterId: string, taskId: string, delta: number): Promise<StoreShape> =>
      ipcRenderer.invoke('store:increment-task', characterId, taskId, delta),
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
  },
  flows: {
    /** 캡처 리전 드래그 지정. 취소 시 null */
    pickRegion: (): Promise<StoreShape | null> => ipcRenderer.invoke('flow:pick-region'),
    clearRegion: (): Promise<StoreShape> => ipcRenderer.invoke('flow:clear-region'),
    /** 스크린샷 크롭으로 템플릿 등록. 취소 시 null, 성공 시 최신 템플릿 목록 */
    registerTemplate: (characterId: string, taskId: string): Promise<TemplateIndex | null> =>
      ipcRenderer.invoke('flow:register-template', characterId, taskId)
  },
  templates: {
    list: (): Promise<TemplateIndex> => ipcRenderer.invoke('template:list'),
    remove: (characterId: string, taskId: string): Promise<TemplateIndex> =>
      ipcRenderer.invoke('template:delete', characterId, taskId)
  },
  catalog: {
    /** Firestore 퀘스트 카탈로그 수동 동기화 (#4) */
    sync: (): Promise<CatalogSyncResult> => ipcRenderer.invoke('catalog:sync')
  },
  picker: {
    onInit: (
      cb: (payload: { screenshot: Screenshot; message: string }) => void
    ): (() => void) => {
      const listener = (
        _e: Electron.IpcRendererEvent,
        payload: { screenshot: Screenshot; message: string }
      ): void => cb(payload)
      ipcRenderer.on('picker:init', listener)
      return () => ipcRenderer.removeListener('picker:init', listener)
    },
    done: (rect: CaptureRegion): void => ipcRenderer.send('picker:done', rect),
    cancel: (): void => ipcRenderer.send('picker:cancel')
  }
}

export type PreloadApi = typeof api

contextBridge.exposeInMainWorld('api', api)
