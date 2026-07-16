import { useEffect, useRef, useState } from 'react'
import CharacterTabs from './components/CharacterTabs'
import TaskChecklist from './components/TaskChecklist'
import { useAlarms } from './hooks/useAlarms'
import { useDashboardStore } from './store/useDashboardStore'

/**
 * 게임 위에 떠 있는 체크 전용 오버레이 (#17).
 * 캐릭터 탭 전환 + 체크/카운터 + 알람만. 관리(추가/수정/설정)는 관리 창에서.
 */
export default function OverlayApp(): React.JSX.Element {
  const init = useDashboardStore((s) => s.init)
  const applyState = useDashboardStore((s) => s.applyState)
  const activeAlarms = useAlarms() // 알람은 오버레이가 담당 (#11, #17)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncCooldown, setSyncCooldown] = useState(false)
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [history, setHistory] = useState({ canUndo: false, canRedo: false })

  useEffect(() => {
    void init()
    void window.api.history.getState().then(setHistory)
    const offChanged = window.api.store.onChanged(applyState)
    const offHistory = window.api.history.onChanged(setHistory)

    // 실행취소 단축키 폴백 (#undo) — 기본 경로는 main의 before-input-event이며,
    // 그쪽에서 preventDefault되면 여기까지 오지 않으므로 이중 실행 없음
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        void window.api.history.undo()
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault()
        void window.api.history.redo()
      }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      offChanged()
      offHistory()
      window.removeEventListener('keydown', onKey)
    }
  }, [init, applyState])

  /** 수동 동기화 (#28) — 클릭했을 때만 클라우드에서 가져옴. 자동 폴링 없음(트래픽 절약) */
  const handleSync = async (): Promise<void> => {
    if (syncing || syncCooldown) return
    setSyncing(true)
    setSyncError(null)
    try {
      const result = await window.api.cloud.pull()
      if (!result.ok) {
        setSyncError(result.message)
        setTimeout(() => setSyncError(null), 4000)
      }
    } finally {
      setSyncing(false)
      // 연타로 인한 과도한 요청 방지 (#30) — 성공/실패 무관하게 1분간 재요청 제한
      setSyncCooldown(true)
      if (cooldownTimer.current) clearTimeout(cooldownTimer.current)
      cooldownTimer.current = setTimeout(() => setSyncCooldown(false), 60_000)
    }
  }

  return (
    <div className="overlay-root">
      <header className="titlebar">
        <span className="titlebar-title">📝 뭐해야하더라</span>
        <div className="titlebar-buttons">
          <button
            className="titlebar-btn"
            title="실행취소 (Ctrl+Z)"
            onClick={() => void window.api.history.undo()}
            disabled={!history.canUndo}
          >
            ↩
          </button>
          <button
            className="titlebar-btn"
            title="다시 실행 (Ctrl+Shift+Z)"
            onClick={() => void window.api.history.redo()}
            disabled={!history.canRedo}
          >
            ↪
          </button>
          <button
            className="titlebar-btn"
            title={
              syncError ??
              (syncCooldown
                ? '1분에 한 번만 동기화할 수 있어요'
                : '클라우드에서 최신 데이터 가져오기 (클릭 시에만 동기화)')
            }
            onClick={() => void handleSync()}
            disabled={syncing || syncCooldown}
          >
            {syncing ? '⏳' : syncError ? '⚠' : '🔄'}
          </button>
          <button
            className="titlebar-btn"
            title="닫기"
            onClick={() => window.api.window.closeOverlay()}
          >
            ✕
          </button>
        </div>
      </header>
      <CharacterTabs />
      <main className="content">
        <TaskChecklist activeAlarms={activeAlarms} />
      </main>
    </div>
  )
}
