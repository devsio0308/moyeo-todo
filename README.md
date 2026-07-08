# 📝 mobi-homework-helper — 모여길드 도비

다중 캐릭터 육성 유저를 위한 **게임 퀘스트 체크 오버레이 대시보드**.

- **Electron 오버레이 UI** — 투명/항상 위 창에서 캐릭터별 일일·주간 퀘스트를 수동 체크 (카운트형 N회 퀘스트 지원)
- **Firebase 퀘스트 카탈로그** — Firestore에서 퀘스트 목록을 받아 전체 캐릭터에 자동 반영
- **Python 캡처 엔진** — 화면을 주기적으로 캡처해 "퀘스트 완료 팝업"을 템플릿 매칭으로 자동 감지 (🤖)
- 게임 프로세스에는 일절 손대지 않음: **화면 캡처(읽기 전용) + 이미지 매칭만** 사용. 입력 자동화 없음.

> ⚠️ **현재 버전은 자동 감지가 비활성화되어 있다** (#10 — 추가 검증 후 배포 예정).
> 수동 체크 + Firebase 카탈로그만 동작하며, python 엔진은 실행되지 않고 관련 UI(엔진 상태,
> 캡처/템플릿 설정, 트레이 캡처 메뉴)도 숨겨져 있다.
> 재활성화: `electron-app/src/shared/types.ts`의 `AUTO_DETECT_ENABLED = true` 한 줄.

상세 명세: [HOMEWORK_DASHBOARD_BRIEF.md](./HOMEWORK_DASHBOARD_BRIEF.md)

## 구조

```
electron-app/     # Electron UI (electron-vite + React + TS + zustand + electron-store)
python-engine/    # 캡처 엔진 (mss + OpenCV + websockets) — WS 서버 ws://127.0.0.1:47231
shared/           # 공용 JSON Schema (스토어/WS 메시지)
```

## 개발 환경

```bash
# Python 엔진 (자동 감지 활성화 시에만 사용됨)
cd python-engine
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest            # 테스트

# Electron 앱 (AUTO_DETECT_ENABLED=true면 dev 모드가 .venv의 엔진을 자동 스폰)
cd electron-app
npm install
npm run dev

npm run typecheck && npm test         # 타입체크 + 단위 테스트 (리셋/카탈로그)
```

macOS에서 개발 시 화면 기록 권한이 필요하다 (mss — 자동 감지 활성화 시).

## 배포 빌드

```bash
cd electron-app
npm run build:all
# = PyInstaller로 capture-engine 빌드 → resources/engine/ 복사 → electron-builder (Windows: NSIS)

# 자동 감지 비활성 버전은 엔진 번들이 불필요 — electron만 패키징해도 됨
npm run build && npx electron-builder
```

## 주요 동작

| 기능 | 방식 |
|---|---|
| 카운트형 퀘스트 | `targetCount` ≥ 2면 n/N 카운터(＋/−), target 도달 시 완료. 리셋 시 0으로 (#7) |
| 리셋 | 타이머 의존 없이 앱 시작/포커스/절전 복귀 시 day-boundary 비교 — 기본 일일 06:00 / 월요일 06:00 (#1) |
| 완료 정렬 | 체크리스트에서 완료 퀘스트는 섹션 하단으로 (#8) |

**자동 감지 관련 (현재 비활성 — `AUTO_DETECT_ENABLED` 참고):**

| 기능 | 방식 |
|---|---|
| 자동 감지 | 2.5초(설정 가능) 주기 캡처 → `TM_CCOEFF_NORMED` ≥ threshold(기본 0.85) 연속 2프레임 시 확정 |
| 중복 방지 | 단일 퀘스트는 해당 일/주에 1회만 전송(쿨다운), 카운트형은 팝업 소실 후 재등장 + 10초 간격 시 재발화 (#7) |
| 해상도 대응 | 템플릿 등록 시점 해상도 저장 → 다르면 자동 리사이즈 매칭 |
| 통신 | Python이 WS 서버, Electron이 클라이언트. 5초 하트비트, 15초 미수신 시 재접속(백오프 1→10s) |
| 엔진 생존 | 죽으면 3초 후 재시작, 연속 5회 실패 시 중단 + UI 에러 배지, 종료 시 SIGTERM 정리 |

## 퀘스트 카탈로그 (Firebase)

일일/주간 퀘스트 목록을 Firestore에서 가져와 **모든 캐릭터에 자동 반영**할 수 있다 (#4).

1. Firebase 콘솔에서 프로젝트 생성 → Firestore Database 활성화
2. `quests` 컬렉션에 문서 추가 — 필드:
   ```
   name:        "일일 던전"        (string, 필수)
   period:      "daily" | "weekly" (string, 기본 daily)
   order:       1                  (number, 표시 순서 — 선택)
   targetCount: 5                  (number, 완료 필요 횟수 — 선택, 기본 1)
   category:    "전투"             (string, "전투"|"물물교환"|"알바" — 선택)
   ```
3. 공개 읽기 규칙 설정:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /quests/{doc} { allow read: if true; allow write: if false; }
     }
   }
   ```
4. 앱 ⚙ 설정 → "퀘스트 카탈로그(Firebase)"에 **프로젝트 ID** 입력 → 동기화

앱 시작 시에도 자동 동기화된다. 카탈로그 퀘스트(☁)는 삭제해도 다음 동기화 때 다시 추가되며,
카탈로그에서 빠진 항목은 삭제하지 않는다 (수동 추가 퀘스트 보존).

## Git 워크플로

gitflow — `master`(릴리스) / `develop`(통합) / `feature/*`(기능 단위, `--no-ff` 머지)
