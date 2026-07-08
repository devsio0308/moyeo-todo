"""matcher.py 검증 — 합성 이미지로 매칭/2프레임 확정/쿨다운/해상도 리사이즈 테스트."""

import json
import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from config import EngineConfig  # noqa: E402
from matcher import TemplateMatcher, load_templates, period_key  # noqa: E402

RNG = np.random.default_rng(42)


def make_template(size=(40, 60)) -> np.ndarray:
    """식별력 있는 패턴의 grayscale 템플릿 (체커보드 + 노이즈)."""
    h, w = size
    tpl = np.zeros((h, w), dtype=np.uint8)
    tpl[::4, :] = 255
    tpl[:, ::6] = 200
    tpl += RNG.integers(0, 40, (h, w), dtype=np.uint8)
    return tpl


def make_frame_with(tpl: np.ndarray, pos=(100, 150), frame_size=(400, 600)) -> np.ndarray:
    """노이즈 배경 프레임(BGR)에 템플릿을 합성."""
    h, w = frame_size
    frame_gray = RNG.integers(0, 255, (h, w), dtype=np.uint8)
    y, x = pos
    frame_gray[y : y + tpl.shape[0], x : x + tpl.shape[1]] = tpl
    return cv2.cvtColor(frame_gray, cv2.COLOR_GRAY2BGR)


def make_noise_frame(frame_size=(400, 600)) -> np.ndarray:
    return cv2.cvtColor(
        RNG.integers(0, 255, frame_size, dtype=np.uint8), cv2.COLOR_GRAY2BGR
    )


@pytest.fixture
def workspace(tmp_path: Path):
    """템플릿 1개(character_01/daily_dungeon)를 가진 매처 환경."""
    tpl = make_template()
    tpl_dir = tmp_path / "templates" / "character_01"
    tpl_dir.mkdir(parents=True)
    cv2.imwrite(str(tpl_dir / "daily_dungeon.png"), tpl)
    (tpl_dir / "daily_dungeon.json").write_text(
        json.dumps({"period": "daily", "screen": {"width": 600, "height": 400}})
    )
    config = EngineConfig(templates_dir=tmp_path / "templates")
    return TemplateMatcher(config), tpl


NOW = 1_720_000_000.0  # 고정 기준 시각


class TestMatching:
    def test_template_visible_two_frames_fires_once(self, workspace):
        matcher, tpl = workspace
        frame = make_frame_with(tpl)
        screen = (600, 400)

        # 1프레임: threshold 통과해도 아직 미확정 (오탐 방지)
        assert matcher.process_frame(frame, screen, now=NOW) == []
        # 2프레임 연속: 확정 이벤트
        detections = matcher.process_frame(frame, screen, now=NOW + 2.5)
        assert len(detections) == 1
        det = detections[0]
        assert det.character == "character_01"
        assert det.task == "daily_dungeon"
        assert det.confidence >= 0.85

    def test_no_template_no_detection(self, workspace):
        matcher, _ = workspace
        frame = make_noise_frame()
        for i in range(4):
            assert matcher.process_frame(frame, (600, 400), now=NOW + i) == []

    def test_interrupted_streak_does_not_fire(self, workspace):
        """1프레임 매칭 → 노이즈 → 다시 1프레임: 연속 2회가 아니므로 미발화."""
        matcher, tpl = workspace
        hit = make_frame_with(tpl)
        miss = make_noise_frame()
        screen = (600, 400)
        assert matcher.process_frame(hit, screen, now=NOW) == []
        assert matcher.process_frame(miss, screen, now=NOW + 1) == []
        assert matcher.process_frame(hit, screen, now=NOW + 2) == []
        # 여기서 두 번째 연속 hit이면 발화
        assert len(matcher.process_frame(hit, screen, now=NOW + 3)) == 1


