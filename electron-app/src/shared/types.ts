/**
 * 공용 타입 정의 — shared/schema.json 과 1:1 대응.
 * main / preload / renderer 모두에서 import 한다.
 */

export type TaskPeriod = 'daily' | 'weekly'

/** 퀘스트 카테고리 태그 (#13) — 일일/주간은 섹션으로 구분되므로 배지는 카테고리 표시.
 *  배열 순서 = 섹션 내 정렬 순서 (전투 → 물물교환 → 알바 → 구매) */
export const QUEST_CATEGORIES = ['전투', '물물교환', '알바', '구매'] as const
export type QuestCategory = (typeof QUEST_CATEGORIES)[number]

/** 카테고리 → CSS 클래스 접미사 */
export const QUEST_CATEGORY_CLASS: Record<QuestCategory, string> = {
  전투: 'combat',
  물물교환: 'barter',
  알바: 'parttime',
  구매: 'purchase'
}

export function isQuestCategory(value: unknown): value is QuestCategory {
  return typeof value === 'string' && (QUEST_CATEGORIES as readonly string[]).includes(value)
}

/** 섹션 내 정렬용 카테고리 순위 — 미지정 카테고리는 맨 뒤 */
export function questCategoryOrder(category?: QuestCategory | null): number {
  return category ? QUEST_CATEGORIES.indexOf(category) : QUEST_CATEGORIES.length
}

export interface TaskState {
  done: boolean
  lastDoneAt: number | null // unix epoch (초)
  displayName: string
  period: TaskPeriod
  /** Firebase 카탈로그 출처 퀘스트면 해당 문서 id (#4). 수동 추가는 null/없음 */
  catalogId?: string | null
  /** 완료에 필요한 횟수 (#7). 없으면 1 (단일 퀘스트) */
  targetCount?: number
  /** 현재 진행 횟수 (#7). 없으면 0 */
  count?: number
  /** 카테고리 태그 (#13). 없으면 배지 미표시 */
  category?: QuestCategory | null
  /** 지역 태그 (#24, 자유 문자열 — 예: 두갈드아일, 던바튼). 없으면 미표시 */
  location?: string | null
  /** 이 캐릭터는 이 카탈로그 퀘스트를 하지 않음 (#25).
   *  true면 항상 완료 상태로 고정되고 리셋 대상에서 제외된다. 커스텀 퀘스트에는 의미 없음 */
  excluded?: boolean
}

/** Firestore quests 컬렉션에서 가져온 카탈로그 항목 (#4) */
export interface QuestCatalogItem {
  id: string
  name: string
  period: TaskPeriod
  /** 완료에 필요한 횟수 (#7). 없으면 1 */
  targetCount?: number
  /** 카테고리 태그 (#13) */
  category?: QuestCategory | null
  /** 지역 태그 (#24) */
  location?: string | null
}

/** 카탈로그 동기화 결과 (#4) */
export interface CatalogSyncResult {
  ok: boolean
  message: string
  added?: number
  updated?: number
}

/** 게임계정 ID 등록 결과 (#26) */
export interface CloudRegisterResult {
  ok: boolean
  message: string
  /** true면 원격 데이터를 불러와 로컬을 덮어썼음 (기존 등록 기기) */
  pulled?: boolean
}

/** 수동 클라우드 동기화(풀) 결과 (#28) */
export interface CloudSyncResult {
  ok: boolean
  message: string
}

export interface Character {
  displayName: string
  tasks: Record<string, TaskState>
}

export interface Settings {
  /** 0=일요일 ... 6=토요일 */
  weeklyResetDay: number
  dailyResetHour: number
  /** 퀘스트 카탈로그를 가져올 Firebase 프로젝트 ID (#4). null이면 비활성 */
  firebaseProjectId: string | null
  /** 알람 규칙별 모드 (#11). 키: AlarmRule.id, 없으면 기본 'sound'(UI+소리) */
  alarmModes?: Record<string, import('./alarms').AlarmMode>
  /** 게임계정 ID (#26) — Firestore 동기화 키. 등록하면 캐릭터/퀘스트 진행 상황이 클라우드에 동기화된다 */
  gameAccountId?: string | null
}

/**
 * Firestore players/{gameAccountId} 문서 형태 (#26).
 * 기기별 설정은 제외 — 캐릭터 진행 상황과 리셋 스케줄만 여러 기기/웹 오버레이 간 동기화 대상.
 */
export interface CloudPlayerData {
  characters: Record<string, Character>
  characterOrder: string[]
  lastDailyResetAt: number | null
  lastWeeklyResetAt: number | null
  dailyResetHour: number
  weeklyResetDay: number
  /** 마지막 푸시 시각 (unix epoch 초) — 디버깅용 */
  updatedAt: number
}

export interface StoreShape {
  characters: Record<string, Character>
  characterOrder: string[]
  settings: Settings
  lastDailyResetAt: number | null
  lastWeeklyResetAt: number | null
  /** 마지막으로 동기화된 퀘스트 카탈로그 캐시 (#4) — 새 캐릭터 생성 시 재사용 */
  questCatalog?: QuestCatalogItem[]
  /** 추천 퀘스트 목록 캐시 (#15) — 선택해서 커스텀 퀘스트로 추가 */
  recommendedQuests?: QuestCatalogItem[]
  /** 스토어 마이그레이션 버전 (내부용) */
  metaVersion?: number
}
