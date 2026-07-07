"""mss 기반 화면 캡처 (읽기 전용 — 게임 프로세스에 일절 손대지 않음)."""

from __future__ import annotations

from typing import Optional, Tuple

import numpy as np

from config import CaptureRegion


class ScreenCapture:
    """주 모니터 또는 지정 리전을 BGR numpy 배열로 캡처한다.

    mss 인스턴스는 스레드에 묶이므로 캡처 루프와 같은 스레드에서만 사용할 것.
    """

    def __init__(self) -> None:
        import mss  # 지연 import — 테스트 환경(헤드리스)에서 모듈 로드만으로 죽지 않게

        self._sct = mss.mss()

    @property
    def screen_size(self) -> Tuple[int, int]:
        """주 모니터의 (width, height) — 물리 픽셀 기준."""
        mon = self._sct.monitors[1]  # 0은 전체 가상 데스크톱, 1이 주 모니터
        return int(mon["width"]), int(mon["height"])

    def grab(self, region: Optional[CaptureRegion] = None) -> np.ndarray:
        """리전(없으면 주 모니터 전체)을 BGR 배열로 반환."""
        if region is not None:
            box = {
                "left": region.left,
                "top": region.top,
                "width": region.width,
                "height": region.height,
            }
        else:
            box = self._sct.monitors[1]
        shot = self._sct.grab(box)
        frame = np.asarray(shot, dtype=np.uint8)  # BGRA
        return frame[:, :, :3]  # BGR

    def close(self) -> None:
        self._sct.close()
