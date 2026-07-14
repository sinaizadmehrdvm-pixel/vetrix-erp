import asyncio
import io
import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers

from app import change_requests


class ManagedVoiceAudioTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.upload_patch = patch.dict(
            os.environ, {"VETRIX_UPLOAD_DIR": self.temp.name}
        )
        self.upload_patch.start()
        self.request = SimpleNamespace(
            state=SimpleNamespace(auth={"sub": "42", "role": "sales"})
        )

    def tearDown(self):
        self.upload_patch.stop()
        self.temp.cleanup()

    def _upload(self, content=b"voice evidence", filename="voice.webm"):
        upload = UploadFile(
            file=io.BytesIO(content),
            filename=filename,
            headers=Headers({"content-type": "audio/webm"}),
        )
        return asyncio.run(change_requests.upload_audio(self.request, upload))

    def test_audio_is_stored_under_random_reference_with_checksum(self):
        result = self._upload()

        self.assertRegex(result["reference"], r"^[0-9a-f]{32}\.webm$")
        self.assertEqual(result["size_bytes"], len(b"voice evidence"))
        self.assertEqual(len(result["sha256"]), 64)
        self.assertTrue(
            change_requests._require_managed_audio(result["reference"]).is_file()
        )

    def test_path_traversal_and_unsupported_extensions_are_rejected(self):
        for reference in ("../voice.webm", "voice.exe", ".hidden.webm"):
            with self.subTest(reference=reference):
                with self.assertRaises(HTTPException):
                    change_requests._audio_path(reference)

    def test_oversized_upload_is_deleted(self):
        with patch.object(change_requests, "MAX_AUDIO_BYTES", 3):
            with self.assertRaises(HTTPException) as raised:
                self._upload(content=b"1234")
        self.assertEqual(raised.exception.status_code, 413)
        self.assertEqual(
            list(change_requests._audio_directory().iterdir()), []
        )


if __name__ == "__main__":
    unittest.main()