class TestCooldown:
    def test_same_day_not_resent(self, workspace):
        matcher, tpl = workspace
        frame = make_frame_with(tpl)
        screen = (600, 400)
        matcher.process_frame(frame, screen, now=NOW)
        assert len(matcher.process_frame(frame, screen, now=NOW + 1)) == 1
        # 같은 날 계속 떠 있어도 재전송 없음
        for i in range(2, 6):
            assert matcher.process_frame(frame, screen, now=NOW + i) == []

    def test_next_day_resends(self, workspace):
        matcher, tpl = workspace
        frame = make_frame_with(tpl)
        screen = (600, 400)
        matcher.process_frame(frame, screen, now=NOW)
        assert len(matcher.process_frame(frame, screen, now=NOW + 1)) == 1
        # 다음 날(+24h)에는 쿨다운 해제 → 다시 2연속 후 발화
        day = 86400
        assert matcher.process_frame(frame, screen, now=NOW + day) == []
        assert len(matcher.process_frame(frame, screen, now=NOW + day + 1)) == 1


class TestActiveCharacter:
    def test_other_character_skipped(self, workspace):
        matcher, tpl = workspace
        frame = make_frame_with(tpl)
        matcher.set_active_character("character_99")
        for i in range(3):
            assert matcher.process_frame(frame, (600, 400), now=NOW + i) == []
        # 다시 해제하면 감지됨
        matcher.set_active_character(None)
        matcher.process_frame(frame, (600, 400), now=NOW + 10)
        assert len(matcher.process_frame(frame, (600, 400), now=NOW + 11)) == 1


class TestResolutionScaling:
    def test_scaled_screen_still_matches(self, workspace):
        """등록 해상도 600x400, 현재 화면 1200x800(2배) — 템플릿 자동 리사이즈로 매칭."""
        matcher, tpl = workspace
        big_tpl = cv2.resize(tpl, (tpl.shape[1] * 2, tpl.shape[0] * 2))
        frame = make_frame_with(big_tpl, pos=(200, 300), frame_size=(800, 1200))
        screen = (1200, 800)
        matcher.process_frame(frame, screen, now=NOW)
        detections = matcher.process_frame(frame, screen, now=NOW + 1)
        assert len(detections) == 1
        assert detections[0].confidence >= 0.8

    def test_template_larger_than_frame_skipped(self, workspace):
        matcher, tpl = workspace
        tiny = make_noise_frame(frame_size=(20, 20))
        # 크래시 없이 빈 결과
        assert matcher.process_frame(tiny, (600, 400), now=NOW) == []


