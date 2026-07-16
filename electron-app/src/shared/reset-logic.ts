/**
 * 리셋 판단 순수 로직 (명세서 §6).
 * Electron 의존이 없어 단위 테스트 가능. 시각 계산은 모두 로컬 타임존 기준.
 *
 * 핵심: "자정에 타이머가 울리길" 기대하지 않고,
 * 언제 검사하든 `마지막 리셋 시각 < 현재 주기의 시작` 이면 리셋한다.
 * (절전/슬립으로 경계를 놓쳐도 다음 검사 때 따라잡는다)
 */

export interface ResetSettings {
  dailyResetHour: number // 0–23
  weeklyResetDay: number // 0=일요일 ... 6=토요일
}

export type ResetAction = 'reset' | 'baseline' | 'none'

/** 현재 '게임 기준 하루'의 시작 시각 (unix epoch 초) */
export function dailyPeriodStart(nowSec: number, resetHour: number): number {
  const now = new Date(nowSec * 1000)
  const boundary = new Date(now.getFullYear(), now.getMonth(), now.getDate(), resetHour)
  if (now.getTime() < boundary.getTime()) {
    boundary.setDate(boundary.getDate() - 1) // 아직 오늘의 리셋 시각 전 → 어제가 기준
  }
  return Math.floor(boundary.getTime() / 1000)
}

/** 현재 '게임 기준 한 주'의 시작 시각 (리셋 요일의 리셋 시각, unix epoch 초) */
export function weeklyPeriodStart(nowSec: number, resetDay: number, resetHour: number): number {
  const dayStart = new Date(dailyPeriodStart(nowSec, resetHour) * 1000)
  // Date.getDay(): 0=일요일 — 명세서 규약과 동일
  const daysSinceReset = (dayStart.getDay() - resetDay + 7) % 7
  dayStart.setDate(dayStart.getDate() - daysSinceReset)
  return Math.floor(dayStart.getTime() / 1000)
}

/**
 * 리셋 필요 여부 판단.
 * - lastResetAt이 null (최초 실행): 리셋하지 않고 현재 주기 시작을 기준점으로 기록만 ('baseline')
 *   — 설치 직후 유저가 체크해 둔 항목을 재시작 때마다 지우지 않기 위함
 * - lastResetAt < 주기 시작: 'reset'
 */
export function decideReset(lastResetAt: number | null, periodStartSec: number): ResetAction {
  if (lastResetAt === null) return 'baseline'
  return lastResetAt < periodStartSec ? 'reset' : 'none'
}

export interface ResetDecision {
  daily: ResetAction
  weekly: ResetAction
  dailyPeriodStart: number
  weeklyPeriodStart: number
}

export function computeResets(
  lastDailyResetAt: number | null,
  lastWeeklyResetAt: number | null,
  settings: ResetSettings,
  nowSec: number
): ResetDecision {
  const daily = dailyPeriodStart(nowSec, settings.dailyResetHour)
  const weekly = weeklyPeriodStart(nowSec, settings.weeklyResetDay, settings.dailyResetHour)
  return {
    daily: decideReset(lastDailyResetAt, daily),
    weekly: decideReset(lastWeeklyResetAt, weekly),
    dailyPeriodStart: daily,
    weeklyPeriodStart: weekly
  }
}
