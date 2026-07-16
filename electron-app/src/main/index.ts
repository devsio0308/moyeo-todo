import './dev-userdata' // 반드시 최상단 — store 생성 전에 dev용 userData 경로로 전환
import { app, BrowserWindow, ipcMain } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createManageWindow, createOverlayWindow } from './window'
import { createTray } from './tray'
import { registerIpcHandlers } from './ipc-handlers'
import { clearHistory, historyState, redoHistory, setHistoryListener, undoHistory } from './history'
import { checkForUpdates } from './auto-update'
import { dashboardStore } from './store'
import { ResetScheduler } from './reset-scheduler'
import { syncQuestCatalogIfChanged } from './quest-catalog'
import { pushCloudSyncIfRegistered, reconcileCloudSyncOnStartup } from './cloud-sync'
import type { CatalogNotice } from '../shared/types'

// 알람 차임(#11)을 사용자 제스처 없이 재생할 수 있게 autoplay 정책 해제
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

let manageWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let resetScheduler: ResetScheduler | null = null
let catalogWatchTimer: NodeJS.Timeout | null = null

/** 카탈로그 백그라운드 감시 주기 (#catalog-watch) — 변경이 한 달에 1~2회뿐이라 여유 있게 */
const CATALOG_WATCH_INTERVAL_MS = 3 * 60 * 60 * 1000

/**
 * meta/catalog 문서만 가볍게 확인해 변경이 있을 때만 전체 동기화 (#catalog-watch).
 * 앱 시작 시 1회 + 이후 CATALOG_WATCH_INTERVAL_MS 주기로 호출된다.
 */
function runCatalogWatch(): void {
  void syncQuestCatalogIfChanged().then((result) => {
    if (!result) return // meta 문서 기준 변경 없음 — 조용히 스킵
    console.log(`[catalog] ${result.message}`)
    if (!result.ok) return

    clearHistory() // 카탈로그 추가/삭제로 캐릭터 태스크가 바뀌므로 (#undo)
    broadcastAll('store:changed', dashboardStore.getState())

    const addedNames = result.addedNames ?? []
    const removedNames = result.removedNames ?? []
    if (addedNames.length > 0 || removedNames.length > 0) {
      const notice: CatalogNotice = { addedNames, removedNames }
      broadcastAll('catalog:notice', notice)
    }
  })
}

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
    // 관리 창이 메인 프로그램 — 닫히면 숨어있는 오버레이까지 포함해 전체 종료
    app.quit()
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
  // 실행취소 단축키 (#undo) — 오버레이 창이 포커스일 때만. before-input-event는
  // 애플리케이션 메뉴 액셀러레이터보다 먼저 실행되어 mac의 Cmd+Z 가로채기도 안전
  overlayWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const mod = input.control || input.meta
    if (!mod) return
    const key = input.key.toLowerCase()
    if (key === 'z' && !input.shift) {
      event.preventDefault()
      if (undoHistory()) broadcastAll('store:changed', dashboardStore.getState())
    } else if ((key === 'z' && input.shift) || key === 'y') {
      event.preventDefault()
      if (redoHistory()) broadcastAll('store:changed', dashboardStore.getState())
    }
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

    // 클라우드 화해(pull-first) — 다른 기기가 그 사이 쓴 내용이 있으면 먼저 가져온다.
    // 동기 호출로 푸시 게이트가 즉시 걸리므로, 이후의 리셋/카탈로그 푸시가
    // 낡은 로컬 상태로 클라우드를 덮어쓰는 일이 없다.
    const reconcile = reconcileCloudSyncOnStartup()

    // 리셋 스케줄러 — 시작/포커스/절전복귀 시 day-boundary 체크 (명세서 §6)
    resetScheduler = new ResetScheduler(() => {
      clearHistory() // 리셋 전 상태를 실행취소로 부활시키지 않도록 (#undo)
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
    setHistoryListener(() => broadcastAll('history:changed', historyState()))

    // 시작 시 업데이트 확인 — 새 버전 있으면 백그라운드 다운로드 후 알림
    checkForUpdates()

    void reconcile
      .then((result) => {
        if (result === 'pulled') {
          // 원격 데이터를 받아왔으니 최신 시각 기준으로 리셋 재판정 + 화면 갱신
          clearHistory()
          resetScheduler?.checkNow()
          broadcastAll('store:changed', dashboardStore.getState())
        }
      })
      .finally(() => {
        // 카탈로그 동기화는 화해 이후에 — pull 전에 실행하면 카탈로그가 추가한
        // 퀘스트가 pull에 덮여 사라질 수 있다 (#4)
        runCatalogWatch()
        catalogWatchTimer = setInterval(runCatalogWatch, CATALOG_WATCH_INTERVAL_MS)
      })

    app.on('activate', () => {
      showManageWindow()
    })
  })

  app.on('before-quit', () => {
    resetScheduler?.stop()
    if (catalogWatchTimer) clearInterval(catalogWatchTimer)
  })

  // 종료는 관리 창 닫기(위 'closed' 핸들러)로 처리 — 오버레이만 남은 상태는
  // 오버레이가 hide로만 닫히므로 발생하지 않는다
  app.on('window-all-closed', () => {
    app.quit()
  })
}

function registerWindowIpc(): void {
  ipcMain.on('overlay:show', () => showOverlayWindow())
  // 사용자 관점에선 '닫기'지만, 관리 프로그램이 떠 있는 동안은 숨김만 하고
  // 다시 열 때 바로 재사용한다 — 관리 창을 닫으면(전체 종료) 함께 사라짐
  ipcMain.on('overlay:close', () => overlayWindow?.hide())
}
