import { useState } from 'react'
import { webStore } from '../store'

interface Props {
  notRegistered?: boolean
  errorMessage?: string | null
}

/** 동기화 ID 입력 화면 — 등록은 데스크톱 앱 전용, 여기선 조회만 (#27) */
export default function SyncIdGate({ notRegistered, errorMessage }: Props): React.JSX.Element {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (): Promise<void> => {
    if (!value.trim()) return
    setBusy(true)
    try {
      await webStore.register(value)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="gate">
      <div className="gate-card">
        <h1 className="gate-title">🧦 모여길드 도비</h1>
        <p className="gate-desc">
          마비노기 모바일 <b>환경설정 → 계정 → 이용자 정보</b>에서 확인할 수 있는{' '}
          <b>회원코드</b>를 입력하세요.
        </p>
        <input
          className="gate-input"
          placeholder="회원코드 입력"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
          }}
          autoFocus
        />
        <button className="gate-btn" disabled={busy || !value.trim()} onClick={() => void submit()}>
          {busy ? '조회 중…' : '연동'}
        </button>

        {notRegistered && (
          <p className="gate-error">
            이 ID로 등록된 데이터가 없습니다. 먼저 데스크톱 앱(모여길드 도비)의 설정 →
            "동기화 ID 연동"에서 같은 회원코드로 연동해주세요.
          </p>
        )}
        {errorMessage && <p className="gate-error">⚠ {errorMessage}</p>}
      </div>
    </div>
  )
}
