import { useEffect, useState } from 'react'
import type { EngineStatus } from '../shared/types'
import CharacterTabs from './components/CharacterTabs'
import SettingsPanel from './components/SettingsPanel'
import TaskChecklist from './components/TaskChecklist'
import { useDashboardStore } from './store/useDashboardStore'

const ENGINE_STATUS_LABEL: Record<EngineStatus, string> = {
  connected: '자동 감지 동작 중',
  disconnected: '엔진 연결 대기 중…',
  failed: '엔진 시작 실패 — 재시작 중단됨'
}

export default function App(): React.JSX.Element {
  const capturePaused = useDashboardStore((s) => s.capturePaused)
  const setCapturePaused = useDashboardStore((s) => s.setCapturePaused)
  const init = useDashboardStore((s) => s.init)
  const applyState = useDashboardStore((s) => s.applyState)
  const activeCharacterId = useDashboardStore((s) => s.activeCharacterId)
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('disconnected')
  const [showSettings, setShowSettings] = useState(false)

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

  return (
    <div className="overlay-root">
      <header className="titlebar">
        <span className="titlebar-title">📝 모여길드 도비</span>
        <span
          className={`engine-dot engine-${engineStatus}`}
          title={ENGINE_STATUS_LABEL[engineStatus]}
        />
        {engineStatus === 'failed' && <span className="badge badge-failed">엔진 오류</span>}
        {capturePaused && <span className="badge badge-paused">캡처 정지됨</span>}
        <div className="titlebar-buttons">
          <button
            className={`titlebar-btn ${showSettings ? 'titlebar-btn-active' : ''}`}
            title="설정"
            onClick={() => setShowSettings((v) => !v)}
          >
            ⚙
          </button>
          <button
            className="titlebar-btn"
            title="숨기기 (트레이로)"
            onClick={() => window.api.window.hide()}
          >
            —
          </button>
          <button className="titlebar-btn" title="종료" onClick={() => window.api.window.quit()}>
            ✕
          </button>
        </div>
      </header>
      <CharacterTabs />
      <main className="content">{showSettings ? <SettingsPanel /> : <TaskChecklist />}</main>
    </div>
  )
}
