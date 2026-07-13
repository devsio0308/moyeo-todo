import { useState } from 'react'
import { ALARM_RULES, DEFAULT_ALARM_MODE, type AlarmMode } from '../../shared/alarms'
import { useDashboardStore } from '../store/useDashboardStore'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/**
 * 설정 패널:
 * - 일일/주간 리셋 시각
 * - 알람 규칙별 모드
 * - 퀘스트 카탈로그 동기화 / 동기화 ID 연동
 */
export default function SettingsPanel(): React.JSX.Element {
  const data = useDashboardStore((s) => s.data)
  const updateSettings = useDashboardStore((s) => s.updateSettings)

  const [busy, setBusy] = useState(false)
  const [projectIdDraft, setProjectIdDraft] = useState<string | null>(null)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [accountIdDraft, setAccountIdDraft] = useState<string | null>(null)
  const [cloudMessage, setCloudMessage] = useState<string | null>(null)

  if (!data) return <></>
  const { settings } = data
  const projectId = projectIdDraft ?? settings.firebaseProjectId ?? ''

  const saveProjectId = (): void => {
    const value = projectId.trim() || null
    if (value !== settings.firebaseProjectId) {
      void updateSettings({ firebaseProjectId: value })
    }
    setProjectIdDraft(null)
  }

  const runCatalogSync = async (): Promise<void> => {
    setBusy(true)
    setSyncMessage('동기화 중…')
    try {
      const result = await window.api.catalog.sync()
      setSyncMessage(`${result.ok ? '✅' : '⚠'} ${result.message}`)
    } finally {
      setBusy(false)
    }
  }

  const runCloudRegister = async (accountId: string): Promise<void> => {
    setBusy(true)
    setCloudMessage('연동 중…')
    try {
      const result = await window.api.cloud.register(accountId)
      setCloudMessage(`${result.ok ? '✅' : '⚠'} ${result.message}`)
    } finally {
      setBusy(false)
      setAccountIdDraft(null)
    }
  }

  return (
    <div className="settings">
      <section className="settings-section">
        <h3 className="section-title">리셋</h3>

        <div className="settings-row">
          <span className="settings-label">일일 리셋</span>
          <select
            className="settings-select"
            value={settings.dailyResetHour}
            onChange={(e) => void updateSettings({ dailyResetHour: parseInt(e.target.value) })}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </div>

        <div className="settings-row">
          <span className="settings-label">주간 리셋</span>
          <select
            className="settings-select"
            value={settings.weeklyResetDay}
            onChange={(e) => void updateSettings({ weeklyResetDay: parseInt(e.target.value) })}
          >
            {WEEKDAYS.map((d, i) => (
              <option key={i} value={i}>
                {d}요일
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="section-title">알람</h3>
        {ALARM_RULES.map((rule) => (
          <div className="settings-row" key={rule.id}>
            <span className="settings-label settings-label-wide" title={rule.label}>
              {rule.label}
            </span>
            <select
              className="settings-select"
              value={settings.alarmModes?.[rule.id] ?? DEFAULT_ALARM_MODE}
              onChange={(e) =>
                void updateSettings({
                  alarmModes: {
                    ...settings.alarmModes,
                    [rule.id]: e.target.value as AlarmMode
                  }
                })
              }
            >
              <option value="sound">UI + 소리</option>
              <option value="ui">UI만</option>
              <option value="off">끄기</option>
            </select>
          </div>
        ))}
        <p className="settings-hint">
          이름에 해당 키워드가 포함된 퀘스트가 미완료면 알람 시각에 배경색으로 표시됩니다.
        </p>
      </section>

      <section className="settings-section">
        <h3 className="section-title">퀘스트 카탈로그 (Firebase)</h3>

        <div className="settings-row">
          <span className="settings-label">프로젝트 ID</span>
          <input
            className="settings-number settings-input-wide"
            type="text"
            placeholder="my-firebase-project"
            value={projectId}
            onChange={(e) => setProjectIdDraft(e.target.value)}
            onBlur={saveProjectId}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveProjectId()
            }}
          />
          <button
            className="settings-btn"
            disabled={busy || !projectId.trim()}
            onClick={() => {
              saveProjectId()
              void runCatalogSync()
            }}
          >
            동기화
          </button>
        </div>
        {syncMessage && <p className="settings-hint">{syncMessage}</p>}
        <p className="settings-hint">
          Firestore <code>quests</code> 컬렉션에서 일일/주간 퀘스트 목록을 가져와 모든 캐릭터에
          반영합니다. 앱 시작 시에도 자동 동기화됩니다.
        </p>
      </section>

      <section className="settings-section">
        <h3 className="section-title">동기화 ID 연동</h3>
        <p className="settings-hint settings-subdescription">
          마비노기 모바일 <b>환경설정 → 계정 → 이용자 정보</b>에서 확인할 수 있는{' '}
          <b>회원코드</b>를 입력하세요.
        </p>

        <div className="settings-row">
          <span className="settings-label">동기화 ID</span>
          <input
            className="settings-number settings-input-wide"
            type="text"
            placeholder="회원코드 입력"
            value={accountIdDraft ?? settings.gameAccountId ?? ''}
            onChange={(e) => setAccountIdDraft(e.target.value)}
            onKeyDown={(e) => {
              const value = (e.currentTarget as HTMLInputElement).value.trim()
              if (e.key === 'Enter' && value) void runCloudRegister(value)
            }}
          />
          <button
            className="settings-btn"
            disabled={busy || !(accountIdDraft ?? settings.gameAccountId ?? '').trim()}
            onClick={() => {
              const value = (accountIdDraft ?? settings.gameAccountId ?? '').trim()
              if (value) void runCloudRegister(value)
            }}
          >
            {settings.gameAccountId ? '재연동' : '연동'}
          </button>
        </div>
        {cloudMessage && <p className="settings-hint">{cloudMessage}</p>}
        <p className="settings-hint">
          {settings.gameAccountId
            ? `'${settings.gameAccountId}'로 동기화 중 — 캐릭터/퀘스트 변경이 자동으로 클라우드에 저장됩니다.`
            : '등록하면 캐릭터/퀘스트 진행 상황이 이 ID로 클라우드에 저장돼, 같은 ID로 다른 기기에서도 이어서 볼 수 있습니다. 이미 등록된 ID를 입력하면 그 데이터를 불러옵니다.'}
        </p>
      </section>
    </div>
  )
}
