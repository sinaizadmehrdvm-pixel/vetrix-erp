
import React, { useEffect, useMemo, useState } from "react";
import { getAccountingChart } from "../services/accountingApi";
import { cancelAccountingVoucher, createAccountingVoucher, deleteAccountingVoucher, getAccountingVouchers, postAccountingVoucher } from "../services/accountingEntriesApi";
import { useLanguage } from "../localization/LanguageContext";

const emptyLine = { account_id: "", description: "", debit: "", credit: "" };
function h(tag, props, ...children) { return React.createElement(tag, props, ...children); }
function toNumber(value) { return Number(String(value ?? "0").replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[^\d.-]/g, "")) || 0; }

export default function AccountingEntries() {
  const { language, dir, money, n } = useLanguage();
  const fa = language === "fa";
  const [accounts, setAccounts] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ voucher_date: new Date().toISOString().slice(0, 10), description: "", status: "draft", lines: [{ ...emptyLine }, { ...emptyLine }] });

  async function load() {
    setLoading(true);
    try {
      const [acc, vou] = await Promise.all([getAccountingChart(), getAccountingVouchers()]);
      setAccounts(Array.isArray(acc) ? acc : []);
      setVouchers(Array.isArray(vou) ? vou : []);
    } catch (e) { setMessage(e.message || "Loading error"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [language]);

  const totals = useMemo(() => {
    const debit = form.lines.reduce((s, x) => s + toNumber(x.debit), 0);
    const credit = form.lines.reduce((s, x) => s + toNumber(x.credit), 0);
    return { debit, credit, diff: debit - credit, balanced: debit > 0 && debit === credit };
  }, [form.lines]);

  function patchLine(index, key, value) {
    setForm(prev => ({ ...prev, lines: prev.lines.map((line, i) => i === index ? { ...line, [key]: value } : line) }));
  }
  function addLine() { setForm(prev => ({ ...prev, lines: [...prev.lines, { ...emptyLine }] })); }
  function removeLine(index) { setForm(prev => ({ ...prev, lines: prev.lines.filter((_, i) => i !== index) })); }

  async function save(status = "draft") {
    try {
      const payload = {
        ...form, status,
        lines: form.lines.map(line => ({ account_id: Number(line.account_id), description: line.description || "", debit: toNumber(line.debit), credit: toNumber(line.credit) })),
      };
      await createAccountingVoucher(payload);
      setMessage(status === "posted" ? (fa ? "سند قطعی شد." : "Voucher posted.") : (fa ? "سند ذخیره شد." : "Voucher saved."));
      setForm({ voucher_date: new Date().toISOString().slice(0, 10), description: "", status: "draft", lines: [{ ...emptyLine }, { ...emptyLine }] });
      await load();
    } catch (e) { setMessage(e.message || (fa ? "خطا در ثبت سند" : "Voucher save error")); }
  }

  async function post(id) { await postAccountingVoucher(id); await load(); }
  async function cancel(id) { await cancelAccountingVoucher(id); await load(); }
  async function remove(id) { if (!window.confirm(fa ? "سند حذف شود؟" : "Delete voucher?")) return; await deleteAccountingVoucher(id); await load(); }

  const styles = {
    root: { direction: dir, minHeight: "100vh", color: "white", background: "#071028" },
    card: { background: "rgba(15,23,42,.75)", border: "1px solid rgba(34,211,238,.22)", borderRadius: 28, padding: 20 },
    input: { width: "100%", background: "#1e293b", color: "white", border: "1px solid rgba(34,211,238,.18)", borderRadius: 16, padding: 12 },
    btn: { border: 0, borderRadius: 16, padding: "12px 16px", fontWeight: 900, cursor: "pointer" }
  };

  return h("div", { style: styles.root },
    h("div", { style: { display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 24 } },
      h("div", null,
        h("h1", { style: { color: "#22d3ee", fontSize: 38, fontWeight: 900, margin: 0 } }, fa ? "سند حسابداری" : "Accounting Vouchers"),
        h("p", { style: { color: "#94a3b8" } }, fa ? "فاز عملیاتی: ثبت سند دوطرفه، کنترل تراز و قطعی‌سازی" : "Operational phase: balanced voucher entry and posting")
      ),
      h("button", { onClick: load, style: { ...styles.btn, background: "#22d3ee", color: "#020617" } }, loading ? "..." : fa ? "به‌روزرسانی" : "Refresh")
    ),
    message && h("div", { style: { ...styles.card, marginBottom: 20, color: "#a5f3fc" } }, message),
    h("div", { style: { display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(360px,.8fr)", gap: 20 } },
      h("section", { style: styles.card },
        h("h2", { style: { color: "#67e8f9", fontSize: 24, fontWeight: 900 } }, fa ? "ثبت سند جدید" : "New Voucher"),
        h("div", { style: { display: "grid", gridTemplateColumns: "180px 1fr", gap: 12, marginBottom: 16 } },
          h("input", { type: "date", style: styles.input, value: form.voucher_date, onChange: e => setForm({ ...form, voucher_date: e.target.value }) }),
          h("input", { style: styles.input, value: form.description, onChange: e => setForm({ ...form, description: e.target.value }), placeholder: fa ? "شرح سند" : "Voucher description" })
        ),
        h("div", { style: { overflowX: "auto" } },
          h("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: 760 } },
            h("thead", null, h("tr", { style: { color: "#67e8f9" } },
              h("th", { style: { padding: 10, textAlign: "right" } }, fa ? "حساب" : "Account"),
              h("th", { style: { padding: 10, textAlign: "right" } }, fa ? "شرح" : "Description"),
              h("th", { style: { padding: 10, textAlign: "right" } }, fa ? "بدهکار" : "Debit"),
              h("th", { style: { padding: 10, textAlign: "right" } }, fa ? "بستانکار" : "Credit"),
              h("th", { style: { padding: 10 } }, "")
            )),
            h("tbody", null, form.lines.map((line, index) => h("tr", { key: index },
              h("td", { style: { padding: 6 } }, h("select", { style: styles.input, value: line.account_id, onChange: e => patchLine(index, "account_id", e.target.value) },
                h("option", { value: "" }, fa ? "انتخاب حساب" : "Select account"),
                accounts.map(acc => h("option", { key: acc.id, value: acc.id }, `${acc.code} - ${acc.name}`))
              )),
              h("td", { style: { padding: 6 } }, h("input", { style: styles.input, value: line.description, onChange: e => patchLine(index, "description", e.target.value), placeholder: fa ? "شرح ردیف" : "Line description" })),
              h("td", { style: { padding: 6 } }, h("input", { style: styles.input, value: line.debit, onChange: e => patchLine(index, "debit", e.target.value), placeholder: "0" })),
              h("td", { style: { padding: 6 } }, h("input", { style: styles.input, value: line.credit, onChange: e => patchLine(index, "credit", e.target.value), placeholder: "0" })),
              h("td", { style: { padding: 6 } }, h("button", { onClick: () => removeLine(index), style: { ...styles.btn, background: "#7f1d1d", color: "white" } }, "×"))
            )))
          )
        ),
        h("div", { style: { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 16 } },
          h("button", { onClick: addLine, style: { ...styles.btn, background: "#1e293b", color: "#a5f3fc" } }, fa ? "+ ردیف" : "+ Line"),
          h("div", { style: { display: "flex", gap: 12, flexWrap: "wrap" } },
            h("div", { style: { color: "#22d3ee", fontWeight: 900 } }, fa ? "بدهکار: " : "Debit: ", money(totals.debit)),
            h("div", { style: { color: "#22d3ee", fontWeight: 900 } }, fa ? "بستانکار: " : "Credit: ", money(totals.credit)),
            h("div", { style: { color: totals.balanced ? "#86efac" : "#fca5a5", fontWeight: 900 } }, totals.balanced ? (fa ? "تراز" : "Balanced") : `${fa ? "اختلاف" : "Diff"}: ${money(Math.abs(totals.diff))}`)
          )
        ),
        h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 } },
          h("button", { onClick: () => save("draft"), style: { ...styles.btn, background: "#1e293b", color: "#a5f3fc" } }, fa ? "ذخیره پیش‌نویس" : "Save Draft"),
          h("button", { onClick: () => save("posted"), disabled: !totals.balanced, style: { ...styles.btn, background: totals.balanced ? "#22d3ee" : "#334155", color: totals.balanced ? "#020617" : "#94a3b8" } }, fa ? "ثبت قطعی" : "Post")
        )
      ),
      h("aside", { style: styles.card },
        h("h2", { style: { color: "#67e8f9", fontSize: 24, fontWeight: 900 } }, fa ? "آخرین اسناد" : "Recent Vouchers"),
        h("div", { style: { display: "grid", gap: 10, maxHeight: 700, overflow: "auto" } }, vouchers.map(v => h("div", { key: v.id, style: { background: "rgba(30,41,59,.75)", borderRadius: 18, padding: 14, border: "1px solid rgba(255,255,255,.06)" } },
          h("div", { style: { display: "flex", justifyContent: "space-between", gap: 8 } },
            h("b", null, fa ? `سند ${n(v.voucher_no)}` : `Voucher ${v.voucher_no}`),
            h("span", { style: { color: v.status === "posted" ? "#86efac" : v.status === "cancelled" ? "#fca5a5" : "#fde68a" } }, v.status)
          ),
          h("div", { style: { color: "#94a3b8", marginTop: 6 } }, v.voucher_date),
          h("div", { style: { color: "white", marginTop: 6 } }, v.description || "-"),
          h("div", { style: { color: "#22d3ee", marginTop: 6, fontWeight: 900 } }, money(v.total_debit || 0)),
          h("div", { style: { display: "flex", gap: 8, marginTop: 10 } },
            v.status !== "posted" && h("button", { onClick: () => post(v.id), style: { ...styles.btn, background: "#16a34a", color: "white" } }, fa ? "قطعی" : "Post"),
            v.status !== "cancelled" && h("button", { onClick: () => cancel(v.id), style: { ...styles.btn, background: "#f59e0b", color: "#111827" } }, fa ? "ابطال" : "Cancel"),
            v.status !== "posted" && h("button", { onClick: () => remove(v.id), style: { ...styles.btn, background: "#7f1d1d", color: "white" } }, fa ? "حذف" : "Delete")
          )
        )))
      )
    )
  );
}
