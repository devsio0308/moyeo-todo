import { useState } from 'react'

interface Props {
  /** '그냥 브라우저에서 계속하기' 선택 시 */
  onContinueInBrowser: () => void
}

type Platform = 'ios' | 'android'

function detectPlatform(): Platform {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 'ios' : 'android'
}

/**
 * 브라우저(비-standalone)로 열었을 때 보여주는 홈 화면 추가 가이드.
 * 홈 화면 아이콘으로 실행하면(standalone) 이 화면 없이 바로 동기화 ID 입력으로 간다.
 */
export default function InstallGuide({ onContinueInBrowser }: Props): React.JSX.Element {
  const [platform, setPlatform] = useState<Platform>(detectPlatform)

  return (
    <div className="gate">
      <div className="gate-card install-guide">
        <h1 className="gate-title">📝 뭐해야하더라</h1>
        <p className="gate-desc">
          홈 화면에 추가하면 앱처럼 전체 화면으로 열립니다.
          기기에 맞는 방법으로 추가한 뒤, 홈 화면의 아이콘으로 실행하세요.
        </p>

        <div className="guide-tabs" role="tablist" aria-label="기기 선택">
          <button
            role="tab"
            aria-selected={platform === 'ios'}
            className={`guide-tab ${platform === 'ios' ? 'guide-tab-active' : ''}`}
            onClick={() => setPlatform('ios')}
          >
            iOS
          </button>
          <button
            role="tab"
            aria-selected={platform === 'android'}
            className={`guide-tab ${platform === 'android' ? 'guide-tab-active' : ''}`}
            onClick={() => setPlatform('android')}
          >
            Android
          </button>
        </div>

        {platform === 'ios' ? (
          <ol className="guide-steps">
            <li>
              <b>Safari</b>로 이 페이지를 엽니다 (다른 브라우저에는 추가 메뉴가 없습니다).
            </li>
            <li>
              하단 가운데의 <b>공유</b> 버튼(위쪽 화살표가 있는 사각형)을 누릅니다.
            </li>
            <li>
              목록을 내려 <b>홈 화면에 추가</b>를 선택합니다.
            </li>
            <li>
              오른쪽 위 <b>추가</b>를 누르면 홈 화면에 아이콘이 생깁니다.
            </li>
          </ol>
        ) : (
          <ol className="guide-steps">
            <li>
              <b>Chrome</b>으로 이 페이지를 엽니다.
            </li>
            <li>
              오른쪽 위 <b>메뉴(⋮)</b>를 누릅니다.
            </li>
            <li>
              <b>홈 화면에 추가</b>(기기에 따라 <b>앱 설치</b>)를 선택합니다.
            </li>
            <li>
              <b>추가</b>를 누르면 홈 화면에 아이콘이 생깁니다.
            </li>
          </ol>
        )}

        <p className="gate-desc">
          추가가 끝나면 홈 화면의 아이콘으로 실행하세요 — 동기화 ID 입력 화면이 나타납니다.
        </p>

        <button className="guide-skip" onClick={onContinueInBrowser}>
          그냥 브라우저에서 계속하기
        </button>
      </div>
    </div>
  )
}
