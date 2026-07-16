import { useEffect, useState } from 'react'
import CharactersView from './components/CharactersView'
import CharacterTabs from './components/CharacterTabs'
import DashboardView from './components/DashboardView'
import QuestManager from './components/QuestManager'
import RecommendedPanel from './components/RecommendedPanel'
import SettingsPanel from './components/SettingsPanel'
import { useDashboardStore } from './store/useDashboardStore'
import type { CatalogNotice, UpdateDownloadedNotice } from '../shared/types'

type View = 'dashboard' | 'quests' | 'characters' | 'settings'

/** 관리 창 우측 하단 말풍선 알림 — 카탈로그 변경(#catalog-watch) / 업데이트 준비(#auto-update-notice) 공용 */
type AppNotice =
  | ({ kind: 'catalog'; id: string } & CatalogNotice)
  | ({ kind: 'update'; id: string } & UpdateDownloadedNotice)

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
  const [view, setView] = useState<View>('dashboard')
  // 우측 하단 말풍선 알림 — X로 닫거나 앱을 종료하기 전까지 유지.
  // 확인 안 한 알림이 남아있는 상태에서 새 알림이 오면 쌓아서 각각 따로 닫을 수 있게 한다
  // (세션 메모리 상태만 — 재시작하면 초기화됨)
  const [notices, setNotices] = useState<AppNotice[]>([])

  useEffect(() => {
    void init()
    const offChanged = window.api.store.onChanged(applyState)
    const offCatalog = window.api.catalog.onNotice((notice: CatalogNotice) => {
      setNotices((prev) => [...prev, { ...notice, kind: 'catalog', id: `${Date.now()}-${Math.random()}` }])
    })
    // 설치 안 하고 종료했다가 재시작해도 계속 안내를 띄운다 (#auto-update-notice)
    const addUpdateNotice = (notice: UpdateDownloadedNotice): void => {
      const id = `update-${notice.version}`
      setNotices((prev) => (prev.some((n) => n.id === id) ? prev : [...prev, { ...notice, kind: 'update', id }]))
    }
    void window.api.update.getPending().then((pending) => {
      if (pending) addUpdateNotice(pending)
    })
    const offUpdate = window.api.update.onDownloaded(addUpdateNotice)
    return () => {
      offChanged()
      offCatalog()
      offUpdate()
    }
  }, [init, applyState])

  const dismissNotice = (id: string): void => {
    setNotices((prev) => prev.filter((n) => n.id !== id))
  }

  const navItem = (v: View): React.JSX.Element => (
    <button
      className={`side-nav-item ${view === v ? 'side-nav-active' : ''}`}
      onClick={() => setView(v)}
    >
      {VIEW_TITLE[v]}
    </button>
  )

  return (
    <div className="admin-root">
      <aside className="side-nav">
        <div className="side-brand">
          <span className="side-brand-icon">📝</span>
          <span className="side-brand-name">뭐해야하더라</span>
        </div>
        <nav className="side-nav-list">
          {navItem('dashboard')}
          {navItem('characters')}
          {navItem('quests')}
          {navItem('settings')}
        </nav>
        <div className="side-footer">
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
              <CharactersView onGoToSettings={() => setView('settings')} />
            </div>
          ) : (
            <div className="settings-narrow">
              <SettingsPanel />
            </div>
          )}
        </main>
      </div>

      {notices.length > 0 && (
        <div className="app-notice-stack">
          {notices.map((notice) => (
            <div className="app-notice-bubble" key={notice.id}>
              <button
                className="app-notice-close"
                title="닫기"
                onClick={() => dismissNotice(notice.id)}
              >
                ✕
              </button>
              {notice.kind === 'catalog' ? (
                <>
                  <strong className="app-notice-title">카탈로그 업데이트</strong>
                  {notice.addedNames.length > 0 && (
                    <p className="app-notice-line">
                      새 퀘스트가 추가되었습니다: {notice.addedNames.join(', ')}
                    </p>
                  )}
                  {notice.removedNames.length > 0 && (
                    <p className="app-notice-line">
                      퀘스트가 삭제되었습니다: {notice.removedNames.join(', ')}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <strong className="app-notice-title">새 버전 준비됨 (v{notice.version})</strong>
                  <p className="app-notice-line">
                    버튼을 누르면 지금 설치하고 자동으로 재시작합니다. 누르지 않으면 종료해도
                    설치되지 않고, 다음에 켤 때 이 안내가 다시 뜹니다.
                  </p>
                  <button
                    className="app-notice-action"
                    onClick={() => void window.api.update.install()}
                  >
                    지금 업데이트
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
