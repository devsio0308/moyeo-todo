import { QUEST_CATEGORY_CLASS, type TaskState } from '../../shared/types'
import { useDashboardStore } from '../store/useDashboardStore'

interface Props {
  characterId: string
  taskId: string
  task: TaskState
  /** 알람 시간대인 규칙 id — 규칙별 색상 하이라이트 (#11). null이면 알람 없음 */
  alarmRuleId?: string | null
}

/** 퀘스트 한 줄 (체크 전용 — 삭제는 퀘스트 관리 화면에서, #5). */
export default function TaskItem({
  characterId,
  taskId,
  task,
  alarmRuleId = null
}: Props): React.JSX.Element {
  const setTaskDone = useDashboardStore((s) => s.setTaskDone)
  const incrementTask = useDashboardStore((s) => s.incrementTask)

  const target = task.targetCount ?? 1
  const count = task.count ?? (task.done ? target : 0)
  const isCounted = target > 1 // 카운트형 퀘스트 (#7)
  // 풀형 퀘스트: 주간 원본 행은 집계 표시 전용이라 체크박스를 숨긴다 —
  // 체크/증감은 일일 섹션의 투영 행에서 (증감 버튼은 양쪽 다 동작)
  const isPoolWeeklyRow = task.dailyPool === true && task.period === 'weekly'
  const isPoolDailyRow = task.dailyPool === true && task.period === 'daily'

  return (
    <li
      className={`task-item ${task.done ? 'task-done' : ''} ${
        task.excluded ? 'task-excluded-row' : ''
      } ${alarmRuleId ? `task-alarm task-alarm-${alarmRuleId}` : ''}`}
    >
      <label className="task-label">
        {!isPoolWeeklyRow && (
          <input
            type="checkbox"
            checked={task.done}
            disabled={task.excluded}
            title={
              task.excluded
                ? '제외된 퀘스트 — 퀘스트 관리에서 해제할 수 있습니다'
                : isPoolDailyRow
                  ? target === 0
                    ? '오늘은 갈 수 없습니다 (남은 요일 예약분)'
                    : '체크: 오늘 가능분 전부 완료 / 해제: 오늘 사용분 취소'
                  : isCounted
                    ? '체크: 전체 완료 / 해제: 0회로 초기화'
                    : undefined
            }
            onChange={(e) => void setTaskDone(characterId, taskId, e.target.checked)}
          />
        )}
        <span className="task-name">{task.displayName}</span>
      </label>
      {task.excluded && (
        <span className="excluded-badge" title="이 캐릭터는 제외한 퀘스트">
          🚫 제외
        </span>
      )}
      {task.location && <span className="loc-badge">{task.location}</span>}
      {isCounted && !task.excluded && (
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
      {task.category && (
        <span className={`cat-badge cat-${QUEST_CATEGORY_CLASS[task.category]}`}>
          {task.category}
        </span>
      )}
    </li>
  )
}
