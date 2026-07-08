import React, { useEffect, useMemo, useState } from "react";
import { getAccountingChart } from "../services/accountingApi";
import {
  cancelAccountingVoucher,
  createAccountingVoucher,
  deleteAccountingVoucher,
  getAccountingJournal,
  getAccountingLedger,
  getAccountingSummary,
  getAccountingTrialBalance,
  getAccountingVouchers,
  postAccountingVoucher,
} from "../services/accountingEntriesApi";
import { useLanguage } from "../localization/LanguageContext";

const emptyLine = { account_id: "", description: "", debit: "", credit: "" };
function h(tag, props, ...children) { return React.createElement(tag, props, ...children); }
function toNumber(value) { return Number(String(value ?? "0").replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[^\d.-]/g, "")) || 0; }

export default function AccountingEntries() {
  const { language, dir, money, n } = useLanguage();
  const fa = language === "fa";
  const [accounts, setAccounts] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [summary, setSummary] = useState(null);
  const [journal, setJournal] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [trial, setTrial] = useState({ rows: [], totals: {} });
  const [activeTab, setActiveTab] = useState("vouchers");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ status: "posted", from_date: "", to_date: "", account_id: "" });
  const [form, setForm] = useState({
    voucher_date: new Date().toISOString().slice(0, 10),
    description: "",
    status: "draft",
    lines: [{ ...emptyLine }, { ...emptyLine }],
  });

  async function load() {
    setLoading(true);
    try {
      const reportParams = {
        status: filters.status,
        from_date: filters.from_date,
        to_date: filters.to_date,
      };
      const ledgerParams = {
        ...reportParams,
        account_id: filters.account_id,
      };
      const [acc, vou, sum, jour, led, tb] = await Promise.all([
        getAccountingChart(),
        getAccountingVouchers({ limit: 150 }),
        getAccountingSummary(reportParams),
        getAccountingJournal({ ...reportParams, limit: 2000 }),
        getAccountingLedger(ledgerParams),
        getAccountingTrialBalance({ ...reportParams, include_zero: false }),
      ]);
      setAccounts(Array.isArray(acc) ? acc : []);
      setVouchers(Array.isArray(vou) ? vou : []);
      setSummary(sum || null);
      setJournal(Array.isArray(jour) ? jour : []);
      setLedger(Array.isArray(led) ? led : []);
      setTrial(tb || { rows: [], totals: {} });
      setMessage("");
    } catch (e) {
      setMessage(e.message || "Loading error");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [language]);

  const totals = useMemo(() => {
    const debit = form.lines.reduce((s, x) => s + toNumber(x.debit), 0);
    const credit = form.lines.reduce((s, x) => s + toNumber(x.credit), 0);
    return { debit, credit, diff: debit - credit, balanced: debit > 0 && Math.abs(debit - credit) < 0.01 };
  }, [form.lines]);

  function patchLine(index, key, value) {
    setForm(prev => ({ ...prev, lines: prev.lines.map((line, i) => i === index ? { ...line, [key]: value } : line) }));
  }
  function addLine() { setForm(prev => ({ ...prev, lines: [...prev.lines, { ...emptyLine }] })); }
  function removeLine(index) {
    setForm(prev => ({ ...prev, lines: prev.lines.length <= 2 ? prev.lines : prev.lines.filter((_, i) => i !== index) }));
  }

  async function save(status = "draft") {
    try {
      const payload = {
        ...form,
        status,
        lines: form.lines
          .filter(line => line.account_id && (toNumber(line.debit) > 0 || toNumber(line.credit) > 0))
          .map(line => ({
            account_id: Number(line.account_id),
            description: line.description || form.description || "",
            debit: toNumber(line.debit),
            credit: toNumber(line.credit),
          })),
      };
      await createAccountingVoucher(payload);
      setMessage(status === "posted" ? (fa ? "سند قطعی شد." : "Voucher posted.") : (fa ? "سند ذخیره شد." : "Voucher saved."));
      setForm({ voucher_date: new Date().toISOString().slice(0, 10), description: "", status: "draft", lines: [{ ...emptyLine }, { ...emptyLine }] });
      await load();
    } catch (e) { setMessage(e.message || (fa ? "خطا در ثبت سند" : "Voucher save error")); }
  }

  async function post(id) { try { await postAccountingVoucher(id); await load(); } catch (e) { setMessage(e.message); } }
  async function cancel(id) { try { await cancelAccountingVoucher(id); await load(); } catch (e) { setMessage(e.message); } }
  async function remove(id) { if (!window.confirm(fa ? "سند حذف شود؟" : "Delete voucher?")) return; try { await deleteAccountingVoucher(id); await load(); } catch (e) { setMessage(e.message); } }

  const styles = {
    root: { direction: dir, minHeight: "100vh", color: "white", background: "#071028", padding: 20 },
    card: { background: "rgba(15,23,42,.75)", border: "1px solid rgba(34,211,238,.22)", borderRadius: 28, padding: 20 },
    input: { width: "100%", background: "#1e293b", color: "white", border: "1px solid rgba(34,211,238,.18)", borderRadius: 16, padding: 12 },
    btn: { border: 0, borderRadius: 16, padding: "12px 16px", fontWeight: 900, cursor: "pointer" },
    th: { padding: 10, textAlign: dir === "rtl" ? "right" : "left", color: "#67e8f9", borderBottom: "1px solid rgba(255,255,255,.1)" },
    td: { padding: 10, borderBottom: "1px solid rgba(255,255,255,.06)", color: "#e2e8f0" },
  };

  const TabButton = ({ id, label }) => h("button", {
    onClick: () => setActiveTab(id),
    style: { ...styles.btn, background: activeTab === id ? "#22d3ee" : "#1e293b", color: activeTab === id ? "#020617" : "#a5f3fc" },
  }, label);

  const MoneyCell = ({ value }) => h("td", { style: { ...styles.td, fontWeight: 900, color: Number(value || 0) ? "#a5f3fc" : "#64748b" } }, money(value || 0));

  function reportFilters() {
    return h("div", { style: { ...styles.card, marginBottom: 16, display: "grid", gridTemplateColumns: "repeat(5, minmax(150px, 1fr))", gap: 12 } },
      h("select", { style: styles.input, value: filters.status, onChange: e => setFilters({ ...filters, status: e.target.value }) },
        h("option", { value: "posted" }, fa ? "فقط قطعی" : "Posted only"),
        h("option", { value: "draft" }, fa ? "پیش‌نویس" : "Draft"),
        h("option", { value: "all" }, fa ? "همه" : "All")
      ),
      h("input", { type: "date", style: styles.input, value: filters.from_date, onChange: e => setFilters({ ...filters, from_date: e.target.value }) }),
      h("input", { type: "date", style: styles.input, value: filters.to_date, onChange: e => setFilters({ ...filters, to_date: e.target.value }) }),
      h("select", { style: styles.input, value: filters.account_id, onChange: e => setFilters({ ...filters, account_id: e.target.value }) },
        h("option", { value: "" }, fa ? "همه حساب‌ها" : "All accounts"),
        accounts.map(acc => h("option", { key: acc.id, value: acc.id }, `${acc.code} - ${acc.name}`))
      ),
      h("button", { onClick: load, style: { ...styles.btn, background: "#22d3ee", color: "#020617" } }, loading ? "..." : fa ? "اعمال فیلتر" : "Apply")
    );
  }

  function summaryCards() {
    const cards = [
      [fa ? "کل اسناد" : "Vouchers", summary?.vouchers_count || 0],
      [fa ? "قطعی" : "Posted", summary?.posted_count || 0],
      [fa ? "پیش‌نویس" : "Draft", summary?.draft_count || 0],
      [fa ? "جمع بدهکار" : "Total Debit", money(summary?.total_debit || 0)],
      [fa ? "جمع بستانکار" : "Total Credit", money(summary?.total_credit || 0)],
      [fa ? "اختلاف" : "Difference", money(summary?.difference || 0)],
    ];
    return h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 } },
      cards.map(([label, value]) => h("div", { key: label, style: styles.card },
        h("div", { style: { color: "#94a3b8", fontSize: 13 } }, label),
        h("div", { style: { color: "#22d3ee", fontSize: 24, fontWeight: 900, marginTop: 8 } }, value)
      ))
    );
  }

  function vouchersView() {
    return h("div", { style: { display: "grid", gridTemplateColumns: "minmax(0,1.25fr) minmax(360px,.75fr)", gap: 20 } },
      h("section", { style: styles.card },
        h("h2", { style: { color: "#67e8f9", fontSize: 24, fontWeight: 900 } }, fa ? "ثبت سند جدید" : "New Voucher"),
        h("div", { style: { display: "grid", gridTemplateColumns: "180px 1fr", gap: 12, marginBottom: 16 } },
          h("input", { type: "date", style: styles.input, value: form.voucher_date, onChange: e => setForm({ ...form, voucher_date: e.target.value }) }),
          h("input", { style: styles.input, value: form.description, onChange: e => setForm({ ...form, description: e.target.value }), placeholder: fa ? "شرح سند" : "Voucher description" })
        ),
        h("div", { style: { overflowX: "auto" } },
          h("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: 760 } },
            h("thead", null, h("tr", null,
              h("th", { style: styles.th }, fa ? "حساب" : "Account"),
              h("th", { style: styles.th }, fa ? "شرح" : "Description"),
              h("th", { style: styles.th }, fa ? "بدهکار" : "Debit"),
              h("th", { style: styles.th }, fa ? "بستانکار" : "Credit"),
              h("th", { style: styles.th }, "")
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
          h("div", { style: { display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" } },
            v.status !== "posted" && h("button", { onClick: () => post(v.id), style: { ...styles.btn, background: "#16a34a", color: "white" } }, fa ? "قطعی" : "Post"),
            v.status !== "cancelled" && h("button", { onClick: () => cancel(v.id), style: { ...styles.btn, background: "#f59e0b", color: "#111827" } }, fa ? "ابطال" : "Cancel"),
            v.status !== "posted" && h("button", { onClick: () => remove(v.id), style: { ...styles.btn, background: "#7f1d1d", color: "white" } }, fa ? "حذف" : "Delete")
          )
        )))
      )
    );
  }

  function tableView(rows, columns) {
    return h("div", { style: { ...styles.card, overflowX: "auto" } },
      h("table", { style: { width: "100%", borderCollapse: "collapse", minWidth: 920 } },
        h("thead", null, h("tr", null, columns.map(col => h("th", { key: col.key, style: styles.th }, col.label)))),
        h("tbody", null, rows.map((row, i) => h("tr", { key: `${row.line_id || row.account_id || i}-${i}` }, columns.map(col => {
          const value = col.render ? col.render(row) : row[col.key];
          return h("td", { key: col.key, style: styles.td }, value ?? "-");
        }))))
      )
    );
  }

  const journalColumns = [
    { key: "voucher_no", label: fa ? "سند" : "Voucher", render: r => n(r.voucher_no) },
    { key: "voucher_date", label: fa ? "تاریخ" : "Date" },
    { key: "account_code", label: fa ? "کد حساب" : "Code" },
    { key: "account_name", label: fa ? "نام حساب" : "Account" },
    { key: "line_description", label: fa ? "شرح" : "Description", render: r => r.line_description || r.voucher_description || "-" },
    { key: "debit", label: fa ? "بدهکار" : "Debit", render: r => money(r.debit || 0) },
    { key: "credit", label: fa ? "بستانکار" : "Credit", render: r => money(r.credit || 0) },
  ];

  const ledgerColumns = [
    ...journalColumns,
    { key: "running_balance", label: fa ? "مانده" : "Balance", render: r => money(r.running_balance || 0) },
  ];

  const trialColumns = [
    { key: "account_code", label: fa ? "کد حساب" : "Code" },
    { key: "account_name", label: fa ? "نام حساب" : "Account" },
    { key: "account_type", label: fa ? "نوع" : "Type" },
    { key: "debit", label: fa ? "گردش بدهکار" : "Debit Turnover", render: r => money(r.debit || 0) },
    { key: "credit", label: fa ? "گردش بستانکار" : "Credit Turnover", render: r => money(r.credit || 0) },
    { key: "debit_balance", label: fa ? "مانده بدهکار" : "Debit Balance", render: r => money(r.debit_balance || 0) },
    { key: "credit_balance", label: fa ? "مانده بستانکار" : "Credit Balance", render: r => money(r.credit_balance || 0) },
  ];

  return h("div", { style: styles.root },
    h("div", { style: { display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 24 } },
      h("div", null,
        h("h1", { style: { color: "#22d3ee", fontSize: 38, fontWeight: 900, margin: 0 } }, fa ? "اسناد و گزارش‌های حسابداری" : "Accounting Vouchers & Reports"),
        h("p", { style: { color: "#94a3b8" } }, fa ? "ثبت سند دوطرفه، دفتر روزنامه، دفتر کل و تراز آزمایشی" : "Double-entry vouchers, journal, ledger and trial balance")
      ),
      h("button", { onClick: load, style: { ...styles.btn, background: "#22d3ee", color: "#020617" } }, loading ? "..." : fa ? "به‌روزرسانی" : "Refresh")
    ),
    message && h("div", { style: { ...styles.card, marginBottom: 20, color: "#a5f3fc" } }, message),
    summaryCards(),
    h("div", { style: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 } },
      h(TabButton, { id: "vouchers", label: fa ? "ثبت سند" : "Vouchers" }),
      h(TabButton, { id: "journal", label: fa ? "دفتر روزنامه" : "Journal" }),
      h(TabButton, { id: "ledger", label: fa ? "دفتر کل" : "Ledger" }),
      h(TabButton, { id: "trial", label: fa ? "تراز آزمایشی" : "Trial Balance" })
    ),
    activeTab !== "vouchers" && reportFilters(),
    activeTab === "vouchers" && vouchersView(),
    activeTab === "journal" && tableView(journal, journalColumns),
    activeTab === "ledger" && tableView(ledger, ledgerColumns),
    activeTab === "trial" && h("div", null,
      tableView(trial.rows || [], trialColumns),
      h("div", { style: { ...styles.card, marginTop: 16, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" } },
        h("b", { style: { color: "#a5f3fc" } }, fa ? "جمع مانده بدهکار: " : "Debit balance total: ", money(trial.totals?.debit_balance || 0)),
        h("b", { style: { color: "#a5f3fc" } }, fa ? "جمع مانده بستانکار: " : "Credit balance total: ", money(trial.totals?.credit_balance || 0)),
        h("b", { style: { color: trial.totals?.balanced ? "#86efac" : "#fca5a5" } }, trial.totals?.balanced ? (fa ? "تراز است" : "Balanced") : `${fa ? "اختلاف" : "Difference"}: ${money(trial.totals?.difference || 0)}`)
      )
    )
  );
}
