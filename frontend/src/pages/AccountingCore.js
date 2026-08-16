import React, { useEffect, useMemo, useState } from "react";
import { getAccountingChart, getAccountingMeta, seedAccountingChart, createAccountingAccount, updateAccountingAccount, toggleAccountingAccount, deleteAccountingAccount } from "../services/accountingApi";
import { useLanguage } from "../localization/useLanguage";
import { confirmAction } from "../components/ui/confirmService";

const emptyForm = { code: "", name: "", account_type: "asset", level: "group", parent_id: "", normal_balance: "debit", description: "", color: "#22d3ee", is_active: true };
const types = ["asset", "liability", "equity", "revenue", "expense", "contra"];
const levels = ["group", "ledger", "subsidiary", "detail"];
const faType = { asset: "دارایی", liability: "بدهی", equity: "سرمایه", revenue: "درآمد", expense: "هزینه", contra: "کاهنده" };
const arType = { asset: "الأصول", liability: "الالتزامات", equity: "حقوق الملكية", revenue: "الإيرادات", expense: "المصروفات", contra: "حساب مقابل" };
const trType = { asset: "Varlıklar", liability: "Yükümlülükler", equity: "Özkaynaklar", revenue: "Gelir", expense: "Giderler", contra: "Düzenleyici Hesap" };
const faLevel = { group: "گروه", ledger: "کل", subsidiary: "معین", detail: "تفصیلی" };
const arLevel = { group: "مجموعة", ledger: "إجمالي", subsidiary: "فرعي", detail: "تفصيلي" };
const trLevel = { group: "Grup", ledger: "Ana Hesap", subsidiary: "Alt Hesap", detail: "Detay" };
function h(tag, props, ...children) { return React.createElement(tag, props, ...children); }
function label(obj, key, language) {
  const map = language === "fa" ? obj.fa : language === "ar" ? obj.ar : language === "tr" ? obj.tr : null;
  return map ? (map[key] || key) : key;
}

