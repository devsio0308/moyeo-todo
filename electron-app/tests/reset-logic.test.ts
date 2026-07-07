import { describe, expect, it } from 'vitest'
import {
  computeResets,
  dailyPeriodStart,
  decideReset,
  weeklyPeriodStart
} from '../src/main/reset-logic'

/** 로컬 타임존 기준 epoch 초 */
const at = (
  y: number,
  mo: number,
  d: number,
  h = 0,
  mi = 0
): number => Math.floor(new Date(y, mo - 1, d, h, mi).getTime() / 1000)

describe('dailyPeriodStart', () => {
  it('리셋 시각(0시) 이후면 오늘 0시가 주기 시작', () => {
    expect(dailyPeriodStart(at(2026, 7, 7, 15, 30), 0)).toBe(at(2026, 7, 7, 0))
  })

  it('리셋 시각(6시) 전이면 어제 6시가 주기 시작', () => {
    expect(dailyPeriodStart(at(2026, 7, 7, 5, 59), 6)).toBe(at(2026, 7, 6, 6))
    expect(dailyPeriodStart(at(2026, 7, 7, 6, 0), 6)).toBe(at(2026, 7, 7, 6))
  })
})

describe('weeklyPeriodStart', () => {
  // 2026-07-07은 화요일 (getDay()=2)
  it('목요일(4) 리셋 — 화요일이면 지난주 목요일이 시작', () => {
    expect(weeklyPeriodStart(at(2026, 7, 7, 12), 4, 0)).toBe(at(2026, 7, 2, 0))
  })

  it('목요일 당일 리셋 시각 이후면 그날이 시작', () => {
    expect(weeklyPeriodStart(at(2026, 7, 9, 1), 4, 0)).toBe(at(2026, 7, 9, 0))
  })

  it('일요일(0) 리셋 — 화요일이면 지난 일요일이 시작', () => {
    expect(weeklyPeriodStart(at(2026, 7, 7, 12), 0, 0)).toBe(at(2026, 7, 5, 0))
  })

  it('리셋 시각(6시)이 주간 경계에도 적용된다', () => {
    // 목요일 새벽 5시는 아직 지난주
    expect(weeklyPeriodStart(at(2026, 7, 9, 5), 4, 6)).toBe(at(2026, 7, 2, 6))
    expect(weeklyPeriodStart(at(2026, 7, 9, 7), 4, 6)).toBe(at(2026, 7, 9, 6))
  })
})

describe('decideReset', () => {
  it('최초 실행(null)은 baseline — 데이터를 지우지 않는다', () => {
    expect(decideReset(null, at(2026, 7, 7))).toBe('baseline')
  })

  it('마지막 리셋이 주기 시작 이전이면 reset', () => {
    expect(decideReset(at(2026, 7, 6, 23), at(2026, 7, 7, 0))).toBe('reset')
  })

  it('주기 시작 이후에 이미 리셋했으면 none', () => {
    expect(decideReset(at(2026, 7, 7, 1), at(2026, 7, 7, 0))).toBe('none')
  })
})

describe('computeResets — 시나리오', () => {
  const settings = { dailyResetHour: 6, weeklyResetDay: 4 }

  it('절전으로 자정을 놓쳐도 다음 체크에서 따라잡는다', () => {
    // 7/6 저녁에 마지막 체크 → 슬립 → 7/7 오전 9시에 깨어남
    const lastDaily = at(2026, 7, 6, 20)
    const lastWeekly = at(2026, 7, 2, 7)
    const r = computeResets(lastDaily, lastWeekly, settings, at(2026, 7, 7, 9))
    expect(r.daily).toBe('reset') // 7/7 06:00 경계를 넘김
    expect(r.weekly).toBe('none') // 주간 경계(7/9 목 06:00)는 아직
  })

  it('여러 날 꺼져 있었어도 리셋은 한 번만 (멱등)', () => {
    const r = computeResets(at(2026, 7, 1), at(2026, 7, 1), settings, at(2026, 7, 7, 9))
    expect(r.daily).toBe('reset')
    expect(r.weekly).toBe('reset') // 7/2 목 06:00 경계를 넘김
    // 리셋 후 lastResetAt = now 로 기록되면 같은 시각 재체크 시 none
    const after = computeResets(at(2026, 7, 7, 9), at(2026, 7, 7, 9), settings, at(2026, 7, 7, 9, 1))
    expect(after.daily).toBe('none')
    expect(after.weekly).toBe('none')
  })

  it('같은 날 재시작해도 리셋되지 않는다', () => {
    const r = computeResets(at(2026, 7, 7, 7), at(2026, 7, 3), settings, at(2026, 7, 7, 22))
    expect(r.daily).toBe('none')
    expect(r.weekly).toBe('none')
  })
})
