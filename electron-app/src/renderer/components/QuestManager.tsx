import { useState } from 'react'
import {
  QUEST_CATEGORIES,
  QUEST_CATEGORY_CLASS,
  taskOrderCompare,
  type QuestCategory,
  type TaskPeriod
} from '../../shared/types'
import { useDashboardStore } from '../store/useDashboardStore'

/** 카테고리 그룹 목록 — 체크리스트(#13)와 동일한 정렬 순서, 미지정('기타')은 맨 뒤 */
const GROUP_KEYS: Array<QuestCategory | null> = [...QUEST_CATEGORIES, null]

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
  const setTaskExcluded = useDashboardStore((s) => s.setTaskExcluded)
  const reorderTasks = useDashboardStore((s) => s.reorderTasks)

  const [name, setName] = useState('')
  const [period, setPeriod] = useState<TaskPeriod>('daily')
  const [targetCount, setTargetCount] = useState(1)
  const [category, setCategory] = useState<QuestCategory | ''>('')
  const [location, setLocation] = useState('')
  const [isRaid, setIsRaid] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  /** 드래그로 순서 변경 중인 커스텀 퀘스트 (#quest-order) — 카탈로그 퀘스트는 대상 아님 */
  const [dragTaskId, setDragTaskId] = useState<string | null>(null)
  /** 인라인 수정 중인 커스텀 퀘스트 (#21) */
  const [editing, setEditing] = useState<{
    taskId: string
    name: string
    period: TaskPeriod
    category: QuestCategory | ''
    targetCount: number
    location: string
    isRaid: boolean
  } | null>(null)

  if (!data || !activeId || !data.characters[activeId]) {
    return <p className="placeholder">캐릭터를 먼저 추가하세요.</p>
  }

  const character = data.characters[activeId]
  const entries = Object.entries(character.tasks)

  const submit = (): void => {
    const trimmed = name.trim()
    if (!trimmed) return
    void addTask(
      activeId,
      trimmed,
      period,
      targetCount,
      category || null,
      location.trim() || null,
      isRaid
    )
    setName('')
    setTargetCount(1)
    setCategory('')
    setLocation('')
    setIsRaid(false)
  }

  /** 인라인 수정 저장 (#21) */
  const submitEdit = (): void => {
    if (!editing || !editing.name.trim()) return
    void updateTask(activeId, editing.taskId, {
      displayName: editing.name.trim(),
      period: editing.period,
      category: editing.category || null,
      targetCount: editing.targetCount,
      location: editing.location.trim() || null,
      isRaid: editing.isRaid
    })
    setEditing(null)
  }

  /** 드래그로 놓은 위치에 맞춰 그룹(같은 period+category) 내 순서 재부여 (#quest-order).
   *  카탈로그 퀘스트도 같은 그룹에 섞여 있으면 그 사이로 끼워 넣을 수 있다 — 단, 카탈로그
   *  쪽 순서는 다음 동기화 때 Firestore order로 다시 덮인다 */
  const handleDrop = (groupTaskIds: string[], targetTaskId: string): void => {
    if (!dragTaskId || dragTaskId === targetTaskId) return
    const ids = [...groupTaskIds]
    const from = ids.indexOf(dragTaskId)
    const to = ids.indexOf(targetTaskId)
    setDragTaskId(null)
    if (from === -1 || to === -1) return
    ids.splice(from, 1)
    ids.splice(to, 0, dragTaskId)
    void reorderTasks(activeId, ids)
  }

  const renderSection = (p: TaskPeriod, label: string): React.JSX.Element | null => {
    const sectionTasks = entries.filter(([, t]) => t.period === p)
    if (sectionTasks.length === 0) return null
    return (
      <section className="task-section">
        <h3 className="section-title">{label}</h3>
        {GROUP_KEYS.map((cat) => renderGroup(p, cat, sectionTasks))}
      </section>
    )
  }

  const renderGroup = (
    p: TaskPeriod,
    cat: QuestCategory | null,
    sectionTasks: Array<[string, (typeof entries)[number][1]]>
  ): React.JSX.Element | null => {
    const groupTasks = sectionTasks
      .filter(([, t]) => (t.category ?? null) === cat)
      .sort(([, a], [, b]) => taskOrderCompare(a, b))
    if (groupTasks.length === 0) return null
    const groupTaskIds = groupTasks.map(([taskId]) => taskId)

    return (
      <div className="manage-group" key={`${p}:${cat ?? '기타'}`}>
        <div className="manage-group-title">
          {cat ? (
            <span className={`cat-badge cat-${QUEST_CATEGORY_CLASS[cat]}`}>{cat}</span>
          ) : (
            <span className="cat-badge cat-none">기타</span>
          )}
        </div>
        <ul className="task-list">
          {groupTasks.map(([taskId, task]) => {
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
                  <input
                    className="add-task-input edit-location-input"
                    placeholder="지역 (선택)"
                    value={editing.location}
                    onChange={(e) => setEditing({ ...editing, location: e.target.value })}
                  />
                  <label className="raid-check-label" title="대시보드 '레이드' 섹션에 표시">
                    <input
                      type="checkbox"
                      checked={editing.isRaid}
                      onChange={(e) => setEditing({ ...editing, isRaid: e.target.checked })}
                    />
                    레이드
                  </label>
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
              <li
                className={`task-item ${task.excluded ? 'task-excluded-row' : ''} ${
                  dragTaskId === taskId ? 'task-item-dragging' : ''
                }`}
                key={taskId}
                onDragOver={(e) => {
                  if (dragTaskId) e.preventDefault()
                }}
                onDrop={() => handleDrop(groupTaskIds, taskId)}
              >
                {/* 카탈로그 퀘스트는 순서가 Firestore order로 고정 — 핸들 자체를 안 보여줌 (#quest-order) */}
                {!task.catalogId && (
                  <span
                    className="drag-handle"
                    title="드래그해서 순서 변경"
                    draggable
                    onDragStart={(e) => {
                      setDragTaskId(taskId)
                      e.dataTransfer.effectAllowed = 'move'
                      const row = e.currentTarget.closest('li')
                      if (row) e.dataTransfer.setDragImage(row, 0, 0)
                    }}
                    onDragEnd={() => setDragTaskId(null)}
                  >
                    ☰
                  </span>
                )}
                <span className="task-name manage-task-name">
                  {task.displayName}
                  {(task.targetCount ?? 1) > 1 && (
                    <span className="target-badge" title={`${task.targetCount}회 완료 필요`}>
                      ×{task.targetCount}
                    </span>
                  )}
                </span>
                {task.isRaid && (
                  <span className="raid-badge" title="대시보드 '레이드' 섹션에 표시됨">
                    🐉 레이드
                  </span>
                )}
                {task.catalogId && (
                  <span className="catalog-badge" title="Firebase 카탈로그 퀘스트 — 삭제해도 다음 동기화 때 다시 추가됩니다">
                    ☁
                  </span>
                )}
                {task.location && <span className="loc-badge">{task.location}</span>}
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
                        targetCount: task.targetCount ?? 1,
                        location: task.location ?? '',
                        isRaid: task.isRaid ?? false
                      })
                    }
                  >
                    ✏️
                  </button>
                )}
                {task.catalogId ? (
                  // 카탈로그 퀘스트는 삭제해도 동기화로 부활하므로 '제외' 토글로 대체 (#25)
                  <button
                    className={`manage-exclude ${task.excluded ? 'manage-exclude-active' : ''}`}
                    title={
                      task.excluded
                        ? '이 캐릭터의 진행 대상으로 다시 포함합니다'
                        : '이 캐릭터는 안 하는 퀘스트면 제외 — 항상 완료 상태로 유지되고 리셋되지 않습니다'
                    }
                    onClick={() => void setTaskExcluded(activeId, taskId, !task.excluded)}
                  >
                    {task.excluded ? '🚫 제외됨' : '제외'}
                  </button>
                ) : (
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
                )}
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  return (
    <div className="checklist">
      <p className="manage-title">
        <b>{character.displayName}</b>의 퀘스트 관리
      </p>

      {/* 카드형 추가 폼 (#23) */}
      <form
        className="add-quest-card"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="form-field">
          <label>퀘스트 이름</label>
          <input
            className="add-task-input"
            placeholder="예: 두갈드아일 엘빈: 야채볶음 2 → 상급목재 4"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="form-row">
          <div className="form-field">
            <label>주기</label>
            <select
              className="add-task-period"
              value={period}
              onChange={(e) => setPeriod(e.target.value as TaskPeriod)}
            >
              <option value="daily">일일</option>
              <option value="weekly">주간</option>
            </select>
          </div>
          <div className="form-field">
            <label>카테고리</label>
            <select
              className="add-task-period"
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
          </div>
          <div className="form-field">
            <label>완료 횟수</label>
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
          </div>
          <div className="form-field">
            <label>지역 (선택)</label>
            <input
              className="add-task-input loc-input"
              placeholder="예: 던바튼"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label>&nbsp;</label>
            <label className="raid-check-label" title="대시보드 '레이드' 섹션에 표시">
              <input
                type="checkbox"
                checked={isRaid}
                onChange={(e) => setIsRaid(e.target.checked)}
              />
              레이드
            </label>
          </div>
          <button className="add-task-btn form-submit" type="submit" disabled={!name.trim()}>
            ＋ 추가
          </button>
        </div>
      </form>

      {renderSection('daily', '일일 퀘스트')}
      {renderSection('weekly', '주간 퀘스트')}

      {entries.length === 0 && <p className="placeholder">위에서 퀘스트를 추가해 보세요.</p>}
    </div>
  )
}
