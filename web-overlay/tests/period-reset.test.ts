import { describe, expect, it } from 'vitest'
import { applyPeriodReset } from '../src/shared/period-reset'
import type { Character } from '../src/shared/types'

const chars: Record<string, Character> = {
  character_01: {
    displayName: '테스트',
    tasks: {
      task_daily: {
        done: true,
        lastDoneAt: 100,
        displayName: '일일 던전',
        period: 'daily',
        count: 1,
        targetCount: 1
      },
      task_weekly_excluded: {
        done: true,
        lastDoneAt: 100,
        displayName: '심층던전 매우 어려움',
        period: 'weekly',
        count: 1,
        targetCount: 1,
        excluded: true
      }
    }
  }
}

describe('applyPeriodReset', () => {
  it('해당 주기의 일반 퀘스트만 초기화한다', () => {
    const next = applyPeriodReset(chars, 'daily')
    expect(next.character_01.tasks.task_daily.done).toBe(false)
    expect(next.character_01.tasks.task_daily.count).toBe(0)
    expect(next.character_01.tasks.task_daily.lastDoneAt).toBeNull()
    // 다른 주기는 안 건드림
    expect(next.character_01.tasks.task_weekly_excluded.done).toBe(true)
  })

  it('제외(#25)된 퀘스트는 리셋해도 완료 상태 유지', () => {
    const next = applyPeriodReset(chars, 'weekly')
    expect(next.character_01.tasks.task_weekly_excluded.done).toBe(true)
    expect(next.character_01.tasks.task_weekly_excluded.count).toBe(1)
  })
})

describe('applyPeriodReset — 풀형 퀘스트 (검은/심층 구멍)', () => {
  const poolChars = (count: number, dailyUsed: number): Record<string, Character> => ({
    character_01: {
      displayName: '테스트',
      tasks: {
        task_pool: {
          done: false,
          lastDoneAt: null,
          displayName: '검은/심층 구멍',
          period: 'weekly',
          count,
          targetCount: 14,
          dailyPool: true,
          dailyUsed
        }
      }
    }
  })

  it('일일 리셋: 그날 갔으면 차감 없이 오늘 사용량만 초기화', () => {
    const next = applyPeriodReset(poolChars(4, 4), 'daily')
    expect(next.character_01.tasks.task_pool.count).toBe(4)
    expect(next.character_01.tasks.task_pool.dailyUsed).toBe(0)
  })

  it('일일 리셋: 안 간 날은 count가 1 차감(소모)된다', () => {
    const next = applyPeriodReset(poolChars(4, 0), 'daily')
    expect(next.character_01.tasks.task_pool.count).toBe(5)
    expect(next.character_01.tasks.task_pool.dailyUsed).toBe(0)
  })

  it('일일 리셋: 3일 못 열었고 마지막 활동일에도 안 갔으면 3 차감', () => {
    const next = applyPeriodReset(poolChars(0, 0), 'daily', 3)
    expect(next.character_01.tasks.task_pool.count).toBe(3)
  })

  it('차감이 누적되어 target에 도달하면 done 처리', () => {
    const next = applyPeriodReset(poolChars(13, 0), 'daily')
    expect(next.character_01.tasks.task_pool.count).toBe(14)
    expect(next.character_01.tasks.task_pool.done).toBe(true)
  })

  it('주간 리셋: count/dailyUsed 모두 초기화', () => {
    const next = applyPeriodReset(poolChars(9, 2), 'weekly')
    expect(next.character_01.tasks.task_pool.count).toBe(0)
    expect(next.character_01.tasks.task_pool.dailyUsed).toBe(0)
    expect(next.character_01.tasks.task_pool.done).toBe(false)
  })
})

describe('applyPeriodReset — 연동 일일 퀘스트 (검은/심층 구멍 일일↔주간)', () => {
  const linkedChars = (dailyDone: boolean, weeklyCount: number): Record<string, Character> => ({
    character_01: {
      displayName: '테스트',
      tasks: {
        task_daily: {
          done: dailyDone,
          lastDoneAt: dailyDone ? 100 : null,
          displayName: '검은/심층 구멍',
          period: 'daily',
          count: dailyDone ? 1 : 0,
          targetCount: 1,
          catalogId: 'hole-daily',
          linkedCatalogId: 'hole-weekly'
        },
        task_weekly: {
          done: false,
          lastDoneAt: null,
          displayName: '검은/심층 구멍',
          period: 'weekly',
          count: weeklyCount,
          targetCount: 14,
          catalogId: 'hole-weekly'
        }
      }
    }
  })

  it('일일 리셋: 그날 갔으면(done) 주간 그대로, 일일만 초기화', () => {
    const next = applyPeriodReset(linkedChars(true, 5), 'daily')
    expect(next.character_01.tasks.task_weekly.count).toBe(5)
    expect(next.character_01.tasks.task_daily.done).toBe(false)
  })

  it('일일 리셋: 안 갔으면 주간 +1 (그날치 소멸)', () => {
    const next = applyPeriodReset(linkedChars(false, 5), 'daily')
    expect(next.character_01.tasks.task_weekly.count).toBe(6)
  })

  it('3일 못 열었고 마지막 날 안 갔으면 주간 +3', () => {
    const next = applyPeriodReset(linkedChars(false, 5), 'daily', 3)
    expect(next.character_01.tasks.task_weekly.count).toBe(8)
  })

  it('3일 못 열었고 마지막 날은 갔으면 주간 +2', () => {
    const next = applyPeriodReset(linkedChars(true, 5), 'daily', 3)
    expect(next.character_01.tasks.task_weekly.count).toBe(7)
  })

  it('소멸 누적으로 target 도달 시 done 처리 + 클램프', () => {
    const next = applyPeriodReset(linkedChars(false, 13), 'daily', 5)
    expect(next.character_01.tasks.task_weekly.count).toBe(14)
    expect(next.character_01.tasks.task_weekly.done).toBe(true)
  })

  it('주간 리셋: 둘 다 초기화, 연동 소멸 없음', () => {
    const next = applyPeriodReset(linkedChars(false, 9), 'weekly')
    expect(next.character_01.tasks.task_weekly.count).toBe(0)
    // 일일은 주간 리셋 대상 아님
    expect(next.character_01.tasks.task_daily.count).toBe(0)
  })
})
