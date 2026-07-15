---
name: run-electron-app
description: electron-app(뭐해야하더라)을 dev 모드로 띄우고 관리창/오버레이창이 정상 동작하는지 스모크 테스트. "electron-app 테스트해줘", "오버레이 확인해줘", "스모크 테스트" 요청 시 사용.
---

`electron-app/`은 Electron 데스크톱 앱이라 헤드리스 세션에서는 창을 직접
"볼" 수 없다. 이 스킬은 **화면 캡처(스크린샷) 없이** Chrome DevTools
Protocol(CDP)로 렌더러 프로세스에 붙어서 DOM/상태를 콘솔 레벨로만
확인한다.

## 왜 스크린샷을 안 쓰는가

`screencapture`로 전체화면/포커스 기반 캡처를 시도했다가 **다른 작업 중인
창(무관한 코드)이 잘못 찍힌 사고**가 여러 번 있었다 (포커스 전환이
안정적으로 안 됨 — 자동화/손쉬운 사용 권한 문제로 추정). 이후로는 CDP 기반
DOM 확인 방식으로 전환했고, 이 방식은:
- 새 npm 의존성이 필요 없음 (Node 22+ 내장 `fetch`/`WebSocket` 사용)
- 다른 창을 절대 캡처하지 않음 (렌더러 프로세스에 직접 붙는 것이라 화면과 무관)
- 클릭도 `element.click()` DOM 이벤트로 처리 — OS 레벨 마우스/키보드 자동화 아님

## 사전 조건

```bash
cd electron-app
npm install   # 최초 1회
```

## 실행 절차

**1) dev 서버를 remote-debugging 포트와 함께 백그라운드로 띄운다:**

```bash
cd electron-app
npm run dev -- --remote-debugging-port=9222 > /tmp/moyeo-todo-dev.log 2>&1 &
sleep 6
cat /tmp/moyeo-todo-dev.log   # 에러 없이 "DevTools listening on ws://127.0.0.1:9222/..." 나오는지 확인
```

로그에서 확인할 것:
- `build the electron main process successfully`
- `build the electron preload files successfully`
- `DevTools listening on ws://127.0.0.1:9222/...`
- `[catalog] ...` — `.env`에 `MAIN_VITE_FIREBASE_PROJECT_ID`를 안 채웠으면
  `Firebase 프로젝트 ID가 설정되지 않았습니다`가 정상. 채웠다면
  `카탈로그 N개 동기화 완료 (...)`가 정상
- 스택 트레이스/에러 없음 (특히 auto-update.ts는 dev 모드에서 `app.isPackaged`
  가 false라 아무 로그도 안 남기는 게 정상)

**2) 드라이버 스크립트로 관리창 + 오버레이창을 확인한다:**

```bash
node .claude/skills/run-electron-app/driver.mjs
```

드라이버가 하는 일:
1. `/json/list`로 관리창(ManageApp) CDP 타겟 확인
2. `Runtime.evaluate`로 타이틀, 사이드바 메뉴(`대시보드/캐릭터/퀘스트 관리/설정`),
   엔진 에러 배지 유무, `window.api`(preload) 노출 여부 확인
3. `.overlay-launch-btn` 버튼을 DOM `.click()`으로 눌러 오버레이창 오픈 트리거
4. `/json/list`를 다시 조회해 `#overlay` 해시가 붙은 새 타겟이 떴는지 확인
5. 오버레이창에 붙어서 타이틀바 버튼(🔄, —), 본문 텍스트(실제 퀘스트 체크리스트
   렌더링 여부), `#root` 자식 노드 수(0이면 빈 화면 = 렌더 실패) 확인

**3) 종료:**

```bash
pkill -f "electron-vite dev"
pkill -f "node_modules/electron/dist/Electron.app"
```

## 정상 결과 예시

```
side-nav 항목: [ '대시보드', '캐릭터', '퀘스트 관리', '설정' ]
에러 배지 존재 여부: false
preload API 노출 여부: OK
CLICKED: 🚀 오버레이 띄우기
[ { title: '뭐해야하더라', url: '.../#overlay' }, { title: '뭐해야하더라', url: '.../' } ]
타이틀바 버튼들: [ '🔄', '—' ]
본문 텍스트 일부: (실제 캐릭터/퀘스트 체크리스트 텍스트)
root 렌더 여부: 1 (0 이상이면 정상)
```

## Gotchas

- **dev 모드는 저장소가 분리되어 있음** — `src/main/dev-userdata.ts`가 userData를
  `~/Library/Application Support/moyeo-todo-dev`로 돌린다 (실사용 데이터
  `.../moyeo-todo`는 절대 건드리지 않음). 처음 실행하면 캐릭터 0명 + 동기화 ID
  미등록 상태로 시작하며, 테스트로 캐릭터를 추가하거나 ID를 연동해도 실데이터에
  영향 없다. 클라우드 문서를 만드는 테스트를 했다면 문서 삭제 + dev 저장소
  디렉터리 삭제로 정리할 것 (2026-07-15 이전에는 실저장소를 공유해서 실사용
  클라우드 데이터를 덮어쓴 사고가 있었다).
- **`screencapture -x`(전체화면)는 쓰지 말 것** — 맨 앞 창이 아니라
  포커스된 아무 창이나 찍힌다. 실제로 무관한 작업 창이 캡처된 사고 발생.
- **`osascript`로 `activate` 해도 포커스가 안 넘어올 수 있음** — 터미널/에이전트
  프로세스에 손쉬운 사용(Accessibility)/자동화 권한이 없으면 조용히 실패.
  이 프로젝트에서는 아예 스크린샷 접근을 포기하고 CDP로 전환했다.
- **오버레이창은 기본적으로 안 떠 있음** — 관리창이 먼저 뜨고, "오버레이
  띄우기" 버튼(또는 트레이 메뉴)을 눌러야 생성됨. 드라이버가 이 버튼을
  DOM 클릭으로 대신 눌러준다.
- **자동 감지(화면 캡처 기반 완료 감지) 기능은 코드 자체가 삭제된 상태** —
  `.badge-failed`(엔진 오류 배지) 같은 관련 UI/클래스가 아예 존재하지
  않으므로 드라이버의 "에러 배지 존재 여부"는 항상 `false`가 정상.
- 관리창의 CDP 타겟은 `url`에 `#`이 없는 것으로 구분하고, 오버레이는
  `#overlay`가 붙은 것으로 구분한다 (해시 라우팅, `src/renderer/main.tsx`).

## 한계

이 방식은 **로직/렌더링/IPC가 정상 동작하는지**를 콘솔 레벨로 검증하는
것이지, **픽셀 단위 시각적 확인**(레이아웃 깨짐, 스타일 이슈 등)은 못 한다.
시각적 확인이 꼭 필요하면 사용자에게 직접 스크린샷을 부탁할 것
(`Cmd+Shift+4` → `Space` → 창 클릭).
