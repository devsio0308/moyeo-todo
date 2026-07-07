import { contextBridge, ipcRenderer } from 'electron'

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
  }
}

export type PreloadApi = typeof api

contextBridge.exposeInMainWorld('api', api)
