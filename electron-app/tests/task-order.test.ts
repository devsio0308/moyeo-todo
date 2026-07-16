import { describe, expect, it } from 'vitest'
import { taskOrderCompare } from '../src/shared/types'
import type { TaskState } from '../src/shared/types'

const task = (order?: number): TaskState => ({
  done: false,
  lastDoneAt: null,
  displayName: '테스트',
  period: 'daily',
  order
})

describe('taskOrderCompare', () => {
  it('order가 낮은 쪽이 앞선다', () => {
    expect(taskOrderCompare(task(1), task(2))).toBeLessThan(0)
    expect(taskOrderCompare(task(2), task(1))).toBeGreaterThan(0)
  })

  it('order가 없는 항목은 맨 뒤로 취급한다', () => {
    expect(taskOrderCompare(task(undefined), task(0))).toBeGreaterThan(0)
    expect(taskOrderCompare(task(0), task(undefined))).toBeLessThan(0)
  })

  it('order가 같으면 0', () => {
    expect(taskOrderCompare(task(3), task(3))).toBe(0)
  })
})
