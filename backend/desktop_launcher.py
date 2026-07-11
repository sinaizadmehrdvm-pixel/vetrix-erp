import json
import multiprocessing
import os
import secrets
import socket
import sys
import threading
import time
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


APP_HOST = "127.0.0.1"
API_PORT = 8001
WEB_PORT = 5173


def bundle_path(*parts):
    root = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))
    return root.joinpath(*parts)


def data_directory():
    base = os.getenv("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    target = Path(base) / "VetrixERP"
    target.mkdir(parents=True, exist_ok=True)
    (target / "backups").mkdir(exist_ok=True)
    (target / "uploads").mkdir(exist_ok=True)
    return target


def load_or_create_secret(target):
    config_file = target / "desktop-config.json"
    config = {}
    if config_file.exists():
        try:
            config = json.loads(config_file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            config = {}
    secret = str(config.get("jwt_secret") or "")
    if len(secret) < 32:
        secret = secrets.token_urlsafe(48)
        config["jwt_secret"] = secret
        config_file.write_text(json.dumps(config, indent=2), encoding="utf-8")
    return secret


def configure_environment():
    target = data_directory()
    os.environ.setdefault("VETRIX_ENV", "desktop")
    os.environ.setdefault("VETRIX_JWT_SECRET", load_or_create_secret(target))
    os.environ.setdefault(
        "VETRIX_ALLOWED_ORIGINS",
        f"http://{APP_HOST}:{WEB_PORT},http://localhost:{WEB_PORT}",
    )
    database = (target / "vetrix.db").resolve().as_posix()
    os.environ.setdefault("VETRIX_DATABASE_URL", f"sqlite:///{database}")
    os.environ.setdefault("VETRIX_BACKUP_DIR", str(target / "backups"))
    os.chdir(target)
    return target


class SpaHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(
            *args,
            directory=str(bundle_path("frontend_dist")),
            **kwargs,
        )

    def do_GET(self):
        requested = self.path.split("?", 1)[0].split("#", 1)[0]
        local = bundle_path("frontend_dist", requested.lstrip("/"))
        if requested != "/" and not local.exists():
            self.path = "/index.html"
        return super().do_GET()

    def log_message(self, format, *args):
        if os.getenv("VETRIX_VERBOSE") == "1":
            super().log_message(format, *args)


def assert_port_available(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        try:
            probe.bind((APP_HOST, port))
        except OSError as error:
            raise RuntimeError(
                f"Port {port} is already in use. Close the other Vetrix instance and retry."
            ) from error


def run_web_server():
    server = ThreadingHTTPServer((APP_HOST, WEB_PORT), SpaHandler)
    server.serve_forever()


def open_browser_when_ready():
    url = f"http://{APP_HOST}:{WEB_PORT}"
    for _ in range(60):
        try:
            with socket.create_connection((APP_HOST, WEB_PORT), timeout=0.2):
                if os.getenv("VETRIX_NO_BROWSER") != "1":
                    webbrowser.open(url)
                return
        except OSError:
            time.sleep(0.25)


def main():
    multiprocessing.freeze_support()
    target = configure_environment()
    assert_port_available(API_PORT)
    assert_port_available(WEB_PORT)

    from main import app
    import uvicorn

    web_thread = threading.Thread(
        target=run_web_server,
        name="vetrix-web",
        daemon=True,
    )
    web_thread.start()
    threading.Thread(
        target=open_browser_when_ready,
        name="vetrix-browser",
        daemon=True,
    ).start()

    print("=" * 58)
    print("Vetrix ERP 1.0")
    print(f"Application: http://{APP_HOST}:{WEB_PORT}")
    print(f"Data folder: {target}")
    print("Keep this window open while using Vetrix.")
    print("=" * 58)
    uvicorn.run(
        app,
        host=APP_HOST,
        port=API_PORT,
        log_level="warning",
        access_log=False,
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Vetrix failed to start: {error}")
        if os.getenv("VETRIX_NO_PAUSE") != "1":
            input("Press Enter to close...")
        raise
