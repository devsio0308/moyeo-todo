import { useEffect, useState } from 'react'
import { AUTO_DETECT_ENABLED, type EngineStatus } from '../shared/types'
import CharacterTabs from './components/CharacterTabs'
import TaskChecklist from './components/TaskChecklist'
import { useAlarms } from './hooks/useAlarms'
import { useDashboardStore } from './store/useDashboardStore'

const ENGINE_STATUS_LABEL: Record<EngineStatus, string> = {
  connected: '자동 감지 동작 중',
  disconnected: '엔진 연결 대기 중…',
  failed: '엔진 시작 실패 — 재시작 중단됨'
}

/**
 * 게임 위에 떠 있는 체크 전용 오버레이 (#17).
 * 캐릭터 탭 전환 + 체크/카운터 + 알람만. 관리(추가/수정/설정)는 관리 창에서.
 */
export default function OverlayApp(): React.JSX.Element {
  const capturePaused = useDashboardStore((s) => s.capturePaused)
  const setCapturePaused = useDashboardStore((s) => s.setCapturePaused)
  const init = useDashboardStore((s) => s.init)
  const applyState = useDashboardStore((s) => s.applyState)
  const activeCharacterId = useDashboardStore((s) => s.activeCharacterId)
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('disconnected')
  const activeAlarms = useAlarms() // 알람은 오버레이가 담당 (#11, #17)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)

  useEffect(() => {
    void init()
    const offPaused = window.api.capture.onPausedChanged(setCapturePaused)
    const offChanged = window.api.store.onChanged(applyState)
    const offStatus = window.api.engine.onStatus(setEngineStatus)
    return () => {
      offPaused()
      offChanged()
      offStatus()
    }
  }, [init, applyState, setCapturePaused])

  // 활성 캐릭터가 바뀌면 엔진에 알림 (매칭 대상 좁히기)
  useEffect(() => {
    window.api.engine.setActiveCharacter(activeCharacterId)
  }, [activeCharacterId])

  /** 수동 동기화 (#28) — 클릭했을 때만 클라우드에서 가져옴. 자동 폴링 없음(트래픽 절약) */
  const handleSync = async (): Promise<void> => {
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
    }
  }

  return (
    <div className="overlay-root">
      <header className="titlebar">
        <span className="titlebar-title">📝 모여길드 도비</span>
        {AUTO_DETECT_ENABLED && (
          <>
            <span
              className={`engine-dot engine-${engineStatus}`}
              title={ENGINE_STATUS_LABEL[engineStatus]}
            />
            {engineStatus === 'failed' && <span className="badge badge-failed">엔진 오류</span>}
            {capturePaused && <span className="badge badge-paused">캡처 정지됨</span>}
          </>
        )}
        <div className="titlebar-buttons">
          <button
            className="titlebar-btn"
            title={syncError ?? '클라우드에서 최신 데이터 가져오기 (클릭 시에만 동기화)'}
            onClick={() => void handleSync()}
            disabled={syncing}
          >
            {syncing ? '⏳' : syncError ? '⚠' : '🔄'}
          </button>
          <button
            className="titlebar-btn"
            title="관리 창 열기"
            onClick={() => window.api.window.openManage()}
          >
            ⚙
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
