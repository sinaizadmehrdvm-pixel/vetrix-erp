import ipaddress
import os
from dataclasses import dataclass
from urllib.parse import urlparse


TRUE_VALUES = {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class NetworkConfig:
    lan_enabled: bool
    bind_host: str
    browser_host: str
    api_port: int
    web_port: int
    allowed_origins: tuple[str, ...]

    @property
    def local_url(self):
        return f"http://{self.browser_host}:{self.web_port}"


def _port(name, default):
    raw = os.getenv(name, str(default)).strip()
    try:
        value = int(raw)
    except ValueError as error:
        raise RuntimeError(f"{name} must be a number") from error
    if not 1 <= value <= 65535:
        raise RuntimeError(f"{name} must be between 1 and 65535")
    return value


def _origins():
    return tuple(
        item.strip().rstrip("/")
        for item in os.getenv("VETRIX_ALLOWED_ORIGINS", "").split(",")
        if item.strip()
    )


def _is_loopback_origin(origin):
    parsed = urlparse(origin)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return False
    if parsed.hostname == "localhost":
        return True
    try:
        return ipaddress.ip_address(parsed.hostname).is_loopback
    except ValueError:
        return False


def load_network_config():
    lan_enabled = os.getenv("VETRIX_LAN_ENABLED", "").strip().lower() in TRUE_VALUES
    api_port = _port("VETRIX_API_PORT", 8001)
    web_port = _port("VETRIX_WEB_PORT", 5173)
    if api_port == web_port:
        raise RuntimeError("VETRIX_API_PORT and VETRIX_WEB_PORT must be different")

    origins = _origins()
    if lan_enabled:
        if not origins:
            raise RuntimeError(
                "LAN mode requires VETRIX_ALLOWED_ORIGINS with the exact server URL"
            )
        if "*" in origins:
            raise RuntimeError("Wildcard CORS is forbidden in LAN mode")
        remote = [origin for origin in origins if not _is_loopback_origin(origin)]
        if not remote:
            raise RuntimeError(
                "LAN mode requires at least one non-loopback allowed origin"
            )
        for origin in origins:
            parsed = urlparse(origin)
            if parsed.scheme not in {"http", "https"} or not parsed.hostname:
                raise RuntimeError(f"Invalid allowed origin: {origin}")
        bind_host = "0.0.0.0"
    else:
        bind_host = "127.0.0.1"
        if not origins:
            origins = (
                f"http://127.0.0.1:{web_port}",
                f"http://localhost:{web_port}",
            )

    return NetworkConfig(
        lan_enabled=lan_enabled,
        bind_host=bind_host,
        browser_host="127.0.0.1",
        api_port=api_port,
        web_port=web_port,
        allowed_origins=origins,
    )
