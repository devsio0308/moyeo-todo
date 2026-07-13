import { app, BrowserWindow, ipcMain } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createManageWindow, createOverlayWindow } from './window'
import { createTray } from './tray'
import { registerIpcHandlers } from './ipc-handlers'
import { checkForUpdates } from './auto-update'
import { dashboardStore } from './store'
import { ResetScheduler } from './reset-scheduler'
import { syncQuestCatalogOnce } from './quest-catalog'
import { pushCloudSyncIfRegistered } from './cloud-sync'

// 알람 차임(#11)을 사용자 제스처 없이 재생할 수 있게 autoplay 정책 해제
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

let manageWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let resetScheduler: ResetScheduler | null = null

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
    electronApp.setAppUserModelId('com.hrjin.moyeo-todo')

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
      openManage: showManageWindow
    })

    registerWindowIpc()
    registerIpcHandlers(broadcastAll)

    // 시작 시 업데이트 확인 — 새 버전 있으면 백그라운드 다운로드 후 알림
    checkForUpdates()

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
    resetScheduler?.stop()
  })

  // 두 창 모두 닫혀도 트레이 상주. 종료는 트레이 메뉴로만.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      // no-op: 트레이 상주
    }
  })
}

function registerWindowIpc(): void {
  ipcMain.on('overlay:show', () => showOverlayWindow())
  // 사용자 관점에선 '닫기'지만, 관리 프로그램이 떠 있는 동안은 숨김만 하고
  // 다시 열 때 바로 재사용한다 — 프로그램 전체가 꺼지면 창도 자동으로 같이 사라짐
  ipcMain.on('overlay:close', () => overlayWindow?.hide())
  ipcMain.on('app:quit', () => app.quit())
}
