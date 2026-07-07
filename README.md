# 📝 mobi-homework-helper

다중 캐릭터 육성 유저를 위한 **게임 숙제 체크 오버레이 대시보드**.

- **Electron 오버레이 UI** — 투명/항상 위 창에서 캐릭터별 일일·주간 숙제를 수동 체크
- **Python 캡처 엔진** — 화면을 주기적으로 캡처해 "숙제 완료 팝업"을 템플릿 매칭으로 자동 감지 (🤖)
- 게임 프로세스에는 일절 손대지 않음: **화면 캡처(읽기 전용) + 이미지 매칭만** 사용. 입력 자동화 없음.

상세 명세: [HOMEWORK_DASHBOARD_BRIEF.md](./HOMEWORK_DASHBOARD_BRIEF.md)

## 구조

```
electron-app/     # Electron UI (electron-vite + React + TS + zustand + electron-store)
python-engine/    # 캡처 엔진 (mss + OpenCV + websockets) — WS 서버 ws://127.0.0.1:47231
shared/           # 공용 JSON Schema (스토어/WS 메시지)
```

## 개발 환경

```bash
# Python 엔진
cd python-engine
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest            # 테스트

# Electron 앱 (dev 모드가 .venv의 엔진을 자동 스폰)
cd electron-app
npm install
npm run dev

npm run typecheck && npm test         # 타입체크 + 리셋 로직 테스트
```

macOS에서 개발 시 화면 기록 권한이 필요하다 (mss).

## 배포 빌드

```bash
cd electron-app
npm run build:all
# = PyInstaller로 capture-engine 빌드 → resources/engine/ 복사 → electron-builder (Windows: NSIS)
```

## 주요 동작

| 기능 | 방식 |
|---|---|
| 자동 감지 | 2.5초(설정 가능) 주기 캡처 → `TM_CCOEFF_NORMED` ≥ threshold(기본 0.85) 연속 2프레임 시 확정 |
| 중복 방지 | (캐릭터, 숙제) 조합은 해당 일/주에 1회만 전송 (쿨다운) |
| 해상도 대응 | 템플릿 등록 시점 해상도 저장 → 다르면 자동 리사이즈 매칭 |
| 통신 | Python이 WS 서버, Electron이 클라이언트. 5초 하트비트, 15초 미수신 시 재접속(백오프 1→10s) |
| 엔진 생존 | 죽으면 3초 후 재시작, 연속 5회 실패 시 중단 + UI 에러 배지, 종료 시 SIGTERM 정리 |
| 리셋 | 타이머 의존 없이 앱 시작/포커스/절전 복귀 시 day-boundary 비교 (일일 시각·주간 요일 설정 가능) |

## Git 워크플로

gitflow — `master`(릴리스) / `develop`(통합) / `feature/*`(기능 단위, `--no-ff` 머지)
