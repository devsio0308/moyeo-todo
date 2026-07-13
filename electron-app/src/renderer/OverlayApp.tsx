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

  useEffect(() => {
    void init()
    const offChanged = window.api.store.onChanged(applyState)
    return () => {
      offChanged()
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
        <span className="titlebar-title">📝 모여길드 도비</span>
        <div className="titlebar-buttons">
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
            title="오버레이 숨기기"
            onClick={() => window.api.window.hideOverlay()}
          >
            —
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
