import { describe, expect, it } from 'vitest'
import { poolDaysAfterToday, poolForfeitDays, poolTodayMax } from '../src/shared/pool-quest'

// 기본 설정: 일일 06:00 / 주간 월요일 (#1)
const SETTINGS = { dailyResetHour: 6, weeklyResetDay: 1 }

/** 2026-07-13(월)이 주 시작인 주의 요일별 10:00 시각 (로컬 타임존) */
function at(dayOffset: number, hour = 10): number {
  return Math.floor(new Date(2026, 6, 13 + dayOffset, hour).getTime() / 1000)
}

const MON = at(0)
const TUE = at(1)
const WED = at(2)
const SUN = at(6)

describe('poolDaysAfterToday', () => {
  it('월요일은 6일, 일요일은 0일 남는다', () => {
    expect(poolDaysAfterToday(MON, SETTINGS)).toBe(6)
    expect(poolDaysAfterToday(TUE, SETTINGS)).toBe(5)
    expect(poolDaysAfterToday(SUN, SETTINGS)).toBe(0)
  })

  it('리셋 시각(06:00) 전에는 전날 기준으로 계산한다', () => {
    // 화요일 새벽 5시 = 게임 기준 아직 월요일
    expect(poolDaysAfterToday(at(1, 5), SETTINGS)).toBe(6)
  })
})

describe('poolTodayMax — 검은/심층 구멍 ×14', () => {
  const pool = (count: number, dailyUsed: number) => ({ targetCount: 14, count, dailyUsed })

  it('월요일 시작: 최대 8 (하루 상한 = target - 6)', () => {
    expect(poolTodayMax(pool(0, 0), MON, SETTINGS)).toBe(8)
  })

  it('월요일에 4회 사용 중이어도 오늘 최대치는 그대로 8', () => {
    expect(poolTodayMax(pool(4, 4), MON, SETTINGS)).toBe(8)
  })

  it('월 8회 → 화요일 최대 1', () => {
    expect(poolTodayMax(pool(8, 0), TUE, SETTINGS)).toBe(1)
  })

  it('월 4회 → 화요일 최대 5', () => {
    expect(poolTodayMax(pool(4, 0), TUE, SETTINGS)).toBe(5)
  })

  it('월 4회 + 화 2회 → 수요일 최대 4', () => {
    expect(poolTodayMax(pool(6, 0), WED, SETTINGS)).toBe(4)
  })

  it('월~토 전부 스킵(차감 6) → 일요일 최대 8', () => {
    expect(poolTodayMax(pool(6, 0), SUN, SETTINGS)).toBe(8)
  })

  it('풀 소진 시 0으로 클램프 (수동 보정으로 깨진 불변식 포함)', () => {
    expect(poolTodayMax(pool(14, 0), WED, SETTINGS)).toBe(0)
    expect(poolTodayMax(pool(13, 0), MON, SETTINGS)).toBe(0) // 남은 1 < 남은 요일 6
  })
})

describe('poolForfeitDays', () => {
  it('하루 지났고 안 갔으면 1', () => {
    expect(poolForfeitDays(0, 1)).toBe(1)
  })

  it('하루 지났고 1회라도 갔으면 0', () => {
    expect(poolForfeitDays(3, 1)).toBe(0)
  })

  it('3일 못 열었고 마지막 활동일에 안 갔으면 3', () => {
    expect(poolForfeitDays(0, 3)).toBe(3)
  })

  it('3일 못 열었고 마지막 활동일에는 갔으면 2', () => {
    expect(poolForfeitDays(2, 3)).toBe(2)
  })
})
