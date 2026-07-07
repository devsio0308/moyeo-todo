"""config.py 검증 — 파일 없음/깨진 JSON/정상 로드."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from config import EngineConfig  # noqa: E402


def test_missing_file_uses_defaults(tmp_path):
    cfg = EngineConfig.load(tmp_path / "nope.json")
    assert cfg.capture_interval_sec == 2.5
    assert cfg.match_threshold == 0.85
    assert cfg.capture_region is None


def test_corrupt_json_uses_defaults(tmp_path):
    p = tmp_path / "engine-config.json"
    p.write_text("{invalid json", encoding="utf-8")
    cfg = EngineConfig.load(p)
    assert cfg.capture_interval_sec == 2.5


def test_full_config_loaded(tmp_path):
    p = tmp_path / "engine-config.json"
    p.write_text(
        """{
          "captureIntervalSec": 5.0,
          "matchThreshold": 0.9,
          "dailyResetHour": 6,
          "weeklyResetDay": 1,
          "captureRegion": {"left": 10, "top": 20, "width": 300, "height": 200},
          "templatesDir": "/tmp/tpls"
        }""",
        encoding="utf-8",
    )
    cfg = EngineConfig.load(p)
    assert cfg.capture_interval_sec == 5.0
    assert cfg.match_threshold == 0.9
    assert cfg.daily_reset_hour == 6
    assert cfg.weekly_reset_day == 1
    assert cfg.capture_region is not None
    assert cfg.capture_region.width == 300
    assert str(cfg.templates_dir) == "/tmp/tpls"


def test_invalid_region_ignored(tmp_path):
    p = tmp_path / "engine-config.json"
    p.write_text('{"captureRegion": {"left": "x"}}', encoding="utf-8")
    cfg = EngineConfig.load(p)
    assert cfg.capture_region is None
