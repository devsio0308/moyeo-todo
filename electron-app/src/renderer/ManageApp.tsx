import { useEffect, useState } from 'react'
import { AUTO_DETECT_ENABLED, type EngineStatus } from '../shared/types'
import CharacterTabs from './components/CharacterTabs'
import QuestManager from './components/QuestManager'
import SettingsPanel from './components/SettingsPanel'
import { useDashboardStore } from './store/useDashboardStore'

type View = 'manage' | 'settings'

/**
 * 관리 창 (#17) — 시작 시 표시되는 메인 창 (일반 프레임).
 * 캐릭터 관리(추가/삭제/이름/순서), 퀘스트 관리, 설정, 오버레이 띄우기.
 */
export default function ManageApp(): React.JSX.Element {
  const init = useDashboardStore((s) => s.init)
  const applyState = useDashboardStore((s) => s.applyState)
  const setCapturePaused = useDashboardStore((s) => s.setCapturePaused)
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('disconnected')
  const [view, setView] = useState<View>('manage')

  useEffect(() => {
    void init()
    const offChanged = window.api.store.onChanged(applyState)
    const offPaused = window.api.capture.onPausedChanged(setCapturePaused)
    const offStatus = window.api.engine.onStatus(setEngineStatus)
    return () => {
      offChanged()
      offPaused()
      offStatus()
    }
  }, [init, applyState, setCapturePaused])

  return (
    <div className="manage-root">
      <header className="manage-header">
        <div className="manage-nav">
          <button
            className={`manage-tab ${view === 'manage' ? 'manage-tab-active' : ''}`}
            onClick={() => setView('manage')}
          >
            📋 퀘스트 관리
          </button>
          <button
            className={`manage-tab ${view === 'settings' ? 'manage-tab-active' : ''}`}
            onClick={() => setView('settings')}
          >
            ⚙ 설정
          </button>
        </div>
        {AUTO_DETECT_ENABLED && engineStatus === 'failed' && (
          <span className="badge badge-failed">엔진 오류</span>
        )}
        <button
          className="overlay-launch-btn"
          title="게임 위에 체크리스트 오버레이 띄우기"
          onClick={() => window.api.window.showOverlay()}
        >
          🚀 오버레이 띄우기
        </button>
      </header>
      <CharacterTabs />
      <main className="content manage-content">
        {view === 'settings' ? <SettingsPanel /> : <QuestManager />}
      </main>
    </div>
  )
}
