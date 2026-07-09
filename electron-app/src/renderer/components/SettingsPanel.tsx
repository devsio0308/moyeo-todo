import { useCallback, useEffect, useState } from 'react'
import { ALARM_RULES, DEFAULT_ALARM_MODE, type AlarmMode } from '../../shared/alarms'
import { AUTO_DETECT_ENABLED, type TemplateIndex } from '../../shared/types'
import { useDashboardStore } from '../store/useDashboardStore'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/**
 * 설정 패널 (명세서 §5):
 * - 캡처 리전 지정 / 해제
 * - 캡처 주기, 전역 threshold 슬라이더
 * - 일일/주간 리셋 시각
 * - 활성 캐릭터의 퀘스트별 템플릿 등록/삭제 + 개별 threshold
 */
export default function SettingsPanel(): React.JSX.Element {
  const data = useDashboardStore((s) => s.data)
  const activeId = useDashboardStore((s) => s.activeCharacterId)
  const updateSettings = useDashboardStore((s) => s.updateSettings)
  const updateTask = useDashboardStore((s) => s.updateTask)
  const applyState = useDashboardStore((s) => s.applyState)

  const [templates, setTemplates] = useState<TemplateIndex>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [projectIdDraft, setProjectIdDraft] = useState<string | null>(null)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [accountIdDraft, setAccountIdDraft] = useState<string | null>(null)
  const [cloudMessage, setCloudMessage] = useState<string | null>(null)

  const refreshTemplates = useCallback(async () => {
    setTemplates(await window.api.templates.list())
  }, [])

  useEffect(() => {
    void refreshTemplates()
  }, [refreshTemplates])

  if (!data) return <></>
  const { settings } = data
  const character = activeId ? data.characters[activeId] : null
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

  const runFlow = async (flow: () => Promise<unknown>): Promise<void> => {
    setError(null)
    setBusy(true)
    try {
      await flow()
    } catch (e) {
      // "Error invoking remote method 'x': Error: 메시지" → 메시지만 추출
      const raw = e instanceof Error ? e.message : String(e)
      setError(raw.split('Error: ').pop() ?? raw)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="settings">
      {error && <p className="settings-error">⚠ {error}</p>}

      {/* 자동 감지 비활성 버전(#10) — 캡처/템플릿 관련 설정 숨김 */}
      {AUTO_DETECT_ENABLED && (
      <section className="settings-section">
        <h3 className="section-title">자동 감지</h3>

        <div className="settings-row">
          <span className="settings-label">캡처 영역</span>
          <span className="settings-value">
            {settings.captureRegion
              ? `(${settings.captureRegion.left}, ${settings.captureRegion.top}) ${settings.captureRegion.width}×${settings.captureRegion.height}`
              : '전체 화면'}
          </span>
          <button
            className="settings-btn"
            disabled={busy}
            onClick={() =>
              void runFlow(async () => {
                const state = await window.api.flows.pickRegion()
                if (state) applyState(state)
              })
            }
          >
            영역 지정
          </button>
          {settings.captureRegion && (
            <button
              className="settings-btn"
              disabled={busy}
              onClick={() =>
                void runFlow(async () => applyState(await window.api.flows.clearRegion()))
              }
            >
              해제
            </button>
          )}
        </div>

        <div className="settings-row">
          <span className="settings-label">캡처 주기</span>
          <input
            className="settings-number"
            type="number"
            min={0.5}
            max={60}
            step={0.5}
            value={settings.captureIntervalSec}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              if (v >= 0.5 && v <= 60) void updateSettings({ captureIntervalSec: v })
            }}
          />
          <span className="settings-unit">초</span>
        </div>

        <div className="settings-row">
          <span className="settings-label">매칭 정확도</span>
          <input
            className="settings-slider"
            type="range"
            min={0.5}
            max={0.99}
            step={0.01}
            value={settings.matchThreshold}
            onChange={(e) => void updateSettings({ matchThreshold: parseFloat(e.target.value) })}
          />
          <span className="settings-value">{Math.round(settings.matchThreshold * 100)}%</span>
        </div>
      </section>
      )}

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
        <h3 className="section-title">게임계정 동기화</h3>

        <div className="settings-row">
          <span className="settings-label">계정 ID</span>
          <input
            className="settings-number settings-input-wide"
            type="text"
            placeholder="예: 서버명-닉네임"
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

      {AUTO_DETECT_ENABLED && (
      <section className="settings-section">
        <h3 className="section-title">
          템플릿 {character ? `— ${character.displayName}` : ''}
        </h3>
        {!character && <p className="settings-hint">캐릭터를 먼저 추가하세요.</p>}
        {character && Object.keys(character.tasks).length === 0 && (
          <p className="settings-hint">이 캐릭터에 퀘스트를 먼저 추가하세요.</p>
        )}
        {character &&
          activeId &&
          Object.entries(character.tasks).map(([taskId, task]) => {
            const registered = templates[activeId]?.includes(taskId) ?? false
            return (
              <div className="settings-row" key={taskId}>
                <span className="settings-label settings-label-wide" title={task.displayName}>
                  {task.displayName}
                </span>
                <span className={`tpl-status ${registered ? 'tpl-ok' : ''}`}>
                  {registered ? '등록됨' : '미등록'}
                </span>
                <input
                  className="settings-number settings-number-sm"
                  type="number"
                  min={0.5}
                  max={0.99}
                  step={0.01}
                  placeholder="전역"
                  title="이 퀘스트만의 매칭 정확도 (비우면 전역값)"
                  value={task.threshold ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value
                    const v = raw === '' ? null : parseFloat(raw)
                    if (v === null || (v >= 0.5 && v <= 0.99))
                      void updateTask(activeId, taskId, { threshold: v })
                  }}
                />
                <button
                  className="settings-btn"
                  disabled={busy}
                  title="화면에서 완료 팝업 영역을 크롭해 템플릿으로 등록"
                  onClick={() =>
                    void runFlow(async () => {
                      const index = await window.api.flows.registerTemplate(activeId, taskId)
                      if (index) setTemplates(index)
                    })
                  }
                >
                  📷 {registered ? '재등록' : '등록'}
                </button>
                {registered && (
                  <button
                    className="settings-btn"
                    disabled={busy}
                    onClick={() =>
                      void runFlow(async () =>
                        setTemplates(await window.api.templates.remove(activeId, taskId))
                      )
                    }
                  >
                    삭제
                  </button>
                )}
              </div>
            )
          })}
      </section>
      )}
    </div>
  )
}
