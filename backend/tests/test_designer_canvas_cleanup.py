"""SECURITY PHASE B regression: app/designer/canvas_render.py's _draw_image
and _draw_qr used to write a NamedTemporaryFile(delete=False, ...) for every
rendered logo/QR element and never clean it up, leaking one temp file per
element per render. Both now unlink the file in a finally block."""
import glob
import io
import os
import re
import tempfile
import unittest

from reportlab.pdfgen import canvas as pdfcanvas

from app.designer.canvas_render import _draw_image, _draw_qr

# 1x1 transparent PNG, base64-encoded - the smallest valid input _draw_image accepts.
TINY_PNG_DATA_URL = (
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4"
    "nGNgAAIAAAUAAen63NgAAAAASUVORK5CYII="
)


def _leaked_png_temp_files():
    pattern = os.path.join(tempfile.gettempdir(), "tmp*.png")
    return set(glob.glob(pattern))


class CanvasTempFileCleanupTests(unittest.TestCase):
    def _canvas(self):
        return pdfcanvas.Canvas(io.BytesIO(), pagesize=(200, 200))

    def test_draw_image_does_not_leak_a_temp_file(self):
        before = _leaked_png_temp_files()
        _draw_image(self._canvas(), TINY_PNG_DATA_URL, 0, 0, 10, 10)
        after = _leaked_png_temp_files()
        self.assertEqual(after - before, set())

    def test_draw_qr_does_not_leak_a_temp_file(self):
        before = _leaked_png_temp_files()
        _draw_qr(self._canvas(), "https://example.test/invoice/1", 0, 0, 20)
        after = _leaked_png_temp_files()
        self.assertEqual(after - before, set())

    def test_draw_image_still_renders_despite_cleanup(self):
        # Regression guard: unlinking the temp file must not happen before
        # drawImage has actually read it. A bare "PDF bytes are non-empty"
        # check is NOT enough here - reportlab produces a small non-empty
        # PDF (~900 bytes) even when drawImage silently fails (its OSError
        # is swallowed by the broad except in _draw_image), so an empty-vs-
        # nonempty check alone would still pass on a reverted/broken fix.
        # /Subtype /Image only appears in the output when the image XObject
        # was actually embedded - confirmed by manually reproducing the
        # "unlink before drawImage" regression, which drops this marker.
        # reportlab's dictionary serializer sometimes wraps the line (so the
        # literal spacing between /Subtype and /Image varies) - match on
        # whitespace, not an exact byte sequence.
        buf = io.BytesIO()
        c = pdfcanvas.Canvas(buf, pagesize=(200, 200))
        _draw_image(c, TINY_PNG_DATA_URL, 0, 0, 10, 10)
        c.save()
        self.assertRegex(buf.getvalue(), re.compile(rb"/Subtype\s*/Image"))


if __name__ == "__main__":
    unittest.main()
