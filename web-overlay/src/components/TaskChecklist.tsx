import { useState } from 'react'
import { poolTodayMax } from '../shared/pool-quest'
import {
  QUEST_CATEGORIES,
  QUEST_CATEGORY_CLASS,
  type QuestCategory,
  type TaskPeriod,
  type TaskState
} from '../shared/types'
import { useWebStore } from '../store'
import type { ActiveAlarm } from '../hooks/useAlarms'
import TaskItem from './TaskItem'

interface Props {
  activeAlarms?: ActiveAlarm[]
}

const COLLAPSE_STORAGE_KEY = 'dobi-checklist-collapse'

function loadCollapse(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSE_STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

const GROUP_KEYS: Array<QuestCategory | null> = [...QUEST_CATEGORIES, null]

/** 체크리스트 — electron-app 오버레이 이식 (#27): 섹션별 프로그레스 + 카테고리 접기 */
export default function TaskChecklist({ activeAlarms = [] }: Props): React.JSX.Element {
  const data = useWebStore((s) => s.data)
  const activeId = useWebStore((s) => s.activeCharacterId)
  const [collapse, setCollapse] = useState<Record<string, boolean>>(loadCollapse)
  // 완료 섹션은 항상 접힘으로 시작 — 펼침 상태를 저장하지 않는다 (세션 내에서만 유지)
  const [doneCollapsed, setDoneCollapsed] = useState(true)

  if (!data || !activeId || !data.characters[activeId]) {
    return <p className="placeholder">캐릭터가 없습니다.</p>
  }

  const character = data.characters[activeId]
  const entries = Object.entries(character.tasks)

  // 풀형 퀘스트(검은/심층 구멍)를 일일 섹션에 '오늘 가능 횟수'로 투영 (electron과 동일)
  const nowSec = Math.floor(Date.now() / 1000)
  const poolSettings = { dailyResetHour: data.dailyResetHour, weeklyResetDay: data.weeklyResetDay }
  const poolProjections: Array<[string, TaskState]> = entries
    .filter(([, t]) => t.dailyPool && t.period === 'weekly' && !t.excluded)
    .map(([taskId, t]) => {
      const todayMax = poolTodayMax(t, nowSec, poolSettings)
      const used = t.dailyUsed ?? 0
      return [
        taskId,
        { ...t, period: 'daily', count: used, targetCount: todayMax, done: used >= todayMax }
      ]
    })

  const toggleCollapse = (key: string): void => {
    setCollapse((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  const sectionTasksOf = (p: TaskPeriod): Array<[string, TaskState]> =>
    p === 'daily'
      ? [...entries.filter(([, t]) => t.period === p), ...poolProjections]
      : entries.filter(([, t]) => t.period === p)

  const renderSection = (p: TaskPeriod, label: string): React.JSX.Element | null => {
    const sectionTasks = sectionTasksOf(p)
    if (sectionTasks.length === 0) return null
    const doneCount = sectionTasks.filter(([, t]) => t.done).length

    return (
      <section className="task-section" key={p}>
        <div className="section-head">
          <h3 className="section-title">{label}</h3>
          <div className="progress-bar section-progress">
            <div
              className="progress-fill"
              style={{ width: `${(doneCount / sectionTasks.length) * 100}%` }}
            />
          </div>
          <span className="progress-text">
            {doneCount}/{sectionTasks.length}
          </span>
        </div>

        {GROUP_KEYS.map((cat) => {
          const groupAll = sectionTasks.filter(([, t]) => (t.category ?? null) === cat)
          // 완료 항목은 맨 아래 완료 섹션에서만 표시
          const groupTasks = groupAll.filter(([, t]) => !t.done)
          if (groupTasks.length === 0) return null

          const key = `${p}:${cat ?? '기타'}`
          const collapsed = !!collapse[key]
          const groupDone = groupAll.filter(([, t]) => t.done).length

          return (
            <div className="task-group" key={key}>
              <button className="group-head" onClick={() => toggleCollapse(key)}>
                <span className="group-chevron">{collapsed ? '▸' : '▾'}</span>
                {cat ? (
                  <span className={`cat-badge cat-${QUEST_CATEGORY_CLASS[cat]}`}>{cat}</span>
                ) : (
                  <span className="cat-badge cat-none">기타</span>
                )}
                <span className="group-count">
                  {groupDone}/{groupAll.length}
                </span>
              </button>
              {!collapsed && (
                <ul className="task-list">
                  {groupTasks.map(([taskId, task]) => (
                    <TaskItem
                      key={taskId}
                      characterId={activeId}
                      taskId={taskId}
                      task={task}
                      alarmRuleId={
                        task.done
                          ? null
                          : (activeAlarms.find((a) => task.displayName.includes(a.keyword))
                              ?.ruleId ?? null)
                      }
                    />
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </section>
    )
  }

  /** 완료 섹션 — 모든 퀘스트 맨 아래, 기본 접힘 */
  const renderDoneSection = (): React.JSX.Element | null => {
    const doneTasks = [...sectionTasksOf('daily'), ...sectionTasksOf('weekly')].filter(
      ([, t]) => t.done
    )
    if (doneTasks.length === 0) return null

    return (
      <section className="task-section done-section">
        <button className="group-head" onClick={() => setDoneCollapsed(!doneCollapsed)}>
          <span className="group-chevron">{doneCollapsed ? '▸' : '▾'}</span>
          <span className="done-title">완료됨</span>
          <span className="group-count">{doneTasks.length}</span>
        </button>
        {!doneCollapsed && (
          <ul className="task-list">
            {doneTasks.map(([taskId, task]) => (
              <TaskItem
                key={`${task.period}:${taskId}`}
                characterId={activeId}
                taskId={taskId}
                task={task}
              />
            ))}
          </ul>
        )}
      </section>
    )
  }

  return (
    <div className="checklist">
      {renderSection('daily', '일일 퀘스트')}
      {renderSection('weekly', '주간 퀘스트')}
      {renderDoneSection()}
      {entries.length === 0 && <p className="placeholder">등록된 퀘스트가 없습니다.</p>}
    </div>
  )
}
