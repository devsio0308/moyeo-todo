/**
 * 공용 타입 정의 — shared/schema.json 과 1:1 대응.
 * main / preload / renderer 모두에서 import 한다.
 */

export type TaskMode = 'auto' | 'manual'
export type TaskPeriod = 'daily' | 'weekly'

export interface TaskState {
  done: boolean
  mode: TaskMode
  lastDoneAt: number | null // unix epoch (초)
  displayName: string
  period: TaskPeriod
  /** 매칭 threshold 개별 오버라이드. null이면 전역값 사용 */
  threshold: number | null
  /** Firebase 카탈로그 출처 퀘스트면 해당 문서 id (#4). 수동 추가는 null/없음 */
  catalogId?: string | null
}

/** Firestore quests 컬렉션에서 가져온 카탈로그 항목 (#4) */
export interface QuestCatalogItem {
  id: string
  name: string
  period: TaskPeriod
}

/** 카탈로그 동기화 결과 (#4) */
export interface CatalogSyncResult {
  ok: boolean
  message: string
  added?: number
  updated?: number
}

export interface Character {
  displayName: string
  tasks: Record<string, TaskState>
}

export interface CaptureRegion {
  left: number
  top: number
  width: number
  height: number
}

export interface Settings {
  captureIntervalSec: number
  /** 0=일요일 ... 6=토요일 */
  weeklyResetDay: number
  dailyResetHour: number
  /** 전역 기본 매칭 threshold */
  matchThreshold: number
  captureRegion: CaptureRegion | null
  /** 퀘스트 카탈로그를 가져올 Firebase 프로젝트 ID (#4). null이면 비활성 */
  firebaseProjectId: string | null
}

export interface StoreShape {
  characters: Record<string, Character>
  characterOrder: string[]
  settings: Settings
  lastDailyResetAt: number | null
  lastWeeklyResetAt: number | null
  /** 마지막으로 동기화된 퀘스트 카탈로그 캐시 (#4) — 새 캐릭터 생성 시 재사용 */
  questCatalog?: QuestCatalogItem[]
  /** 스토어 마이그레이션 버전 (내부용) */
  metaVersion?: number
}

// ── WebSocket 메시지 (명세서 §2) ─────────────────────────────

export interface TaskDetectedMessage {
  type: 'task_detected'
  character: string
  task: string
  confidence: number
  timestamp: number
}

export interface HeartbeatMessage {
  type: 'heartbeat'
  timestamp: number
}

export interface ActiveCharacterMessage {
  type: 'active_character'
  character: string
}

export interface ReloadConfigMessage {
  type: 'reload_config'
}

export interface SetPausedMessage {
  type: 'set_paused'
  paused: boolean
}

export interface CaptureScreenshotMessage {
  type: 'capture_screenshot'
}

/** Python → Electron: capture_screenshot 응답 (요청자에게만 전송) */
export interface ScreenshotMessage {
  type: 'screenshot'
  image?: string // base64 PNG — 실패 시 없음
  width?: number
  height?: number
  error?: string
}

/** Python → Electron */
export type EngineMessage = TaskDetectedMessage | HeartbeatMessage | ScreenshotMessage

/** Electron → Python */
export type ClientMessage =
  | ActiveCharacterMessage
  | ReloadConfigMessage
  | SetPausedMessage
  | CaptureScreenshotMessage

/** 엔진 스크린샷 (픽커 UI에 전달) — 좌표계는 mss 이미지 픽셀 */
export interface Screenshot {
  image: string // base64 PNG
  width: number
  height: number
}

/** 캐릭터별 등록된 템플릿 task id 목록 */
export type TemplateIndex = Record<string, string[]>

/** 엔진 연결 상태 (UI 배지 표시용) */
export type EngineStatus = 'connected' | 'disconnected' | 'failed'

export const WS_PORT = 47231
export const WS_URL = `ws://127.0.0.1:${WS_PORT}`
