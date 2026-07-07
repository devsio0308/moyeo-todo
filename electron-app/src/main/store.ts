import Store from 'electron-store'
import type {
  Character,
  Settings,
  StoreShape,
  TaskMode,
  TaskPeriod,
  TaskState
} from '../shared/types'

const DEFAULT_SETTINGS: Settings = {
  captureIntervalSec: 2.5,
  weeklyResetDay: 4, // 목요일 (게임마다 다름 — 설정에서 변경)
  dailyResetHour: 0,
  matchThreshold: 0.85,
  captureRegion: null
}

const DEFAULTS: StoreShape = {
  characters: {},
  characterOrder: [],
  settings: DEFAULT_SETTINGS,
  lastDailyResetAt: null,
  lastWeeklyResetAt: null
}

/**
 * electron-store 래퍼.
 * LocalStorage 대신 파일 기반이라 앱 재설치/버전업에도 데이터가 살아남는다 (명세서 §5).
 * 모든 mutation은 전체 상태를 반환해 renderer가 그대로 반영하게 한다.
 */
export class DashboardStore {
  private store: Store<StoreShape>

  constructor() {
    this.store = new Store<StoreShape>({ defaults: DEFAULTS })
  }

  /** electron-store 데이터 파일 경로 (python 엔진 설정 전달 등에 사용) */
  get filePath(): string {
    return this.store.path
  }

  getState(): StoreShape {
    return {
      characters: this.store.get('characters'),
      characterOrder: this.store.get('characterOrder'),
      settings: { ...DEFAULT_SETTINGS, ...this.store.get('settings') },
      lastDailyResetAt: this.store.get('lastDailyResetAt', null),
      lastWeeklyResetAt: this.store.get('lastWeeklyResetAt', null)
    }
  }

  // ── 캐릭터 CRUD ──────────────────────────────────────────

  addCharacter(displayName: string): StoreShape {
    const characters = this.store.get('characters')
    const id = this.nextId('character', Object.keys(characters))
    const character: Character = { displayName, tasks: {} }
    this.store.set(`characters.${id}`, character)
    this.store.set('characterOrder', [...this.store.get('characterOrder'), id])
    return this.getState()
  }

  removeCharacter(characterId: string): StoreShape {
    const characters = { ...this.store.get('characters') }
    delete characters[characterId]
    this.store.set('characters', characters)
    this.store.set(
      'characterOrder',
      this.store.get('characterOrder').filter((id) => id !== characterId)
    )
    return this.getState()
  }

  renameCharacter(characterId: string, displayName: string): StoreShape {
    if (this.store.get('characters')[characterId]) {
      this.store.set(`characters.${characterId}.displayName`, displayName)
    }
    return this.getState()
  }

  reorderCharacters(order: string[]): StoreShape {
    const existing = new Set(Object.keys(this.store.get('characters')))
    // 존재하는 캐릭터만, 누락 없이 반영 (renderer 버그로 인한 데이터 유실 방지)
    const filtered = order.filter((id) => existing.has(id))
    for (const id of existing) if (!filtered.includes(id)) filtered.push(id)
    this.store.set('characterOrder', filtered)
    return this.getState()
  }

  // ── 숙제 CRUD ────────────────────────────────────────────

  addTask(characterId: string, displayName: string, period: TaskPeriod): StoreShape {
    const character = this.store.get('characters')[characterId]
    if (character) {
      const id = this.nextId('task', Object.keys(character.tasks))
      const task: TaskState = {
        done: false,
        mode: 'manual',
        lastDoneAt: null,
        displayName,
        period,
        threshold: null
      }
      this.store.set(`characters.${characterId}.tasks.${id}`, task)
    }
    return this.getState()
  }

  removeTask(characterId: string, taskId: string): StoreShape {
    const character = this.store.get('characters')[characterId]
    if (character && character.tasks[taskId]) {
      const tasks = { ...character.tasks }
      delete tasks[taskId]
      this.store.set(`characters.${characterId}.tasks`, tasks)
    }
    return this.getState()
  }

  updateTask(
    characterId: string,
    taskId: string,
    patch: Partial<Pick<TaskState, 'displayName' | 'period' | 'threshold'>>
  ): StoreShape {
    const task = this.store.get('characters')[characterId]?.tasks[taskId]
    if (task) {
      this.store.set(`characters.${characterId}.tasks.${taskId}`, { ...task, ...patch })
    }
    return this.getState()
  }

  /** 체크 상태 변경. done=true일 때만 mode/lastDoneAt 갱신. at: unix epoch(초), 기본 현재 시각 */
  setTaskDone(
    characterId: string,
    taskId: string,
    done: boolean,
    mode: TaskMode,
    at?: number
  ): StoreShape {
    const task = this.store.get('characters')[characterId]?.tasks[taskId]
    if (task) {
      const next: TaskState = {
        ...task,
        done,
        mode: done ? mode : task.mode,
        lastDoneAt: done ? (at ?? Math.floor(Date.now() / 1000)) : null
      }
      this.store.set(`characters.${characterId}.tasks.${taskId}`, next)
    }
    return this.getState()
  }

  /**
   * 자동 감지 이벤트 반영 (명세서 §5).
   * 존재하지 않는 조합이거나 이미 완료된 숙제(수동 체크 포함)는 건드리지 않는다.
   * @returns 상태가 실제로 바뀌었는지
   */
  applyDetection(characterId: string, taskId: string, timestamp: number): boolean {
    const task = this.store.get('characters')[characterId]?.tasks[taskId]
    if (!task) {
      console.warn(`[store] 알 수 없는 감지 이벤트 무시: ${characterId}/${taskId}`)
      return false
    }
    if (task.done) return false // 이미 완료 — 수동 체크를 auto로 덮어쓰지 않음
    this.setTaskDone(characterId, taskId, true, 'auto', timestamp)
    return true
  }

  // ── 설정 ─────────────────────────────────────────────────

  updateSettings(patch: Partial<Settings>): StoreShape {
    this.store.set('settings', { ...this.getState().settings, ...patch })
    return this.getState()
  }

  // ── 리셋 (feature/reset-scheduler에서 사용) ───────────────

  /** period에 해당하는 모든 숙제를 초기화. mode 구분 없이 전체 리셋 (명세서 §6) */
  resetTasks(period: TaskPeriod, now: number): StoreShape {
    const characters = this.store.get('characters')
    const next: Record<string, Character> = {}
    for (const [charId, character] of Object.entries(characters)) {
      const tasks: Record<string, TaskState> = {}
      for (const [taskId, task] of Object.entries(character.tasks)) {
        tasks[taskId] =
          task.period === period ? { ...task, done: false, lastDoneAt: null } : task
      }
      next[charId] = { ...character, tasks }
    }
    this.store.set('characters', next)
    this.store.set(period === 'daily' ? 'lastDailyResetAt' : 'lastWeeklyResetAt', now)
    return this.getState()
  }

  // ── 내부 유틸 ────────────────────────────────────────────

  /** character_01, task_03 형태의 순차 id 생성 (템플릿 폴더명과 일치해야 하므로 사람이 읽기 쉬운 형태 유지) */
  private nextId(prefix: string, existing: string[]): string {
    let max = 0
    for (const id of existing) {
      const m = id.match(new RegExp(`^${prefix}_(\\d+)$`))
      if (m) max = Math.max(max, parseInt(m[1], 10))
    }
    return `${prefix}_${String(max + 1).padStart(2, '0')}`
  }
}

export const dashboardStore = new DashboardStore()
