import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

/**
 * GitHub Releases(public repo)를 업데이트 서버로 사용한 자동 업데이트.
 * 시작 시 1회 확인 → 새 버전이 있으면 앱이 실행 중인 동안 백그라운드로 내려받는다
 * (autoDownload 기본값 true). 다운로드가 끝나면 OS 알림 대신 onDownloaded 콜백으로
 * 관리 창에 "종료→업데이트→재실행" 안내 말풍선을 띄운다 (#auto-update-notice) —
 * checkForUpdatesAndNotify()가 기본 제공하는 OS 알림 대신 앱 안 UI로 대체.
 */
export function checkForUpdates(onDownloaded: (version: string) => void): void {
  if (!app.isPackaged) return // 개발 모드는 app-update.yml이 없어 스킵

  // autoUpdater는 EventEmitter라 'error' 리스너가 없으면 미처리 예외로 남는다
  // (예: macOS는 아직 zip 자산이 없어 다운로드 단계에서 항상 실패 — 무해하게 무시)
  autoUpdater.on('error', (e) => {
    console.warn('[auto-update] 업데이트 확인/다운로드 실패:', e)
  })

  autoUpdater.on('update-downloaded', (info) => {
    onDownloaded(info.version)
  })

  autoUpdater.checkForUpdates().catch((e) => {
    console.warn('[auto-update] 업데이트 확인 실패:', e)
  })
}
