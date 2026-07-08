# 템플릿 디렉토리

숙제 완료 팝업의 템플릿 이미지를 캐릭터별로 저장한다.
실제 운영 시에는 Electron 설정 패널에서 등록하며, userData 쪽 경로가 사용된다
(`engine-config.json`의 `templatesDir`).

## 구조

```
templates/
├── character_01/
│   ├── daily_dungeon.png    # 템플릿 이미지 (grayscale 매칭)
│   ├── daily_dungeon.json   # 메타데이터
│   └── weekly_raid.png
└── character_02/
```

## 메타데이터 형식 (`<task_id>.json`)

```json
{
  "period": "daily",
  "threshold": null,
  "repeatable": false,
  "screen": { "width": 2560, "height": 1440 }
}
```

- `period`: `daily` | `weekly` — 쿨다운 주기 결정
- `threshold`: 개별 매칭 임계값 (null이면 전역 `matchThreshold` 사용)
- `repeatable`: 카운트형 퀘스트(#7) 여부 — true면 주기당 1회 쿨다운 대신
  '팝업 소실 후 재등장 + 최소 10초 간격' 조건으로 여러 번 발화
- `screen`: 등록 시점 화면 해상도 — 현재 해상도와 다르면 자동 리사이즈 매칭
