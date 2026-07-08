import type { TaskPeriod } from '../../shared/types'
import type { ActiveAlarm } from '../hooks/useAlarms'
import { useDashboardStore } from '../store/useDashboardStore'
import TaskItem from './TaskItem'

interface Props {
  /** 지금 하이라이트할 알람 목록 (#11) — 규칙별 색상 구분 */
  activeAlarms?: ActiveAlarm[]
}

/** 활성 캐릭터의 퀘스트 체크 목록 + 진행률. 추가/삭제는 퀘스트 관리 화면(#5)에서. */
export default function TaskChecklist({ activeAlarms = [] }: Props): React.JSX.Element {
  const data = useDashboardStore((s) => s.data)
  const activeId = useDashboardStore((s) => s.activeCharacterId)

  if (!data || !activeId || !data.characters[activeId]) {
    return <p className="placeholder">캐릭터를 추가하면 퀘스트를 관리할 수 있어요.</p>
  }

  const character = data.characters[activeId]
  const entries = Object.entries(character.tasks)
  const doneCount = entries.filter(([, t]) => t.done).length

  const renderSection = (p: TaskPeriod, label: string): React.JSX.Element | null => {
    // 완료된 퀘스트는 하단으로 (#8) — sort는 stable이라 미완료끼리는 원래 순서 유지
    const sectionTasks = entries
      .filter(([, t]) => t.period === p)
      .sort(([, a], [, b]) => Number(a.done) - Number(b.done))
    if (sectionTasks.length === 0) return null
    return (
      <section className="task-section">
        <h3 className="section-title">{label}</h3>
        <ul className="task-list">
          {sectionTasks.map(([taskId, task]) => (
            <TaskItem
              key={taskId}
              characterId={activeId}
              taskId={taskId}
              task={task}
              alarmRuleId={
                task.done
                  ? null
                  : (activeAlarms.find((a) => task.displayName.includes(a.keyword))?.ruleId ??
                    null)
              }
            />
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

      {renderSection('daily', '일일 퀘스트')}
      {renderSection('weekly', '주간 퀘스트')}

      {entries.length === 0 && (
        <p className="placeholder">📋 버튼(퀘스트 관리)에서 퀘스트를 추가해 보세요.</p>
      )}
    </div>
  )
}
