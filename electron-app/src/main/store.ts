import Store from 'electron-store'
import type {
  Character,
  QuestCatalogItem,
  QuestCategory,
  Settings,
  StoreShape,
  TaskMode,
  TaskPeriod,
  TaskState
} from '../shared/types'

const DEFAULT_SETTINGS: Settings = {
  captureIntervalSec: 2.5,
  weeklyResetDay: 1, // 월요일 오전 6시 주간 리셋 (#1)
  dailyResetHour: 6, // 매일 오전 6시 일일 리셋 (#1)
  matchThreshold: 0.85,
  captureRegion: null,
  firebaseProjectId: null // 퀘스트 카탈로그 소스 (#4)
}

/** 스토어 마이그레이션 버전 — 리셋 기본값 변경(#1) 반영 */
const META_VERSION = 2

// 주의: metaVersion은 DEFAULTS에 넣으면 안 된다 — electron-store가 키 없는
// 기존 스토어에도 기본값을 돌려줘서 마이그레이션이 스킵된다.
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
    this.migrate()
  }

  /** 버전 기반 일회성 마이그레이션 */
  private migrate(): void {
    const version = this.store.get('metaVersion', 1)
    if (version < 2) {
      // v2 (#1): 리셋 기본값 변경 — 일일 06:00, 주간 월요일
      const settings = this.store.get('settings')
      this.store.set('settings', { ...settings, dailyResetHour: 6, weeklyResetDay: 1 })
      console.log('[store] 마이그레이션 v2: 리셋 기본값 → 일일 06:00 / 월요일')
    }
    if (version !== META_VERSION) this.store.set('metaVersion', META_VERSION)
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
      lastWeeklyResetAt: this.store.get('lastWeeklyResetAt', null),
      questCatalog: this.store.get('questCatalog', [])
    }
  }

  // ── 캐릭터 CRUD ──────────────────────────────────────────

  /**
   * 캐릭터 추가.
   * @param copyFromCharacterId 지정 시 해당 캐릭터의 퀘스트 구성(커스텀 포함)을 복사 (#12).
   *   이름/주기/횟수/threshold/catalogId는 유지하고 체크 상태·진행 횟수는 초기화.
   *   미지정(null)이면 캐시된 카탈로그 퀘스트로 채움 (#4).
   */
  addCharacter(displayName: string, copyFromCharacterId: string | null = null): StoreShape {
    const characters = this.store.get('characters')
    const id = this.nextId('character', Object.keys(characters))

    const tasks: Record<string, TaskState> = {}
    const source = copyFromCharacterId ? characters[copyFromCharacterId] : undefined

    if (source) {
      // 프리셋 복사 — 퀘스트 id도 그대로 유지 (템플릿 등록 시 일관성)
      for (const [taskId, task] of Object.entries(source.tasks)) {
        tasks[taskId] = {
          ...task,
          done: false,
          mode: 'manual',
          lastDoneAt: null,
          count: 0
        }
      }
    } else {
      const catalog = this.store.get('questCatalog', []) ?? []
      catalog.forEach((item, i) => {
        tasks[`task_${String(i + 1).padStart(2, '0')}`] = this.catalogTask(item)
      })
    }

    const character: Character = { displayName, tasks }
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

  // ── 퀘스트 CRUD ────────────────────────────────────────────

  addTask(
    characterId: string,
    displayName: string,
    period: TaskPeriod,
    catalogId: string | null = null,
    targetCount = 1,
    category: QuestCategory | null = null
  ): StoreShape {
    const character = this.store.get('characters')[characterId]
    if (character) {
      const id = this.nextId('task', Object.keys(character.tasks))
      const task: TaskState = {
        done: false,
        mode: 'manual',
        lastDoneAt: null,
        displayName,
        period,
        threshold: null,
        catalogId,
        targetCount: Math.max(1, Math.floor(targetCount)),
        count: 0,
        category
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

  /** 체크 상태 변경. done=true일 때만 mode/lastDoneAt 갱신. at: unix epoch(초), 기본 현재 시각.
   *  카운트 퀘스트(#7): 완료 체크 = count를 target으로, 해제 = 0으로 */
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
        count: done ? (task.targetCount ?? 1) : 0,
        mode: done ? mode : task.mode,
        lastDoneAt: done ? (at ?? Math.floor(Date.now() / 1000)) : null
      }
      this.store.set(`characters.${characterId}.tasks.${taskId}`, next)
    }
    return this.getState()
  }

  /** 카운트 퀘스트 진행 증감 (#7). target 도달 시 완료, 0 미만/target 초과는 클램프 */
  incrementTask(
    characterId: string,
    taskId: string,
    delta: number,
    mode: TaskMode = 'manual',
    at?: number
  ): StoreShape {
    const task = this.store.get('characters')[characterId]?.tasks[taskId]
    if (task) {
      const target = task.targetCount ?? 1
      const count = Math.max(0, Math.min((task.count ?? 0) + delta, target))
      const done = count >= target
      const next: TaskState = {
        ...task,
        count,
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
   * 존재하지 않는 조합이거나 이미 완료된 퀘스트(수동 체크 포함)는 건드리지 않는다.
   * @returns 상태가 실제로 바뀌었는지
   */
  applyDetection(characterId: string, taskId: string, timestamp: number): boolean {
    const task = this.store.get('characters')[characterId]?.tasks[taskId]
    if (!task) {
      console.warn(`[store] 알 수 없는 감지 이벤트 무시: ${characterId}/${taskId}`)
      return false
    }
    if (task.done) return false // 이미 완료 — 수동 체크를 auto로 덮어쓰지 않음
    // 카운트 퀘스트(#7)는 감지 1회당 +1, 단일 퀘스트는 target=1이라 즉시 완료
    this.incrementTask(characterId, taskId, 1, 'auto', timestamp)
    return true
  }

  // ── 설정 ─────────────────────────────────────────────────

  updateSettings(patch: Partial<Settings>): StoreShape {
    this.store.set('settings', { ...this.getState().settings, ...patch })
    return this.getState()
  }

  // ── 퀘스트 카탈로그 동기화 (#4) ──────────────────────────

  /**
   * Firestore에서 받아온 카탈로그를 캐시하고 전체 캐릭터에 반영.
   * - 캐릭터에 catalogId가 없는 항목 → 추가
   * - 이름/주기가 바뀐 항목 → 갱신 (체크 상태는 유지)
   * - 카탈로그에서 사라진 항목은 삭제하지 않음 (개별 커스텀 퀘스트 보존)
   */
  syncQuestCatalog(catalog: QuestCatalogItem[]): { added: number; updated: number } {
    this.store.set('questCatalog', catalog)

    let added = 0
    let updated = 0
    const characters = this.store.get('characters')
    const next: Record<string, Character> = {}

    for (const [charId, character] of Object.entries(characters)) {
      const tasks: Record<string, TaskState> = { ...character.tasks }
      const byCatalogId = new Map(
        Object.entries(tasks)
          .filter(([, t]) => t.catalogId)
          .map(([taskId, t]) => [t.catalogId as string, taskId])
      )

      for (const item of catalog) {
        const existingTaskId = byCatalogId.get(item.id)
        if (!existingTaskId) {
          const id = this.nextId('task', Object.keys(tasks))
          tasks[id] = this.catalogTask(item)
          added++
        } else {
          const t = tasks[existingTaskId]
          const itemTarget = Math.max(1, item.targetCount ?? 1)
          const itemCategory = item.category ?? null
          if (
            t.displayName !== item.name ||
            t.period !== item.period ||
            (t.targetCount ?? 1) !== itemTarget ||
            (t.category ?? null) !== itemCategory
          ) {
            tasks[existingTaskId] = {
              ...t,
              displayName: item.name,
              period: item.period,
              targetCount: itemTarget,
              category: itemCategory
            }
            updated++
          }
        }
      }
      next[charId] = { ...character, tasks }
    }

    this.store.set('characters', next)
    return { added, updated }
  }

  private catalogTask(item: QuestCatalogItem): TaskState {
    return {
      done: false,
      mode: 'manual',
      lastDoneAt: null,
      displayName: item.name,
      period: item.period,
      threshold: null,
      catalogId: item.id,
      targetCount: Math.max(1, item.targetCount ?? 1),
      count: 0,
      category: item.category ?? null
    }
  }

  // ── 리셋 (feature/reset-scheduler에서 사용) ───────────────

  /** period에 해당하는 모든 퀘스트를 초기화. mode 구분 없이 전체 리셋 (명세서 §6) */
  resetTasks(period: TaskPeriod, now: number): StoreShape {
    const characters = this.store.get('characters')
    const next: Record<string, Character> = {}
    for (const [charId, character] of Object.entries(characters)) {
      const tasks: Record<string, TaskState> = {}
      for (const [taskId, task] of Object.entries(character.tasks)) {
        tasks[taskId] =
          task.period === period ? { ...task, done: false, lastDoneAt: null, count: 0 } : task
      }
      next[charId] = { ...character, tasks }
    }
    this.store.set('characters', next)
    this.store.set(period === 'daily' ? 'lastDailyResetAt' : 'lastWeeklyResetAt', now)
    return this.getState()
  }

  /** 최초 실행 시 리셋 기준점만 기록 (리셋 없이) — reset-scheduler에서 사용 */
  markResetBaseline(period: TaskPeriod, at: number): void {
    this.store.set(period === 'daily' ? 'lastDailyResetAt' : 'lastWeeklyResetAt', at)
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
