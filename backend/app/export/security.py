"""Shared export-safety helpers. Currently: CSV/Excel formula-injection
guarding (OWASP-style) - a cell value that starts with =, +, -, or @ can
execute as a formula (or trigger a DDE/launch exploit in older Excel)
the moment the exported file is opened. Nothing in this codebase guarded
against this before; apply it at the point a cell is written, everywhere
user-supplied text reaches an XLSX.
"""
FORMULA_TRIGGER_CHARS = ("=", "+", "-", "@", "\t", "\r")


def sanitize_cell_value(value):
    if not isinstance(value, str):
        return value
    if value and value[0] in FORMULA_TRIGGER_CHARS:
        return "'" + value
    return value
