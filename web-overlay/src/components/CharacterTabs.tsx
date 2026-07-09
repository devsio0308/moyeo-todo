import { useWebStore, webStore } from '../store'

/** 캐릭터 탭 — 전환 전용, 추가/삭제 없음 (#27) */
export default function CharacterTabs(): React.JSX.Element {
  const data = useWebStore((s) => s.data)
  const activeId = useWebStore((s) => s.activeCharacterId)

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
            onClick={() => webStore.setActiveCharacter(id)}
          >
            {character.displayName}
          </button>
        )
      })}
    </div>
  )
}
