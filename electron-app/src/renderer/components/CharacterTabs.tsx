import { useDashboardStore } from '../store/useDashboardStore'

/**
 * 캐릭터 탭 — 전환 전용 (#23).
 * 추가/이름변경/순서/삭제는 관리 창의 '캐릭터' 뷰에서 (CharactersView).
 */
export default function CharacterTabs(): React.JSX.Element {
  const data = useDashboardStore((s) => s.data)
  const activeId = useDashboardStore((s) => s.activeCharacterId)
  const setActive = useDashboardStore((s) => s.setActiveCharacter)

  if (!data) return <></>

  return (
    <div className="character-tabs">
      {data.characterOrder.map((id) => {
        const character = data.characters[id]
        if (!character) return null
        return (
          <button
            key={id}
            className={`tab ${id === activeId ? 'tab-active' : ''}`}
            onClick={() => setActive(id)}
          >
            {character.displayName}
          </button>
        )
      })}
    </div>
  )
}
