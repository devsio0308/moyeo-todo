# 📝 moyeo-todo — 뭐해야하더라

다중 캐릭터 육성 유저를 위한 **게임 퀘스트 체크 오버레이 대시보드**.

- **Electron 오버레이 UI** — 투명/항상 위 창에서 캐릭터별 일일·주간 퀘스트를 수동 체크 (카운트형 N회 퀘스트 지원)
- **Firebase 퀘스트 카탈로그** — Firestore에서 퀘스트 목록을 받아 전체 캐릭터에 자동 반영
- 게임 프로세스에는 일절 손대지 않음 — 화면/입력에 관여하지 않는 순수 UI 오버레이.

상세 명세: [HOMEWORK_DASHBOARD_BRIEF.md](./HOMEWORK_DASHBOARD_BRIEF.md)

## 구조

```
electron-app/     # Electron UI (electron-vite + React + TS + zustand + electron-store)
shared/           # 공용 JSON Schema (스토어)
```

## 개발 환경

```bash
cd electron-app
npm install
npm run dev

npm run typecheck && npm test         # 타입체크 + 단위 테스트 (리셋/카탈로그)
```

## 배포 빌드

```bash
cd electron-app
npm run build && npx electron-builder
```

### Windows 설치/업데이트 시 주의사항

앱은 창을 닫아도(X 버튼) **트레이에 계속 상주**하도록 설계돼 있다 (게임 위에
떠 있는 오버레이라 백그라운드에서 계속 살아있어야 함). 창만 닫은 상태로는
프로세스가 여전히 실행 중이라, 업데이트 설치 시 다음 메시지가 뜰 수 있다:

> MoyeoTodo cannot be closed. Please close it manually and click Retry to continue.

**해결:** 작업 표시줄 트레이 아이콘(`^` 화살표로 숨겨진 아이콘 포함)에서
**뭐해야하더라 우클릭 → 종료**를 먼저 실행한 뒤 설치 창에서 **Retry**.
트레이 아이콘을 못 찾으면 작업 관리자(`Ctrl+Shift+Esc`)에서
`MoyeoTodo.exe`를 찾아 작업 끝내기.

## 주요 동작

