
from pathlib import Path

root = Path.cwd()
app_path = root / "frontend" / "src" / "App.jsx"
if not app_path.exists():
    raise SystemExit("frontend/src/App.jsx not found")

text = app_path.read_text(encoding="utf-8")
if 'import AccountingEntries from "./pages/AccountingEntries";' not in text:
    marker = 'import AccountingCore from "./pages/AccountingCore";'
    if marker in text:
        text = text.replace(marker, marker + '\nimport AccountingEntries from "./pages/AccountingEntries";')
    else:
        text = text.replace('import Dashboard from "./pages/Dashboard";', 'import Dashboard from "./pages/Dashboard";\nimport AccountingEntries from "./pages/AccountingEntries";')

if '<Route path="accounting-entries"' not in text:
    if '<Route path="accounting" element={<AccountingCore />} />' in text:
        text = text.replace('<Route path="accounting" element={<AccountingCore />} />', '<Route path="accounting" element={<AccountingCore />} />\n     <Route path="accounting-entries" element={<AccountingEntries />} />')
    else:
        text = text.replace('<Route path="finance" element={<FinanceCenter />} />', '<Route path="finance" element={<FinanceCenter />} />\n     <Route path="accounting-entries" element={<AccountingEntries />} />')

app_path.write_text(text, encoding="utf-8")
print("Accounting entries route connected: /accounting-entries")
