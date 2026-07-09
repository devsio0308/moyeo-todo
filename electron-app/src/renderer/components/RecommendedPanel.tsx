import {
  QUEST_CATEGORY_CLASS,
  type QuestCatalogItem,
  type StoreShape
} from '../../shared/types'
import { useDashboardStore } from '../store/useDashboardStore'

/**
 * 추천 퀘스트 패널 (#15, #22, #23) — 관리 창 우측에 상시 표시.
 * 1) Firestore recommended_quests 목록
 * 2) 다른 캐릭터들이 등록한 커스텀 퀘스트 (이름 중복 제거, 등록자 표시)
 * 추가하면 활성 캐릭터의 커스텀 퀘스트로 등록된다.
 */

interface OtherCustomQuest extends QuestCatalogItem {
  /** 등록한 캐릭터 이름 */
  owner: string
}

/** 다른 캐릭터들의 커스텀(catalogId 없음) 퀘스트 — 추천 목록/중복 이름 제외 */
function collectOtherCustomQuests(
  data: StoreShape,
  activeId: string | null,
  recommendedNames: Set<string>
): OtherCustomQuest[] {
  const seen = new Set<string>()
  const out: OtherCustomQuest[] = []
  for (const charId of data.characterOrder) {
    if (charId === activeId) continue
    const character = data.characters[charId]
    if (!character) continue
    for (const task of Object.values(character.tasks)) {
      if (task.catalogId) continue
      if (recommendedNames.has(task.displayName) || seen.has(task.displayName)) continue
      seen.add(task.displayName)
      out.push({
        id: `${charId}:${task.displayName}`,
        name: task.displayName,
        period: task.period,
        targetCount: task.targetCount ?? 1,
        category: task.category ?? null,
        location: task.location ?? null,
        owner: character.displayName
      })
    }
  }
  return out
}

function QuestRow({
  item,
  added,
  disabled,
  onAdd,
  owner
}: {
  item: QuestCatalogItem
  added: boolean
  disabled: boolean
  onAdd: () => void
  owner?: string
}): React.JSX.Element {
  return (
    <li className="task-item rec-item">
      <span className="task-name manage-task-name">
        {item.name}
        {(item.targetCount ?? 1) > 1 && <span className="target-badge">×{item.targetCount}</span>}
        {owner && <span className="rec-owner">{owner}</span>}
      </span>
      {item.location && <span className="loc-badge">{item.location}</span>}
      {item.category && (
        <span className={`cat-badge cat-${QUEST_CATEGORY_CLASS[item.category]}`}>
          {item.category}
        </span>
      )}
      <button className="settings-btn rec-add-btn" disabled={added || disabled} onClick={onAdd}>
        {added ? '추가됨' : '＋ 추가'}
      </button>
    </li>
  )
}

export default function RecommendedPanel(): React.JSX.Element {
  const data = useDashboardStore((s) => s.data)
  const activeId = useDashboardStore((s) => s.activeCharacterId)
  const addTask = useDashboardStore((s) => s.addTask)

  const recommended = data?.recommendedQuests ?? []
  const character = activeId && data ? data.characters[activeId] : null
  const existingNames = new Set(
    Object.values(character?.tasks ?? {}).map((t) => t.displayName)
  )
  const otherCustom = data
    ? collectOtherCustomQuests(data, activeId, new Set(recommended.map((r) => r.name)))
    : []

  const add = (item: QuestCatalogItem): void => {
    if (!activeId) return
    void addTask(
      activeId,
      item.name,
      item.period,
      item.targetCount ?? 1,
      item.category ?? null,
      item.location ?? null
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

      {recommended.length === 0 && (
        <p className="settings-hint">추천 목록이 비어 있거나 아직 동기화되지 않았습니다.</p>
      )}
      {(['daily', 'weekly'] as const).map((p) => {
        const items = recommended.filter((r) => r.period === p)
        if (items.length === 0) return null
        return (
          <section className="task-section" key={p}>
            <h3 className="section-title">{p === 'daily' ? '일일' : '주간'}</h3>
            <ul className="task-list">
              {items.map((item) => (
                <QuestRow
                  key={item.id}
                  item={item}
                  added={existingNames.has(item.name)}
                  disabled={!activeId}
                  onAdd={() => add(item)}
                />
              ))}
            </ul>
          </section>
        )
      })}

      {/* 다른 캐릭터의 커스텀 퀘스트 (#23) — 프리셋 복사 대체 */}
      <h2 className="dash-section-title rec-others-title">👥 다른 캐릭터의 커스텀 퀘스트</h2>
      {otherCustom.length === 0 ? (
        <p className="settings-hint">다른 캐릭터가 등록한 커스텀 퀘스트가 없습니다.</p>
      ) : (
        <ul className="task-list">
          {otherCustom.map((item) => (
            <QuestRow
              key={item.id}
              item={item}
              added={existingNames.has(item.name)}
              disabled={!activeId}
              onAdd={() => add(item)}
              owner={item.owner}
            />
          ))}
        </ul>
      )}
    </aside>
  )
}
