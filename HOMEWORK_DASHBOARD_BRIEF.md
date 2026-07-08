# 📝 게임 숙제 체크 오버레이 대시보드 — Claude Code 개발 명세서

## 0. 프로젝트 요약

- **목적:** 다중 캐릭터 육성 유저를 위한 일일/주간 숙제 체크 오버레이
- **핵심:** Python 화면 캡처(자동 감지) + Electron UI(수동 체크) 하이브리드
- **원칙:** 게임 프로세스에 손대지 않음. 화면을 "보기만" 함. 입력 자동화 없음.
- **플랫폼:** Windows 우선 (macOS는 추후 대응)

---

## 1. 레포 구조

```
homework-dashboard/
├── electron-app/
│   ├── src/
│   │   ├── main/
│   │   │   ├── index.ts            # main process entry
│   │   │   ├── window.ts           # BrowserWindow 생성/드래그 처리
│   │   │   ├── ipc-handlers.ts     # renderer ↔ main IPC
│   │   │   ├── python-bridge.ts    # python subprocess 실행/재시작 관리
│   │   │   ├── ws-client.ts        # python 서버에 붙는 WebSocket 클라이언트
│   │   │   ├── store.ts            # electron-store 래퍼
│   │   │   └── reset-scheduler.ts  # 자정/주간 리셋 로직
│   │   ├── preload/
│   │   │   └── index.ts            # contextBridge로 노출할 API
│   │   └── renderer/
│   │       ├── index.html
│   │       ├── App.tsx
│   │       ├── components/
│   │       │   ├── CharacterTabs.tsx
│   │       │   ├── TaskChecklist.tsx
│   │       │   ├── TaskItem.tsx
│   │       │   └── SettingsPanel.tsx
│   │       └── store/
│   │           └── useDashboardStore.ts   # zustand 등
│   ├── package.json
│   └── electron-builder.yml
│
├── python-engine/
│   ├── main.py                     # 진입점, capture loop 시작
│   ├── ws_server.py                # websockets 서버 (Electron이 클라이언트)
│   ├── capture.py                  # mss 기반 화면 캡처
│   ├── matcher.py                  # OpenCV template matching
│   ├── config.py                   # 캡처 주기, threshold, 리전 설정 로드
│   ├── templates/
│   │   ├── character_01/
│   │   │   ├── daily_dungeon.png
│   │   │   └── weekly_raid.png
│   │   └── character_02/
│   ├── requirements.txt
│   └── build.spec                  # PyInstaller 스펙
│
├── shared/
│   └── schema.json                 # 공용 데이터 스키마 (JSON Schema)
│
└── HOMEWORK_DASHBOARD_BRIEF.md      # 이 파일
```

---

## 2. 통신 프로토콜 (중요 — 반드시 이 스펙대로)

**방식:** Python이 WebSocket **서버**(`ws://127.0.0.1:47231`)를 열고, Electron main process가 **클라이언트**로 접속. (반대로 하면 Electron 재시작 시 재연결 로직이 더 복잡해짐)

### 메시지 타입

```jsonc
// Python → Electron: 감지 이벤트
{
  "type": "task_detected",
  "character": "character_01",
  "task": "daily_dungeon",
  "confidence": 0.91,
  "timestamp": 1720000000
}

// Python → Electron: 하트비트 (5초 간격, 연결 생존 확인용)
{ "type": "heartbeat", "timestamp": 1720000000 }

// Electron → Python: 현재 활성 캐릭터 알림 (매칭 대상 좁히기용, 선택사항)
{ "type": "active_character", "character": "character_01" }

// Electron → Python: 설정 리로드 요청 (템플릿 이미지 추가/threshold 변경 시)
{ "type": "reload_config" }
```

### 재연결 로직

- Electron `ws-client.ts`: 연결 끊기면 **exponential backoff**(1s → 2s → 4s → 최대 10s)로 재시도
- 하트비트 15초 이상 미수신 시 연결 끊긴 것으로 간주하고 재연결
- Python 프로세스 자체가 죽었을 경우 Electron이 감지해서 **자동 재시작** (아래 3번 참고)

---

## 3. Python 프로세스 생명주기 관리 (놓치기 쉬운 부분)

- Electron main process가 `child_process.spawn()`으로 python(또는 패키징된 exe) 실행
- **exit code 감시:** python이 죽으면 3초 후 자동 재시작, 단 **연속 5회 이상 실패 시 재시작 중단** + UI에 에러 배지 표시 (무한 재시작 루프 방지)
- 앱 종료 시(`before-quit`) python 프로세스도 반드시 `SIGTERM`으로 정리 — 좀비 프로세스 방지
- 개발 모드에서는 `python main.py` 직접 실행, 배포 모드에서는 PyInstaller로 만든 `capture-engine.exe`를 `resources/` 폴더에 넣고 스폰

---

## 4. Python 캡처 엔진 상세

### 캡처
- `mss` 라이브러리 사용 (PyAutoGUI의 screenshot 기능보다 가볍고, 순수 캡처 전용이라 안티치트 이슈 최소화)
- 주기: 설정 가능, 기본 2.5초 (`config.py`에서 `CAPTURE_INTERVAL_SEC`)
- **캡처 리전 지정 기능 필수:** 전체 화면을 매번 스캔하면 CPU 낭비 + 오탐 확률 증가. 유저가 최초 설정 시 "숙제 완료 팝업이 뜨는 영역"을 드래그로 지정하게 해야 함 (Electron 쪽에서 리전 선택 UI 제공 → python config에 좌표 전달)

