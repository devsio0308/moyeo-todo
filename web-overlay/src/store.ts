/**
 * 웹 오버레이 스토어 (#27) — 캐릭터/퀘스트 CRUD 없음, 조회+체크+카운트만.
 * zustand 없이 간단한 구독 가능 스토어로 직접 구현 (의존성 최소화).
 */

import { useSyncExternalStore } from 'react'
import { applyPeriodReset } from './shared/period-reset'
import { poolTodayMax } from './shared/pool-quest'
import { computeResets, dailyPeriodStart } from './shared/reset-logic'
import type { Character, CloudPlayerData } from './shared/types'
import {
  NotRegisteredError,
  getPlayerData,
  patchTaskFields,
  putFullDocument
} from './firestore'

const PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined
const ACCOUNT_ID_STORAGE_KEY = 'dobi-sync-id'

/** 실행취소 스냅샷 최대 보관 개수 (#undo) — electron-app history.ts와 동일 정책 */
const MAX_HISTORY = 50

export interface WebStoreState {
  gameAccountId: string | null
  data: CloudPlayerData | null
  activeCharacterId: string | null
  status: 'idle' | 'loading' | 'ready' | 'not-registered' | 'error'
  errorMessage: string | null
  /** 실행취소/다시실행 (#undo) — 체크/카운트 조작 대상 */
  canUndo: boolean
  canRedo: boolean
}

type Listener = () => void

class WebStore {
  private state: WebStoreState = {
    gameAccountId: localStorage.getItem(ACCOUNT_ID_STORAGE_KEY),
    data: null,
    activeCharacterId: null,
    status: 'idle',
    errorMessage: null,
    canUndo: false,
    canRedo: false
  }
  private listeners = new Set<Listener>()
  /** 실행취소/다시실행 스냅샷 스택 (#undo) — 메모리 전용, 탭을 닫으면 초기화 */
  private undoStack: Array<Record<string, Character>> = []
  private redoStack: Array<Record<string, Character>> = []

  getState = (): WebStoreState => this.state

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private set(patch: Partial<WebStoreState>): void {
    this.state = { ...this.state, ...patch }
    for (const l of this.listeners) l()
  }

  get projectId(): string | null {
    return PROJECT_ID ?? null
  }

  /** 저장된 ID가 있으면 자동 로드. 앱 시작 시 1회 호출 — 이후 자동 갱신은 하지 않음
   *  (플랫폼을 오가며 쓰는 개인용 도구라 실시간 동기화가 불필요 — 🔄 버튼으로 수동 새로고침) */
  async init(): Promise<void> {
    if (this.state.gameAccountId) {
      await this.loadAndCatchUpReset(this.state.gameAccountId)
    }
  }

  /** 수동 새로고침 — 🔄 버튼에서 호출 */
  async refresh(): Promise<{ ok: boolean; message?: string }> {
    if (!this.state.gameAccountId) return { ok: false, message: '동기화 ID가 없습니다' }
    const ok = await this.loadAndCatchUpReset(this.state.gameAccountId, { silent: true })
    return ok ? { ok: true } : { ok: false, message: '새로고침 실패 — 잠시 후 다시 시도해주세요' }
  }

  /** ID 등록/조회. 없는 ID면 status='not-registered'로 표시 (업로드하지 않음) */
  async register(gameAccountId: string): Promise<void> {
    const trimmed = gameAccountId.trim()
    if (!trimmed) return
    await this.loadAndCatchUpReset(trimmed)
    if (this.state.status === 'ready') {
      localStorage.setItem(ACCOUNT_ID_STORAGE_KEY, trimmed)
      this.set({ gameAccountId: trimmed })
    }
  }

  changeAccount(): void {
    localStorage.removeItem(ACCOUNT_ID_STORAGE_KEY)
    this.clearHistory()
    this.set({ gameAccountId: null, data: null, activeCharacterId: null, status: 'idle' })
  }

