import { useState } from 'react'
import { useDashboardStore } from '../store/useDashboardStore'

/**
 * 캐릭터 탭 바.
 * - 추가: + 버튼 → 인라인 입력
 * - 이름 변경: 활성 탭 더블클릭 → 인라인 입력
 * - 삭제: + 뒤의 🗑 버튼 — 활성 캐릭터를 2단계 확인 후 삭제 (#6)
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
  /** 새 캐릭터의 퀘스트 프리셋 소스 (#12). '' = 카탈로그 기본 */
  const [presetSource, setPresetSource] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)

  if (!data) return <></>
  const order = data.characterOrder
  const activeCharacter = activeId ? data.characters[activeId] : null

  const submitAdd = (): void => {
    const name = newName.trim()
    if (name) void addCharacter(name, presetSource || null)
    setNewName('')
    setPresetSource('')
    setAdding(false)
  }

  const cancelAdd = (): void => {
    setNewName('')
    setPresetSource('')
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
              setConfirmDelete(false)
            }}
            onDoubleClick={() => {
              setEditingId(id)
              setEditName(character.displayName)
            }}
            title="더블클릭: 이름 변경 / 드래그: 순서 변경"
          >
            {character.displayName}
          </button>
        )
      })}

      {adding ? (
        <span className="tab-add-form">
          <input
            className="tab-edit-input"
            placeholder="캐릭터 이름"
            value={newName}
            autoFocus
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitAdd()
              if (e.key === 'Escape') cancelAdd()
            }}
          />
          <select
            className="tab-preset-select"
            title="퀘스트 구성 가져오기 — 선택한 캐릭터의 커스텀 퀘스트까지 복사"
            value={presetSource}
            onChange={(e) => setPresetSource(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancelAdd()
            }}
          >
            <option value="">카탈로그 기본</option>
            {order.map((id) => (
              <option key={id} value={id}>
                {data.characters[id]?.displayName} 복사
              </option>
            ))}
          </select>
          <button
            className="tab tab-add"
            disabled={!newName.trim()}
            onClick={submitAdd}
            title="캐릭터 추가"
          >
            추가
          </button>
          <button className="tab" onClick={cancelAdd} title="취소">
            ×
          </button>
        </span>
      ) : (
        <button className="tab tab-add" title="캐릭터 추가" onClick={() => setAdding(true)}>
          +
        </button>
      )}

      {activeCharacter && (
        <button
          className={`tab tab-trash ${confirmDelete ? 'tab-trash-confirm' : ''}`}
          title={
            confirmDelete
              ? `한 번 더 클릭하면 '${activeCharacter.displayName}' 삭제`
              : `현재 캐릭터(${activeCharacter.displayName}) 삭제`
          }
          onClick={() => {
            if (confirmDelete && activeId) {
              void removeCharacter(activeId)
              setConfirmDelete(false)
            } else {
              setConfirmDelete(true)
            }
          }}
          onBlur={() => setConfirmDelete(false)}
        >
          {confirmDelete ? '삭제?' : '🗑'}
        </button>
      )}
    </div>
  )
}
