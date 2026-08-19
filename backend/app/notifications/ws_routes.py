import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jwt import PyJWTError
from starlette.concurrency import run_in_threadpool

from app.auth import decode_access_token
from app.company_scope import company_id_from_auth
from app.database import SessionLocal
from app.models.user import User
from app.notifications.broadcaster import broadcaster

router = APIRouter()
_logger = logging.getLogger(__name__)

# How often a long-lived connection's token is re-checked for expiry/
# revocation - without this, a token that expires or is revoked mid-
# connection stayed "authenticated" for the rest of the socket's life.
TOKEN_RECHECK_INTERVAL_SECONDS = 60


def _token_is_current(claims: dict) -> bool:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == int(claims["sub"])).first()
        if not user:
            return False
        return int(claims.get("gen", 0) or 0) == int(getattr(user, "token_generation", 0) or 0)
    except (TypeError, ValueError, KeyError):
        return False
    finally:
        db.close()


async def _watch_token_validity(websocket: WebSocket, token: str):
    while True:
        await asyncio.sleep(TOKEN_RECHECK_INTERVAL_SECONDS)
        try:
            claims = decode_access_token(token)
            if not await run_in_threadpool(_token_is_current, claims):
                raise ValueError("revoked token")
        except (PyJWTError, ValueError):
            _logger.warning("WebSocket connection closed on token re-check failure from %s", websocket.client)
            await websocket.close(code=4401)
            return


@router.websocket("/ws/notifications")
async def notifications_socket(websocket: WebSocket):
    token = websocket.query_params.get("token")
    try:
        if not token:
            raise ValueError("missing token")
        claims = decode_access_token(token)
        if not await run_in_threadpool(_token_is_current, claims):
            raise ValueError("revoked token")
    except (PyJWTError, ValueError):
        _logger.warning("WebSocket connection rejected (invalid/missing/revoked token) from %s", websocket.client)
        await websocket.close(code=4401)
        return

    company_id = company_id_from_auth(claims)
    user_id = claims.get("sub")

    if not await broadcaster.connect(websocket, company_id, user_id=user_id):
        _logger.warning("WebSocket connection rejected (per-user connection cap) for user_id=%s", user_id)
        await websocket.close(code=4429)
        return

    watcher = asyncio.create_task(_watch_token_validity(websocket, token))
    try:
        while True:
            # This channel is server-push only; block on any client frame
            # (including the ping/pong the browser sends) to detect disconnects.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        watcher.cancel()
        await broadcaster.disconnect(websocket)
