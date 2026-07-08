
from pathlib import Path

root = Path.cwd()
main_path = root / "backend" / "main.py"
if not main_path.exists():
    raise SystemExit("backend/main.py not found")

text = main_path.read_text(encoding="utf-8")
import_line = "from app.accounting.entries_router import router as accounting_entries_router"
include_line = "app.include_router(accounting_entries_router)"

if import_line not in text:
    lines = text.splitlines()
    idx = 0
    for i, line in enumerate(lines):
        if line.startswith("from ") or line.startswith("import "):
            idx = i + 1
    lines.insert(idx, import_line)
    text = "\n".join(lines) + "\n"

if include_line not in text:
    lines = text.splitlines()
    idx = len(lines)
    for i, line in enumerate(lines):
        if "include_router" in line:
            idx = i + 1
    lines.insert(idx, include_line)
    text = "\n".join(lines) + "\n"

main_path.write_text(text, encoding="utf-8")
print("Accounting entries router connected.")
