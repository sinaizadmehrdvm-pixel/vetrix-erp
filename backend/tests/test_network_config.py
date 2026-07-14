import os
import unittest
from unittest.mock import patch

from app.network_config import load_network_config


class NetworkConfigTests(unittest.TestCase):
    def load(self, **values):
        environment = {
            "VETRIX_LAN_ENABLED": "",
            "VETRIX_ALLOWED_ORIGINS": "",
            "VETRIX_API_PORT": "8001",
            "VETRIX_WEB_PORT": "5173",
            **values,
        }
        with patch.dict(os.environ, environment, clear=False):
            return load_network_config()

    def test_default_is_loopback_only(self):
        config = self.load()
        self.assertFalse(config.lan_enabled)
        self.assertEqual(config.bind_host, "127.0.0.1")
        self.assertEqual(config.local_url, "http://127.0.0.1:5173")
        self.assertTrue(all("localhost" in item or "127.0.0.1" in item for item in config.allowed_origins))

    def test_lan_mode_requires_exact_remote_origin(self):
        with self.assertRaisesRegex(RuntimeError, "requires VETRIX_ALLOWED_ORIGINS"):
            self.load(VETRIX_LAN_ENABLED="true")

    def test_lan_mode_rejects_wildcard(self):
        with self.assertRaisesRegex(RuntimeError, "Wildcard"):
            self.load(VETRIX_LAN_ENABLED="1", VETRIX_ALLOWED_ORIGINS="*")

    def test_lan_mode_rejects_loopback_only_origin(self):
        with self.assertRaisesRegex(RuntimeError, "non-loopback"):
            self.load(
                VETRIX_LAN_ENABLED="yes",
                VETRIX_ALLOWED_ORIGINS="http://127.0.0.1:5173",
            )

    def test_lan_mode_binds_all_interfaces_with_strict_origins(self):
        config = self.load(
            VETRIX_LAN_ENABLED="on",
            VETRIX_ALLOWED_ORIGINS=(
                "http://192.168.1.20:5173,http://127.0.0.1:5173"
            ),
        )
        self.assertTrue(config.lan_enabled)
        self.assertEqual(config.bind_host, "0.0.0.0")
        self.assertEqual(config.api_port, 8001)
        self.assertEqual(len(config.allowed_origins), 2)

    def test_ports_are_valid_and_distinct(self):
        with self.assertRaisesRegex(RuntimeError, "between 1 and 65535"):
            self.load(VETRIX_API_PORT="70000")
        with self.assertRaisesRegex(RuntimeError, "must be different"):
            self.load(VETRIX_API_PORT="5173")


if __name__ == "__main__":
    unittest.main()
