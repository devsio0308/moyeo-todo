import { app, BrowserWindow, ipcMain } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createMainWindow } from './window'
import { createTray } from './tray'
import { registerIpcHandlers } from './ipc-handlers'
import { PythonBridge, writeEngineConfig } from './python-bridge'
import { EngineWsClient } from './ws-client'
import { dashboardStore } from './store'
import type { EngineMessage, EngineStatus } from '../shared/types'

let mainWindow: BrowserWindow | null = null
let bridge: PythonBridge | null = null
let wsClient: EngineWsClient | null = null

/** 마지막으로 renderer가 알려준 활성 캐릭터 — 재접속 시 재동기화용 */
let activeCharacter: string | null = null
let capturePaused = false

// 단일 인스턴스 보장 — 오버레이가 두 개 뜨면 혼란만 생김
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.hrjin.homework-dashboard')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    mainWindow = createMainWindow()
    createTray(mainWindow, {
      onTogglePauseCapture: (paused) => {
        capturePaused = paused
        wsClient?.send({ type: 'set_paused', paused })
        mainWindow?.webContents.send('capture:paused-changed', paused)
      }
    })

    registerWindowIpc()
    registerIpcHandlers(() => mainWindow, {
      onSettingsChanged: () => {
        // 설정이 바뀌면 엔진 설정 파일 갱신 후 리로드 지시 (명세서 §2)
        writeEngineConfig()
        wsClient?.send({ type: 'reload_config' })
      }
    })

    startEngine()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow()
      } else {
        mainWindow?.show()
      }
    })
  })

  app.on('before-quit', () => {
    // python 프로세스 SIGTERM 정리 — 좀비 방지 (명세서 §3)
    wsClient?.stop()
    bridge?.stop()
  })

  // 오버레이 앱: 창을 닫아도 트레이에 남는다. 종료는 트레이 메뉴로만.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      // no-op: 트레이 상주
    }
  })
}

function startEngine(): void {
  writeEngineConfig()

  bridge = new PythonBridge()
  wsClient = new EngineWsClient()

  bridge.on('failed', () => sendEngineStatus('failed'))

  wsClient.on('status', (connected: boolean) => {
    sendEngineStatus(connected ? 'connected' : bridge?.failed ? 'failed' : 'disconnected')
  })

  wsClient.on('connected', () => {
    // 재접속 시 엔진 쪽 상태 재동기화 (연결 없던 동안의 변경분 반영)
    if (activeCharacter) wsClient?.send({ type: 'active_character', character: activeCharacter })
    if (capturePaused) wsClient?.send({ type: 'set_paused', paused: true })
  })

  wsClient.on('message', (msg: EngineMessage) => {
    if (msg.type === 'task_detected') {
      console.log('[engine] task_detected:', msg.character, msg.task, msg.confidence)
      if (dashboardStore.applyDetection(msg.character, msg.task, msg.timestamp)) {
        mainWindow?.webContents.send('store:changed', dashboardStore.getState())
      }
    }
  })

  bridge.start()
  wsClient.connect()
}

function sendEngineStatus(status: EngineStatus): void {
  mainWindow?.webContents.send('engine:status', status)
}

function registerWindowIpc(): void {
  ipcMain.on('window:hide', () => mainWindow?.hide())
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('app:quit', () => app.quit())

  ipcMain.on('engine:set-active-character', (_e, character: string | null) => {
    activeCharacter = character
    if (character) wsClient?.send({ type: 'active_character', character })
  })
}