export default function AccountingCore() {
  const { language, dir, n } = useLanguage();
  const [accounts, setAccounts] = useState([]), [meta, setMeta] = useState({});
  const [form, setForm] = useState(emptyForm), [selected, setSelected] = useState(null);
  const [q, setQ] = useState(""), [message, setMessage] = useState(""), [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [chart, metaData] = await Promise.all([getAccountingChart(), getAccountingMeta().catch(() => ({}))]);
      setAccounts(Array.isArray(chart) ? chart : []);
      setMeta(metaData || {});
    } catch (e) { setMessage(e.message || "Accounting API error"); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
  }, [language]);

  const filtered = useMemo(() => accounts.filter(a => !q || String(a.code).includes(q) || String(a.name).toLowerCase().includes(q.toLowerCase())), [accounts, q]);
  const stats = { total: accounts.length, active: accounts.filter(a => a.is_active !== false && a.is_active !== 0).length };
  const accountTypes = meta.account_types || types, accountLevels = meta.levels || levels;
  function patch(k, v) { setForm(prev => ({ ...prev, [k]: v })); }
  function select(a) { setSelected(a); setForm({ ...emptyForm, ...a, parent_id: a.parent_id || "", is_active: a.is_active !== false && a.is_active !== 0 }); }
  function reset(parent) { setSelected(null); setForm({ ...emptyForm, parent_id: parent?.id || "", account_type: parent?.account_type || "asset" }); }
  async function save() {
    if (!form.code || !form.name) { setMessage(language === "fa" ? "کد و نام الزامی است" : language === "ar" ? "الرمز والاسم مطلوبان" : language === "tr" ? "Kod ve ad zorunludur" : "Code and name required"); return; }
    const payload = { ...form, parent_id: form.parent_id ? Number(form.parent_id) : null, is_active: !!form.is_active };
    if (selected?.id) await updateAccountingAccount(selected.id, payload); else await createAccountingAccount(payload);
    setMessage(language === "fa" ? "ذخیره شد" : language === "ar" ? "تم الحفظ" : language === "tr" ? "Kaydedildi" : "Saved"); reset(); await load();
  }
  async function remove(id) { if (!(await confirmAction(language === "fa" ? "حساب حذف شود؟" : language === "ar" ? "هل تريد حذف الحساب؟" : language === "tr" ? "Hesap silinsin mi?" : "Delete account?"))) return; await deleteAccountingAccount(id); await load(); }
  const styles = { root: { direction: dir, minHeight: "100vh", color: "white", background: "#071028", padding: 0 }, card: { background: "rgba(15,23,42,.75)", border: "1px solid rgba(34,211,238,.22)", borderRadius: 28, padding: 20 }, input: { width: "100%", background: "#1e293b", color: "white", border: "1px solid rgba(34,211,238,.18)", borderRadius: 16, padding: 12 }, btn: { border: 0, borderRadius: 16, padding: "12px 16px", fontWeight: 900, cursor: "pointer" } };

  return h("div", { style: styles.root },
    h("div", { style: { display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 24 } },
      h("div", null, h("h1", { style: { color: "#22d3ee", fontSize: 38, fontWeight: 900, margin: 0 } }, language === "fa" ? "کدینگ حساب‌ها" : language === "ar" ? "دليل الحسابات" : language === "tr" ? "Hesap Planı" : "Chart of Accounts"), h("p", { style: { color: "#94a3b8" } }, language === "fa" ? "مرحله ۷.۱ هسته حسابداری VITALIX" : language === "ar" ? "المرحلة 7.1 من نواة المحاسبة في VITALIX" : language === "tr" ? "VITALIX Muhasebe Çekirdeği - Aşama 7.1" : "Accounting core phase 7.1")),
      h("div", { style: { display: "flex", gap: 10 } }, h("button", { className: "text-cyan-200", style: { ...styles.btn, background: "#1e293b" }, onClick: async () => { await seedAccountingChart(); await load(); } }, language === "fa" ? "کدینگ پیش‌فرض" : language === "ar" ? "الترميز الافتراضي" : language === "tr" ? "Varsayılan Kodlama" : "Seed"), h("button", { style: { ...styles.btn, background: "#22d3ee", color: "#020617" }, onClick: load }, loading ? "..." : language === "fa" ? "به‌روزرسانی" : language === "ar" ? "تحديث" : language === "tr" ? "Yenile" : "Refresh"))
    ),
    message && h("div", { className: "text-cyan-200", style: { ...styles.card, marginBottom: 20 } }, message),
    h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16, marginBottom: 20 } }, h("div", { style: styles.card }, h("div", { style: { color: "#94a3b8" } }, language === "fa" ? "کل حساب‌ها" : language === "ar" ? "الإجمالي" : language === "tr" ? "Toplam" : "Total"), h("b", { style: { color: "#22d3ee", fontSize: 30 } }, n(stats.total))), h("div", { style: styles.card }, h("div", { style: { color: "#94a3b8" } }, language === "fa" ? "فعال" : language === "ar" ? "نشط" : language === "tr" ? "Aktif" : "Active"), h("b", { style: { color: "#22d3ee", fontSize: 30 } }, n(stats.active)))),
    h("div", { style: { display: "grid", gridTemplateColumns: "minmax(0,1fr) 420px", gap: 20 } },
      h("section", { style: styles.card }, h("input", { style: { ...styles.input, marginBottom: 16 }, value: q, onChange: e => setQ(e.target.value), placeholder: language === "fa" ? "جستجو..." : language === "ar" ? "بحث..." : language === "tr" ? "Ara..." : "Search..." }), h("div", { style: { maxHeight: 650, overflow: "auto" } }, filtered.map(a => h("div", { key: a.id, style: { background: selected?.id === a.id ? "rgba(34,211,238,.15)" : "rgba(30,41,59,.75)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 18, padding: 14, marginBottom: 10, display: "flex", justifyContent: "space-between", gap: 12 } }, h("button", { onClick: () => select(a), style: { all: "unset", cursor: "pointer", flex: 1 } }, h("div", { style: { fontWeight: 900 } }, h("span", { style: { color: a.color || "#22d3ee" } }, "● "), a.code, " - ", a.name), h("div", { style: { color: "#94a3b8", fontSize: 12, marginTop: 6 } }, label({ fa: faType, ar: arType, tr: trType }, a.account_type, language), " • ", label({ fa: faLevel, ar: arLevel, tr: trLevel }, a.level, language), " • ", a.normal_balance === "debit" ? (language === "fa" ? "بدهکار" : language === "ar" ? "مدين" : language === "tr" ? "Borç" : "Debit") : (language === "fa" ? "بستانکار" : language === "ar" ? "دائن" : language === "tr" ? "Alacak" : "Credit"))), h("div", { style: { display: "flex", gap: 8 } }, h("button", { className: "text-cyan-200", style: { ...styles.btn, background: "rgba(34,211,238,.12)" }, onClick: () => reset(a) }, "+"), h("button", { style: { ...styles.btn, background: "#334155", color: "white" }, onClick: async () => { await toggleAccountingAccount(a.id); await load(); } }, a.is_active ? "فعال" : "غیرفعال"), h("button", { style: { ...styles.btn, background: "var(--erp-danger-solid)", color: "white" }, onClick: () => remove(a.id) }, language === "fa" ? "حذف" : language === "ar" ? "حذف" : language === "tr" ? "Sil" : "Delete")))))),
      h("aside", { style: styles.card }, h("h2", { className: "text-cyan-300", style: { fontSize: 24, fontWeight: 900 } }, selected ? (language === "fa" ? "ویرایش حساب" : language === "ar" ? "تعديل الحساب" : language === "tr" ? "Hesabı Düzenle" : "Edit account") : (language === "fa" ? "حساب جدید" : language === "ar" ? "حساب جديد" : language === "tr" ? "Yeni Hesap" : "New account")), h("div", { style: { display: "grid", gap: 12 } }, h("input", { style: styles.input, value: form.code, onChange: e => patch("code", e.target.value), placeholder: language === "fa" ? "کد حساب" : language === "ar" ? "رمز الحساب" : language === "tr" ? "Hesap Kodu" : "Code" }), h("input", { style: styles.input, value: form.name, onChange: e => patch("name", e.target.value), placeholder: language === "fa" ? "نام حساب" : language === "ar" ? "اسم الحساب" : language === "tr" ? "Hesap Adı" : "Name" }), h("select", { style: styles.input, value: form.account_type, onChange: e => patch("account_type", e.target.value) }, accountTypes.map(t => h("option", { key: t, value: t }, label({ fa: faType, ar: arType, tr: trType }, t, language)))), h("select", { style: styles.input, value: form.level, onChange: e => patch("level", e.target.value) }, accountLevels.map(l => h("option", { key: l, value: l }, label({ fa: faLevel, ar: arLevel, tr: trLevel }, l, language)))), h("select", { style: styles.input, value: form.parent_id, onChange: e => patch("parent_id", e.target.value) }, h("option", { value: "" }, language === "fa" ? "بدون والد" : language === "ar" ? "بدون حساب أب" : language === "tr" ? "Üst Hesap Yok" : "No parent"), accounts.filter(a => a.id !== selected?.id).map(a => h("option", { key: a.id, value: a.id }, `${a.code} - ${a.name}`))), h("select", { style: styles.input, value: form.normal_balance, onChange: e => patch("normal_balance", e.target.value) }, h("option", { value: "debit" }, language === "fa" ? "بدهکار" : language === "ar" ? "مدين" : language === "tr" ? "Borç" : "Debit"), h("option", { value: "credit" }, language === "fa" ? "بستانکار" : language === "ar" ? "دائن" : language === "tr" ? "Alacak" : "Credit")), h("input", { type: "color", style: { ...styles.input, height: 48 }, value: form.color, onChange: e => patch("color", e.target.value) }), h("textarea", { style: styles.input, rows: 3, value: form.description, onChange: e => patch("description", e.target.value), placeholder: language === "fa" ? "توضیحات" : language === "ar" ? "الوصف" : language === "tr" ? "Açıklama" : "Description" }), h("label", { style: { display: "flex", justifyContent: "space-between", background: "#1e293b", borderRadius: 16, padding: 12 } }, language === "fa" ? "فعال" : language === "ar" ? "نشط" : language === "tr" ? "Aktif" : "Active", h("input", { type: "checkbox", checked: !!form.is_active, onChange: e => patch("is_active", e.target.checked) })), h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } }, h("button", { onClick: save, style: { ...styles.btn, background: "#22d3ee", color: "#020617" } }, language === "fa" ? "ذخیره" : language === "ar" ? "حفظ" : language === "tr" ? "Kaydet" : "Save"), h("button", { onClick: () => reset(), className: "text-cyan-200", style: { ...styles.btn, background: "#1e293b" } }, language === "fa" ? "جدید" : language === "ar" ? "جديد" : language === "tr" ? "Yeni" : "New"))))
    )
  );
}
