/**
 * 주간 풀형 퀘스트(검은/심층 구멍) 순수 로직.
 *
 * 게임 정책:
 * 1. 일주일 최대 target회 (기본 14).
 * 2. 하루도 안 간 날은 풀에서 1회 차감(소멸).
 * 3. 오늘 갈 수 있는 최대치 = 남은 풀에서 "남은 요일마다 1회씩"을 예약하고 남는 만큼.
 *    (하루 상한 = target − 6 = 8이 이 식에서 자연히 나온다)
 *
 * 데이터 모델: 주간 퀘스트 하나(count/targetCount)가 유일한 원본이고,
 * dailyUsed(오늘 사용량)만 추가로 기록한다. 일일 섹션에는 이 값으로 투영해 보여준다.
 * Electron 의존 없는 순수 함수 — web-overlay/src/shared에 verbatim 복사해 사용.
 */

import { dailyPeriodStart, weeklyPeriodStart, type ResetSettings } from './reset-logic'

export const POOL_DAYS_PER_WEEK = 7
const DAY_SEC = 86_400

export interface PoolTaskLike {
  targetCount?: number
  count?: number
  dailyUsed?: number
}

/** 오늘(게임 기준 하루) 이후, 주간 리셋 전까지 남은 날 수 (오늘 제외, 0~6) */
export function poolDaysAfterToday(nowSec: number, settings: ResetSettings): number {
  const weekEnd =
    weeklyPeriodStart(nowSec, settings.weeklyResetDay, settings.dailyResetHour) +
    POOL_DAYS_PER_WEEK * DAY_SEC
  const dayStart = dailyPeriodStart(nowSec, settings.dailyResetHour)
  return Math.max(0, Math.round((weekEnd - dayStart) / DAY_SEC) - 1)
}

/**
 * 오늘 갈 수 있는 총 횟수 (오늘 이미 간 횟수 포함).
 * = min(하루 상한, 오늘 시작 시점의 남은 풀 − 남은 요일 예약분)
 */
export function poolTodayMax(task: PoolTaskLike, nowSec: number, settings: ResetSettings): number {
  const target = task.targetCount ?? 1
  const used = task.dailyUsed ?? 0
  // 오늘 시작 시점의 남은 풀 = 전체 − (오늘 이전까지 소진분)
  const remainingAtDayStart = target - ((task.count ?? 0) - used)
  const capPerDay = target - (POOL_DAYS_PER_WEEK - 1)
  return Math.max(0, Math.min(capPerDay, remainingAtDayStart - poolDaysAfterToday(nowSec, settings)))
}

/**
 * 일일 리셋 시 차감(소멸)할 횟수.
 * @param dailyUsed 마지막 활동일의 사용량 — 0이면 그날도 차감 대상
 * @param crossedDays 마지막 일일 리셋 이후 지난 일수(경계 통과 횟수, ≥1) —
 *        앱을 며칠 못 열었으면 그 사이 날들도 하루 1회씩 차감
 */
export function poolForfeitDays(dailyUsed: number, crossedDays: number): number {
  return (dailyUsed === 0 ? 1 : 0) + Math.max(0, crossedDays - 1)
}
