import { BrowserWindow, ipcMain, screen } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'
import type { CaptureRegion, Screenshot } from '../shared/types'

/**
 * 전체 화면 픽커 창 — 엔진이 찍은 스크린샷 위에서 영역을 드래그로 선택한다.
 * 반환 좌표는 스크린샷 이미지 픽셀 기준 (= mss/매칭과 동일 좌표계 → DPI 문제 없음).
 * ESC 또는 취소 시 null.
 */
export function openPicker(
  screenshot: Screenshot,
  message: string
): Promise<CaptureRegion | null> {
  return new Promise((resolve) => {
    const display = screen.getPrimaryDisplay()

    const win = new BrowserWindow({
      ...display.bounds,
      frame: false,
      transparent: false,
      alwaysOnTop: true,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    win.setAlwaysOnTop(true, 'screen-saver')

    let settled = false
    const settle = (rect: CaptureRegion | null): void => {
      if (settled) return
      settled = true
      cleanup()
      if (!win.isDestroyed()) win.close()
      resolve(rect)
    }

    const onDone = (e: Electron.IpcMainEvent, rect: CaptureRegion): void => {
      if (e.sender === win.webContents) settle(rect)
    }
    const onCancel = (e: Electron.IpcMainEvent): void => {
      if (e.sender === win.webContents) settle(null)
    }
    const cleanup = (): void => {
      ipcMain.removeListener('picker:done', onDone)
      ipcMain.removeListener('picker:cancel', onCancel)
    }

    ipcMain.on('picker:done', onDone)
    ipcMain.on('picker:cancel', onCancel)
    win.on('closed', () => settle(null))

    win.webContents.on('did-finish-load', () => {
      win.webContents.send('picker:init', { screenshot, message })
      win.show()
      win.focus()
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#picker`)
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'picker' })
    }
  })
}
