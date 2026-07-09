/**
 * 웹 오버레이 스토어 (#27) — 캐릭터/퀘스트 CRUD 없음, 조회+체크+카운트만.
 * zustand 없이 간단한 구독 가능 스토어로 직접 구현 (의존성 최소화).
 */

import { useSyncExternalStore } from 'react'
import { applyPeriodReset } from './shared/period-reset'
import { computeResets } from './shared/reset-logic'
import type { CloudPlayerData, TaskMode } from './shared/types'
import {
  NotRegisteredError,
  getPlayerData,
  patchTaskFields,
  putFullDocument
} from './firestore'

const PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined
const ACCOUNT_ID_STORAGE_KEY = 'dobi-sync-id'
const REFRESH_INTERVAL_MS = 30_000

export interface WebStoreState {
  gameAccountId: string | null
  data: CloudPlayerData | null
  activeCharacterId: string | null
  status: 'idle' | 'loading' | 'ready' | 'not-registered' | 'error'
  errorMessage: string | null
}

type Listener = () => void

class WebStore {
  private state: WebStoreState = {
    gameAccountId: localStorage.getItem(ACCOUNT_ID_STORAGE_KEY),
    data: null,
    activeCharacterId: null,
    status: 'idle',
    errorMessage: null
  }
  private listeners = new Set<Listener>()
  private refreshTimer: ReturnType<typeof setInterval> | null = null

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

  /** 저장된 ID가 있으면 자동 로드. 앱 시작 시 1회 호출 */
  async init(): Promise<void> {
    if (this.state.gameAccountId) {
      await this.loadAndCatchUpReset(this.state.gameAccountId)
    }
    this.startAutoRefresh()
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
    this.set({ gameAccountId: null, data: null, activeCharacterId: null, status: 'idle' })
  }

  private async loadAndCatchUpReset(
    gameAccountId: string,
    opts: { silent?: boolean } = {}
  ): Promise<void> {
    if (!this.projectId) {
      if (!opts.silent) this.set({ status: 'error', errorMessage: 'Firebase 프로젝트 설정이 누락되었습니다' })
      return
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
        characters = applyPeriodReset(characters, 'daily')
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

      this.set({ data: finalData, activeCharacterId: activeId, status: 'ready' })
    } catch (e) {
      if (opts.silent) {
        // 백그라운드 갱신 실패는 화면을 건드리지 않고 다음 주기에 재시도
        console.warn('[store] 백그라운드 새로고침 실패:', e)
        return
      }
      if (e instanceof NotRegisteredError) {
        this.set({ status: 'not-registered', errorMessage: null })
      } else {
        const msg = e instanceof Error ? e.message : String(e)
        this.set({ status: 'error', errorMessage: msg })
      }
    }
  }

  setActiveCharacter(id: string): void {
    this.set({ activeCharacterId: id })
  }

  /** 조용히 다시 조회 (백그라운드 새로고침 — 로딩 화면으로 전환하지 않음) */
  private async silentRefresh(): Promise<void> {
    if (!this.state.gameAccountId || !this.projectId || document.hidden) return
    await this.loadAndCatchUpReset(this.state.gameAccountId, { silent: true })
  }

  private startAutoRefresh(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer)
    this.refreshTimer = setInterval(() => void this.silentRefresh(), REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) void this.silentRefresh()
    })
  }

  async setTaskDone(characterId: string, taskId: string, done: boolean, mode: TaskMode): Promise<void> {
    const { data, gameAccountId } = this.state
    if (!data || !gameAccountId || !this.projectId) return
    const task = data.characters[characterId]?.tasks[taskId]
    if (!task) return

    const target = task.targetCount ?? 1
    const patch = {
      done,
      mode: done ? mode : task.mode,
      lastDoneAt: done ? Math.floor(Date.now() / 1000) : null,
      count: done ? target : 0
    }
    this.applyLocalTaskPatch(characterId, taskId, patch)
    try {
      await patchTaskFields(this.projectId, gameAccountId, characterId, taskId, patch)
    } catch (e) {
      console.warn('[store] 체크 반영 실패:', e)
    }
  }

  async incrementTask(characterId: string, taskId: string, delta: number): Promise<void> {
    const { data, gameAccountId } = this.state
    if (!data || !gameAccountId || !this.projectId) return
    const task = data.characters[characterId]?.tasks[taskId]
    if (!task) return

    const target = task.targetCount ?? 1
    const count = Math.max(0, Math.min((task.count ?? 0) + delta, target))
    const done = count >= target
    const patch = {
      count,
      done,
      mode: done ? ('manual' as TaskMode) : task.mode,
      lastDoneAt: done ? Math.floor(Date.now() / 1000) : null
    }
    this.applyLocalTaskPatch(characterId, taskId, patch)
    try {
      await patchTaskFields(this.projectId, gameAccountId, characterId, taskId, patch)
    } catch (e) {
      console.warn('[store] 카운트 반영 실패:', e)
    }
  }

  /** 낙관적 업데이트 — 네트워크 응답 기다리지 않고 즉시 화면 반영 */
  private applyLocalTaskPatch(
    characterId: string,
    taskId: string,
    patch: Partial<{ done: boolean; mode: TaskMode; lastDoneAt: number | null; count: number }>
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
}

export const webStore = new WebStore()

export function useWebStore<T>(selector: (s: WebStoreState) => T): T {
  return useSyncExternalStore(webStore.subscribe, () => selector(webStore.getState()))
}
