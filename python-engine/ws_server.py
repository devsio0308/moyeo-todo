"""websockets 서버 — Electron main process가 클라이언트로 접속한다 (명세서 §2).

Python이 서버인 이유: Electron 재시작 시 재연결 로직이 단순해짐.
- 캡처 루프: 전용 1-스레드 executor에서 poll (mss가 스레드에 바인딩되므로 스레드 고정 필수)
- 하트비트: 5초 간격 브로드캐스트
- 수신: active_character / reload_config / set_paused
"""

from __future__ import annotations

import asyncio
import json
import logging
import signal
import time
from concurrent.futures import ThreadPoolExecutor
from typing import TYPE_CHECKING, Any

from websockets.asyncio.server import serve

if TYPE_CHECKING:
    from main import CaptureEngine

log = logging.getLogger("ws_server")

WS_HOST = "127.0.0.1"
WS_PORT = 47231
HEARTBEAT_INTERVAL_SEC = 5.0


class EngineServer:
    def __init__(self, engine: "CaptureEngine", port: int = WS_PORT) -> None:
        self.engine = engine
        self.port = port
        self.connections: set[Any] = set()
        # mss는 생성된 스레드에서만 동작 → poll은 항상 같은 스레드에서 실행
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="capture")

    # ── 연결/수신 ────────────────────────────────────────────

    async def handler(self, websocket: Any) -> None:
        peer = getattr(websocket, "remote_address", "?")
        self.connections.add(websocket)
        log.info("클라이언트 접속: %s (총 %d)", peer, len(self.connections))
        try:
            # 접속 즉시 하트비트 1회 — 클라이언트 워치독이 바로 살아있음을 확인
            await websocket.send(
                json.dumps({"type": "heartbeat", "timestamp": int(time.time())})
            )
            async for raw in websocket:
                await self._handle_message(websocket, raw)
        except Exception as e:  # 연결 예외로 서버가 죽으면 안 됨
            log.debug("연결 종료(%s): %s", peer, e)
        finally:
            self.connections.discard(websocket)
            log.info("클라이언트 해제: %s (총 %d)", peer, len(self.connections))

    async def _handle_message(self, websocket: Any, raw: str | bytes) -> None:
        try:
            msg = json.loads(raw)
        except (json.JSONDecodeError, UnicodeDecodeError):
            log.warning("잘못된 메시지 무시: %.100r", raw)
            return

        msg_type = msg.get("type")
        if msg_type == "active_character":
            self.engine.matcher.set_active_character(msg.get("character"))
            log.info("활성 캐릭터: %s", msg.get("character"))
        elif msg_type == "reload_config":
            self.engine.reload_config()
        elif msg_type == "set_paused":
            self.engine.paused = bool(msg.get("paused"))
            log.info("캡처 %s", "일시정지" if self.engine.paused else "재개")
        elif msg_type == "capture_screenshot":
            # 리전 지정/템플릿 등록 UI용 전체 화면 스크린샷 (요청자에게만 응답)
            loop = asyncio.get_running_loop()
            try:
                image_b64, width, height = await loop.run_in_executor(
                    self._executor, self.engine.screenshot
                )
                response = {
                    "type": "screenshot",
                    "image": image_b64,
                    "width": width,
                    "height": height,
                }
            except Exception as e:
                log.error("스크린샷 실패: %s", e)
                response = {"type": "screenshot", "error": str(e)}
            await websocket.send(json.dumps(response))
        else:
            log.warning("알 수 없는 메시지 타입: %s", msg_type)

    # ── 송신 ─────────────────────────────────────────────────

    async def broadcast(self, obj: dict[str, Any]) -> None:
        if not self.connections:
            return
        payload = json.dumps(obj, ensure_ascii=False)
        for ws in list(self.connections):
            try:
                await ws.send(payload)
            except Exception:
                self.connections.discard(ws)

    # ── 루프 ─────────────────────────────────────────────────

    async def capture_loop(self) -> None:
        loop = asyncio.get_running_loop()
        while True:
            started = loop.time()
            try:
                detections = await loop.run_in_executor(self._executor, self.engine.poll)
            except Exception as e:
                # 캡처 실패(권한/모니터 변경 등)로 엔진이 죽지 않게 — 다음 주기에 재시도
                log.error("캡처/매칭 실패: %s", e)
                detections = []

            for det in detections:
                event = {
                    "type": "task_detected",
                    "character": det.character,
                    "task": det.task,
                    "confidence": det.confidence,
                    "timestamp": det.timestamp,
                }
                log.info("감지: %s", event)
                await self.broadcast(event)

            elapsed = loop.time() - started
            await asyncio.sleep(max(0.1, self.engine.config.capture_interval_sec - elapsed))

    async def heartbeat_loop(self) -> None:
        while True:
            await self.broadcast({"type": "heartbeat", "timestamp": int(time.time())})
            await asyncio.sleep(HEARTBEAT_INTERVAL_SEC)

    # ── 실행 ─────────────────────────────────────────────────

    async def run(self) -> None:
        stop = asyncio.Event()
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, stop.set)
            except NotImplementedError:
                pass  # Windows — Electron이 프로세스를 직접 종료함

        async with serve(self.handler, WS_HOST, self.port):
            log.info("WebSocket 서버 시작: ws://%s:%d", WS_HOST, self.port)
            tasks = [
                asyncio.create_task(self.capture_loop()),
                asyncio.create_task(self.heartbeat_loop()),
            ]
            try:
                await stop.wait()
            finally:
                for t in tasks:
                    t.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
                self._executor.shutdown(wait=False)
                self.engine.close()
                log.info("서버 종료")


def run_server(engine: "CaptureEngine", port: int = WS_PORT) -> None:
    asyncio.run(EngineServer(engine, port=port).run())
