/**
 * electron-app/src/shared/types.ts의 부분 복사본 (#27).
 * 웹앱은 캐릭터/퀘스트 CRUD가 없어 필요한 타입만 가져옴.
 * 워크스페이스 패키지 분리 전까지는 electron-app 쪽 변경 시 수동으로 맞춰야 한다.
 */

export type TaskMode = 'auto' | 'manual'
export type TaskPeriod = 'daily' | 'weekly'

export const QUEST_CATEGORIES = ['전투', '물물교환', '알바', '구매'] as const
export type QuestCategory = (typeof QUEST_CATEGORIES)[number]

export const QUEST_CATEGORY_CLASS: Record<QuestCategory, string> = {
  전투: 'combat',
  물물교환: 'barter',
  알바: 'parttime',
  구매: 'purchase'
}

export function questCategoryOrder(category?: QuestCategory | null): number {
  return category ? QUEST_CATEGORIES.indexOf(category) : QUEST_CATEGORIES.length
}

export interface TaskState {
  done: boolean
  mode: TaskMode
  lastDoneAt: number | null
  displayName: string
  period: TaskPeriod
  threshold: number | null
  catalogId?: string | null
  targetCount?: number
  count?: number
  category?: QuestCategory | null
  location?: string | null
  excluded?: boolean
}

export interface Character {
  displayName: string
  tasks: Record<string, TaskState>
}

/** Firestore players/{id} 문서 형태 — electron-app의 CloudPlayerData와 동일 */
export interface CloudPlayerData {
  characters: Record<string, Character>
  characterOrder: string[]
  lastDailyResetAt: number | null
  lastWeeklyResetAt: number | null
  dailyResetHour: number
  weeklyResetDay: number
  updatedAt: number
}
