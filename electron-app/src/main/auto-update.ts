import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

/**
 * GitHub Releases(public repo)를 업데이트 서버로 사용한 자동 업데이트.
 * 시작 시 1회 확인 → 새 버전이 있으면 백그라운드로 내려받고, 완료되면
 * OS 알림 표시 (클릭 또는 다음 앱 재시작 시 설치, electron-updater 기본 동작).
 */
export function checkForUpdates(): void {
  if (!app.isPackaged) return // 개발 모드는 app-update.yml이 없어 스킵

  autoUpdater.checkForUpdatesAndNotify().catch((e) => {
    console.warn('[auto-update] 업데이트 확인 실패:', e)
  })
}