### 매칭
- `cv2.matchTemplate` + `cv2.TM_CCOEFF_NORMED`
- threshold 기본값 0.85, 캐릭터/숙제별로 개별 설정 가능하게 (게임 UI가 캐릭터마다 다를 수 있음)
- **쿨다운 로직 필수:** 같은 (character, task) 조합이 한 번 감지되면 해당 날짜/주에는 재전송 안 함 (중복 이벤트로 UI 깜빡임 방지)
- **오탐 방지:** 연속 2프레임 이상에서 threshold 통과해야 확정 이벤트로 전송 (일시적 화면 전환/애니메이션 중 오탐 감소)

### 해상도/DPI 대응
- 유저 모니터 해상도가 템플릿 캡처 시점과 다르면 매칭 실패 가능
- 템플릿 등록 시점의 캡처 해상도를 메타데이터로 저장 → 현재 화면 해상도와 비교해 다르면 자동 리사이즈 매칭 시도, 그래도 실패 시 UI에 "템플릿 재등록 필요" 경고

---

## 5. Electron UI 상세

### 창 속성
```ts
{
  frame: false,
  transparent: true,
  alwaysOnTop: true,
  resizable: true,
  skipTaskbar: false,   // 작업표시줄에는 남겨서 유저가 쉽게 찾게
  hasShadow: false
}
```
- 프레임이 없으므로 **커스텀 드래그 영역** 필요 (`-webkit-app-region: drag` CSS + 버튼 영역은 `no-drag`)
- 트레이 아이콘 추가 권장: 우클릭 메뉴로 "숨기기/보이기", "종료", "캡처 일시정지"

### 컴포넌트
- `CharacterTabs`: 캐릭터 추가/삭제/순서 변경(드래그) 가능하게
- `TaskItem`: 자동 감지로 체크된 항목과 수동 체크 항목을 **아이콘으로 구분** (예: 🤖 자동 / 👆 수동) — 유저가 나중에 오탐인지 구분 가능해야 함
- `SettingsPanel`: 캡처 리전 지정, 템플릿 이미지 등록(스크린샷 찍어서 크롭), threshold 슬라이더, 캐릭터별 숙제 목록 커스터마이징

### 데이터 저장
- `electron-store` 사용 (LocalStorage 대신 — 앱 재설치/버전업 시에도 파일 기반이라 안전)
- 스키마:
```json
{
  "characters": {
    "character_01": {
      "displayName": "닉네임",
      "tasks": {
        "daily_dungeon": { "done": true, "mode": "auto", "lastDoneAt": 1720000000 },
        "weekly_raid":   { "done": false, "mode": "manual", "lastDoneAt": null }
      }
    }
  },
  "settings": {
    "captureIntervalSec": 2.5,
    "weeklyResetDay": 4,       // 0=일요일 ... 4=목요일 (게임마다 리셋 요일 다름)
    "dailyResetHour": 0
  }
}
```

---

## 6. 리셋 로직 (엣지케이스 주의)

- **단순 `setInterval`로 자정 체크 금지** — 컴퓨터 절전모드/슬립 중에는 타이머가 멈추므로 자정을 "놓칠" 수 있음
- 대신: **앱이 포그라운드로 돌아오거나 시작될 때마다** `마지막 리셋 시각` vs `현재 시각`을 비교해서 날짜가 바뀌었으면 리셋 실행 (day-boundary 체크 방식)
- 일일 리셋: `dailyResetHour` 기준으로 날짜 변경 감지
- 주간 리셋: `weeklyResetDay` 기준 요일 계산 (많은 게임이 리셋 요일이 다름 — 목요일 리셋인 게임도 흔함)
- 리셋 시 `mode: "manual"`로 유저가 직접 체크한 항목도 동일하게 초기화 (구분 없이 전체 리셋)

---

## 7. 패키징/배포

- **Electron:** `electron-builder`로 NSIS 인스톨러 생성 (Windows)
- **Python:** `PyInstaller --onefile`로 단일 exe화, `electron-builder.yml`의 `extraResources`에 포함시켜 최종 설치 패키지에 함께 번들
- 빌드 스크립트에서 python exe 빌드 → electron 리소스 폴더 복사 → electron 빌드 순서로 자동화 (`npm run build:all` 하나로 처리)

---

## 8. 개발 순서 (Claude Code에게 이 순서로 진행 요청 권장)

1. Electron 기본 셸: 투명/frameless 창 + 드래그 이동 + 트레이 아이콘
2. `electron-store` 기반 캐릭터/숙제 CRUD (수동 체크만 되는 버전) → 여기까지 먼저 동작 확인
3. Python 캡처 엔진: mss + 템플릿 매칭 단독 테스트 (콘솔 로그로만 감지 결과 출력)
4. WebSocket 연결 (Python 서버 ↔ Electron 클라이언트) 붙이기
5. 자동 감지 → UI 반영 연결
6. 리전 지정 UI, 템플릿 등록 UI (설정 패널)
7. 리셋 로직
8. 패키징/빌드 자동화

---

## 9. 제약사항 (재확인)

- 게임 프로세스 메모리 읽기/후킹 코드 절대 포함 금지
- 마우스/키보드 입력 자동화(PyAutoGUI 등) 코드 절대 포함 금지
- 오직 화면 캡처(읽기 전용) + 이미지 매칭만 사용
