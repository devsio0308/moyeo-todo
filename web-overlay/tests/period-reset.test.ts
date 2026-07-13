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
