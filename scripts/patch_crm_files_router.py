from pathlib import Path

ROOT = Path.cwd()

IMPORT_LINE = "from app.crm.files import router as crm_files_router"
INCLUDE_LINE = "app.include_router(crm_files_router)"

candidates = [
    ROOT / "backend" / "main.py",
    ROOT / "backend" / "app" / "main.py",
    ROOT / "main.py",
]

main_path = next((p for p in candidates if p.exists()), None)

if not main_path:
    print("main.py not found. Add manually:")
    print(IMPORT_LINE)
    print(INCLUDE_LINE)
    raise SystemExit(1)

text = main_path.read_text(encoding="utf-8")
original = text

if IMPORT_LINE not in text:
    lines = text.splitlines()
    insert_at = 0
    for i, line in enumerate(lines):
        if line.startswith("from ") or line.startswith("import "):
            insert_at = i + 1
    lines.insert(insert_at, IMPORT_LINE)
    text = "\n".join(lines) + "\n"

if INCLUDE_LINE not in text:
    lines = text.splitlines()
    insert_at = len(lines)
    for i, line in enumerate(lines):
        if "include_router" in line:
            insert_at = i + 1
    lines.insert(insert_at, INCLUDE_LINE)
    text = "\n".join(lines) + "\n"

if text != original:
    main_path.write_text(text, encoding="utf-8")
    print(f"PATCHED: {main_path}")
else:
    print(f"OK: {main_path}")

print("CRM files router connected.")
