from pathlib import Path
root = Path.cwd()
main_path = next((p for p in [root / 'backend' / 'main.py', root / 'main.py'] if p.exists()), None)
if not main_path:
    raise SystemExit('main.py not found')
text = main_path.read_text(encoding='utf-8')
imp = 'from app.accounting.router import router as accounting_router'
inc = 'app.include_router(accounting_router)'
if imp not in text:
    lines = text.splitlines()
    idx = 0
    for i, line in enumerate(lines):
        if line.startswith('from ') or line.startswith('import '):
            idx = i + 1
    lines.insert(idx, imp)
    text = '\n'.join(lines) + '\n'
if inc not in text:
    lines = text.splitlines()
    idx = len(lines)
    for i, line in enumerate(lines):
        if 'include_router' in line:
            idx = i + 1
    lines.insert(idx, inc)
    text = '\n'.join(lines) + '\n'
main_path.write_text(text, encoding='utf-8')
print(f'Accounting router connected: {main_path}')
