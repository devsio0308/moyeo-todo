import { app, BrowserWindow, ipcMain } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createManageWindow, createOverlayWindow } from './window'
import { createTray } from './tray'
import { registerIpcHandlers } from './ipc-handlers'
import { PythonBridge, writeEngineConfig } from './python-bridge'
import { EngineWsClient } from './ws-client'
import { dashboardStore } from './store'
import { ResetScheduler } from './reset-scheduler'
import { syncQuestCatalogOnce } from './quest-catalog'
import { pushCloudSyncIfRegistered } from './cloud-sync'
import { AUTO_DETECT_ENABLED, type EngineMessage, type EngineStatus } from '../shared/types'

// 알람 차임(#11)을 사용자 제스처 없이 재생할 수 있게 autoplay 정책 해제
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

let manageWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let bridge: PythonBridge | null = null
let wsClient: EngineWsClient | null = null
let resetScheduler: ResetScheduler | null = null

/** 마지막으로 renderer가 알려준 활성 캐릭터 — 재접속 시 재동기화용 */
let activeCharacter: string | null = null
let capturePaused = false
let lastEngineStatus: EngineStatus = 'disconnected'

/**
 * 열려 있는 모든 창에 브로드캐스트 (#17 — 두 창이 같은 상태를 공유).
 * store가 바뀔 때마다 등록된 게임계정이 있으면 Firestore에도 반영한다 (#26) —
 * 개별 IPC 핸들러마다 훅을 걸 필요 없이 이 한 지점만 지키면 빠짐없이 커버된다.
 */
function broadcastAll(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload)
  }
  if (channel === 'store:changed') {
    void pushCloudSyncIfRegistered()
  }
}

function showManageWindow(): void {
  if (manageWindow && !manageWindow.isDestroyed()) {
    manageWindow.show()
    manageWindow.focus()
    return
  }
  manageWindow = createManageWindow()
  resetScheduler?.attachWindow(manageWindow)
  manageWindow.on('closed', () => {
    manageWindow = null
  })
  // 새로 열린 창에 현재 엔진 상태 전달
  manageWindow.webContents.on('did-finish-load', () => {
    manageWindow?.webContents.send('engine:status', lastEngineStatus)
  })
}

function showOverlayWindow(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.show()
    return
  }
  overlayWindow = createOverlayWindow()
  resetScheduler?.attachWindow(overlayWindow)
  overlayWindow.on('closed', () => {
    overlayWindow = null
  })
  overlayWindow.webContents.on('did-finish-load', () => {
    overlayWindow?.webContents.send('engine:status', lastEngineStatus)
    overlayWindow?.webContents.send('capture:paused-changed', capturePaused)
  })
}

function toggleOverlay(): void {
  if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible()) {
    overlayWindow.hide()
  } else {
    showOverlayWindow()
  }
}

// 단일 인스턴스 보장 — 오버레이가 두 개 뜨면 혼란만 생김
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showManageWindow()
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.hrjin.homework-dashboard')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // 리셋 스케줄러 — 시작/포커스/절전복귀 시 day-boundary 체크 (명세서 §6)
    resetScheduler = new ResetScheduler(() => {
      broadcastAll('store:changed', dashboardStore.getState())
    })
    resetScheduler.start()

    // 시작 흐름(#17): 관리 창이 메인, 오버레이는 '오버레이 띄우기'로
    showManageWindow()

    createTray({
      isOverlayVisible: () =>
        !!overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible(),
      toggleOverlay,
      openManage: showManageWindow,
      onTogglePauseCapture: (paused) => {
        capturePaused = paused
        wsClient?.send({ type: 'set_paused', paused })
        broadcastAll('capture:paused-changed', paused)
      }
    })

    registerWindowIpc()
    registerIpcHandlers(broadcastAll, {
      onSettingsChanged: () => {
        // 설정이 바뀌면 엔진 설정 파일 갱신 후 리로드 지시 (명세서 §2)
        writeEngineConfig()
        wsClient?.send({ type: 'reload_config' })
      },
      requestScreenshot: () => {
        if (!wsClient) return Promise.reject(new Error('엔진이 초기화되지 않았습니다'))
        return wsClient.requestScreenshot()
      }
    })

    // 자동 감지는 추가 검증 후 배포 (#10) — 플래그 켜기 전까지 엔진 미기동
    if (AUTO_DETECT_ENABLED) startEngine()

    // 시작 시 퀘스트 카탈로그 자동 동기화 (#4) — 실패해도 앱 동작에는 영향 없음
    void syncQuestCatalogOnce().then((result) => {
      console.log(`[catalog] ${result.message}`)
      if (result.ok) {
        broadcastAll('store:changed', dashboardStore.getState())
      }
    })

    app.on('activate', () => {
      showManageWindow()
    })
  })

  app.on('before-quit', () => {
    // python 프로세스 SIGTERM 정리 — 좀비 방지 (명세서 §3)
    resetScheduler?.stop()
    wsClient?.stop()
    bridge?.stop()
  })

  // 두 창 모두 닫혀도 트레이 상주. 종료는 트레이 메뉴로만.
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

  const sendEngineStatus = (status: EngineStatus): void => {
    lastEngineStatus = status
    broadcastAll('engine:status', status)
  }

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
        broadcastAll('store:changed', dashboardStore.getState())
      }
    }
  })

  bridge.start()
  wsClient.connect()
}

function registerWindowIpc(): void {
  ipcMain.on('overlay:show', () => showOverlayWindow())
  ipcMain.on('overlay:hide', () => overlayWindow?.hide())
  ipcMain.on('manage:show', () => showManageWindow())
  ipcMain.on('app:quit', () => app.quit())

  ipcMain.on('engine:set-active-character', (_e, character: string | null) => {
    activeCharacter = character
    if (character) wsClient?.send({ type: 'active_character', character })
  })
}
