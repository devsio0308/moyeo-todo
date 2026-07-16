import { app } from 'electron'

/**
 * dev 모드 저장소 분리 — 개발/스모크 테스트가 실사용 데이터를 건드리지 않도록
 * userData를 별도 디렉터리(moyeo-todo-dev)로 돌린다.
 *
 * 주의: electron-store가 userData 경로를 참조하므로, 이 모듈은 store를 만들거나
 * import하는 어떤 모듈보다도 먼저 import되어야 한다 (index.ts 최상단).
 */
if (!app.isPackaged) {
  app.setPath('userData', `${app.getPath('userData')}-dev`)
}

export {}
