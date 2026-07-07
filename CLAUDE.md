# 게임 숙제 체크 오버레이 대시보드

다중 캐릭터 육성 유저를 위한 일일/주간 숙제 체크 오버레이.
Python 화면 캡처(자동 감지) + Electron UI(수동 체크) 하이브리드 구조.

전체 명세는 `HOMEWORK_DASHBOARD_BRIEF.md` 참고 — 통신 프로토콜, 스키마, 리셋 로직 등 구현 세부사항은 반드시 명세서 스펙을 따를 것.

## 절대 제약 (명세서 §9)

- 게임 프로세스 메모리 읽기/후킹 코드 절대 금지
- 마우스/키보드 입력 자동화(PyAutoGUI 등) 절대 금지
- 오직 화면 캡처(읽기 전용) + 이미지 매칭만 사용

## 구조

- `electron-app/` — Electron UI (electron-vite, React, TypeScript, zustand, electron-store)
- `python-engine/` — 캡처 엔진 (mss, opencv-python, websockets). WebSocket **서버** `ws://127.0.0.1:47231`
- `shared/schema.json` — 공용 메시지/데이터 JSON Schema

통신 방향: Python이 WS 서버, Electron main이 클라이언트 (역방향 금지 — 명세서 §2).

## 명령어

```bash
# Electron 개발
cd electron-app && npm install && npm run dev

# Electron 타입체크/빌드
cd electron-app && npm run typecheck && npm run build

# Python 엔진 (개발)
cd python-engine && pip3 install -r requirements.txt && python3 main.py

# Python 테스트
cd python-engine && python3 -m pytest

# 전체 배포 빌드 (python exe → 리소스 복사 → electron 빌드)
cd electron-app && npm run build:all
```

## Git 워크플로 (gitflow)

- `master` — 릴리스 전용
- `develop` — 통합 브랜치
- `feature/<이름>` — develop에서 분기, 완료 후 develop으로 머지
- 커밋 메시지는 한국어 또는 영어, 변경 단위를 작게 유지

## 개발/타겟 플랫폼

- 타겟: Windows 우선 (NSIS 인스톨러 + PyInstaller onefile)
- 개발 머신: macOS — mss 캡처는 화면 기록 권한 필요, 트레이/투명창 동작 일부 상이할 수 있음
