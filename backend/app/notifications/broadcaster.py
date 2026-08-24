import asyncio
import threading
from datetime import datetime, timezone
from typing import Any, Optional

# Simple cap against a single account opening unbounded WebSocket
# connections (no legitimate user needs more than a handful of tabs/devices
# open at once).
MAX_CONNECTIONS_PER_USER = 8


class NotificationBroadcaster:
    """Push events to connected /ws/notifications clients.

    Route handlers in this app are plain sync functions running in
    FastAPI's threadpool, while the WebSocket connections live on the
    server's asyncio event loop. publish() is the thread-safe entry point
    sync code calls; it hands the actual send off to the loop via
    run_coroutine_threadsafe.

    Every connection is bound to the company_id it authenticated for, and
    every publish() call is scoped to one company_id - events are only
    delivered to sockets belonging to that same tenant, never fanned out
    to every connected client regardless of company.
    """

    def __init__(self):
        # websocket -> {"company_id": int, "user_id": int | None}
        self._connections: dict = {}
        self._connections_lock = threading.Lock()
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop):
        self._loop = loop

    async def connect(self, websocket, company_id: int, user_id=None) -> bool:
        """Returns False (without accepting the connection) if this user
        already holds MAX_CONNECTIONS_PER_USER open sockets."""
        with self._connections_lock:
            if user_id is not None:
                existing = sum(
                    1 for meta in self._connections.values() if meta.get("user_id") == user_id
                )
                if existing >= MAX_CONNECTIONS_PER_USER:
                    return False
        await websocket.accept()
        self.bind_loop(asyncio.get_running_loop())
        with self._connections_lock:
            self._connections[websocket] = {"company_id": company_id, "user_id": user_id}
        return True

    async def disconnect(self, websocket):
        with self._connections_lock:
            self._connections.pop(websocket, None)

    async def _broadcast_async(self, event: dict, company_id: int):
        with self._connections_lock:
            targets = [
                ws for ws, meta in self._connections.items()
                if meta.get("company_id") == company_id
            ]
        for connection in targets:
            try:
                await connection.send_json(event)
            except Exception:
                await self.disconnect(connection)

    def publish(self, event_type: str, company_id: int, **payload: Any):
        if not self._loop:
            return
        event = {
            "type": event_type,
            "at": datetime.now(timezone.utc).isoformat(),
            **payload,
        }
        try:
            asyncio.run_coroutine_threadsafe(self._broadcast_async(event, company_id), self._loop)
        except RuntimeError:
            # Event loop already shut down (e.g. during test teardown).
            pass


broadcaster = NotificationBroadcaster()
