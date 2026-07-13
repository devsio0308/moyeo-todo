# 게임 숙제 체크 오버레이 대시보드

다중 캐릭터 육성 유저를 위한 일일/주간 숙제 체크 오버레이 (Electron, 수동 체크).

전체 명세는 `HOMEWORK_DASHBOARD_BRIEF.md` 참고 — 스키마, 리셋 로직 등 구현 세부사항은 반드시 명세서 스펙을 따를 것.

## 구조

- `electron-app/` — Electron UI (electron-vite, React, TypeScript, zustand, electron-store)
- `shared/schema.json` — 공용 데이터 JSON Schema

## 명령어

```bash
# Electron 개발
cd electron-app && npm install && npm run dev

# Electron 타입체크/빌드
cd electron-app && npm run typecheck && npm run build

# 전체 배포 빌드 (electron-builder)
cd electron-app && npm run build:all
```

## Git 워크플로 (gitflow)

- `master` — 릴리스 전용
- `develop` — 통합 브랜치
- `feature/<이름>` — develop에서 분기, 완료 후 develop으로 머지
- 커밋 메시지는 한국어 또는 영어, 변경 단위를 작게 유지

## 개발/타겟 플랫폼

- 타겟: Windows 우선 (NSIS 인스톨러)
- 개발 머신: macOS — 트레이/투명창 동작 일부 상이할 수 있음
