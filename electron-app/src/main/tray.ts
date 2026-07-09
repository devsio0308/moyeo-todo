import { Menu, Tray, app, nativeImage } from 'electron'
import { AUTO_DETECT_ENABLED } from '../shared/types'

// 16x16 단색 원형 아이콘 (base64 PNG) — 별도 바이너리 리소스 없이 인라인 유지
const TRAY_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAALklEQVR42mOQk1NhoAQz0MqA/zgwQQP+E4lpY8B/EvGoAbQwYODTAVWSMv1zIwBy/duFhqdjUwAAAABJRU5ErkJggg=='

export interface TrayCallbacks {
  isOverlayVisible: () => boolean
  toggleOverlay: () => void
  openManage: () => void
  onTogglePauseCapture: (paused: boolean) => void
}

let tray: Tray | null = null
let capturePaused = false

export function isCapturePaused(): boolean {
  return capturePaused
}

/** 두 창(#17) 어느 쪽이 닫혀 있어도 트레이에서 복구 가능해야 한다 */
export function createTray(callbacks: TrayCallbacks): Tray {
  const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL)
  if (process.platform === 'darwin') icon.setTemplateImage(true)
  tray = new Tray(icon)
  tray.setToolTip('모여길드 도비')

  const rebuildMenu = (): void => {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: callbacks.isOverlayVisible() ? '오버레이 숨기기' : '오버레이 보이기',
        click: () => {
          callbacks.toggleOverlay()
          rebuildMenu()
        }
      },
      {
        label: '관리 창 열기',
        click: () => callbacks.openManage()
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

  // 좌클릭: 오버레이 토글 (일상 사용 동선)
  tray.on('click', () => {
    callbacks.toggleOverlay()
    rebuildMenu()
  })

  return tray
}
