import { BrowserWindow, shell } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'

const PRELOAD = join(__dirname, '../preload/index.js')

function loadRenderer(win: BrowserWindow, hash?: string): void {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'] + (hash ? `#${hash}` : ''))
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
  }
}

function openExternalLinks(win: BrowserWindow): void {
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

/**
 * 게임 위에 떠 있는 체크 전용 오버레이 (#17).
 * 명세서 §5: frameless + 투명 + 항상 위. 드래그는 렌더러 CSS로 처리.
 */
export function createOverlayWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 360,
    height: 520,
    minWidth: 280,
    minHeight: 320,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: PRELOAD,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // 게임 위에 떠 있어야 하므로 전체화면 앱 위에서도 보이도록
  win.setAlwaysOnTop(true, 'screen-saver')
  win.on('ready-to-show', () => win.show())
  openExternalLinks(win)
  loadRenderer(win, 'overlay')
  return win
}

/**
 * 관리 창 (#17) — 시작 시 표시되는 메인 창.
 * 어드민 대시보드 스타일 (#22) — 최대화 상태로 연다.
 */
export function createManageWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: '#111116',
    title: '모여길드 도비',
    show: false,
    webPreferences: {
      preload: PRELOAD,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => {
    win.maximize() // 어드민 페이지 — 최대화로 시작 (#22)
    win.show()
  })
  openExternalLinks(win)
  loadRenderer(win)
  return win
}
