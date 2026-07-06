from pathlib import Path

ROOT = Path.cwd()

def patch_file(path, fn):
    if not path.exists():
        print(f"NOT FOUND: {path}")
        return
    text = path.read_text(encoding="utf-8")
    new = fn(text)
    if new != text:
        path.write_text(new, encoding="utf-8")
        print(f"PATCHED: {path}")
    else:
        print(f"OK: {path}")

def patch_customer_details(text):
    bad_block = '''import Customer360 from "./crm/Customer360";

export default function CustomerDetails() {
  return <Customer360 />;
}

'''
    text = text.replace(bad_block, "")

    text = text.replace(
        'new Intl.DateTimeFormat(isFa ? "fa-IR" : "en-US", {',
        'new Intl.DateTimeFormat(isFa ? "fa-IR-u-ca-persian" : "en-US", {'
    )

    text = text.replace(
        '{isFa ? "پرونده طرف‌حساب" : "Party Profile"}',
        '{isFa ? "پرونده ۳۶۰ درجه طرف‌حساب" : "Customer 360 Profile"}'
    )

    text = text.replace(
        '{isFa ? `طرف‌حساب #${n(party.id)} - ${party.customer_type || "مشتری"}` : `Party #${party.id}`}',
        '{isFa ? `پرونده کامل مالی، CRM، پیگیری و ارتباطات طرف‌حساب #${n(party.id)}` : `Complete finance and CRM profile #${party.id}`}'
    )

    text = text.replace('type="date"', 'type="text"')

    text = text.replace(
        'className="bg-slate-800 text-white rounded-2xl p-4 outline-none border border-cyan-500/10"\n            />',
        'className="bg-slate-800 text-white rounded-2xl p-4 outline-none border border-cyan-500/10"\n              placeholder={isFa ? "مثال: ۱۴۰۵/۰۴/۲۵" : "Example: 2026/07/16"}\n            />'
    )
    return text

def patch_customers(text):
    text = text.replace('{fa ? "پرونده" : "Profile"}', '{fa ? "پرونده 360°" : "360° Profile"}')
    text = text.replace('{fa ? "پرونده مشتری" : "Profile"}', '{fa ? "پرونده 360°" : "360° Profile"}')
    return text

def patch_customer360(text):
    text = text.replace('type="date"', 'type="text"')
    return text

patch_file(ROOT / "frontend/src/pages/CustomerDetails.jsx", patch_customer_details)
patch_file(ROOT / "frontend/src/pages/Customers.jsx", patch_customers)
patch_file(ROOT / "frontend/src/pages/crm/Customer360.jsx", patch_customer360)

utils = ROOT / "frontend/src/utils/persianDate.js"
utils.parent.mkdir(parents=True, exist_ok=True)
if not utils.exists():
    utils.write_text('''export function toPersianDigits(value) {
  return String(value ?? "").replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
}

export function formatPersianDate(value, fallback = "-") {
  if (!value) return fallback;
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  } catch {
    return String(value || fallback);
  }
}
''', encoding="utf-8")
    print("ADDED: frontend/src/utils/persianDate.js")

print("DONE")
