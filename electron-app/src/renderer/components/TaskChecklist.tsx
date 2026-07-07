import { useState } from 'react'
import type { TaskPeriod } from '../../shared/types'
import { useDashboardStore } from '../store/useDashboardStore'
import TaskItem from './TaskItem'

/** 활성 캐릭터의 숙제 목록 + 추가 폼 + 진행률 */
export default function TaskChecklist(): React.JSX.Element {
  const data = useDashboardStore((s) => s.data)
  const activeId = useDashboardStore((s) => s.activeCharacterId)
  const addTask = useDashboardStore((s) => s.addTask)

  const [name, setName] = useState('')
  const [period, setPeriod] = useState<TaskPeriod>('daily')

  if (!data || !activeId || !data.characters[activeId]) {
    return <p className="placeholder">캐릭터를 추가하면 숙제를 관리할 수 있어요.</p>
  }

  const character = data.characters[activeId]
  const entries = Object.entries(character.tasks)
  const doneCount = entries.filter(([, t]) => t.done).length

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
            <TaskItem key={taskId} characterId={activeId} taskId={taskId} task={task} />
          ))}
        </ul>
      </section>
    )
  }

  return (
    <div className="checklist">
      {entries.length > 0 && (
        <div className="progress-row">
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${entries.length ? (doneCount / entries.length) * 100 : 0}%` }}
            />
          </div>
          <span className="progress-text">
            {doneCount}/{entries.length}
          </span>
        </div>
      )}

      {renderSection('daily', '일일 숙제')}
      {renderSection('weekly', '주간 숙제')}

      {entries.length === 0 && <p className="placeholder">아래에서 숙제를 추가해 보세요.</p>}

      <form
        className="add-task-form"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <input
          className="add-task-input"
          placeholder="숙제 추가…"
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
    </div>
  )
}
