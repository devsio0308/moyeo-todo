import { create } from 'zustand'
import type { QuestCategory, Settings, StoreShape, TaskPeriod, TaskState } from '../../shared/types'

interface DashboardState {
  data: StoreShape | null
  activeCharacterId: string | null

  init: () => Promise<void>
  applyState: (state: StoreShape) => void
  setActiveCharacter: (id: string) => void

  addCharacter: (displayName: string) => Promise<void>
  removeCharacter: (id: string) => Promise<void>
  renameCharacter: (id: string, displayName: string) => Promise<void>
  reorderCharacters: (order: string[]) => Promise<void>
  reorderTasks: (characterId: string, orderedTaskIds: string[]) => Promise<void>
  addTask: (
    characterId: string,
    displayName: string,
    period: TaskPeriod,
    targetCount?: number,
    category?: QuestCategory | null,
    location?: string | null
  ) => Promise<void>
  incrementTask: (characterId: string, taskId: string, delta: number) => Promise<void>
  setTaskExcluded: (characterId: string, taskId: string, excluded: boolean) => Promise<void>
  removeTask: (characterId: string, taskId: string) => Promise<void>
  updateTask: (
    characterId: string,
    taskId: string,
    patch: Partial<Pick<TaskState, 'displayName' | 'period' | 'category' | 'targetCount' | 'location'>>
  ) => Promise<void>
  setTaskDone: (characterId: string, taskId: string, done: boolean) => Promise<void>
  updateSettings: (patch: Partial<Settings>) => Promise<void>
}

/** activeCharacterId가 삭제 등으로 무효화됐을 때 첫 캐릭터로 보정 */
function ensureActive(state: StoreShape, current: string | null): string | null {
  if (current && state.characters[current]) return current
  return state.characterOrder[0] ?? null
}

export const useDashboardStore = create<DashboardState>((set, get) => {
  const apply = (state: StoreShape): void =>
    set({ data: state, activeCharacterId: ensureActive(state, get().activeCharacterId) })

  return {
    data: null,
    activeCharacterId: null,

    init: async () => {
      apply(await window.api.store.getState())
    },
    applyState: apply,
    setActiveCharacter: (id) => set({ activeCharacterId: id }),

    addCharacter: async (displayName) => {
      const state = await window.api.store.addCharacter(displayName)
      // 새로 추가된 캐릭터를 바로 활성 탭으로
      const newId = state.characterOrder[state.characterOrder.length - 1] ?? null
      set({ data: state, activeCharacterId: newId })
    },
    removeCharacter: async (id) => apply(await window.api.store.removeCharacter(id)),
    renameCharacter: async (id, name) => apply(await window.api.store.renameCharacter(id, name)),
    reorderCharacters: async (order) => apply(await window.api.store.reorderCharacters(order)),
    reorderTasks: async (characterId, orderedTaskIds) =>
      apply(await window.api.store.reorderTasks(characterId, orderedTaskIds)),
    addTask: async (characterId, displayName, period, targetCount, category, location) =>
      apply(
        await window.api.store.addTask(
          characterId,
          displayName,
          period,
          targetCount,
          category,
          location
        )
      ),
    incrementTask: async (characterId, taskId, delta) =>
      apply(await window.api.store.incrementTask(characterId, taskId, delta)),
    setTaskExcluded: async (characterId, taskId, excluded) =>
      apply(await window.api.store.setTaskExcluded(characterId, taskId, excluded)),
    removeTask: async (characterId, taskId) =>
      apply(await window.api.store.removeTask(characterId, taskId)),
    updateTask: async (characterId, taskId, patch) =>
      apply(await window.api.store.updateTask(characterId, taskId, patch)),
    setTaskDone: async (characterId, taskId, done) =>
      apply(await window.api.store.setTaskDone(characterId, taskId, done)),
    updateSettings: async (patch) => apply(await window.api.store.updateSettings(patch))
  }
})
