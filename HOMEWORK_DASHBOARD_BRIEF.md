# 📝 게임 숙제 체크 오버레이 대시보드 — Claude Code 개발 명세서

## 0. 프로젝트 요약

- **목적:** 다중 캐릭터 육성 유저를 위한 일일/주간 숙제 체크 오버레이
- **핵심:** Electron UI 기반 수동 체크
- **원칙:** 게임 프로세스에 손대지 않음. 입력 자동화 없음.
- **플랫폼:** Windows 우선 (macOS는 추후 대응)

---

## 1. 레포 구조

```
moyeo-todo/
├── electron-app/
│   ├── src/
│   │   ├── main/
│   │   │   ├── index.ts            # main process entry
│   │   │   ├── window.ts           # BrowserWindow 생성/드래그 처리
│   │   │   ├── ipc-handlers.ts     # renderer ↔ main IPC
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
├── shared/
│   └── schema.json                 # 공용 데이터 스키마 (JSON Schema)
│
└── HOMEWORK_DASHBOARD_BRIEF.md      # 이 파일
```

---

## 2. Electron UI 상세

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
- 트레이 아이콘 추가 권장: 우클릭 메뉴로 "숨기기/보이기", "종료"

### 컴포넌트
- `CharacterTabs`: 캐릭터 추가/삭제/순서 변경(드래그) 가능하게
- `TaskItem`: 체크/카운터 UI (체크 전용, 삭제는 퀘스트 관리 화면에서)
- `SettingsPanel`: 리셋 시각, 알람 규칙별 모드, 퀘스트 카탈로그/동기화 ID 설정

### 데이터 저장
- `electron-store` 사용 (LocalStorage 대신 — 앱 재설치/버전업 시에도 파일 기반이라 안전)
- 스키마:
```json
{
  "characters": {
    "character_01": {
      "displayName": "닉네임",
      "tasks": {
        "daily_dungeon": { "done": true, "lastDoneAt": 1720000000 },
        "weekly_raid":   { "done": false, "lastDoneAt": null }
      }
    }
  },
  "settings": {
    "weeklyResetDay": 4,       // 0=일요일 ... 4=목요일 (게임마다 리셋 요일 다름)
    "dailyResetHour": 0
  }
}
```

---

## 3. 리셋 로직 (엣지케이스 주의)

- **단순 `setInterval`로 자정 체크 금지** — 컴퓨터 절전모드/슬립 중에는 타이머가 멈추므로 자정을 "놓칠" 수 있음
- 대신: **앱이 포그라운드로 돌아오거나 시작될 때마다** `마지막 리셋 시각` vs `현재 시각`을 비교해서 날짜가 바뀌었으면 리셋 실행 (day-boundary 체크 방식)
- 일일 리셋: `dailyResetHour` 기준으로 날짜 변경 감지
- 주간 리셋: `weeklyResetDay` 기준 요일 계산 (많은 게임이 리셋 요일이 다름 — 목요일 리셋인 게임도 흔함)
- 리셋 시 유저가 직접 체크한 항목도 동일하게 초기화 (제외 처리된 퀘스트만 예외)

---

## 4. 패키징/배포

- **Electron:** `electron-builder`로 NSIS 인스톨러 생성 (Windows)
- `npm run build:all`로 `electron-vite build` → `electron-builder` 순서로 처리

---

## 5. 개발 순서 (Claude Code에게 이 순서로 진행 요청 권장)

1. Electron 기본 셸: 투명/frameless 창 + 드래그 이동 + 트레이 아이콘
2. `electron-store` 기반 캐릭터/숙제 CRUD (수동 체크) → 여기까지 먼저 동작 확인
3. 리셋 로직
4. 패키징/빌드 자동화

---

## 6. 제약사항

- 게임 프로세스 메모리 읽기/후킹 코드 절대 포함 금지
- 마우스/키보드 입력 자동화 코드 절대 포함 금지
