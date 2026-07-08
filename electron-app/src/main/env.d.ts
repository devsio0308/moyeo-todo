/** electron-vite가 .env에서 주입하는 main 프로세스 환경변수 타입 (#14) */
interface ImportMetaEnv {
  /** Firebase 프로젝트 ID 기본값 — electron-app/.env (git 미포함) */
  readonly MAIN_VITE_FIREBASE_PROJECT_ID?: string
}
