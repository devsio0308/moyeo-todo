import { useEffect } from 'react'
import CharacterTabs from './components/CharacterTabs'
import TaskChecklist from './components/TaskChecklist'
import { useDashboardStore } from './store/useDashboardStore'

export default function App(): React.JSX.Element {
  const capturePaused = useDashboardStore((s) => s.capturePaused)
  const setCapturePaused = useDashboardStore((s) => s.setCapturePaused)
  const init = useDashboardStore((s) => s.init)
  const applyState = useDashboardStore((s) => s.applyState)

  useEffect(() => {
    void init()
    const offPaused = window.api.capture.onPausedChanged(setCapturePaused)
    const offChanged = window.api.store.onChanged(applyState)
    return () => {
      offPaused()
      offChanged()
    }
  }, [init, applyState, setCapturePaused])

  return (
    <div className="overlay-root">
      <header className="titlebar">
        <span className="titlebar-title">📝 숙제 대시보드</span>
        {capturePaused && <span className="badge badge-paused">캡처 정지됨</span>}
        <div className="titlebar-buttons">
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
      <main className="content">
        <TaskChecklist />
      </main>
    </div>
  )
}
