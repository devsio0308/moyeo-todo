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

  const [name, setName] = useState('')
  const [period, setPeriod] = useState<TaskPeriod>('daily')
  const [targetCount, setTargetCount] = useState(1)
  const [category, setCategory] = useState<QuestCategory | ''>('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [showRecommended, setShowRecommended] = useState(false)

  if (!data || !activeId || !data.characters[activeId]) {
    return <p className="placeholder">캐릭터를 먼저 추가하세요.</p>
  }

  const character = data.characters[activeId]
  const entries = Object.entries(character.tasks)
  const recommended = data.recommendedQuests ?? []
  /** 같은 이름의 퀘스트가 이미 있으면 '추가됨' 처리 (#15) */
  const existingNames = new Set(entries.map(([, t]) => t.displayName))

  const submit = (): void => {
    const trimmed = name.trim()
    if (!trimmed) return
    void addTask(activeId, trimmed, period, targetCount, category || null)
    setName('')
    setTargetCount(1)
    setCategory('')
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
          {sectionTasks.map(([taskId, task]) => (
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

      {recommended.length > 0 && (
        <section className="task-section">
          <button
            className="rec-toggle"
            onClick={() => setShowRecommended((v) => !v)}
            title="추천 목록에서 골라 커스텀 퀘스트로 추가 (카탈로그와 달리 자동 동기화되지 않음)"
          >
            📖 추천 퀘스트 {recommended.length}개 {showRecommended ? '▲' : '▼'}
          </button>
          {showRecommended && (
            <ul className="task-list">
              {['daily', 'weekly'].map((p) => {
                const items = recommended.filter((r) => r.period === p)
                if (items.length === 0) return null
                return (
                  <li key={p}>
                    <h3 className="section-title rec-section-title">
                      {p === 'daily' ? '일일' : '주간'}
                    </h3>
                    <ul className="task-list">
                      {items.map((item) => {
                        const added = existingNames.has(item.name)
                        return (
                          <li className="task-item rec-item" key={item.id}>
                            <span className="task-name manage-task-name">
                              {item.name}
                              {(item.targetCount ?? 1) > 1 && (
                                <span className="target-badge">×{item.targetCount}</span>
                              )}
                            </span>
                            {item.category && (
                              <span
                                className={`cat-badge cat-${QUEST_CATEGORY_CLASS[item.category]}`}
                              >
                                {item.category}
                              </span>
                            )}
                            <button
                              className="settings-btn rec-add-btn"
                              disabled={added}
                              onClick={() =>
                                void addTask(
                                  activeId,
                                  item.name,
                                  item.period,
                                  item.targetCount ?? 1,
                                  item.category ?? null
                                )
                              }
                            >
                              {added ? '추가됨' : '＋ 추가'}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {renderSection('daily', '일일 퀘스트')}
      {renderSection('weekly', '주간 퀘스트')}

      {entries.length === 0 && <p className="placeholder">위에서 퀘스트를 추가해 보세요.</p>}
    </div>
  )
}
