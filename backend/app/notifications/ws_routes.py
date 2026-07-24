from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jwt import PyJWTError
from starlette.concurrency import run_in_threadpool

from app.auth import decode_access_token
from app.database import SessionLocal
from app.models.user import User
from app.notifications.broadcaster import broadcaster

router = APIRouter()


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
        await websocket.close(code=4401)
        return

    await broadcaster.connect(websocket)
    try:
        while True:
            # This channel is server-push only; block on any client frame
            # (including the ping/pong the browser sends) to detect disconnects.
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        await broadcaster.disconnect(websocket)
