import { useEffect } from 'react'
import CharacterTabs from './components/CharacterTabs'
import SyncIdGate from './components/SyncIdGate'
import TaskChecklist from './components/TaskChecklist'
import { useAlarms } from './hooks/useAlarms'
import { useWebStore, webStore } from './store'

export default function App(): React.JSX.Element {
  const status = useWebStore((s) => s.status)
  const gameAccountId = useWebStore((s) => s.gameAccountId)
  const errorMessage = useWebStore((s) => s.errorMessage)
  const activeAlarms = useAlarms()

  useEffect(() => {
    void webStore.init()
  }, [])

  if (status === 'idle' || status === 'not-registered') {
    return <SyncIdGate notRegistered={status === 'not-registered'} />
  }
  if (status === 'error') {
    return <SyncIdGate errorMessage={errorMessage} />
  }
  if (status === 'loading') {
    return (
      <div className="gate">
        <p className="gate-loading">불러오는 중…</p>
      </div>
    )
  }

  return (
    <div className="overlay-root">
      <header className="titlebar">
        <span className="titlebar-title">📝 모여길드 도비</span>
        <button className="titlebar-btn" title="다른 ID로 변경" onClick={() => webStore.changeAccount()}>
          {gameAccountId}
        </button>
      </header>
      <CharacterTabs />
      <main className="content">
        <TaskChecklist activeAlarms={activeAlarms} />
      </main>
    </div>
  )
}
