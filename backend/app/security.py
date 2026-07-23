import threading
import time

from sqlalchemy import Column, Float, Integer, String
from sqlalchemy.orm import Session

from app.database import Base, engine


MAX_LOGIN_FAILURES = 5
FAILURE_WINDOW_SECONDS = 5 * 60
BLOCK_SECONDS = 10 * 60


class LoginThrottle(Base):
    """Per-process-independent login throttle state.

    Stored in the shared database (instead of in-process memory) so the
    failure count and block survive a restart and stay consistent across
    multiple worker processes sharing the same database.
    """

    __tablename__ = "login_throttle"

    key = Column(String(300), primary_key=True)
    failure_count = Column(Integer, nullable=False, default=0)
    window_started_at = Column(Float, nullable=False, default=0.0)
    blocked_until = Column(Float, nullable=False, default=0.0)


LoginThrottle.__table__.create(bind=engine, checkfirst=True)

# Guards read-then-write throttle updates within a single process; SQLite
# itself serializes the underlying writes across processes.
_lock = threading.Lock()


def login_attempt_key(client_ip, username):
    safe_ip = str(client_ip or "unknown").strip()[:128]
    safe_username = str(username or "").strip().casefold()[:150]
    return f"{safe_ip}:{safe_username}"


def login_retry_after(key, now=None):
    now = time.time() if now is None else float(now)
    with _lock:
        # Bound at call time (not import time) so tests can point this module
        # at an isolated engine via unittest.mock.patch.object(security, "engine", ...).
        db = Session(bind=engine)
        try:
            row = db.query(LoginThrottle).filter(LoginThrottle.key == key).first()
            if not row:
                return 0

            if row.blocked_until and row.blocked_until > now:
                return max(1, int(row.blocked_until - now + 0.999))

            expired_block = row.blocked_until and row.blocked_until <= now
            expired_window = (
                row.window_started_at
                and now - row.window_started_at > FAILURE_WINDOW_SECONDS
            )
            if expired_block or expired_window:
                db.delete(row)
                db.commit()
            return 0
        finally:
            db.close()


def record_login_result(key, succeeded, now=None):
    now = time.time() if now is None else float(now)
    with _lock:
        db = Session(bind=engine)
        try:
            row = db.query(LoginThrottle).filter(LoginThrottle.key == key).first()

            if succeeded:
                if row:
                    db.delete(row)
                    db.commit()
                return

            if not row:
                row = LoginThrottle(
                    key=key,
                    failure_count=0,
                    window_started_at=now,
                    blocked_until=0.0,
                )
                db.add(row)

            if not row.window_started_at or now - row.window_started_at > FAILURE_WINDOW_SECONDS:
                row.window_started_at = now
                row.failure_count = 0

            row.failure_count += 1
            if row.failure_count >= MAX_LOGIN_FAILURES:
                row.blocked_until = now + BLOCK_SECONDS
                row.failure_count = 0

            db.commit()
        finally:
            db.close()


def reset_login_throttle():
    with _lock:
        db = Session(bind=engine)
        try:
            db.query(LoginThrottle).delete()
            db.commit()
        finally:
            db.close()
