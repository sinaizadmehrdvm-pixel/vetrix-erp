from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Image
import os

def apply_template(elements, config, styles, rtl, fa):
    """
    اینجا طراحی کاربر روی PDF اعمال میشه
    """

    header = config.get("header", {})
    table_cfg = config.get("table", {})
    footer = config.get("footer", {})

    # ===== HEADER TEXT =====
    if header.get("title"):
        elements.insert(
            0,
            Paragraph(header["title"], styles["Title"])
        )

    # ===== TABLE CUSTOM =====
    if table_cfg.get("style") == "simple":
        pass  # بعداً حرفه‌ای می‌کنیم

    # ===== FOOTER =====
    if footer.get("text"):
        elements.append(
            Paragraph(footer["text"], styles["Normal"])
        )

    return elements