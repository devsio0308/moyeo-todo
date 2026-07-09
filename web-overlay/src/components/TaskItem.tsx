import { QUEST_CATEGORY_CLASS, type TaskState } from '../shared/types'
import { webStore } from '../store'

interface Props {
  characterId: string
  taskId: string
  task: TaskState
  alarmRuleId?: string | null
}

/** 퀘스트 한 줄 — electron-app TaskItem 이식 (#27), 체크 전용 */
export default function TaskItem({
  characterId,
  taskId,
  task,
  alarmRuleId = null
}: Props): React.JSX.Element {
  const target = task.targetCount ?? 1
  const count = task.count ?? (task.done ? target : 0)
  const isCounted = target > 1

  return (
    <li
      className={`task-item ${task.done ? 'task-done' : ''} ${
        task.excluded ? 'task-excluded-row' : ''
      } ${alarmRuleId ? `task-alarm task-alarm-${alarmRuleId}` : ''}`}
    >
      <label className="task-label">
        <input
          type="checkbox"
          checked={task.done}
          disabled={task.excluded}
          onChange={(e) => void webStore.setTaskDone(characterId, taskId, e.target.checked, 'manual')}
        />
        <span className="task-name">{task.displayName}</span>
      </label>
      {task.excluded && <span className="excluded-badge">🚫 제외</span>}
      {task.location && <span className="loc-badge">{task.location}</span>}
      {isCounted && !task.excluded && (
        <span className="count-ctrl">
          <button
            className="count-btn"
            disabled={count <= 0}
            onClick={() => void webStore.incrementTask(characterId, taskId, -1)}
          >
            −
          </button>
          <span className={`count-text ${task.done ? 'count-done' : ''}`}>
            {count}/{target}
          </span>
          <button
            className="count-btn"
            disabled={task.done}
            onClick={() => void webStore.incrementTask(characterId, taskId, 1)}
          >
            ＋
          </button>
        </span>
      )}
      {task.category && (
        <span className={`cat-badge cat-${QUEST_CATEGORY_CLASS[task.category]}`}>
          {task.category}
        </span>
      )}
      {task.done && task.mode === 'auto' && (
        <span className="mode-icon" title="자동 감지됨">
          🤖
        </span>
      )}
    </li>
  )
}
