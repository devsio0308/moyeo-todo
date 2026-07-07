import { useState } from 'react'
import { useDashboardStore } from '../store/useDashboardStore'

/**
 * 캐릭터 탭 바.
 * - 추가: + 버튼 → 인라인 입력
 * - 이름 변경: 활성 탭 더블클릭 → 인라인 입력
 * - 삭제: 활성 탭의 × (한 번 더 클릭으로 확정)
 * - 순서 변경: HTML5 drag & drop
 */
export default function CharacterTabs(): React.JSX.Element {
  const data = useDashboardStore((s) => s.data)
  const activeId = useDashboardStore((s) => s.activeCharacterId)
  const setActive = useDashboardStore((s) => s.setActiveCharacter)
  const addCharacter = useDashboardStore((s) => s.addCharacter)
  const removeCharacter = useDashboardStore((s) => s.removeCharacter)
  const renameCharacter = useDashboardStore((s) => s.renameCharacter)
  const reorderCharacters = useDashboardStore((s) => s.reorderCharacters)

  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  if (!data) return <></>
  const order = data.characterOrder

  const submitAdd = (): void => {
    const name = newName.trim()
    if (name) void addCharacter(name)
    setNewName('')
    setAdding(false)
  }

  const submitRename = (): void => {
    const name = editName.trim()
    if (editingId && name) void renameCharacter(editingId, name)
    setEditingId(null)
  }

  const handleDrop = (targetId: string): void => {
    if (!dragId || dragId === targetId) return
    const next = order.filter((id) => id !== dragId)
    next.splice(next.indexOf(targetId) + (order.indexOf(dragId) < order.indexOf(targetId) ? 1 : 0), 0, dragId)
    void reorderCharacters(next)
    setDragId(null)
  }

  return (
    <div className="character-tabs">
      {order.map((id) => {
        const character = data.characters[id]
        if (!character) return null
        const isActive = id === activeId

        if (editingId === id) {
          return (
            <input
              key={id}
              className="tab-edit-input"
              value={editName}
              autoFocus
              onChange={(e) => setEditName(e.target.value)}
              onBlur={submitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitRename()
                if (e.key === 'Escape') setEditingId(null)
              }}
            />
          )
        }

        return (
          <button
            key={id}
            className={`tab ${isActive ? 'tab-active' : ''} ${dragId === id ? 'tab-dragging' : ''}`}
            draggable
            onDragStart={() => setDragId(id)}
            onDragEnd={() => setDragId(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(id)}
            onClick={() => {
              setActive(id)
              setConfirmDeleteId(null)
            }}
            onDoubleClick={() => {
              setEditingId(id)
              setEditName(character.displayName)
            }}
            title="더블클릭: 이름 변경 / 드래그: 순서 변경"
          >
            {character.displayName}
            {isActive && (
              <span
                className={`tab-delete ${confirmDeleteId === id ? 'tab-delete-confirm' : ''}`}
                title={confirmDeleteId === id ? '한 번 더 클릭하면 삭제됩니다' : '캐릭터 삭제'}
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirmDeleteId === id) {
                    void removeCharacter(id)
                    setConfirmDeleteId(null)
                  } else {
                    setConfirmDeleteId(id)
                  }
                }}
              >
                ×
              </span>
            )}
          </button>
        )
      })}

      {adding ? (
        <input
          className="tab-edit-input"
          placeholder="캐릭터 이름"
          value={newName}
          autoFocus
          onChange={(e) => setNewName(e.target.value)}
          onBlur={submitAdd}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitAdd()
            if (e.key === 'Escape') setAdding(false)
          }}
        />
      ) : (
        <button className="tab tab-add" title="캐릭터 추가" onClick={() => setAdding(true)}>
          +
        </button>
      )}
    </div>
  )
}
