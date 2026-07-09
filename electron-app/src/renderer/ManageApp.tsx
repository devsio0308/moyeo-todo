import { useEffect, useState } from 'react'
import { AUTO_DETECT_ENABLED, type EngineStatus } from '../shared/types'
import CharactersView from './components/CharactersView'
import CharacterTabs from './components/CharacterTabs'
import DashboardView from './components/DashboardView'
import QuestManager from './components/QuestManager'
import RecommendedPanel from './components/RecommendedPanel'
import SettingsPanel from './components/SettingsPanel'
import { useDashboardStore } from './store/useDashboardStore'

type View = 'dashboard' | 'quests' | 'characters' | 'settings'

const VIEW_TITLE: Record<View, string> = {
  dashboard: '대시보드',
  quests: '퀘스트 관리',
  characters: '캐릭터',
  settings: '설정'
}

/**
 * 관리 창 (#17, #22) — 어드민 대시보드 레이아웃.
 * 사이드바 내비 + 대시보드(주간 현황) / 퀘스트 관리(+추천 패널) / 설정.
 */
export default function ManageApp(): React.JSX.Element {
  const init = useDashboardStore((s) => s.init)
  const applyState = useDashboardStore((s) => s.applyState)
  const setCapturePaused = useDashboardStore((s) => s.setCapturePaused)
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('disconnected')
  const [view, setView] = useState<View>('dashboard')

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

  const navItem = (v: View, icon: string): React.JSX.Element => (
    <button
      className={`side-nav-item ${view === v ? 'side-nav-active' : ''}`}
      onClick={() => setView(v)}
    >
      <span className="side-nav-icon">{icon}</span>
      {VIEW_TITLE[v]}
    </button>
  )

  return (
    <div className="admin-root">
      <aside className="side-nav">
        <div className="side-brand">
          <span className="side-brand-icon">🧦</span>
          <span className="side-brand-name">모여길드 도비</span>
        </div>
        <nav className="side-nav-list">
          {navItem('dashboard', '🏠')}
          {navItem('quests', '📋')}
          {navItem('characters', '👥')}
          {navItem('settings', '⚙')}
        </nav>
        <div className="side-footer">
          {AUTO_DETECT_ENABLED && engineStatus === 'failed' && (
            <span className="badge badge-failed">엔진 오류</span>
          )}
          <button
            className="overlay-launch-btn side-launch"
            title="게임 위에 체크리스트 오버레이 띄우기"
            onClick={() => window.api.window.showOverlay()}
          >
            🚀 오버레이 띄우기
          </button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-header">
          <h1 className="admin-title">{VIEW_TITLE[view]}</h1>
          {view === 'quests' && <CharacterTabs />}
        </header>
        <main className="admin-content">
          {view === 'dashboard' ? (
            <DashboardView />
          ) : view === 'quests' ? (
            <div className="quest-cols">
              <div className="quest-main">
                <QuestManager />
              </div>
              <RecommendedPanel />
            </div>
          ) : view === 'characters' ? (
            <div className="settings-narrow">
              <CharactersView />
            </div>
          ) : (
            <div className="settings-narrow">
              <SettingsPanel />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