| 기능 | 방식 |
|---|---|
| 카운트형 퀘스트 | `targetCount` ≥ 2면 n/N 카운터(＋/−), target 도달 시 완료. 리셋 시 0으로 (#7) |
| 리셋 | 타이머 의존 없이 앱 시작/포커스/절전 복귀 시 day-boundary 비교 — 기본 일일 06:00 / 월요일 06:00 (#1) |
| 완료 정렬 | 체크리스트에서 완료 퀘스트는 섹션 하단으로 (#8) |

## 퀘스트 카탈로그 (Firebase)

일일/주간 퀘스트 목록을 Firestore에서 가져와 **모든 캐릭터에 자동 반영**할 수 있다 (#4).

1. Firebase 콘솔에서 프로젝트 생성 → Firestore Database 활성화
2. `quests` 컬렉션에 문서 추가 — 필드:
   ```
   name:        "일일 던전"        (string, 필수)
   period:      "daily" | "weekly" (string, 기본 daily)
   order:       1                  (number, 표시 순서 — 선택)
   targetCount: 5                  (number, 완료 필요 횟수 — 선택, 기본 1)
   category:    "전투"             (string, "전투"|"물물교환"|"알바"|"구매" — 선택)
   location:    "던바튼"           (string, 지역 태그 — 선택)
   ```
3. 공개 읽기 규칙 설정:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /quests/{doc} { allow read: if true; allow write: if false; }
       match /recommended_quests/{doc} { allow read: if true; allow write: if false; }
     }
   }
   ```
4. 앱 ⚙ 설정 → "퀘스트 카탈로그(Firebase)"에 **프로젝트 ID** 입력 → 동기화

**기본 프로젝트 ID 주입(#14):** `electron-app/.env.example`을 `.env`로 복사하고
`MAIN_VITE_FIREBASE_PROJECT_ID`를 채우면 dev/release 빌드에 기본값으로 들어간다
(`.env`는 git 미포함). 설정 UI에 직접 입력한 값이 있으면 그 값이 우선.

앱 시작 시에도 자동 동기화된다. 카탈로그 퀘스트(☁)는 삭제해도 다음 동기화 때 다시 추가되며,
카탈로그에서 빠진 항목은 삭제하지 않는다 (수동 추가 퀘스트 보존).

**추천 퀘스트(#15):** `recommended_quests` 컬렉션(문서 형식 동일)은 강제 동기화 대상이 아니라
퀘스트 관리 화면의 "📖 추천 퀘스트" 목록으로 표시되고, 골라서 추가하면 **커스텀 퀘스트**로
등록된다 (캐릭터별 선택, 삭제 자유).

## 게임계정 동기화 (Firestore, #26)

인증 없이 **게임계정 ID를 키**로 캐릭터/퀘스트 진행 상황을 Firestore에 동기화한다. 같은
ID로 다른 기기(추후 웹 오버레이 포함)에서 등록하면 이어서 볼 수 있다.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /quests/{doc} { allow read: if true; allow write: if false; }
    match /recommended_quests/{doc} { allow read: if true; allow write: if false; }
    match /players/{doc} {
      allow get: if true;
      allow list: if false;
      allow write: if true;
    }
  }
}
```

`players` 컬렉션은 **영구적으로** 이 규칙이어야 한다 — 인증 없이 ID만으로 접근하는
설계이기 때문이다(위 `quests`/`recommended_quests`처럼 시드 후 잠그는 규칙이 아님).
`get`(정확한 ID로 문서 하나 조회)만 허용하고 **`list`(컬렉션 전체 나열)는 반드시 차단**
해야 한다 — `allow read: if true`로 두면 ID를 몰라도 등록된 모든 플레이어의 데이터를
한 번에 훑어볼 수 있어 "ID를 아는 사람만 접근 가능"이라는 설계 의도가 무력화된다.
`write`는 여전히 열려 있어 특정 ID를 노린 변조까지 막지는 못하지만(인증 없는 설계의
근본적 한계), list 차단만으로 무작위 스캔·전체 유출 위험은 사라진다.

동작:
- ⚙ 설정 → "게임계정 동기화"에서 ID 등록. **원격에 이미 데이터가 있으면 원격 우선**으로
  로컬을 덮어쓰고, 없으면 **현재 로컬 데이터를 업로드**해 최초 등록으로 삼는다.
- 등록 후에는 캐릭터/퀘스트 변경이 있을 때마다 자동으로 `players/{id}` 문서에 반영된다
  (fire-and-forget — 네트워크 실패해도 로컬 동작에는 영향 없음).
- 동기화 대상은 캐릭터/퀘스트/리셋 시각뿐이며, 기기별 설정은 포함하지 않는다.
- **자동 풀(polling)은 하지 않는다** — 트래픽을 아끼기 위해 로컬 변경은 자동 푸시하지만,
  다른 기기(폰 등)에서 바뀐 내용은 오버레이 타이틀바의 **🔄 동기화 버튼**을 눌러야
  가져온다 (#28).

## 웹 오버레이 (휴대폰용, #27)

`web-overlay/`는 동기화 ID로 Firestore를 읽고 체크만 하는 별도 웹앱 — 캐릭터/퀘스트
추가는 없음(Electron 전용). iOS Safari / Android Chrome에서 "홈 화면에 추가"로 앱처럼
쓸 수 있다.

```bash
cd web-overlay
npm install
cp .env.example .env   # VITE_FIREBASE_PROJECT_ID 채우기
npm run dev            # http://localhost:5183
npm run build           # dist/ 생성
firebase deploy --project <프로젝트ID> --only hosting   # 배포 (firebase login 필요)
```

**설계 메모:**
- 알람은 **앱이 열려 있을 때만** 하이라이트+소리 (백그라운드 푸시 아님 — 확정된 범위)
- 체크/카운트 변경은 Firestore `updateMask`로 **건드린 필드만 부분 업데이트** — 데스크톱과
  동시에 다른 퀘스트를 바꿔도 서로 덮어쓰지 않는다. 일/주 리셋 캐치업만 예외적으로 문서
  전체를 덮어쓴다(다수 필드를 한 번에 바꾸므로)
- 로드 시 웹이 직접 day-boundary를 계산해 리셋을 실행한다 — Electron이 꺼져 있어도
  폰에서 먼저 열면 리셋이 반영되고 클라우드에도 다시 푸시된다
- `src/shared/`는 electron-app의 순수 로직(types 일부/alarms/reset-logic)을 그대로
  복사한 것 — 워크스페이스 패키지 분리 전까지는 electron-app 변경 시 수동으로 맞춰야 함
- 미등록 ID 입력 시 업로드하지 않고 "데스크톱 앱에서 먼저 연동" 안내만 표시
- **자동 폴링은 하지 않는다** (#29) — 앱 최초 진입 시 1회 로드 후에는 타이틀바의
  **🔄 새로고침 버튼**을 눌러야 최신 데이터를 가져온다. 한 사람이 플랫폼을 오가며
  쓰는 개인용 도구라 실시간 동기화가 불필요하고, 백그라운드 폴링은 트래픽뿐 아니라
  배터리 소모도 아깝다 — Electron 쪽 수동 동기화(#28)와 철학을 통일

## Git 워크플로

gitflow — `master`(릴리스) / `develop`(통합) / `feature/*`(기능 단위, `--no-ff` 머지)
