import { useEffect, useState } from 'react'

export default function App(): React.JSX.Element {
  const [capturePaused, setCapturePaused] = useState(false)

  useEffect(() => {
    return window.api.capture.onPausedChanged(setCapturePaused)
  }, [])

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
      <main className="content">
        <p className="placeholder">캐릭터/숙제 목록이 여기에 표시됩니다.</p>
      </main>
    </div>
  )
}
