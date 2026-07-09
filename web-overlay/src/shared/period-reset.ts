/**
 * electron-app/src/main/store.ts의 resetTasks 메서드를 순수 함수로 이식 (#27).
 * 제외(#25)된 퀘스트는 리셋해도 완료 상태 유지하는 동작까지 동일하게 재현.
 */

import type { Character, TaskPeriod } from './types'

export function applyPeriodReset(
  characters: Record<string, Character>,
  period: TaskPeriod
): Record<string, Character> {
  const next: Record<string, Character> = {}
  for (const [charId, character] of Object.entries(characters)) {
    const tasks: Character['tasks'] = {}
    for (const [taskId, task] of Object.entries(character.tasks)) {
      if (task.period !== period) {
        tasks[taskId] = task
      } else if (task.excluded) {
        tasks[taskId] = { ...task, done: true, count: task.targetCount ?? 1 }
      } else {
        tasks[taskId] = { ...task, done: false, lastDoneAt: null, count: 0 }
      }
    }
    next[charId] = { ...character, tasks }
  }
  return next
}
