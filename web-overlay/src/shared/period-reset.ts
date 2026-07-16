/**
 * electron-app/src/main/store.ts의 resetTasks 메서드를 순수 함수로 이식 (#27).
 * 제외(#25)된 퀘스트는 리셋해도 완료 상태 유지하는 동작까지 동일하게 재현.
 * 풀형 퀘스트(검은/심층 구멍)의 일일 차감도 electron 쪽과 동일 규칙.
 */

import { poolForfeitDays } from './pool-quest'
import type { Character, TaskPeriod } from './types'

export function applyPeriodReset(
  characters: Record<string, Character>,
  period: TaskPeriod,
  /** 일일 리셋일 때 마지막 리셋 이후 지난 일수 (풀형 차감 계산용, 기본 1) */
  crossedDays = 1
): Record<string, Character> {
  const next: Record<string, Character> = {}
  for (const [charId, character] of Object.entries(characters)) {
    // 연동 일일 퀘스트(#linked): 안 간 날만큼 연동 주간 퀘스트에 +1 (그날치 소멸)
    const linkForfeit = new Map<string, number>()
    if (period === 'daily') {
      for (const task of Object.values(character.tasks)) {
        if (task.period !== 'daily' || !task.linkedCatalogId || task.excluded) continue
        const missed = poolForfeitDays(task.done ? 1 : 0, crossedDays)
        if (missed <= 0) continue
        const entry = Object.entries(character.tasks).find(
          ([, s]) => s.catalogId === task.linkedCatalogId && !s.excluded
        )
        if (entry) linkForfeit.set(entry[0], (linkForfeit.get(entry[0]) ?? 0) + missed)
      }
    }

    const tasks: Character['tasks'] = {}
    for (const [taskId, task] of Object.entries(character.tasks)) {
      if (period === 'daily' && task.dailyPool && task.period === 'weekly' && !task.excluded) {
        // 풀형 퀘스트(주간)의 일일 처리: 안 간 날만큼 차감하고 오늘 사용량 초기화
        const target = task.targetCount ?? 1
        const forfeit = poolForfeitDays(task.dailyUsed ?? 0, crossedDays)
        const count = Math.min(target, (task.count ?? 0) + forfeit)
        tasks[taskId] = { ...task, count, done: count >= target, dailyUsed: 0 }
      } else if (task.period !== period) {
        tasks[taskId] = task
      } else if (task.excluded) {
        tasks[taskId] = { ...task, done: true, count: task.targetCount ?? 1 }
      } else {
        tasks[taskId] = {
          ...task,
          done: false,
          lastDoneAt: null,
          count: 0,
          ...(task.dailyPool ? { dailyUsed: 0 } : {})
        }
      }

      const add = linkForfeit.get(taskId)
      if (add) {
        const base = tasks[taskId]
        const target = base.targetCount ?? 1
        const count = Math.min(target, (base.count ?? 0) + add)
        tasks[taskId] = { ...base, count, done: count >= target }
      }
    }
    next[charId] = { ...character, tasks }
  }
  return next
}
