"""OpenCV 템플릿 매칭 + 오탐/중복 방지 로직.

명세서 §4:
- cv2.matchTemplate + TM_CCOEFF_NORMED, threshold 기본 0.85 (템플릿별 오버라이드 가능)
- 쿨다운: 같은 (character, task)는 해당 일/주 동안 재전송 금지
- 오탐 방지: 연속 2프레임 이상 threshold 통과해야 확정
- 해상도 대응: 템플릿 메타의 등록 시점 해상도와 현재 해상도가 다르면 리사이즈 매칭
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

from config import EngineConfig

log = logging.getLogger(__name__)

CONSECUTIVE_FRAMES_REQUIRED = 2


@dataclass
class Detection:
    character: str
    task: str
    confidence: float
    timestamp: int


@dataclass
class Template:
    character: str
    task: str
    image: np.ndarray  # grayscale
    period: str = "daily"  # daily | weekly
    threshold: Optional[float] = None  # None이면 전역값
    # 등록 시점 화면 해상도 (해상도 변경 감지용). 없으면 리사이즈 시도 안 함
    screen_width: Optional[int] = None
    screen_height: Optional[int] = None
    # 현재 해상도에 맞춰 리사이즈된 캐시 (해상도가 메타와 다를 때만 사용)
    _scaled_cache: Optional[np.ndarray] = field(default=None, repr=False)
    _scaled_for: Optional[tuple[int, int]] = field(default=None, repr=False)

    def image_for_screen(self, screen_size: Optional[tuple[int, int]]) -> np.ndarray:
        """현재 화면 해상도에 맞는 템플릿 이미지를 반환 (필요 시 리사이즈 캐시)."""
        if (
            screen_size is None
            or self.screen_width is None
            or self.screen_height is None
            or (self.screen_width, self.screen_height) == screen_size
        ):
            return self.image

        if self._scaled_for != screen_size:
            scale_x = screen_size[0] / self.screen_width
            scale_y = screen_size[1] / self.screen_height
            new_w = max(1, round(self.image.shape[1] * scale_x))
            new_h = max(1, round(self.image.shape[0] * scale_y))
            self._scaled_cache = cv2.resize(
                self.image, (new_w, new_h), interpolation=cv2.INTER_AREA
            )
            self._scaled_for = screen_size
            log.warning(
                "[%s/%s] 등록 해상도(%dx%d) ≠ 현재 해상도(%dx%d) — 리사이즈 매칭 시도. "
                "매칭이 계속 실패하면 템플릿 재등록 필요",
                self.character,
                self.task,
                self.screen_width,
                self.screen_height,
                screen_size[0],
                screen_size[1],
            )
        assert self._scaled_cache is not None
        return self._scaled_cache


def load_templates(templates_dir: Path) -> list[Template]:
    """templates/<character_id>/<task_id>.png (+ <task_id>.json 메타) 구조를 스캔한다."""
    templates: list[Template] = []
    if not templates_dir.is_dir():
        log.info("템플릿 디렉토리 없음: %s", templates_dir)
        return templates

    for char_dir in sorted(p for p in templates_dir.iterdir() if p.is_dir()):
        for png in sorted(char_dir.glob("*.png")):
            image = cv2.imread(str(png), cv2.IMREAD_GRAYSCALE)
            if image is None:
                log.error("템플릿 로드 실패 (손상?): %s", png)
                continue

            tpl = Template(character=char_dir.name, task=png.stem, image=image)
            meta_path = png.with_suffix(".json")
            if meta_path.exists():
                try:
                    meta = json.loads(meta_path.read_text(encoding="utf-8"))
                    tpl.period = meta.get("period", "daily")
                    tpl.threshold = meta.get("threshold")
                    screen = meta.get("screen") or {}
                    tpl.screen_width = screen.get("width")
                    tpl.screen_height = screen.get("height")
                except (json.JSONDecodeError, OSError) as e:
                    log.error("템플릿 메타 파싱 실패(%s): %s", meta_path, e)
            templates.append(tpl)

    log.info("템플릿 %d개 로드 완료 (%s)", len(templates), templates_dir)
    return templates


def period_key(period: str, now: float, daily_reset_hour: int, weekly_reset_day: int) -> str:
    """쿨다운 기준이 되는 '게임 기준 하루/한 주'의 식별자.

    리셋 시각(예: 새벽 6시)을 하루의 경계로 취급하기 위해 시각을 reset hour만큼
    뒤로 민 뒤 날짜를 계산한다. 주간은 weekly_reset_day(0=일요일)를 주의 시작으로 본다.
    """
    shifted = datetime.fromtimestamp(now) - timedelta(hours=daily_reset_hour)
    day = shifted.date()
    if period == "weekly":
        # python weekday(): 월=0..일=6 → 일=0..토=6 규약으로 변환
        sunday0 = (day.weekday() + 1) % 7
        days_since_reset = (sunday0 - weekly_reset_day) % 7
        week_start = day - timedelta(days=days_since_reset)
        return f"W{week_start.isoformat()}"
    return day.isoformat()


class TemplateMatcher:
    """프레임을 받아 확정 감지 이벤트를 돌려주는 상태 기계."""

    def __init__(self, config: EngineConfig) -> None:
        self.config = config
        self.templates = load_templates(config.templates_dir)
        self.active_character: Optional[str] = None
        # (character, task) → 연속 threshold 통과 프레임 수
        self._consecutive_hits: dict[tuple[str, str], int] = {}
        # (character, task) → 마지막 전송된 period key (쿨다운)
        self._sent_period: dict[tuple[str, str], str] = {}

    def reload(self, config: EngineConfig) -> None:
        """reload_config 수신 시: 설정 + 템플릿 다시 로드. 쿨다운 상태는 유지."""
        self.config = config
        self.templates = load_templates(config.templates_dir)
        self._consecutive_hits.clear()

    def set_active_character(self, character: Optional[str]) -> None:
        """active_character 메시지 수신 시 매칭 대상을 좁힌다 (선택 사항)."""
        self.active_character = character

    def process_frame(
        self,
        frame_bgr: np.ndarray,
        screen_size: Optional[tuple[int, int]] = None,
        now: Optional[float] = None,
    ) -> list[Detection]:
        """한 프레임을 매칭하고, '확정된' 감지 목록을 반환한다."""
        now = time.time() if now is None else now
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        detections: list[Detection] = []

        for tpl in self.templates:
            key = (tpl.character, tpl.task)

            if self.active_character is not None and tpl.character != self.active_character:
                continue

            # 쿨다운: 이번 일/주에 이미 보낸 조합은 스킵
            pkey = period_key(
                tpl.period, now, self.config.daily_reset_hour, self.config.weekly_reset_day
            )
            if self._sent_period.get(key) == pkey:
                continue

            image = tpl.image_for_screen(screen_size)
            if image.shape[0] > gray.shape[0] or image.shape[1] > gray.shape[1]:
                # 템플릿이 캡처 리전보다 큼 — 매칭 불가능
                log.debug("[%s/%s] 템플릿이 캡처 영역보다 큼 — 스킵", *key)
                continue

            result = cv2.matchTemplate(gray, image, cv2.TM_CCOEFF_NORMED)
            confidence = float(result.max())
            threshold = tpl.threshold if tpl.threshold is not None else self.config.match_threshold

            if confidence >= threshold:
                hits = self._consecutive_hits.get(key, 0) + 1
                self._consecutive_hits[key] = hits
                if hits >= CONSECUTIVE_FRAMES_REQUIRED:
                    # 확정 이벤트 — 쿨다운 등록 후 전송
                    self._sent_period[key] = pkey
                    self._consecutive_hits[key] = 0
                    detections.append(
                        Detection(
                            character=tpl.character,
                            task=tpl.task,
                            confidence=round(confidence, 4),
                            timestamp=int(now),
                        )
                    )
            else:
                # 연속성 끊김 — 일시적 화면 전환/애니메이션 오탐 방지
                self._consecutive_hits[key] = 0

        return detections
