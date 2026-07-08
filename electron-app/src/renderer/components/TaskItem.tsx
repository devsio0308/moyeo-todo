import type { TaskState } from '../../shared/types'
import { useDashboardStore } from '../store/useDashboardStore'

interface Props {
  characterId: string
  taskId: string
  task: TaskState
  /** 알람 시간대 — 배경 펄스 표시 (#11) */
  alarmActive?: boolean
}

/**
 * 퀘스트 한 줄 (체크 전용 — 삭제는 퀘스트 관리 화면에서, #5).
 * 자동 감지로 완료된 항목만 🤖 아이콘 표시 — 유저가 오탐 여부를 구분할 수 있어야 함 (명세서 §5).
 * 수동 체크는 아이콘 없음 (#9).
 */
export default function TaskItem({
  characterId,
  taskId,
  task,
  alarmActive = false
}: Props): React.JSX.Element {
  const setTaskDone = useDashboardStore((s) => s.setTaskDone)
  const incrementTask = useDashboardStore((s) => s.incrementTask)

  const target = task.targetCount ?? 1
  const count = task.count ?? (task.done ? target : 0)
  const isCounted = target > 1 // 카운트형 퀘스트 (#7)

  return (
    <li
      className={`task-item ${task.done ? 'task-done' : ''} ${alarmActive ? 'task-alarm' : ''}`}
    >
      <label className="task-label">
        <input
          type="checkbox"
          checked={task.done}
          title={isCounted ? '체크: 전체 완료 / 해제: 0회로 초기화' : undefined}
          onChange={(e) => void setTaskDone(characterId, taskId, e.target.checked, 'manual')}
        />
        <span className="task-name">{task.displayName}</span>
      </label>
      {isCounted && (
        <span className="count-ctrl">
          <button
            className="count-btn"
            disabled={count <= 0}
            onClick={() => void incrementTask(characterId, taskId, -1)}
          >
            −
          </button>
          <span className={`count-text ${task.done ? 'count-done' : ''}`}>
            {count}/{target}
          </span>
          <button
            className="count-btn"
            disabled={task.done}
            onClick={() => void incrementTask(characterId, taskId, 1)}
          >
            ＋
          </button>
        </span>
      )}
      <span className={`period-badge period-${task.period}`}>
        {task.period === 'daily' ? '일일' : '주간'}
      </span>
      {task.done && task.mode === 'auto' && (
        <span className="mode-icon" title="자동 감지됨">
          🤖
        </span>
      )}
    </li>
  )
}
