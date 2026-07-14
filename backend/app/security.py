import threading
import time
from collections import defaultdict, deque


MAX_LOGIN_FAILURES = 5
FAILURE_WINDOW_SECONDS = 5 * 60
BLOCK_SECONDS = 10 * 60

_attempts = defaultdict(deque)
_blocked_until = {}
_lock = threading.Lock()


def login_attempt_key(client_ip, username):
    safe_ip = str(client_ip or "unknown").strip()[:128]
    safe_username = str(username or "").strip().casefold()[:150]
    return f"{safe_ip}:{safe_username}"


def _prune(key, now):
    cutoff = now - FAILURE_WINDOW_SECONDS
    attempts = _attempts[key]
    while attempts and attempts[0] <= cutoff:
        attempts.popleft()
    if not attempts:
        _attempts.pop(key, None)


def login_retry_after(key, now=None):
    now = time.monotonic() if now is None else float(now)
    with _lock:
        blocked_until = _blocked_until.get(key, 0)
        if blocked_until > now:
            return max(1, int(blocked_until - now + 0.999))
        _blocked_until.pop(key, None)
        _prune(key, now)
        return 0


def record_login_result(key, succeeded, now=None):
    now = time.monotonic() if now is None else float(now)
    with _lock:
        if succeeded:
            _attempts.pop(key, None)
            _blocked_until.pop(key, None)
            return
        _prune(key, now)
        attempts = _attempts[key]
        attempts.append(now)
        if len(attempts) >= MAX_LOGIN_FAILURES:
            _blocked_until[key] = now + BLOCK_SECONDS
            attempts.clear()


def reset_login_throttle():
    with _lock:
        _attempts.clear()
        _blocked_until.clear()
