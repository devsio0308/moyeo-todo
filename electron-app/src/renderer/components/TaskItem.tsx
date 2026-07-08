import type { TaskState } from '../../shared/types'
import { useDashboardStore } from '../store/useDashboardStore'

interface Props {
  characterId: string
  taskId: string
  task: TaskState
}

/**
 * 퀘스트 한 줄.
 * 자동 감지(🤖) / 수동 체크(👆)를 아이콘으로 구분 — 유저가 오탐 여부를 나중에 구분할 수 있어야 함 (명세서 §5).
 */
export default function TaskItem({ characterId, taskId, task }: Props): React.JSX.Element {
  const setTaskDone = useDashboardStore((s) => s.setTaskDone)
  const removeTask = useDashboardStore((s) => s.removeTask)

  return (
    <li className={`task-item ${task.done ? 'task-done' : ''}`}>
      <label className="task-label">
        <input
          type="checkbox"
          checked={task.done}
          onChange={(e) => void setTaskDone(characterId, taskId, e.target.checked, 'manual')}
        />
        <span className="task-name">{task.displayName}</span>
      </label>
      <span className={`period-badge period-${task.period}`}>
        {task.period === 'daily' ? '일일' : '주간'}
      </span>
      {task.done && (
        <span className="mode-icon" title={task.mode === 'auto' ? '자동 감지됨' : '수동 체크'}>
          {task.mode === 'auto' ? '🤖' : '👆'}
        </span>
      )}
      <button
        className="task-delete"
        title="퀘스트 삭제"
        onClick={() => void removeTask(characterId, taskId)}
      >
        ×
      </button>
    </li>
  )
}