  /** @returns 성공 여부 — refresh()가 실패를 UI에 알릴 때 사용 */
  private async loadAndCatchUpReset(
    gameAccountId: string,
    opts: { silent?: boolean } = {}
  ): Promise<boolean> {
    if (!this.projectId) {
      if (!opts.silent) this.set({ status: 'error', errorMessage: 'Firebase 프로젝트 설정이 누락되었습니다' })
      return false
    }
    // silent(백그라운드 새로고침)는 이미 화면이 떠 있는 상태이므로 로딩 화면으로
    // 전환하지 않는다 — 안 그러면 30초마다 체크리스트가 사라졌다 나타나며 깜빡인다
    if (!opts.silent) this.set({ status: 'loading', errorMessage: null })
    try {
      const remote = await getPlayerData(this.projectId, gameAccountId)
      const settings = {
        dailyResetHour: remote.dailyResetHour,
        weeklyResetDay: remote.weeklyResetDay
      }
      const now = Math.floor(Date.now() / 1000)
      const decision = computeResets(remote.lastDailyResetAt, remote.lastWeeklyResetAt, settings, now)

      let characters = remote.characters
      let lastDailyResetAt = remote.lastDailyResetAt
      let lastWeeklyResetAt = remote.lastWeeklyResetAt
      let changed = false

      if (decision.daily === 'reset') {
        // 마지막 리셋 이후 지난 일수 — 풀형 퀘스트를 그만큼 차감 (#pool)
        const crossedDays = Math.max(
          1,
          Math.round(
            (decision.dailyPeriodStart -
              dailyPeriodStart(remote.lastDailyResetAt ?? now, settings.dailyResetHour)) /
              86_400
          )
        )
        characters = applyPeriodReset(characters, 'daily', crossedDays)
        lastDailyResetAt = now
        changed = true
      } else if (decision.daily === 'baseline') {
        lastDailyResetAt = now
        changed = true
      }
      if (decision.weekly === 'reset') {
        characters = applyPeriodReset(characters, 'weekly')
        lastWeeklyResetAt = now
        changed = true
      } else if (decision.weekly === 'baseline') {
        lastWeeklyResetAt = now
        changed = true
      }

      const finalData: CloudPlayerData = {
        ...remote,
        characters,
        lastDailyResetAt,
        lastWeeklyResetAt
      }

      // Electron이 안 켜져 있어도 웹이 리셋을 대신 실행했으니 클라우드에도 반영
      if (changed) {
        void putFullDocument(this.projectId, gameAccountId, { ...finalData, updatedAt: now }).catch(
          (e) => console.warn('[store] 리셋 캐치업 푸시 실패:', e)
        )
      }

      const activeId =
        this.state.activeCharacterId && finalData.characters[this.state.activeCharacterId]
          ? this.state.activeCharacterId
          : (finalData.characterOrder[0] ?? null)

      // 원격에서 새로 불러온 상태 위에 오래된 실행취소 스냅샷을 되살리지 않도록 초기화 (#undo)
      this.clearHistory()
      this.set({ data: finalData, activeCharacterId: activeId, status: 'ready' })
      return true
    } catch (e) {
      if (opts.silent) {
        // 수동 새로고침 실패는 화면을 건드리지 않고(로딩 화면 전환 없음) 호출자가 처리
        console.warn('[store] 새로고침 실패:', e)
        return false
      }
      if (e instanceof NotRegisteredError) {
        this.set({ status: 'not-registered', errorMessage: null })
      } else {
        const msg = e instanceof Error ? e.message : String(e)
        this.set({ status: 'error', errorMessage: msg })
      }
      return false
    }
  }

  setActiveCharacter(id: string): void {
    this.set({ activeCharacterId: id })
  }

  async setTaskDone(characterId: string, taskId: string, done: boolean): Promise<void> {
    const { data, gameAccountId } = this.state
    if (!data || !gameAccountId || !this.projectId) return
    const task = data.characters[characterId]?.tasks[taskId]
    if (!task) return

    this.recordHistory() // 실행취소 지점 (#undo)

    if (task.dailyPool) {
      // 풀형: 체크 = 오늘 가능분 전부, 해제 = 오늘 사용분 취소
      const now = Math.floor(Date.now() / 1000)
      const settings = { dailyResetHour: data.dailyResetHour, weeklyResetDay: data.weeklyResetDay }
      const used = task.dailyUsed ?? 0
      const todayMax = poolTodayMax(task, now, settings)
      return this.applyIncrement(characterId, taskId, done ? todayMax - used : -used)
    }

    const target = task.targetCount ?? 1
    const now = Math.floor(Date.now() / 1000)
    const patch = {
      done,
      lastDoneAt: done ? now : null,
      count: done ? target : 0
    }
    this.applyLocalTaskPatch(characterId, taskId, patch)
    try {
      await patchTaskFields(this.projectId, gameAccountId, characterId, taskId, patch)
    } catch (e) {
      console.warn('[store] 체크 반영 실패:', e)
    }
    if (task.done !== done) {
      await this.propagateLink(characterId, task, done ? 1 : -1, now)
    }
  }

