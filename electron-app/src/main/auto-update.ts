import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

// 종료해도 자동으로 설치하지 않는다 — 유저가 알림의 '업데이트' 버튼을 눌러야만 설치·재시작
// 진행 (#auto-update-notice). 누르지 않으면 종료 후 다시 켜도 이전 버전 그대로 실행된다.
autoUpdater.autoInstallOnAppQuit = false

let listenersAttached = false

/** error/update-downloaded 리스너는 한 번만 붙인다 — checkForUpdates가 주기적으로
 *  반복 호출돼도(#auto-update-notice) 매번 새로 붙이면 중복 알림이 쌓인다 */
function ensureListeners(onDownloaded: (version: string) => void): void {
  if (listenersAttached) return
  listenersAttached = true

  // autoUpdater는 EventEmitter라 'error' 리스너가 없으면 미처리 예외로 남는다
  // (예: macOS는 아직 zip 자산이 없어 다운로드 단계에서 항상 실패 — 무해하게 무시)
  autoUpdater.on('error', (e) => {
    console.warn('[auto-update] 업데이트 확인/다운로드 실패:', e)
  })

  autoUpdater.on('update-downloaded', (info) => {
    onDownloaded(info.version)
  })
}

/**
 * GitHub Releases(public repo)를 업데이트 서버로 사용한 자동 업데이트.
 * 호출될 때마다 확인 → 새 버전이 있으면 앱이 실행 중인 동안 백그라운드로 내려받는다
 * (autoDownload 기본값 true). 다운로드 자체는 자동이지만 설치는 installUpdateNow()를
 * 명시적으로 호출해야만 진행된다 (#auto-update-notice) — 다운로드가 끝나면 onDownloaded
 * 콜백으로 관리 창에 안내 말풍선을 띄우고, 유저가 버튼을 눌러야 실제로 적용된다.
 * 시작 시 1회 + 주기적 재확인(호출측 타이머) 양쪽에서 안전하게 재사용 가능.
 */
export function checkForUpdates(onDownloaded: (version: string) => void): void {
  if (!app.isPackaged) return // 개발 모드는 app-update.yml이 없어 스킵

  ensureListeners(onDownloaded)
  autoUpdater.checkForUpdates().catch((e) => {
    console.warn('[auto-update] 업데이트 확인 실패:', e)
  })
}

/** 알림의 '업데이트' 버튼 — 지금 바로 설치하고 재시작 (#auto-update-notice).
 *  isSilent=true — false로 두면 NSIS 마법사 창이 뜨면서 기존 설치를 덮어쓰지 못하고
 *  별도 경로에 새로 설치해버리는 문제가 있었다(v1.1.1에서 확인). 예전엔
 *  autoInstallOnAppQuit 기본 동작이 조용히 설치해 문제가 없었던 것과 동일하게 맞춘다.
 *  isForceRunAfter=true로 플랫폼 무관하게 설치 후 자동 재실행을 보장한다 */
export function installUpdateNow(): void {
  if (!app.isPackaged) return // 개발 모드는 실제로 받은 업데이트가 없어 스킵
  autoUpdater.quitAndInstall(true, true)
}