class TestRepeatable:
    """카운트형 퀘스트(#7) — repeatable 템플릿은 소실 후 재등장 시 다시 발화."""

    @pytest.fixture
    def repeat_workspace(self, tmp_path):
        tpl = make_template()
        tpl_dir = tmp_path / "templates" / "character_01"
        tpl_dir.mkdir(parents=True)
        cv2.imwrite(str(tpl_dir / "weekly_dungeon.png"), tpl)
        (tpl_dir / "weekly_dungeon.json").write_text(
            json.dumps(
                {
                    "period": "weekly",
                    "repeatable": True,
                    "screen": {"width": 600, "height": 400},
                }
            )
        )
        config = EngineConfig(templates_dir=tmp_path / "templates")
        return TemplateMatcher(config), tpl

    def test_refires_after_disappear(self, repeat_workspace):
        matcher, tpl = repeat_workspace
        hit = make_frame_with(tpl)
        miss = make_noise_frame()
        screen = (600, 400)

        # 1차 발화 (2연속)
        assert matcher.process_frame(hit, screen, now=NOW) == []
        assert len(matcher.process_frame(hit, screen, now=NOW + 1)) == 1
        # 팝업이 계속 떠 있는 동안은 재발화 없음
        assert matcher.process_frame(hit, screen, now=NOW + 2) == []
        assert matcher.process_frame(hit, screen, now=NOW + 3) == []
        # 소실 → 재등장 (+ 최소 간격 경과) → 2차 발화
        assert matcher.process_frame(miss, screen, now=NOW + 20) == []
        assert matcher.process_frame(hit, screen, now=NOW + 22) == []
        assert len(matcher.process_frame(hit, screen, now=NOW + 24)) == 1

    def test_min_interval_blocks_rapid_refire(self, repeat_workspace):
        matcher, tpl = repeat_workspace
        hit = make_frame_with(tpl)
        miss = make_noise_frame()
        screen = (600, 400)

        matcher.process_frame(hit, screen, now=NOW)
        assert len(matcher.process_frame(hit, screen, now=NOW + 1)) == 1
        # 곧바로 소실→재등장해도 최소 간격(10초) 내에는 발화하지 않음
        matcher.process_frame(miss, screen, now=NOW + 2)
        matcher.process_frame(hit, screen, now=NOW + 3)
        assert matcher.process_frame(hit, screen, now=NOW + 4) == []
        # 간격 경과 후에는 발화
        matcher.process_frame(miss, screen, now=NOW + 5)
        matcher.process_frame(hit, screen, now=NOW + 12)
        assert len(matcher.process_frame(hit, screen, now=NOW + 13)) == 1

    def test_same_period_multiple_fires(self, repeat_workspace):
        """단일 퀘스트와 달리 같은 주에 여러 번 발화 가능해야 한다."""
        matcher, tpl = repeat_workspace
        hit = make_frame_with(tpl)
        miss = make_noise_frame()
        screen = (600, 400)

        fired = 0
        t = NOW
        for _ in range(3):
            matcher.process_frame(hit, screen, now=t)
            fired += len(matcher.process_frame(hit, screen, now=t + 1))
            matcher.process_frame(miss, screen, now=t + 2)
            t += 30  # 최소 간격 초과
        assert fired == 3


class TestPeriodKey:
    def test_daily_boundary_respects_reset_hour(self):
        # 리셋 시각 6시: 새벽 5시는 '전날', 7시는 '당일'
        from datetime import datetime

        five_am = datetime(2026, 7, 7, 5, 0).timestamp()
        seven_am = datetime(2026, 7, 7, 7, 0).timestamp()
        assert period_key("daily", five_am, 6, 4) == "2026-07-06"
        assert period_key("daily", seven_am, 6, 4) == "2026-07-07"

    def test_weekly_key_starts_on_reset_day(self):
        from datetime import datetime

        # 2026-07-07은 화요일. 주간 리셋 목요일(4) → 이번 주 시작은 지난 목요일 7/2
        tue = datetime(2026, 7, 7, 12, 0).timestamp()
        assert period_key("weekly", tue, 0, 4) == "W2026-07-02"
        # 목요일 당일부터는 새 주
        thu = datetime(2026, 7, 9, 12, 0).timestamp()
        assert period_key("weekly", thu, 0, 4) == "W2026-07-09"

    def test_weekly_sunday_reset(self):
        from datetime import datetime

        tue = datetime(2026, 7, 7, 12, 0).timestamp()
        # 일요일(0) 리셋 → 이번 주 시작은 7/5(일)
        assert period_key("weekly", tue, 0, 0) == "W2026-07-05"


class TestLoadTemplates:
    def test_missing_dir_returns_empty(self, tmp_path):
        assert load_templates(tmp_path / "nope") == []

    def test_corrupt_png_skipped(self, tmp_path):
        d = tmp_path / "templates" / "character_01"
        d.mkdir(parents=True)
        (d / "broken.png").write_bytes(b"not a png")
        assert load_templates(tmp_path / "templates") == []

    def test_meta_loaded(self, workspace):
        matcher, _ = workspace
        tpl = matcher.templates[0]
        assert tpl.period == "daily"
        assert tpl.screen_width == 600
        assert tpl.screen_height == 400
