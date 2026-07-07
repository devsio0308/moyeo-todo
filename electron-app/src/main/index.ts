import { app, BrowserWindow, ipcMain } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createMainWindow } from './window'
import { createTray } from './tray'

let mainWindow: BrowserWindow | null = null

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
        // TODO(feature/ws-bridge): python 엔진에 pause 전달
        mainWindow?.webContents.send('capture:paused-changed', paused)
      }
    })

    registerWindowIpc()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createMainWindow()
      } else {
        mainWindow?.show()
      }
    })
  })

  // 오버레이 앱: 창을 닫아도 트레이에 남는다. 종료는 트레이 메뉴로만.
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      // no-op: 트레이 상주
    }
  })
}

function registerWindowIpc(): void {
  ipcMain.on('window:hide', () => mainWindow?.hide())
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('app:quit', () => app.quit())
}
