"""mss 기반 화면 캡처 (읽기 전용 — 게임 프로세스에 일절 손대지 않음).

좌표계 규약: 외부(설정/템플릿 메타)와 주고받는 모든 좌표는
'mss가 반환하는 이미지의 픽셀'(=물리 픽셀) 기준이다.
macOS Retina처럼 mss의 grab box(논리 좌표)와 이미지 픽셀(물리)이 다른 환경에서는
내부에서 비율을 계산해 변환한다. (Windows는 보통 비율 1)
"""

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
        mon = self._sct.monitors[1]  # 0은 전체 가상 데스크톱, 1이 주 모니터
        # 논리 좌표(grab box) ↔ 물리 픽셀(이미지) 비율 측정
        probe = self._sct.grab(mon)
        self._ratio = probe.width / mon["width"]
        self._physical_size = (int(probe.width), int(probe.height))

    @property
    def screen_size(self) -> Tuple[int, int]:
        """주 모니터의 (width, height) — 물리 픽셀(mss 이미지) 기준."""
        return self._physical_size

    def grab(self, region: Optional[CaptureRegion] = None) -> np.ndarray:
        """리전(물리 픽셀 좌표, 없으면 주 모니터 전체)을 BGR 배열로 반환."""
        if region is not None:
            r = self._ratio
            box = {
                "left": round(region.left / r),
                "top": round(region.top / r),
                "width": max(1, round(region.width / r)),
                "height": max(1, round(region.height / r)),
            }
        else:
            box = self._sct.monitors[1]
        shot = self._sct.grab(box)
        frame = np.asarray(shot, dtype=np.uint8)  # BGRA
        return frame[:, :, :3]  # BGR

    def close(self) -> None:
        self._sct.close()
