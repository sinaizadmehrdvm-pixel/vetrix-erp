import asyncio
import threading
from datetime import datetime, timezone
from typing import Any, Optional


class NotificationBroadcaster:
    """Push events to connected /ws/notifications clients.

    Route handlers in this app are plain sync functions running in
    FastAPI's threadpool, while the WebSocket connections live on the
    server's asyncio event loop. publish() is the thread-safe entry point
    sync code calls; it hands the actual send off to the loop via
    run_coroutine_threadsafe.
    """

    def __init__(self):
        self._connections: set = set()
        self._connections_lock = threading.Lock()
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop):
        self._loop = loop

    async def connect(self, websocket):
        await websocket.accept()
        self.bind_loop(asyncio.get_running_loop())
        with self._connections_lock:
            self._connections.add(websocket)

    async def disconnect(self, websocket):
        with self._connections_lock:
            self._connections.discard(websocket)

    async def _broadcast_async(self, event: dict):
        with self._connections_lock:
            connections = list(self._connections)
        for connection in connections:
            try:
                await connection.send_json(event)
            except Exception:
                await self.disconnect(connection)

    def publish(self, event_type: str, **payload: Any):
        if not self._loop:
            return
        event = {
            "type": event_type,
            "at": datetime.now(timezone.utc).isoformat(),
            **payload,
        }
        try:
            asyncio.run_coroutine_threadsafe(self._broadcast_async(event), self._loop)
        except RuntimeError:
            # Event loop already shut down (e.g. during test teardown).
            pass


broadcaster = NotificationBroadcaster()
