"""캡처 엔진 진입점.

3단계(현재): 단독 실행 — 캡처 → 매칭 → 콘솔 JSON 로그.
4단계에서 ws_server가 이 루프를 감싸 Electron으로 이벤트를 전송한다.

사용법:
    python3 main.py --config /path/to/engine-config.json
    python3 main.py --once   # 한 프레임만 캡처/매칭하고 종료 (디버그)
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path
from typing import Optional

from config import EngineConfig
from matcher import TemplateMatcher

log = logging.getLogger("engine")


class CaptureEngine:
    """캡처 루프 한 사이클을 실행하는 오케스트레이터 (ws_server에서도 재사용)."""

    def __init__(self, config_path: Optional[Path]) -> None:
        self.config_path = config_path
        self.config = EngineConfig.load(config_path)
        self.matcher = TemplateMatcher(self.config)
        self.paused = False
        self._capture = None  # 첫 poll에서 지연 초기화 (스레드 바인딩 때문)

    def reload_config(self) -> None:
        self.config = EngineConfig.load(self.config_path)
        self.matcher.reload(self.config)
        log.info(
            "설정 리로드: interval=%.1fs threshold=%.2f region=%s",
            self.config.capture_interval_sec,
            self.config.match_threshold,
            self.config.capture_region,
        )

    def _ensure_capture(self):
        if self._capture is None:
            from capture import ScreenCapture

            self._capture = ScreenCapture()
        return self._capture

    def poll(self):
        """한 프레임 캡처/매칭. 확정 Detection 목록 반환."""
        if self.paused:
            return []
        capture = self._ensure_capture()
        frame = capture.grab(self.config.capture_region)
        return self.matcher.process_frame(frame, screen_size=capture.screen_size)

    def screenshot(self) -> tuple[str, int, int]:
        """전체 화면을 PNG(base64)로 반환 — 리전 지정/템플릿 등록 UI용.

        매칭과 동일한 mss 픽셀 공간이므로, 여기서 크롭한 좌표/이미지를
        그대로 captureRegion/템플릿으로 쓰면 DPI 불일치가 생기지 않는다.
        """
        import base64

        import cv2

        capture = self._ensure_capture()
        frame = capture.grab(None)
        ok, buf = cv2.imencode(".png", frame)
        if not ok:
            raise RuntimeError("PNG 인코딩 실패")
        return base64.b64encode(buf.tobytes()).decode(), frame.shape[1], frame.shape[0]

    def close(self) -> None:
        if self._capture is not None:
            self._capture.close()


def run_standalone(engine: CaptureEngine, once: bool) -> None:
    """WebSocket 없이 콘솔 로그로만 감지 결과 출력 (명세서 §8-3)."""
    log.info(
        "단독 모드 시작 — interval=%.1fs, 템플릿 %d개",
        engine.config.capture_interval_sec,
        len(engine.matcher.templates),
    )
    try:
        while True:
            started = time.monotonic()
            for det in engine.poll():
                print(
                    json.dumps(
                        {
                            "type": "task_detected",
                            "character": det.character,
                            "task": det.task,
                            "confidence": det.confidence,
                            "timestamp": det.timestamp,
                        },
                        ensure_ascii=False,
                    ),
                    flush=True,
                )
            if once:
                break
            elapsed = time.monotonic() - started
            time.sleep(max(0.1, engine.config.capture_interval_sec - elapsed))
    except KeyboardInterrupt:
        log.info("종료 (KeyboardInterrupt)")
    finally:
        engine.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="숙제 대시보드 캡처 엔진")
    parser.add_argument("--config", type=Path, default=None, help="engine-config.json 경로")
    parser.add_argument("--once", action="store_true", help="한 프레임만 처리하고 종료")
    parser.add_argument(
        "--standalone", action="store_true", help="WebSocket 서버 없이 콘솔 로그만"
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        stream=sys.stderr,
    )

    engine = CaptureEngine(args.config)

    if args.standalone or args.once:
        run_standalone(engine, once=args.once)
        return 0

    # 기본 모드: WebSocket 서버와 함께 실행
    try:
        from ws_server import run_server
    except ImportError:
        log.warning("ws_server 미구현 — 단독 모드로 대체 실행")
        run_standalone(engine, once=False)
        return 0

    run_server(engine)
    return 0


if __name__ == "__main__":
    sys.exit(main())
