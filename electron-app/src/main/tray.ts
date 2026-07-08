import { BrowserWindow, Menu, Tray, app, nativeImage } from 'electron'
import { AUTO_DETECT_ENABLED } from '../shared/types'

// 16x16 단색 원형 아이콘 (base64 PNG) — 별도 바이너리 리소스 없이 인라인 유지
const TRAY_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAALklEQVR42mOQk1NhoAQz0MqA/zgwQQP+E4lpY8B/EvGoAbQwYODTAVWSMv1zIwBy/duFhqdjUwAAAABJRU5ErkJggg=='

interface TrayCallbacks {
  onTogglePauseCapture: (paused: boolean) => void
}

let tray: Tray | null = null
let capturePaused = false

export function isCapturePaused(): boolean {
  return capturePaused
}

export function createTray(win: BrowserWindow, callbacks: TrayCallbacks): Tray {
  const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL)
  if (process.platform === 'darwin') icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('모여길드 도비')

  const rebuildMenu = (): void => {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: win.isVisible() ? '숨기기' : '보이기',
        click: () => {
          if (win.isVisible()) win.hide()
          else win.show()
          rebuildMenu()
        }
      }
    ]

    // 자동 감지 비활성 버전(#10)에서는 캡처 관련 메뉴 숨김
    if (AUTO_DETECT_ENABLED) {
      template.push({
        label: '캡처 일시정지',
        type: 'checkbox',
        checked: capturePaused,
        click: (item) => {
          capturePaused = item.checked
          callbacks.onTogglePauseCapture(capturePaused)
        }
      })
    }

    template.push(
      { type: 'separator' },
      {
        label: '종료',
        click: () => {
          app.quit()
        }
      }
    )
    tray?.setContextMenu(Menu.buildFromTemplate(template))
  }

  rebuildMenu()
  win.on('show', rebuildMenu)
  win.on('hide', rebuildMenu)

  // 좌클릭으로 보이기/숨기기 토글 (Windows 관례)
  tray.on('click', () => {
    if (win.isVisible()) win.hide()
    else win.show()
  })

  return tray
}
