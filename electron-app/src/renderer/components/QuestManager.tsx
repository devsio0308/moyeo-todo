import { useState } from 'react'
import type { TaskPeriod } from '../../shared/types'
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

  const [name, setName] = useState('')
  const [period, setPeriod] = useState<TaskPeriod>('daily')
  const [confirmId, setConfirmId] = useState<string | null>(null)

  if (!data || !activeId || !data.characters[activeId]) {
    return <p className="placeholder">캐릭터를 먼저 추가하세요.</p>
  }

  const character = data.characters[activeId]
  const entries = Object.entries(character.tasks)

  const submit = (): void => {
    const trimmed = name.trim()
    if (!trimmed) return
    void addTask(activeId, trimmed, period)
    setName('')
  }

  const renderSection = (p: TaskPeriod, label: string): React.JSX.Element | null => {
    const sectionTasks = entries.filter(([, t]) => t.period === p)
    if (sectionTasks.length === 0) return null
    return (
      <section className="task-section">
        <h3 className="section-title">{label}</h3>
        <ul className="task-list">
          {sectionTasks.map(([taskId, task]) => (
            <li className="task-item" key={taskId}>
              <span className="task-name manage-task-name">{task.displayName}</span>
              <span className={`period-badge period-${task.period}`}>
                {task.period === 'daily' ? '일일' : '주간'}
              </span>
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
          ))}
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
