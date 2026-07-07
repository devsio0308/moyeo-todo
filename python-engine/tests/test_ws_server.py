"""ws_server 통합 테스트 — 가짜 엔진으로 서버를 띄우고 실제 WS 클라이언트로 검증."""

import asyncio
import json
import sys
from pathlib import Path

import pytest
from websockets.asyncio.client import connect
from websockets.asyncio.server import serve

sys.path.insert(0, str(Path(__file__).parent.parent))

from config import EngineConfig  # noqa: E402
from matcher import Detection, TemplateMatcher  # noqa: E402
from ws_server import EngineServer  # noqa: E402

TEST_PORT = 47999


class FakeEngine:
    """실제 캡처 없이 큐에 넣은 감지를 돌려주는 엔진 대역."""

    def __init__(self):
        self.config = EngineConfig(capture_interval_sec=0.05)
        self.matcher = TemplateMatcher(self.config)
        self.paused = False
        self.reload_count = 0
        self.pending: list[Detection] = []

    def poll(self):
        if self.paused:
            return []
        out, self.pending = self.pending, []
        return out

    def reload_config(self):
        self.reload_count += 1

    def close(self):
        pass


async def _start(server: EngineServer):
    """테스트용: 시그널 핸들러 없이 서버+루프만 기동."""
    ws_server = await serve(server.handler, "127.0.0.1", server.port).__aenter__()
    tasks = [
        asyncio.create_task(server.capture_loop()),
        asyncio.create_task(server.heartbeat_loop()),
    ]

    async def teardown():
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        ws_server.close()
        await ws_server.wait_closed()

    return teardown


def test_heartbeat_and_detection():
    async def scenario():
        engine = FakeEngine()
        server = EngineServer(engine, port=TEST_PORT)
        teardown = await _start(server)
        try:
            async with connect(f"ws://127.0.0.1:{TEST_PORT}") as client:
                # 하트비트 수신 (5초 주기지만 첫 브로드캐스트는 즉시)
                msg = json.loads(await asyncio.wait_for(client.recv(), timeout=3))
                assert msg["type"] == "heartbeat"
                assert isinstance(msg["timestamp"], int)

                # 감지 이벤트 브로드캐스트
                engine.pending.append(
                    Detection(
                        character="character_01",
                        task="daily_dungeon",
                        confidence=0.91,
                        timestamp=1720000000,
                    )
                )
                while True:
                    msg = json.loads(await asyncio.wait_for(client.recv(), timeout=3))
                    if msg["type"] == "task_detected":
                        break
                assert msg == {
                    "type": "task_detected",
                    "character": "character_01",
                    "task": "daily_dungeon",
                    "confidence": 0.91,
                    "timestamp": 1720000000,
                }
        finally:
            await teardown()

    asyncio.run(scenario())


def test_client_messages_control_engine():
    async def scenario():
        engine = FakeEngine()
        server = EngineServer(engine, port=TEST_PORT + 1)
        teardown = await _start(server)
        try:
            async with connect(f"ws://127.0.0.1:{TEST_PORT + 1}") as client:
                await client.send(json.dumps({"type": "active_character", "character": "character_02"}))
                await client.send(json.dumps({"type": "set_paused", "paused": True}))
                await client.send(json.dumps({"type": "reload_config"}))
                await client.send("not json at all")  # 서버가 죽으면 안 됨
                await asyncio.sleep(0.3)

                assert engine.matcher.active_character == "character_02"
                assert engine.paused is True
                assert engine.reload_count == 1

                # 서버 생존 확인 — 여전히 하트비트가 온다
                msg = json.loads(await asyncio.wait_for(client.recv(), timeout=6))
                assert msg["type"] in ("heartbeat", "task_detected")
        finally:
            await teardown()

    asyncio.run(scenario())


def test_poll_exception_does_not_kill_loop():
    async def scenario():
        engine = FakeEngine()
        calls = {"n": 0}

        def flaky_poll():
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("capture failed")
            return []

        engine.poll = flaky_poll
        server = EngineServer(engine, port=TEST_PORT + 2)
        teardown = await _start(server)
        try:
            await asyncio.sleep(0.5)
            assert calls["n"] >= 2  # 첫 실패 후에도 계속 폴링
        finally:
            await teardown()

    asyncio.run(scenario())