  async incrementTask(characterId: string, taskId: string, delta: number): Promise<void> {
    const { data, gameAccountId } = this.state
    if (!data || !gameAccountId || !this.projectId) return
    const task = data.characters[characterId]?.tasks[taskId]
    if (!task) return

    this.recordHistory() // 실행취소 지점 (#undo)
    return this.applyIncrement(characterId, taskId, delta)
  }

  /** setTaskDone(풀형)/incrementTask 공용 실제 증감 로직 — recordHistory는 호출자 책임
   *  (setTaskDone의 풀형 분기가 이걸 직접 호출하므로 이중 기록 방지) */
  private async applyIncrement(characterId: string, taskId: string, delta: number): Promise<void> {
    const { data, gameAccountId } = this.state
    if (!data || !gameAccountId || !this.projectId) return
    const task = data.characters[characterId]?.tasks[taskId]
    if (!task) return

    const target = task.targetCount ?? 1
    const now = Math.floor(Date.now() / 1000)

    if (task.dailyPool) {
      // 풀형: 증가는 오늘 가능치에서 클램프해 dailyUsed와 함께, 감소는 오늘분부터 되돌림
      const settings = { dailyResetHour: data.dailyResetHour, weeklyResetDay: data.weeklyResetDay }
      const used = task.dailyUsed ?? 0
      const todayMax = poolTodayMax(task, now, settings)
      let count = task.count ?? 0
      let dailyUsed = used
      if (delta > 0) {
        const inc = Math.max(0, Math.min(delta, todayMax - used, target - count))
        count += inc
        dailyUsed += inc
      } else if (delta < 0) {
        const dec = Math.min(-delta, count)
        count -= dec
        dailyUsed = Math.max(0, used - dec)
      }
      const done = count >= target
      const patch = { count, dailyUsed, done, lastDoneAt: done ? now : null }
      this.applyLocalTaskPatch(characterId, taskId, patch)
      try {
        await patchTaskFields(this.projectId, gameAccountId, characterId, taskId, patch)
      } catch (e) {
        console.warn('[store] 카운트 반영 실패:', e)
      }
      return
    }

    const count = Math.max(0, Math.min((task.count ?? 0) + delta, target))
    const done = count >= target
    const patch = {
      count,
      done,
      lastDoneAt: done ? now : null
    }
    this.applyLocalTaskPatch(characterId, taskId, patch)
    try {
      await patchTaskFields(this.projectId, gameAccountId, characterId, taskId, patch)
    } catch (e) {
      console.warn('[store] 카운트 반영 실패:', e)
    }
    if (task.done !== done) {
      await this.propagateLink(characterId, task, done ? 1 : -1, now)
    }
  }

  /**
   * 연동 일일 퀘스트(#linked — 검은/심층 구멍)의 완료 전환을 주간 카운트에 ±1 반영.
   * 주간 쪽 조작은 일일에 영향을 주지 않는 단방향 연동.
   */
  private async propagateLink(
    characterId: string,
    task: import('./shared/types').TaskState,
    delta: 1 | -1,
    at: number
  ): Promise<void> {
    const { data, gameAccountId } = this.state
    if (!data || !gameAccountId || !this.projectId) return
    if (!task.linkedCatalogId || task.period !== 'daily' || task.excluded) return
    const character = data.characters[characterId]
    if (!character) return
    const entry = Object.entries(character.tasks).find(
      ([, s]) => s.catalogId === task.linkedCatalogId
    )
    if (!entry) return
    const [siblingId, sibling] = entry
    if (sibling.excluded) return
    const target = sibling.targetCount ?? 1
    const count = Math.max(0, Math.min((sibling.count ?? 0) + delta, target))
    const done = count >= target
    const patch = { count, done, lastDoneAt: done ? at : null }
    this.applyLocalTaskPatch(characterId, siblingId, patch)
    try {
      await patchTaskFields(this.projectId, gameAccountId, characterId, siblingId, patch)
    } catch (e) {
      console.warn('[store] 연동 반영 실패:', e)
    }
  }

