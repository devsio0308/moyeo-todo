import { useEffect, useRef, useState } from 'react'
import CharacterTabs from './components/CharacterTabs'
import InstallGuide from './components/InstallGuide'
import SyncIdGate from './components/SyncIdGate'
import TaskChecklist from './components/TaskChecklist'
import { useAlarms } from './hooks/useAlarms'
import { useWebStore, webStore } from './store'

/** 홈 화면 아이콘으로 실행됐는지 (PWA standalone). iOS Safari는 navigator.standalone 사용 */
const IS_STANDALONE =
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

const BROWSER_MODE_KEY = 'dobi-browser-mode'

export default function App(): React.JSX.Element {
  const status = useWebStore((s) => s.status)
  const gameAccountId = useWebStore((s) => s.gameAccountId)
  const errorMessage = useWebStore((s) => s.errorMessage)
  const canUndo = useWebStore((s) => s.canUndo)
  const canRedo = useWebStore((s) => s.canRedo)
  const activeAlarms = useAlarms()
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [refreshCooldown, setRefreshCooldown] = useState(false)
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [browserModeAccepted, setBrowserModeAccepted] = useState(
    () => sessionStorage.getItem(BROWSER_MODE_KEY) === '1'
  )

  // 브라우저 탭으로 열면 홈 화면 추가 가이드부터 — '계속하기'는 세션 동안만 기억
  const showInstallGuide = !IS_STANDALONE && !browserModeAccepted

  /** 연타 방지 (#30) — 성공/실패 무관하게 1분간 재요청 제한 */
  const armCooldown = (): void => {
    setRefreshCooldown(true)
    if (cooldownTimer.current) clearTimeout(cooldownTimer.current)
    cooldownTimer.current = setTimeout(() => setRefreshCooldown(false), 60_000)
  }

  useEffect(() => {
    // 가이드가 떠 있는 동안은 데이터를 불러오지 않는다 (불필요한 요청 방지)
    if (showInstallGuide) return
    // 최초 진입 시 자동 로드도 요청 1회이므로, 열자마자 연타하지 못하게 쿨다운을 같이 건다
    void webStore.init().then(armCooldown)
  }, [showInstallGuide])

  // 실행취소/다시실행 단축키 (#undo) — 데스크톱 브라우저용, 모바일은 titlebar 버튼으로
  useEffect(() => {
    if (showInstallGuide) return
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault()
        void webStore.undo()
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault()
        void webStore.redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showInstallGuide])

  if (showInstallGuide) {
    return (
      <InstallGuide
        onContinueInBrowser={() => {
          sessionStorage.setItem(BROWSER_MODE_KEY, '1')
          setBrowserModeAccepted(true)
        }}
      />
    )
  }

  /** 수동 새로고침 (#29) — 자동 폴링 없음, 눌렀을 때만 클라우드 조회 */
  const handleRefresh = async (): Promise<void> => {
    if (refreshing || refreshCooldown) return
    setRefreshing(true)
    setRefreshError(null)
    try {
      const result = await webStore.refresh()
      if (!result.ok) {
        setRefreshError(result.message ?? '새로고침 실패')
        setTimeout(() => setRefreshError(null), 4000)
      }
    } finally {
      setRefreshing(false)
      armCooldown()
    }
  }

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
        <span className="titlebar-title">📝 뭐해야하더라</span>
        <button
          className="titlebar-icon-btn"
          title="실행취소 (Ctrl+Z)"
          onClick={() => void webStore.undo()}
          disabled={!canUndo}
        >
          ↩
        </button>
        <button
          className="titlebar-icon-btn"
          title="다시 실행 (Ctrl+Shift+Z)"
          onClick={() => void webStore.redo()}
          disabled={!canRedo}
        >
          ↪
        </button>
        <button
          className="titlebar-icon-btn"
          title={
            refreshError ??
            (refreshCooldown ? '1분에 한 번만 새로고침할 수 있어요' : '최신 데이터 새로고침')
          }
          onClick={() => void handleRefresh()}
          disabled={refreshing || refreshCooldown}
        >
          {refreshing ? '⏳' : refreshError ? '⚠' : '🔄'}
        </button>
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
