import Store from 'electron-store'
import { poolForfeitDays, poolTodayMax } from '../shared/pool-quest'
import type {
  Character,
  CloudPlayerData,
  QuestCatalogItem,
  QuestCategory,
  Settings,
  StoreShape,
  TaskPeriod,
  TaskState
} from '../shared/types'

const DEFAULT_SETTINGS: Settings = {
  weeklyResetDay: 1, // 월요일 오전 6시 주간 리셋 (#1)
  dailyResetHour: 6, // 매일 오전 6시 일일 리셋 (#1)
  firebaseProjectId: null, // 퀘스트 카탈로그 소스 (#4)
  gameAccountId: null // Firestore 동기화 키 (#26)
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

  getState(): StoreShape {
    return {
      characters: this.store.get('characters'),
      characterOrder: this.store.get('characterOrder'),
      settings: { ...DEFAULT_SETTINGS, ...this.store.get('settings') },
      lastDailyResetAt: this.store.get('lastDailyResetAt', null),
      lastWeeklyResetAt: this.store.get('lastWeeklyResetAt', null),
      questCatalog: this.store.get('questCatalog', []),
      recommendedQuests: this.store.get('recommendedQuests', [])
    }
  }

  // ── 캐릭터 CRUD ──────────────────────────────────────────

  /** 캐릭터 추가 — 캐시된 카탈로그 퀘스트로 채운다 (#4).
   *  프리셋 복사(#12)는 제거됨 — 대신 추천 패널에서 타 캐릭터 커스텀 퀘스트를 골라 추가 (#23) */
  addCharacter(displayName: string): StoreShape {
    const characters = this.store.get('characters')
    const id = this.nextId('character', Object.keys(characters))

    const tasks: Record<string, TaskState> = {}
    const catalog = this.store.get('questCatalog', []) ?? []
    catalog.forEach((item, i) => {
      tasks[`task_${String(i + 1).padStart(2, '0')}`] = this.catalogTask(item)
    })

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
    category: QuestCategory | null = null,
    location: string | null = null
  ): StoreShape {
    const character = this.store.get('characters')[characterId]
    if (character) {
      const id = this.nextId('task', Object.keys(character.tasks))
      const task: TaskState = {
        done: false,
        lastDoneAt: null,
        displayName,
        period,
        catalogId,
        targetCount: Math.max(1, Math.floor(targetCount)),
        count: 0,
        category,
        location
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
    patch: Partial<Pick<TaskState, 'displayName' | 'period' | 'category' | 'targetCount' | 'location'>>
  ): StoreShape {
    const task = this.store.get('characters')[characterId]?.tasks[taskId]
    if (task) {
      const next: TaskState = { ...task, ...patch }
      // 횟수 변경(#21): count 클램프 + 완료 상태 재계산
      if (patch.targetCount !== undefined) {
        const target = Math.max(1, Math.floor(patch.targetCount))
        const count = Math.min(task.count ?? 0, target)
        next.targetCount = target
        next.count = count
        next.done = count >= target
        next.lastDoneAt = next.done
          ? task.done
            ? task.lastDoneAt
            : Math.floor(Date.now() / 1000)
          : null
      }
      this.store.set(`characters.${characterId}.tasks.${taskId}`, next)
    }
    return this.getState()
  }

  /** 체크 상태 변경. done=true일 때만 lastDoneAt 갱신. at: unix epoch(초), 기본 현재 시각.
   *  카운트 퀘스트(#7): 완료 체크 = count를 target으로, 해제 = 0으로.
   *  풀형 퀘스트: 체크 = 오늘 가능분 전부 사용, 해제 = 오늘 사용분만 되돌림 */
  setTaskDone(characterId: string, taskId: string, done: boolean, at?: number): StoreShape {
    const task = this.store.get('characters')[characterId]?.tasks[taskId]
    if (task) {
      if (task.dailyPool) {
        const now = at ?? Math.floor(Date.now() / 1000)
        const used = task.dailyUsed ?? 0
        const todayMax = poolTodayMax(task, now, this.getState().settings)
        return this.incrementTask(characterId, taskId, done ? todayMax - used : -used, at)
      }
      const next: TaskState = {
        ...task,
        done,
        count: done ? (task.targetCount ?? 1) : 0,
        lastDoneAt: done ? (at ?? Math.floor(Date.now() / 1000)) : null
      }
      this.store.set(`characters.${characterId}.tasks.${taskId}`, next)
      if (task.done !== done) {
        this.propagateLink(characterId, task, done ? 1 : -1, at ?? Math.floor(Date.now() / 1000))
      }
    }
    return this.getState()
  }

  /**
   * 연동 일일 퀘스트(#linked — 검은/심층 구멍)의 완료 전환을 주간 카운트에 ±1 반영.
   * 주간 쪽 조작은 일일에 영향을 주지 않는 단방향 연동.
   */
  private propagateLink(
    characterId: string,
    task: TaskState,
    delta: 1 | -1,
    at: number
  ): void {
    if (!task.linkedCatalogId || task.period !== 'daily' || task.excluded) return
    const character = this.store.get('characters')[characterId]
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
    this.store.set(`characters.${characterId}.tasks.${siblingId}`, {
      ...sibling,
      count,
      done,
      lastDoneAt: done ? at : null
    })
  }

  /**
   * 카탈로그 퀘스트 제외 토글 (#25) — 삭제는 동기화로 부활하므로 대체 기능.
   * 제외 ON: 항상 완료 상태로 고정 (리셋 시에도 유지). 제외 OFF: 미완료로 초기화해 정상 진행 대상으로 복귀.
   */
  setTaskExcluded(characterId: string, taskId: string, excluded: boolean): StoreShape {
    const task = this.store.get('characters')[characterId]?.tasks[taskId]
    if (task) {
      const target = task.targetCount ?? 1
      const next: TaskState = {
        ...task,
        excluded,
        done: excluded,
        count: excluded ? target : 0,
        lastDoneAt: excluded ? Math.floor(Date.now() / 1000) : null
      }
      this.store.set(`characters.${characterId}.tasks.${taskId}`, next)
    }
    return this.getState()
  }

  /** 카운트 퀘스트 진행 증감 (#7). target 도달 시 완료, 0 미만/target 초과는 클램프.
   *  풀형 퀘스트: 증가는 '오늘 사용'으로 기록되고 오늘 가능치에서 클램프,
   *  감소는 오늘 사용분부터 되돌리고 넘어가는 만큼은 과거 기록 보정으로 처리 */
  incrementTask(characterId: string, taskId: string, delta: number, at?: number): StoreShape {
    const task = this.store.get('characters')[characterId]?.tasks[taskId]
    if (task) {
      const target = task.targetCount ?? 1
      const now = at ?? Math.floor(Date.now() / 1000)

      if (task.dailyPool) {
        const used = task.dailyUsed ?? 0
        const todayMax = poolTodayMax(task, now, this.getState().settings)
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
        const next: TaskState = {
          ...task,
          count,
          dailyUsed,
          done,
          lastDoneAt: done ? now : null
        }
        this.store.set(`characters.${characterId}.tasks.${taskId}`, next)
        return this.getState()
      }

      const count = Math.max(0, Math.min((task.count ?? 0) + delta, target))
      const done = count >= target
      const next: TaskState = {
        ...task,
        count,
        done,
        lastDoneAt: done ? now : null
      }
      this.store.set(`characters.${characterId}.tasks.${taskId}`, next)
      if (task.done !== done) {
        this.propagateLink(characterId, task, done ? 1 : -1, now)
      }
    }
    return this.getState()
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
   * - 이전 캐시엔 있었는데 이번 목록엔 없는 catalogId → 관리자가 삭제한 것으로 보고
   *   캐릭터의 해당 태스크도 함께 삭제한다 (#catalog-watch). 커스텀(catalogId 없는)
   *   퀘스트는 이 비교 대상이 아니라 영향받지 않는다.
   */
  syncQuestCatalog(catalog: QuestCatalogItem[]): {
    added: number
    updated: number
    removed: number
  } {
    const previousIds = new Set(this.store.get('questCatalog', []).map((item) => item.id))
    const catalogIds = new Set(catalog.map((item) => item.id))
    const removedIds = [...previousIds].filter((id) => !catalogIds.has(id))

    this.store.set('questCatalog', catalog)

    let added = 0
    let updated = 0
    let removed = 0
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
          const itemLocation = item.location ?? null
          const itemDailyPool = item.dailyPool === true
          const itemLinked = item.linkedCatalogId ?? null
          if (
            t.displayName !== item.name ||
            t.period !== item.period ||
            (t.targetCount ?? 1) !== itemTarget ||
            (t.category ?? null) !== itemCategory ||
            (t.location ?? null) !== itemLocation ||
            (t.dailyPool ?? false) !== itemDailyPool ||
            (t.linkedCatalogId ?? null) !== itemLinked
          ) {
            tasks[existingTaskId] = {
              ...t,
              displayName: item.name,
              period: item.period,
              targetCount: itemTarget,
              category: itemCategory,
              location: itemLocation,
              dailyPool: itemDailyPool,
              dailyUsed: itemDailyPool ? (t.dailyUsed ?? 0) : undefined,
              linkedCatalogId: itemLinked
            }
            updated++
          }
        }
      }

      for (const removedId of removedIds) {
        const taskId = byCatalogId.get(removedId)
        if (taskId) {
          delete tasks[taskId]
          removed++
        }
      }

      next[charId] = { ...character, tasks }
    }

    this.store.set('characters', next)
    return { added, updated, removed }
  }

  /** 추천 퀘스트 목록 캐시 (#15) — 동기화 시 갱신, UI 피커에서 사용 */
  setRecommendedQuests(items: QuestCatalogItem[]): void {
    this.store.set('recommendedQuests', items)
  }

  private catalogTask(item: QuestCatalogItem): TaskState {
    return {
      done: false,
      lastDoneAt: null,
      displayName: item.name,
      period: item.period,
      catalogId: item.id,
      targetCount: Math.max(1, item.targetCount ?? 1),
      count: 0,
      category: item.category ?? null,
      location: item.location ?? null,
      ...(item.dailyPool ? { dailyPool: true, dailyUsed: 0 } : {}),
      ...(item.linkedCatalogId ? { linkedCatalogId: item.linkedCatalogId } : {})
    }
  }

  // ── 리셋 (feature/reset-scheduler에서 사용) ───────────────

  /**
   * period에 해당하는 모든 퀘스트를 초기화 (명세서 §6).
   * @param crossedDays 일일 리셋일 때 마지막 리셋 이후 지난 일수 (풀형 차감 계산용, 기본 1)
   */
  resetTasks(period: TaskPeriod, now: number, crossedDays = 1): StoreShape {
    const characters = this.store.get('characters')
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

      const tasks: Record<string, TaskState> = {}
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
          // 제외된 퀘스트는 리셋해도 완료 상태 유지 (#25)
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
    this.store.set('characters', next)
    this.store.set(period === 'daily' ? 'lastDailyResetAt' : 'lastWeeklyResetAt', now)
    return this.getState()
  }

  /** 최초 실행 시 리셋 기준점만 기록 (리셋 없이) — reset-scheduler에서 사용 */
  markResetBaseline(period: TaskPeriod, at: number): void {
    this.store.set(period === 'daily' ? 'lastDailyResetAt' : 'lastWeeklyResetAt', at)
  }

  // ── Firestore 동기화 (#26) ────────────────────────────────

  /** 클라우드에 올릴 부분집합. 기기별 설정은 제외 */
  getCloudSyncPayload(): CloudPlayerData {
    const state = this.getState()
    return {
      characters: state.characters,
      characterOrder: state.characterOrder,
      lastDailyResetAt: state.lastDailyResetAt,
      lastWeeklyResetAt: state.lastWeeklyResetAt,
      dailyResetHour: state.settings.dailyResetHour,
      weeklyResetDay: state.settings.weeklyResetDay,
      updatedAt: Math.floor(Date.now() / 1000)
    }
  }

  /** 원격 데이터로 로컬을 덮어쓴다 (등록 시 '원격 우선' 병합, #26) */
  applyCloudSnapshot(data: CloudPlayerData): StoreShape {
    this.store.set('characters', data.characters)
    this.store.set('characterOrder', data.characterOrder)
    this.store.set('lastDailyResetAt', data.lastDailyResetAt)
    this.store.set('lastWeeklyResetAt', data.lastWeeklyResetAt)
    this.store.set('settings', {
      ...this.getState().settings,
      dailyResetHour: data.dailyResetHour,
      weeklyResetDay: data.weeklyResetDay
    })
    return this.getState()
  }

  /** 실행취소(#undo) 스냅샷 복원 — characters만 통째로 교체 */
  restoreCharacters(characters: Record<string, Character>): StoreShape {
    this.store.set('characters', characters)
    return this.getState()
  }

  /** 마지막으로 클라우드와 일치했던 updatedAt — 시작 시 원격 변경 감지용 (기기 로컬 전용) */
  getLastCloudSyncAt(): number | null {
    return this.store.get('lastCloudSyncAt', null) ?? null
  }

  markCloudSync(updatedAt: number): void {
    this.store.set('lastCloudSyncAt', updatedAt)
  }

  /** 마지막으로 확인한 meta/catalog 문서의 updatedAt — 카탈로그 변경 감지용 (#catalog-watch) */
  getLastCatalogMetaAt(): string | number | null {
    return this.store.get('lastCatalogMetaAt', null) ?? null
  }

  markCatalogMetaAt(value: string | number): void {
    this.store.set('lastCatalogMetaAt', value)
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
