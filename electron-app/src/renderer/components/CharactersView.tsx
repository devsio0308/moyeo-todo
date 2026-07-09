import { useState } from 'react'
import { useDashboardStore } from '../store/useDashboardStore'

/**
 * 캐릭터 관리 뷰 (#23) — 추가/이름변경/순서/삭제는 여기서만.
 * 새 캐릭터는 카탈로그 퀘스트로 채워진다 (#4).
 */
export default function CharactersView(): React.JSX.Element {
  const data = useDashboardStore((s) => s.data)
  const addCharacter = useDashboardStore((s) => s.addCharacter)
  const removeCharacter = useDashboardStore((s) => s.removeCharacter)
  const renameCharacter = useDashboardStore((s) => s.renameCharacter)
  const reorderCharacters = useDashboardStore((s) => s.reorderCharacters)

  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  if (!data) return <></>
  const order = data.characterOrder

  const submitAdd = (): void => {
    const name = newName.trim()
    if (!name) return
    void addCharacter(name)
    setNewName('')
  }

  const submitRename = (): void => {
    const name = editName.trim()
    if (editingId && name) void renameCharacter(editingId, name)
    setEditingId(null)
  }

  const move = (id: string, dir: -1 | 1): void => {
    const idx = order.indexOf(id)
    const target = idx + dir
    if (target < 0 || target >= order.length) return
    const next = [...order]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    void reorderCharacters(next)
  }

  return (
    <div className="chars-view">
      <div className="add-quest-card">
        <div className="form-field">
          <label>새 캐릭터 이름</label>
          <div className="form-inline">
            <input
              className="add-task-input"
              placeholder="예: 쥐시오"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitAdd()
              }}
            />
            <button className="add-task-btn" disabled={!newName.trim()} onClick={submitAdd}>
              추가
            </button>
          </div>
          <p className="settings-hint">추가하면 카탈로그 퀘스트가 자동으로 채워집니다.</p>
        </div>
      </div>

      {order.length === 0 && <p className="placeholder">첫 캐릭터를 추가해 보세요.</p>}

      <ul className="char-list">
        {order.map((id, idx) => {
          const character = data.characters[id]
          if (!character) return null
          const questCount = Object.keys(character.tasks).length

          return (
            <li className="char-row" key={id}>
              <div className="char-order-btns">
                <button
                  className="count-btn"
                  disabled={idx === 0}
                  title="위로"
                  onClick={() => move(id, -1)}
                >
                  ↑
                </button>
                <button
                  className="count-btn"
                  disabled={idx === order.length - 1}
                  title="아래로"
                  onClick={() => move(id, 1)}
                >
                  ↓
                </button>
              </div>

              {editingId === id ? (
                <input
                  className="add-task-input char-name-input"
                  value={editName}
                  autoFocus
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={submitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitRename()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                />
              ) : (
                <span className="char-name">{character.displayName}</span>
              )}
              <span className="char-meta">퀘스트 {questCount}개</span>

              <button
                className="settings-btn"
                onClick={() => {
                  setEditingId(id)
                  setEditName(character.displayName)
                }}
              >
                ✏️ 이름
              </button>
              <button
                className={`manage-delete ${confirmDeleteId === id ? 'manage-delete-confirm' : ''}`}
                title={confirmDeleteId === id ? '한 번 더 클릭하면 삭제' : '캐릭터 삭제'}
                onBlur={() => setConfirmDeleteId(null)}
                onClick={() => {
                  if (confirmDeleteId === id) {
                    void removeCharacter(id)
                    setConfirmDeleteId(null)
                  } else {
                    setConfirmDeleteId(id)
                  }
                }}
              >
                {confirmDeleteId === id ? '삭제?' : '🗑'}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
