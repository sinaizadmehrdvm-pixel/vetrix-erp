from pathlib import Path
root = Path.cwd()
app_path = root / 'frontend' / 'src' / 'App.jsx'
if not app_path.exists():
    raise SystemExit('frontend/src/App.jsx not found')
text = app_path.read_text(encoding='utf-8')
if 'import AccountingCore from "./pages/AccountingCore";' not in text:
    text = text.replace('import AiBusinessIntelligence from "./pages/AiBusinessIntelligence";', 'import AiBusinessIntelligence from "./pages/AiBusinessIntelligence";\nimport AccountingCore from "./pages/AccountingCore";')
if '<Route path="accounting"' not in text:
    text = text.replace('<Route path="finance" element={<FinanceCenter />} />', '<Route path="finance" element={<FinanceCenter />} />\n     <Route path="accounting" element={<AccountingCore />} />')
app_path.write_text(text, encoding='utf-8')
print('Accounting route connected: /accounting')
