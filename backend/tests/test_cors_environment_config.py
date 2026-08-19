"""SECURITY PHASE D regression: main.py's dev-convenience localhost CORS
regex must only apply when VETRIX_ENV is explicitly "development" - not
merely "not production". The packaged desktop build (VETRIX_ENV=desktop)
already configures its own exact VETRIX_ALLOWED_ORIGINS via
desktop_launcher.py and never needed this loose fallback.

Runs main.py's module-level CORS setup in a fresh subprocess per case
(rather than importlib.reload in-process) since main.py has substantial
import-time side effects (DB schema setup, FastAPI app construction) that
aren't safe to repeat against the shared test database.
"""
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]

_CHECK_SCRIPT = (
    "import main\n"
    "print('REGEX_PRESENT' if 'allow_origin_regex' in main._cors_kwargs else 'REGEX_ABSENT')\n"
)


class CorsEnvironmentConfigTests(unittest.TestCase):
    def _regex_present_for(self, vetrix_env):
        with tempfile.TemporaryDirectory() as temp_dir:
            db_path = Path(temp_dir) / "cors-config-test.db"
            env = {
                **os.environ,
                "VETRIX_ENV": vetrix_env,
                "VETRIX_DATABASE_URL": f"sqlite:///{db_path}",
                "VETRIX_JWT_SECRET": "cors-config-test-secret-not-for-production",
                "VETRIX_BACKUP_DIR": str(Path(temp_dir) / "backups"),
            }
            result = subprocess.run(
                [sys.executable, "-c", _CHECK_SCRIPT],
                cwd=BACKEND_DIR,
                env=env,
                capture_output=True,
                text=True,
                timeout=60,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            output = result.stdout.strip()
            self.assertIn(output, ("REGEX_PRESENT", "REGEX_ABSENT"), result.stdout + result.stderr)
            return output == "REGEX_PRESENT"

    def test_development_gets_the_loose_localhost_regex(self):
        self.assertTrue(self._regex_present_for("development"))

    def test_production_does_not_get_the_loose_localhost_regex(self):
        self.assertFalse(self._regex_present_for("production"))

    def test_desktop_does_not_get_the_loose_localhost_regex(self):
        # The actual regression: "desktop" is neither "development" nor
        # "production" - a denylist ("!= production") would have let it
        # through; the allowlist ("== development") correctly excludes it.
        self.assertFalse(self._regex_present_for("desktop"))


if __name__ == "__main__":
    unittest.main()
