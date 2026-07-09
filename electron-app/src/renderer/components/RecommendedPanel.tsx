import { QUEST_CATEGORY_CLASS } from '../../shared/types'
import { useDashboardStore } from '../store/useDashboardStore'

/**
 * 추천 퀘스트 패널 (#15, #22) — 관리 창 우측에 상시 표시.
 * 활성 캐릭터에 골라서 추가하면 커스텀 퀘스트로 등록된다.
 */
export default function RecommendedPanel(): React.JSX.Element {
  const data = useDashboardStore((s) => s.data)
  const activeId = useDashboardStore((s) => s.activeCharacterId)
  const addTask = useDashboardStore((s) => s.addTask)

  const recommended = data?.recommendedQuests ?? []
  const character = activeId ? data?.characters[activeId] : null
  const existingNames = new Set(
    Object.values(character?.tasks ?? {}).map((t) => t.displayName)
  )

  if (recommended.length === 0) {
    return (
      <aside className="rec-panel">
        <h2 className="dash-section-title">📖 추천 퀘스트</h2>
        <p className="settings-hint">
          Firestore의 recommended_quests 컬렉션이 비어 있거나 아직 동기화되지 않았습니다.
        </p>
      </aside>
    )
  }

  return (
    <aside className="rec-panel">
      <h2 className="dash-section-title">📖 추천 퀘스트</h2>
      <p className="settings-hint">
        {character
          ? `추가하면 '${character.displayName}'의 커스텀 퀘스트로 등록됩니다.`
          : '캐릭터를 먼저 선택하세요.'}
      </p>
      {(['daily', 'weekly'] as const).map((p) => {
        const items = recommended.filter((r) => r.period === p)
        if (items.length === 0) return null
        return (
          <section className="task-section" key={p}>
            <h3 className="section-title">{p === 'daily' ? '일일' : '주간'}</h3>
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
                      <span className={`cat-badge cat-${QUEST_CATEGORY_CLASS[item.category]}`}>
                        {item.category}
                      </span>
                    )}
                    <button
                      className="settings-btn rec-add-btn"
                      disabled={added || !activeId}
                      onClick={() =>
                        activeId &&
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
          </section>
        )
      })}
    </aside>
  )
}
