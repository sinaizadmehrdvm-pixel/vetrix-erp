import React, { useEffect, useMemo, useState } from "react";
import { getAccountingChart, getAccountingMeta, seedAccountingChart, createAccountingAccount, updateAccountingAccount, toggleAccountingAccount, deleteAccountingAccount } from "../services/accountingApi";
import { useLanguage } from "../localization/useLanguage";

const emptyForm = { code: "", name: "", account_type: "asset", level: "group", parent_id: "", normal_balance: "debit", description: "", color: "#22d3ee", is_active: true };
const types = ["asset", "liability", "equity", "revenue", "expense", "contra"];
const levels = ["group", "ledger", "subsidiary", "detail"];
const faType = { asset: "دارایی", liability: "بدهی", equity: "سرمایه", revenue: "درآمد", expense: "هزینه", contra: "کاهنده" };
const faLevel = { group: "گروه", ledger: "کل", subsidiary: "معین", detail: "تفصیلی" };
function h(tag, props, ...children) { return React.createElement(tag, props, ...children); }
function label(obj, key, fa) { return fa ? obj[key] || key : key; }

export default function AccountingCore() {
  const { language, dir, n } = useLanguage();
  const fa = language === "fa";
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
    if (!form.code || !form.name) { setMessage(fa ? "کد و نام الزامی است" : "Code and name required"); return; }
    const payload = { ...form, parent_id: form.parent_id ? Number(form.parent_id) : null, is_active: !!form.is_active };
    if (selected?.id) await updateAccountingAccount(selected.id, payload); else await createAccountingAccount(payload);
    setMessage(fa ? "ذخیره شد" : "Saved"); reset(); await load();
  }
  async function remove(id) { if (!window.confirm(fa ? "حساب حذف شود؟" : "Delete account?")) return; await deleteAccountingAccount(id); await load(); }
  const styles = { root: { direction: dir, minHeight: "100vh", color: "white", background: "#071028", padding: 0 }, card: { background: "rgba(15,23,42,.75)", border: "1px solid rgba(34,211,238,.22)", borderRadius: 28, padding: 20 }, input: { width: "100%", background: "#1e293b", color: "white", border: "1px solid rgba(34,211,238,.18)", borderRadius: 16, padding: 12 }, btn: { border: 0, borderRadius: 16, padding: "12px 16px", fontWeight: 900, cursor: "pointer" } };

  return h("div", { style: styles.root },
    h("div", { style: { display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 24 } },
      h("div", null, h("h1", { style: { color: "#22d3ee", fontSize: 38, fontWeight: 900, margin: 0 } }, fa ? "کدینگ حساب‌ها" : "Chart of Accounts"), h("p", { style: { color: "#94a3b8" } }, fa ? "مرحله ۷.۱ هسته حسابداری Vetrix ERP" : "Accounting core phase 7.1")),
      h("div", { style: { display: "flex", gap: 10 } }, h("button", { style: { ...styles.btn, background: "#1e293b", color: "#a5f3fc" }, onClick: async () => { await seedAccountingChart(); await load(); } }, fa ? "کدینگ پیش‌فرض" : "Seed"), h("button", { style: { ...styles.btn, background: "#22d3ee", color: "#020617" }, onClick: load }, loading ? "..." : fa ? "به‌روزرسانی" : "Refresh"))
    ),
    message && h("div", { style: { ...styles.card, marginBottom: 20, color: "#a5f3fc" } }, message),
    h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16, marginBottom: 20 } }, h("div", { style: styles.card }, h("div", { style: { color: "#94a3b8" } }, fa ? "کل حساب‌ها" : "Total"), h("b", { style: { color: "#22d3ee", fontSize: 30 } }, n(stats.total))), h("div", { style: styles.card }, h("div", { style: { color: "#94a3b8" } }, fa ? "فعال" : "Active"), h("b", { style: { color: "#22d3ee", fontSize: 30 } }, n(stats.active)))),
    h("div", { style: { display: "grid", gridTemplateColumns: "minmax(0,1fr) 420px", gap: 20 } },
      h("section", { style: styles.card }, h("input", { style: { ...styles.input, marginBottom: 16 }, value: q, onChange: e => setQ(e.target.value), placeholder: fa ? "جستجو..." : "Search..." }), h("div", { style: { maxHeight: 650, overflow: "auto" } }, filtered.map(a => h("div", { key: a.id, style: { background: selected?.id === a.id ? "rgba(34,211,238,.15)" : "rgba(30,41,59,.75)", border: "1px solid rgba(255,255,255,.06)", borderRadius: 18, padding: 14, marginBottom: 10, display: "flex", justifyContent: "space-between", gap: 12 } }, h("button", { onClick: () => select(a), style: { all: "unset", cursor: "pointer", flex: 1 } }, h("div", { style: { fontWeight: 900 } }, h("span", { style: { color: a.color || "#22d3ee" } }, "● "), a.code, " - ", a.name), h("div", { style: { color: "#94a3b8", fontSize: 12, marginTop: 6 } }, label(faType, a.account_type, fa), " • ", label(faLevel, a.level, fa), " • ", a.normal_balance === "debit" ? (fa ? "بدهکار" : "Debit") : (fa ? "بستانکار" : "Credit"))), h("div", { style: { display: "flex", gap: 8 } }, h("button", { style: { ...styles.btn, background: "rgba(34,211,238,.12)", color: "#a5f3fc" }, onClick: () => reset(a) }, "+"), h("button", { style: { ...styles.btn, background: "#334155", color: "white" }, onClick: async () => { await toggleAccountingAccount(a.id); await load(); } }, a.is_active ? "فعال" : "غیرفعال"), h("button", { style: { ...styles.btn, background: "#7f1d1d", color: "white" }, onClick: () => remove(a.id) }, fa ? "حذف" : "Delete")))))),
      h("aside", { style: styles.card }, h("h2", { style: { color: "#67e8f9", fontSize: 24, fontWeight: 900 } }, selected ? (fa ? "ویرایش حساب" : "Edit account") : (fa ? "حساب جدید" : "New account")), h("div", { style: { display: "grid", gap: 12 } }, h("input", { style: styles.input, value: form.code, onChange: e => patch("code", e.target.value), placeholder: fa ? "کد حساب" : "Code" }), h("input", { style: styles.input, value: form.name, onChange: e => patch("name", e.target.value), placeholder: fa ? "نام حساب" : "Name" }), h("select", { style: styles.input, value: form.account_type, onChange: e => patch("account_type", e.target.value) }, accountTypes.map(t => h("option", { key: t, value: t }, label(faType, t, fa)))), h("select", { style: styles.input, value: form.level, onChange: e => patch("level", e.target.value) }, accountLevels.map(l => h("option", { key: l, value: l }, label(faLevel, l, fa)))), h("select", { style: styles.input, value: form.parent_id, onChange: e => patch("parent_id", e.target.value) }, h("option", { value: "" }, fa ? "بدون والد" : "No parent"), accounts.filter(a => a.id !== selected?.id).map(a => h("option", { key: a.id, value: a.id }, `${a.code} - ${a.name}`))), h("select", { style: styles.input, value: form.normal_balance, onChange: e => patch("normal_balance", e.target.value) }, h("option", { value: "debit" }, fa ? "بدهکار" : "Debit"), h("option", { value: "credit" }, fa ? "بستانکار" : "Credit")), h("input", { type: "color", style: { ...styles.input, height: 48 }, value: form.color, onChange: e => patch("color", e.target.value) }), h("textarea", { style: styles.input, rows: 3, value: form.description, onChange: e => patch("description", e.target.value), placeholder: fa ? "توضیحات" : "Description" }), h("label", { style: { display: "flex", justifyContent: "space-between", background: "#1e293b", borderRadius: 16, padding: 12 } }, fa ? "فعال" : "Active", h("input", { type: "checkbox", checked: !!form.is_active, onChange: e => patch("is_active", e.target.checked) })), h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 } }, h("button", { onClick: save, style: { ...styles.btn, background: "#22d3ee", color: "#020617" } }, fa ? "ذخیره" : "Save"), h("button", { onClick: () => reset(), style: { ...styles.btn, background: "#1e293b", color: "#a5f3fc" } }, fa ? "جدید" : "New"))))
    )
  );
}
