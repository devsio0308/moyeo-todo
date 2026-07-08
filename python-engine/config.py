"""엔진 설정 로드/리로드.

Electron이 userData에 engine-config.json을 써 주고, 경로를 CLI 인자로 전달한다.
reload_config 메시지를 받으면 같은 파일을 다시 읽는다 (명세서 §2).
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

log = logging.getLogger(__name__)

DEFAULT_CAPTURE_INTERVAL_SEC = 2.5
DEFAULT_MATCH_THRESHOLD = 0.85
DEFAULT_DAILY_RESET_HOUR = 6  # 매일 오전 6시 (#1)
DEFAULT_WEEKLY_RESET_DAY = 1  # 월요일 — 0=일요일 ... 6=토요일 (명세서 §5 스키마와 동일한 규약)


@dataclass
class CaptureRegion:
    left: int
    top: int
    width: int
    height: int

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "CaptureRegion":
        return cls(
            left=int(d["left"]),
            top=int(d["top"]),
            width=int(d["width"]),
            height=int(d["height"]),
        )


@dataclass
class EngineConfig:
    capture_interval_sec: float = DEFAULT_CAPTURE_INTERVAL_SEC
    match_threshold: float = DEFAULT_MATCH_THRESHOLD
    capture_region: Optional[CaptureRegion] = None
    templates_dir: Path = field(default_factory=lambda: Path(__file__).parent / "templates")
    daily_reset_hour: int = DEFAULT_DAILY_RESET_HOUR
    weekly_reset_day: int = DEFAULT_WEEKLY_RESET_DAY

    @classmethod
    def load(cls, path: Optional[Path]) -> "EngineConfig":
        """설정 파일을 읽는다. 없거나 깨졌으면 기본값으로 동작 (엔진이 죽지 않는 게 우선)."""
        cfg = cls()
        if path is None:
            return cfg
        try:
            data = json.loads(Path(path).read_text(encoding="utf-8"))
        except FileNotFoundError:
            log.warning("설정 파일 없음: %s — 기본값 사용", path)
            return cfg
        except (json.JSONDecodeError, OSError) as e:
            log.error("설정 파일 파싱 실패(%s): %s — 기본값 사용", path, e)
            return cfg

        cfg.capture_interval_sec = float(
            data.get("captureIntervalSec", DEFAULT_CAPTURE_INTERVAL_SEC)
        )
        cfg.match_threshold = float(data.get("matchThreshold", DEFAULT_MATCH_THRESHOLD))
        cfg.daily_reset_hour = int(data.get("dailyResetHour", DEFAULT_DAILY_RESET_HOUR))
        cfg.weekly_reset_day = int(data.get("weeklyResetDay", DEFAULT_WEEKLY_RESET_DAY))

        region = data.get("captureRegion")
        if region:
            try:
                cfg.capture_region = CaptureRegion.from_dict(region)
            except (KeyError, TypeError, ValueError) as e:
                log.error("captureRegion 형식 오류: %s — 전체 화면 캡처로 동작", e)

        templates_dir = data.get("templatesDir")
        if templates_dir:
            cfg.templates_dir = Path(templates_dir)

        return cfg
