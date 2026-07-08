import { BrowserWindow, shell } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'

/**
 * 오버레이 메인 윈도우 생성.
 * 명세서 §5: frameless + 투명 + 항상 위 + 작업표시줄 유지.
 * 드래그는 렌더러 CSS(-webkit-app-region: drag)로 처리한다.
 */
export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 380,
    height: 560,
    minWidth: 300,
    minHeight: 360,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // 게임 위에 떠 있어야 하므로 전체화면 앱 위에서도 보이도록
  win.setAlwaysOnTop(true, 'screen-saver')

  win.on('ready-to-show', () => win.show())

  // 외부 링크는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}
