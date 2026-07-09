/**
 * electron-app/src/main/reset-logic.ts verbatim 복사 (#27) — 순수 함수라 변경 없이 그대로.
 * 리셋 계산을 웹에서도 직접 수행해야 한다 — Electron이 안 켜져 있으면 아무도 리셋을
 * 실행하지 않으므로, 로드된 클라우드 데이터에 대해 웹이 직접 day-boundary를 체크한다.
 */

export interface ResetSettings {
  dailyResetHour: number
  weeklyResetDay: number
}

export type ResetAction = 'reset' | 'baseline' | 'none'

export function dailyPeriodStart(nowSec: number, resetHour: number): number {
  const now = new Date(nowSec * 1000)
  const boundary = new Date(now.getFullYear(), now.getMonth(), now.getDate(), resetHour)
  if (now.getTime() < boundary.getTime()) {
    boundary.setDate(boundary.getDate() - 1)
  }
  return Math.floor(boundary.getTime() / 1000)
}

export function weeklyPeriodStart(nowSec: number, resetDay: number, resetHour: number): number {
  const dayStart = new Date(dailyPeriodStart(nowSec, resetHour) * 1000)
  const daysSinceReset = (dayStart.getDay() - resetDay + 7) % 7
  dayStart.setDate(dayStart.getDate() - daysSinceReset)
  return Math.floor(dayStart.getTime() / 1000)
}

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