  /** 낙관적 업데이트 — 네트워크 응답 기다리지 않고 즉시 화면 반영 */
  private applyLocalTaskPatch(
    characterId: string,
    taskId: string,
    patch: Partial<{ done: boolean; lastDoneAt: number | null; count: number; dailyUsed: number }>
  ): void {
    const { data } = this.state
    if (!data) return
    const character = data.characters[characterId]
    const task = character?.tasks[taskId]
    if (!character || !task) return

    const nextData: CloudPlayerData = {
      ...data,
      characters: {
        ...data.characters,
        [characterId]: {
          ...character,
          tasks: { ...character.tasks, [taskId]: { ...task, ...patch } }
        }
      }
    }
    this.set({ data: nextData })
  }

  // ── 실행취소/다시실행 (#undo) — electron-app main/history.ts와 동일한 스냅샷 방식 ──

  /** 체크/카운트 조작 직전에 호출 — 현재 characters 전체를 실행취소 지점으로 기록 */
  private recordHistory(): void {
    const { data } = this.state
    if (!data) return
    this.undoStack.push(structuredClone(data.characters))
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift()
    this.redoStack = []
    this.set({ canUndo: true, canRedo: false })
  }

  /** 체크/카운트 외의 변경(원격 재로드·계정 변경) 시 호출 — 스택 전체 폐기 */
  private clearHistory(): void {
    if (this.undoStack.length === 0 && this.redoStack.length === 0) return
    this.undoStack = []
    this.redoStack = []
    this.set({ canUndo: false, canRedo: false })
  }

  async undo(): Promise<void> {
    const prev = this.undoStack.pop()
    if (!prev) return
    const { data } = this.state
    if (!data) return
    this.redoStack.push(structuredClone(data.characters))
    await this.restoreCharacters(prev)
  }

  async redo(): Promise<void> {
    const next = this.redoStack.pop()
    if (!next) return
    const { data } = this.state
    if (!data) return
    this.undoStack.push(structuredClone(data.characters))
    await this.restoreCharacters(next)
  }

  /**
   * 스냅샷을 화면에 즉시 반영하고, 이전 상태와 달라진 태스크 필드만 Firestore에
   * 패치한다(patchTaskFields와 동일한 필드 단위 반영 — 문서 전체 덮어쓰기로 다른 기기의
   * 무관한 변경을 지우지 않기 위함). 연동 퀘스트(#linked)로 함께 바뀐 태스크도
   * characters 스냅샷에 이미 포함돼 있어 한 번에 되돌아간다.
   */
  private async restoreCharacters(target: Record<string, Character>): Promise<void> {
    const { data, gameAccountId } = this.state
    if (!data || !gameAccountId || !this.projectId) return
    const before = data.characters

    this.set({
      data: { ...data, characters: target },
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0
    })

    const charIds = new Set([...Object.keys(before), ...Object.keys(target)])
    const patches: Array<Promise<void>> = []
    for (const charId of charIds) {
      const beforeTasks = before[charId]?.tasks ?? {}
      const afterTasks = target[charId]?.tasks ?? {}
      const taskIds = new Set([...Object.keys(beforeTasks), ...Object.keys(afterTasks)])
      for (const taskId of taskIds) {
        const b = beforeTasks[taskId]
        const a = afterTasks[taskId]
        if (!a) continue // 실행취소 대상엔 태스크 삭제가 없음 (웹앱은 CRUD 없음)
        if (
          b &&
          b.done === a.done &&
          b.count === a.count &&
          b.dailyUsed === a.dailyUsed &&
          b.lastDoneAt === a.lastDoneAt
        ) {
          continue
        }
        patches.push(
          patchTaskFields(this.projectId, gameAccountId, charId, taskId, {
            done: a.done,
            lastDoneAt: a.lastDoneAt,
            count: a.count,
            dailyUsed: a.dailyUsed
          }).catch((e) => console.warn('[store] 실행취소 반영 실패:', e))
        )
      }
    }
    await Promise.all(patches)
  }
}

export const webStore = new WebStore()

export function useWebStore<T>(selector: (s: WebStoreState) => T): T {
  return useSyncExternalStore(webStore.subscribe, () => selector(webStore.getState()))
}
