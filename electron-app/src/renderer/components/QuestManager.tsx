import { useState } from 'react'
import {
  QUEST_CATEGORIES,
  QUEST_CATEGORY_CLASS,
  questCategoryOrder,
  type QuestCategory,
  type TaskPeriod
} from '../../shared/types'
import { useDashboardStore } from '../store/useDashboardStore'

/**
 * 퀘스트 관리 화면 (#5) — 추가/삭제는 여기서만.
 * 체크리스트 화면은 체크 전용으로 단순화해 오조작을 방지한다.
 */
export default function QuestManager(): React.JSX.Element {
  const data = useDashboardStore((s) => s.data)
  const activeId = useDashboardStore((s) => s.activeCharacterId)
  const addTask = useDashboardStore((s) => s.addTask)
  const removeTask = useDashboardStore((s) => s.removeTask)
  const updateTask = useDashboardStore((s) => s.updateTask)

  const [name, setName] = useState('')
  const [period, setPeriod] = useState<TaskPeriod>('daily')
  const [targetCount, setTargetCount] = useState(1)
  const [category, setCategory] = useState<QuestCategory | ''>('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  /** 인라인 수정 중인 커스텀 퀘스트 (#21) */
  const [editing, setEditing] = useState<{
    taskId: string
    name: string
    period: TaskPeriod
    category: QuestCategory | ''
    targetCount: number
  } | null>(null)

  if (!data || !activeId || !data.characters[activeId]) {
    return <p className="placeholder">캐릭터를 먼저 추가하세요.</p>
  }

  const character = data.characters[activeId]
  const entries = Object.entries(character.tasks)

  const submit = (): void => {
    const trimmed = name.trim()
    if (!trimmed) return
    void addTask(activeId, trimmed, period, targetCount, category || null)
    setName('')
    setTargetCount(1)
    setCategory('')
  }

  /** 인라인 수정 저장 (#21) */
  const submitEdit = (): void => {
    if (!editing || !editing.name.trim()) return
    void updateTask(activeId, editing.taskId, {
      displayName: editing.name.trim(),
      period: editing.period,
      category: editing.category || null,
      targetCount: editing.targetCount
    })
    setEditing(null)
  }

  const renderSection = (p: TaskPeriod, label: string): React.JSX.Element | null => {
    // 체크리스트와 동일한 카테고리 순 정렬 (#13)
    const sectionTasks = entries
      .filter(([, t]) => t.period === p)
      .sort(([, a], [, b]) => questCategoryOrder(a.category) - questCategoryOrder(b.category))
    if (sectionTasks.length === 0) return null
    return (
      <section className="task-section">
        <h3 className="section-title">{label}</h3>
        <ul className="task-list">
          {sectionTasks.map(([taskId, task]) => {
            // 인라인 수정 폼 (#21) — 커스텀 퀘스트만
            if (editing?.taskId === taskId) {
              return (
                <li className="task-item edit-row" key={taskId}>
                  <input
                    className="add-task-input"
                    value={editing.name}
                    autoFocus
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') submitEdit()
                      if (e.key === 'Escape') setEditing(null)
                    }}
                  />
                  <select
                    className="add-task-period"
                    value={editing.period}
                    onChange={(e) =>
                      setEditing({ ...editing, period: e.target.value as TaskPeriod })
                    }
                  >
                    <option value="daily">일일</option>
                    <option value="weekly">주간</option>
                  </select>
                  <select
                    className="add-task-period"
                    value={editing.category}
                    onChange={(e) =>
                      setEditing({ ...editing, category: e.target.value as QuestCategory | '' })
                    }
                  >
                    <option value="">태그 없음</option>
                    {QUEST_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input
                    className="add-task-count"
                    type="number"
                    min={1}
                    max={99}
                    value={editing.targetCount}
                    onChange={(e) => {
                      const v = parseInt(e.target.value)
                      if (v >= 1 && v <= 99) setEditing({ ...editing, targetCount: v })
                    }}
                  />
                  <button
                    className="add-task-btn"
                    disabled={!editing.name.trim()}
                    onClick={submitEdit}
                  >
                    저장
                  </button>
                  <button className="settings-btn" onClick={() => setEditing(null)}>
                    취소
                  </button>
                </li>
              )
            }

            return (
              <li className="task-item" key={taskId}>
                <span className="task-name manage-task-name">
                  {task.displayName}
                  {(task.targetCount ?? 1) > 1 && (
                    <span className="target-badge" title={`${task.targetCount}회 완료 필요`}>
                      ×{task.targetCount}
                    </span>
                  )}
                </span>
                {task.catalogId && (
                  <span className="catalog-badge" title="Firebase 카탈로그 퀘스트 — 삭제해도 다음 동기화 때 다시 추가됩니다">
                    ☁
                  </span>
                )}
                {task.category && (
                  <span className={`cat-badge cat-${QUEST_CATEGORY_CLASS[task.category]}`}>
                    {task.category}
                  </span>
                )}
                {!task.catalogId && (
                  <button
                    className="manage-edit"
                    title="퀘스트 수정 (#21) — 카탈로그 퀘스트는 동기화로 덮이므로 수정 불가"
                    onClick={() =>
                      setEditing({
                        taskId,
                        name: task.displayName,
                        period: task.period,
                        category: task.category ?? '',
                        targetCount: task.targetCount ?? 1
                      })
                    }
                  >
                    ✏️
                  </button>
                )}
                <button
                  className={`manage-delete ${confirmId === taskId ? 'manage-delete-confirm' : ''}`}
                  title={confirmId === taskId ? '한 번 더 클릭하면 삭제' : '퀘스트 삭제'}
                  onBlur={() => setConfirmId(null)}
                  onClick={() => {
                    if (confirmId === taskId) {
                      void removeTask(activeId, taskId)
                      setConfirmId(null)
                    } else {
                      setConfirmId(taskId)
                    }
                  }}
                >
                  {confirmId === taskId ? '삭제?' : '🗑'}
                </button>
              </li>
            )
          })}
        </ul>
      </section>
    )
  }

  return (
    <div className="checklist">
      <p className="manage-title">
        <b>{character.displayName}</b>의 퀘스트 관리
      </p>

      <form
        className="add-task-form manage-add-form"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <input
          className="add-task-input"
          placeholder="퀘스트 추가…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className="add-task-period"
          value={period}
          onChange={(e) => setPeriod(e.target.value as TaskPeriod)}
        >
          <option value="daily">일일</option>
          <option value="weekly">주간</option>
        </select>
        <select
          className="add-task-period"
          title="카테고리 태그"
          value={category}
          onChange={(e) => setCategory(e.target.value as QuestCategory | '')}
        >
          <option value="">태그 없음</option>
          {QUEST_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          className="add-task-count"
          type="number"
          min={1}
          max={99}
          title="완료에 필요한 횟수 (1이면 단일 퀘스트)"
          value={targetCount}
          onChange={(e) => {
            const v = parseInt(e.target.value)
            if (v >= 1 && v <= 99) setTargetCount(v)
          }}
        />
        <button className="add-task-btn" type="submit" disabled={!name.trim()}>
          추가
        </button>
      </form>

      {renderSection('daily', '일일 퀘스트')}
      {renderSection('weekly', '주간 퀘스트')}

      {entries.length === 0 && <p className="placeholder">위에서 퀘스트를 추가해 보세요.</p>}
    </div>
  )
}
