import { useState } from 'react'
import {
  QUEST_CATEGORIES,
  QUEST_CATEGORY_CLASS,
  type QuestCategory,
  type TaskPeriod,
  type TaskState
} from '../../shared/types'
import type { ActiveAlarm } from '../hooks/useAlarms'
import { useDashboardStore } from '../store/useDashboardStore'
import TaskItem from './TaskItem'

interface Props {
  /** 지금 하이라이트할 알람 목록 (#11) — 규칙별 색상 구분 */
  activeAlarms?: ActiveAlarm[]
}

const COLLAPSE_STORAGE_KEY = 'checklist-collapse'

function loadCollapse(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSE_STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

/** 카테고리 그룹 목록: 정렬 순서(#13) + 미지정('기타')은 맨 뒤 */
const GROUP_KEYS: Array<QuestCategory | null> = [...QUEST_CATEGORIES, null]

/**
 * 활성 캐릭터의 퀘스트 체크 목록 (#17 오버레이 전용).
 * - 일일/주간 섹션별 프로그레스 바 (#18)
 * - 섹션 안에서 카테고리 그룹별 접기 — 상태는 localStorage 유지 (#19)
 */
export default function TaskChecklist({ activeAlarms = [] }: Props): React.JSX.Element {
  const data = useDashboardStore((s) => s.data)
  const activeId = useDashboardStore((s) => s.activeCharacterId)
  const [collapse, setCollapse] = useState<Record<string, boolean>>(loadCollapse)

  if (!data || !activeId || !data.characters[activeId]) {
    return <p className="placeholder">관리 창에서 캐릭터를 추가하면 여기에 표시됩니다.</p>
  }

  const character = data.characters[activeId]
  const entries = Object.entries(character.tasks)

  const toggleCollapse = (key: string): void => {
    setCollapse((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  const renderSection = (p: TaskPeriod, label: string): React.JSX.Element | null => {
    const sectionTasks = entries.filter(([, t]) => t.period === p)
    if (sectionTasks.length === 0) return null
    const doneCount = sectionTasks.filter(([, t]) => t.done).length

    return (
      <section className="task-section">
        {/* 섹션별 프로그레스 (#18) */}
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
          const groupTasks = sectionTasks
            .filter(([, t]) => (t.category ?? null) === cat)
            .sort(([, a], [, b]) => Number(a.done) - Number(b.done)) // 완료 하단 (#8)
          if (groupTasks.length === 0) return null

          const key = `${p}:${cat ?? '기타'}`
          const collapsed = !!collapse[key]
          const groupDone = groupTasks.filter(([, t]) => t.done).length

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
                  {groupDone}/{groupTasks.length}
                </span>
              </button>
              {!collapsed && (
                <ul className="task-list">
                  {groupTasks.map(([taskId, task]) => (
                    <TaskItem
                      key={taskId}
                      characterId={activeId}
                      taskId={taskId}
                      task={task as TaskState}
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

  return (
    <div className="checklist">
      {renderSection('daily', '일일 퀘스트')}
      {renderSection('weekly', '주간 퀘스트')}

      {entries.length === 0 && (
        <p className="placeholder">관리 창(⚙)에서 퀘스트를 추가해 보세요.</p>
      )}
    </div>
  )
}
