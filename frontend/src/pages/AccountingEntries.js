import React, { useEffect, useMemo, useState } from "react";
import { useStableCallback } from "../hooks/useStableCallback";
import JalaliDateField from "../components/forms/JalaliDateField";
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
import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits } from "../localization/helpers";
import AttachmentsPanel from "../components/AttachmentsPanel";

const ACCOUNT_TYPE_FA = { asset: "دارایی", liability: "بدهی", equity: "سرمایه", revenue: "درآمد", expense: "هزینه", contra: "کاهنده" };
const ACCOUNT_TYPE_AR = { asset: "الأصول", liability: "الالتزامات", equity: "حقوق الملكية", revenue: "الإيرادات", expense: "المصروفات", contra: "حساب مقابل" };
const ACCOUNT_TYPE_TR = { asset: "Varlıklar", liability: "Yükümlülükler", equity: "Özkaynaklar", revenue: "Gelir", expense: "Giderler", contra: "Düzenleyici Hesap" };

const emptyLine = { account_id: "", description: "", debit: "", credit: "" };
function h(tag, props, ...children) { return React.createElement(tag, props, ...children); }
function toNumber(value) { return Number(String(value ?? "0").replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[^\d.-]/g, "")) || 0; }

export default function AccountingEntries() {
  const { language, dir, money, n, date } = useLanguage();
  const dateInputClass = "bg-[var(--erp-panel-solid)] text-[var(--erp-text)] border border-[var(--erp-border)] rounded-2xl p-3";
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
  const stableLoad = useStableCallback(load);

  useEffect(() => {
    const timer = setTimeout(() => { void stableLoad(); }, 0);
    return () => clearTimeout(timer);
  }, [language, stableLoad]);

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
      setMessage(status === "posted" ? (language === "fa" ? "سند قطعی شد." : language === "ar" ? "تم ترحيل السند." : language === "tr" ? "Fiş kesinleştirildi." : "Voucher posted.") : (language === "fa" ? "سند ذخیره شد." : language === "ar" ? "تم حفظ السند." : language === "tr" ? "Fiş kaydedildi." : "Voucher saved."));
      setForm({ voucher_date: new Date().toISOString().slice(0, 10), description: "", status: "draft", lines: [{ ...emptyLine }, { ...emptyLine }] });
      await load();
    } catch (e) { setMessage(e.message || (language === "fa" ? "خطا در ثبت سند" : language === "ar" ? "خطأ في حفظ السند" : language === "tr" ? "Fiş kaydetme hatası" : "Voucher save error")); }
  }

  async function post(id) { try { await postAccountingVoucher(id); await load(); } catch (e) { setMessage(e.message); } }
  async function cancel(id) { try { await cancelAccountingVoucher(id); await load(); } catch (e) { setMessage(e.message); } }
  async function remove(id) { if (!window.confirm(language === "fa" ? "سند حذف شود؟" : language === "ar" ? "هل تريد حذف السند؟" : language === "tr" ? "Fiş silinsin mi?" : "Delete voucher?")) return; try { await deleteAccountingVoucher(id); await load(); } catch (e) { setMessage(e.message); } }

  const styles = {
    root: { direction: dir, minHeight: "100vh", color: "var(--erp-text)", background: "var(--erp-bg)", padding: 20 },
    card: { background: "var(--erp-panel)", border: "1px solid var(--erp-border)", borderRadius: 28, padding: 20 },
    input: { width: "100%", background: "var(--erp-panel-solid)", color: "var(--erp-text)", border: "1px solid var(--erp-border)", borderRadius: 16, padding: 12 },
    btn: { border: 0, borderRadius: 16, padding: "12px 16px", fontWeight: 900, cursor: "pointer" },
    th: { padding: 10, textAlign: dir === "rtl" ? "right" : "left", color: "var(--erp-accent)", borderBottom: "1px solid var(--erp-border)" },
    td: { padding: 10, borderBottom: "1px solid var(--erp-border)", color: "var(--erp-text)" },
  };

  const TabButton = ({ id, label }) => h("button", {
    onClick: () => setActiveTab(id),
    style: { ...styles.btn, background: activeTab === id ? "var(--erp-accent)" : "var(--erp-panel-solid)", color: activeTab === id ? "#020617" : "var(--erp-accent)" },
  }, label);

  function reportFilters() {
    return h("div", { style: { ...styles.card, marginBottom: 16, display: "grid", gridTemplateColumns: "repeat(5, minmax(150px, 1fr))", gap: 12 } },
      h("select", { style: styles.input, value: filters.status, onChange: e => setFilters({ ...filters, status: e.target.value }) },
        h("option", { value: "posted" }, language === "fa" ? "فقط قطعی" : language === "ar" ? "المرحّل فقط" : language === "tr" ? "Yalnızca Kesinleşmiş" : "Posted only"),
        h("option", { value: "draft" }, language === "fa" ? "پیش‌نویس" : language === "ar" ? "مسودة" : language === "tr" ? "Taslak" : "Draft"),
        h("option", { value: "all" }, language === "fa" ? "همه" : language === "ar" ? "الكل" : language === "tr" ? "Tümü" : "All")
      ),
      h(JalaliDateField, { className: dateInputClass, value: filters.from_date, onChange: iso => setFilters({ ...filters, from_date: iso }), fa: language === "fa", language }),
      h(JalaliDateField, { className: dateInputClass, value: filters.to_date, onChange: iso => setFilters({ ...filters, to_date: iso }), fa: language === "fa", language }),
      h("select", { style: styles.input, value: filters.account_id, onChange: e => setFilters({ ...filters, account_id: e.target.value }) },
        h("option", { value: "" }, language === "fa" ? "همه حساب‌ها" : language === "ar" ? "جميع الحسابات" : language === "tr" ? "Tüm Hesaplar" : "All accounts"),
        accounts.map(acc => h("option", { key: acc.id, value: acc.id }, `${language === "fa" ? toPersianDigits(acc.code) : acc.code} - ${acc.name}`))
      ),
      h("button", { onClick: load, style: { ...styles.btn, background: "var(--erp-accent)", color: "#020617" } }, loading ? "..." : language === "fa" ? "اعمال فیلتر" : language === "ar" ? "تطبيق" : language === "tr" ? "Uygula" : "Apply")
    );
  }

  function summaryCards() {
    const cards = [
      [language === "fa" ? "کل اسناد" : language === "ar" ? "السندات" : language === "tr" ? "Fişler" : "Vouchers", n(summary?.vouchers_count || 0)],
      [language === "fa" ? "قطعی" : language === "ar" ? "مرحّل" : language === "tr" ? "Kesinleşmiş" : "Posted", n(summary?.posted_count || 0)],
      [language === "fa" ? "پیش‌نویس" : language === "ar" ? "مسودة" : language === "tr" ? "Taslak" : "Draft", n(summary?.draft_count || 0)],
      [language === "fa" ? "جمع بدهکار" : language === "ar" ? "إجمالي المدين" : language === "tr" ? "Toplam Borç" : "Total Debit", money(summary?.total_debit || 0)],
      [language === "fa" ? "جمع بستانکار" : language === "ar" ? "إجمالي الدائن" : language === "tr" ? "Toplam Alacak" : "Total Credit", money(summary?.total_credit || 0)],
      [language === "fa" ? "اختلاف" : language === "ar" ? "الفرق" : language === "tr" ? "Fark" : "Difference", money(summary?.difference || 0)],
    ];
    return h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 } },
      cards.map(([label, value]) => h("div", { key: label, style: styles.card },
        h("div", { style: { color: "var(--erp-muted)", fontSize: 13 } }, label),
        h("div", { style: { color: "var(--erp-accent)", fontSize: 24, fontWeight: 900, marginTop: 8 } }, value)
      ))
    );
  }

  function vouchersView() {
    return h("div", { style: { display: "grid", gridTemplateColumns: "minmax(0,1.25fr) minmax(360px,.75fr)", gap: 20 } },
      h("section", { style: styles.card },
        h("h2", { style: { color: "var(--erp-accent)", fontSize: 24, fontWeight: 900 } }, language === "fa" ? "ثبت سند جدید" : language === "ar" ? "سند جديد" : language === "tr" ? "Yeni Fiş" : "New Voucher"),
        h("div", { style: { display: "grid", gridTemplateColumns: "minmax(220px,auto) 1fr", gap: 12, marginBottom: 16 } },
          h(JalaliDateField, { className: dateInputClass, value: form.voucher_date, onChange: iso => setForm({ ...form, voucher_date: iso }), fa: language === "fa", language }),
          h("input", { style: styles.input, value: form.description, onChange: e => setForm({ ...form, description: language === "fa" ? toPersianDigits(e.target.value) : e.target.value }), placeholder: language === "fa" ? "شرح سند" : language === "ar" ? "وصف السند" : language === "tr" ? "Fiş Açıklaması" : "Voucher description" })
        ),
        h("div", { style: { overflowX: "auto" } },
          h("table", { style: { width: "100%", borderCollapse: "collapse", tableLayout: "fixed" } },
            h("colgroup", null,
              h("col", { style: { width: "30%" } }),
              h("col", { style: { width: "28%" } }),
              h("col", { style: { width: "15%" } }),
              h("col", { style: { width: "15%" } }),
              h("col", { style: { width: "48px" } })
            ),
            h("thead", null, h("tr", null,
              h("th", { style: styles.th }, language === "fa" ? "حساب" : language === "ar" ? "الحساب" : language === "tr" ? "Hesap" : "Account"),
              h("th", { style: styles.th }, language === "fa" ? "شرح" : language === "ar" ? "الوصف" : language === "tr" ? "Açıklama" : "Description"),
              h("th", { style: styles.th }, language === "fa" ? "بدهکار" : language === "ar" ? "مدين" : language === "tr" ? "Borç" : "Debit"),
              h("th", { style: styles.th }, language === "fa" ? "بستانکار" : language === "ar" ? "دائن" : language === "tr" ? "Alacak" : "Credit"),
              h("th", { style: styles.th }, "")
            )),
            h("tbody", null, form.lines.map((line, index) => h("tr", { key: index },
              h("td", { style: { padding: 6 } }, h("select", { style: styles.input, value: line.account_id, onChange: e => patchLine(index, "account_id", e.target.value) },
                h("option", { value: "" }, language === "fa" ? "انتخاب حساب" : language === "ar" ? "اختر الحساب" : language === "tr" ? "Hesap Seç" : "Select account"),
                accounts.map(acc => h("option", { key: acc.id, value: acc.id }, `${language === "fa" ? toPersianDigits(acc.code) : acc.code} - ${acc.name}`))
              )),
              h("td", { style: { padding: 6 } }, h("input", { style: styles.input, value: line.description, onChange: e => patchLine(index, "description", language === "fa" ? toPersianDigits(e.target.value) : e.target.value), placeholder: language === "fa" ? "شرح ردیف" : language === "ar" ? "وصف البند" : language === "tr" ? "Satır Açıklaması" : "Line description" })),
              h("td", { style: { padding: 6 } }, h("input", { style: styles.input, value: line.debit, onChange: e => patchLine(index, "debit", language === "fa" ? toPersianDigits(e.target.value) : e.target.value), placeholder: language === "fa" ? "۰" : "0" })),
              h("td", { style: { padding: 6 } }, h("input", { style: styles.input, value: line.credit, onChange: e => patchLine(index, "credit", language === "fa" ? toPersianDigits(e.target.value) : e.target.value), placeholder: language === "fa" ? "۰" : "0" })),
              h("td", { style: { padding: 6, textAlign: "center" } }, h("button", { onClick: () => removeLine(index), style: { ...styles.btn, width: 32, height: 32, padding: 0, background: "#7f1d1d", color: "white" } }, "×"))
            )))
          )
        ),
        h("div", { style: { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 16 } },
          h("button", { onClick: addLine, style: { ...styles.btn, background: "var(--erp-panel-solid)", color: "var(--erp-accent)" } }, language === "fa" ? "+ ردیف" : language === "ar" ? "+ بند" : language === "tr" ? "+ Satır" : "+ Line"),
          h("div", { style: { display: "flex", gap: 12, flexWrap: "wrap" } },
            h("div", { style: { color: "var(--erp-accent)", fontWeight: 900 } }, language === "fa" ? "بدهکار: " : language === "ar" ? "مدين: " : language === "tr" ? "Borç: " : "Debit: ", money(totals.debit)),
            h("div", { style: { color: "var(--erp-accent)", fontWeight: 900 } }, language === "fa" ? "بستانکار: " : language === "ar" ? "دائن: " : language === "tr" ? "Alacak: " : "Credit: ", money(totals.credit)),
            h("div", { className: totals.balanced ? "text-green-300" : "text-red-300", style: { fontWeight: 900 } }, totals.balanced ? (language === "fa" ? "تراز" : language === "ar" ? "متوازن" : language === "tr" ? "Dengeli" : "Balanced") : `${language === "fa" ? "اختلاف" : language === "ar" ? "الفرق" : language === "tr" ? "Fark" : "Diff"}: ${money(Math.abs(totals.diff))}`)
          )
        ),
        h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 } },
          h("button", { onClick: () => save("draft"), style: { ...styles.btn, background: "var(--erp-panel-solid)", color: "var(--erp-accent)" } }, language === "fa" ? "ذخیره پیش‌نویس" : language === "ar" ? "حفظ كمسودة" : language === "tr" ? "Taslak Olarak Kaydet" : "Save Draft"),
          h("button", { onClick: () => save("posted"), disabled: !totals.balanced, style: { ...styles.btn, background: totals.balanced ? "var(--erp-accent)" : "var(--erp-panel-solid)", color: totals.balanced ? "#020617" : "var(--erp-muted)" } }, language === "fa" ? "ثبت قطعی" : language === "ar" ? "ترحيل" : language === "tr" ? "Kesinleştir" : "Post")
        )
      ),
      h("aside", { style: styles.card },
        h("h2", { style: { color: "var(--erp-accent)", fontSize: 24, fontWeight: 900 } }, language === "fa" ? "آخرین اسناد" : language === "ar" ? "أحدث السندات" : language === "tr" ? "Son Fişler" : "Recent Vouchers"),
        h("div", { style: { display: "grid", gap: 10, maxHeight: 700, overflow: "auto" } }, vouchers.map(v => h("div", { key: v.id, style: { background: "var(--erp-panel-solid)", borderRadius: 18, padding: 14, border: "1px solid var(--erp-border)" } },
          h("div", { style: { display: "flex", justifyContent: "space-between", gap: 8 } },
            h("b", null, language === "fa" ? `سند ${n(v.voucher_no)}` : language === "ar" ? `سند ${n(v.voucher_no)}` : language === "tr" ? `Fiş ${v.voucher_no}` : `Voucher ${v.voucher_no}`),
            h("span", { className: v.status === "posted" ? "text-green-300" : v.status === "cancelled" ? "text-red-300" : "text-amber-200" }, v.status)
          ),
          h("div", { style: { color: "var(--erp-muted)", marginTop: 6 } }, date(v.voucher_date)),
          h("div", { style: { color: "var(--erp-text)", marginTop: 6 } }, v.description || "-"),
          h("div", { style: { color: "var(--erp-accent)", marginTop: 6, fontWeight: 900 } }, money(v.total_debit || 0)),
          h("div", { style: { marginTop: 10 } }, h(AttachmentsPanel, { entityType: "voucher", entityId: v.id, compact: true })),
          h("div", { style: { display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" } },
            v.status !== "posted" && h("button", { onClick: () => post(v.id), style: { ...styles.btn, background: "#16a34a", color: "white" } }, language === "fa" ? "قطعی" : language === "ar" ? "ترحيل" : language === "tr" ? "Kesinleştir" : "Post"),
            v.status !== "cancelled" && h("button", { onClick: () => cancel(v.id), style: { ...styles.btn, background: "#f59e0b", color: "#111827" } }, language === "fa" ? "ابطال" : language === "ar" ? "إلغاء" : language === "tr" ? "İptal" : "Cancel"),
            v.status !== "posted" && h("button", { onClick: () => remove(v.id), style: { ...styles.btn, background: "#7f1d1d", color: "white" } }, language === "fa" ? "حذف" : language === "ar" ? "حذف" : language === "tr" ? "Sil" : "Delete")
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
    { key: "voucher_no", label: language === "fa" ? "سند" : language === "ar" ? "السند" : language === "tr" ? "Fiş" : "Voucher", render: r => n(r.voucher_no) },
    { key: "voucher_date", label: language === "fa" ? "تاریخ" : language === "ar" ? "التاريخ" : language === "tr" ? "Tarih" : "Date", render: r => date(r.voucher_date) },
    { key: "account_code", label: language === "fa" ? "کد حساب" : language === "ar" ? "الرمز" : language === "tr" ? "Kod" : "Code", render: r => language === "fa" ? toPersianDigits(r.account_code) : r.account_code },
    { key: "account_name", label: language === "fa" ? "نام حساب" : language === "ar" ? "الحساب" : language === "tr" ? "Hesap" : "Account" },
    { key: "line_description", label: language === "fa" ? "شرح" : language === "ar" ? "الوصف" : language === "tr" ? "Açıklama" : "Description", render: r => r.line_description || r.voucher_description || "-" },
    { key: "debit", label: language === "fa" ? "بدهکار" : language === "ar" ? "مدين" : language === "tr" ? "Borç" : "Debit", render: r => money(r.debit || 0) },
    { key: "credit", label: language === "fa" ? "بستانکار" : language === "ar" ? "دائن" : language === "tr" ? "Alacak" : "Credit", render: r => money(r.credit || 0) },
  ];

  const ledgerColumns = [
    ...journalColumns,
    { key: "running_balance", label: language === "fa" ? "مانده" : language === "ar" ? "الرصيد" : language === "tr" ? "Bakiye" : "Balance", render: r => money(r.running_balance || 0) },
  ];

  const trialColumns = [
    { key: "account_code", label: language === "fa" ? "کد حساب" : language === "ar" ? "الرمز" : language === "tr" ? "Kod" : "Code", render: r => language === "fa" ? toPersianDigits(r.account_code) : r.account_code },
    { key: "account_name", label: language === "fa" ? "نام حساب" : language === "ar" ? "الحساب" : language === "tr" ? "Hesap" : "Account" },
    { key: "account_type", label: language === "fa" ? "نوع" : language === "ar" ? "النوع" : language === "tr" ? "Tür" : "Type", render: r => (language === "fa" ? ACCOUNT_TYPE_FA : language === "ar" ? ACCOUNT_TYPE_AR : language === "tr" ? ACCOUNT_TYPE_TR : null)?.[r.account_type] || r.account_type },
    { key: "debit", label: language === "fa" ? "گردش بدهکار" : language === "ar" ? "حركة المدين" : language === "tr" ? "Borç Hareketi" : "Debit Turnover", render: r => money(r.debit || 0) },
    { key: "credit", label: language === "fa" ? "گردش بستانکار" : language === "ar" ? "حركة الدائن" : language === "tr" ? "Alacak Hareketi" : "Credit Turnover", render: r => money(r.credit || 0) },
    { key: "debit_balance", label: language === "fa" ? "مانده بدهکار" : language === "ar" ? "رصيد مدين" : language === "tr" ? "Borç Bakiyesi" : "Debit Balance", render: r => money(r.debit_balance || 0) },
    { key: "credit_balance", label: language === "fa" ? "مانده بستانکار" : language === "ar" ? "رصيد دائن" : language === "tr" ? "Alacak Bakiyesi" : "Credit Balance", render: r => money(r.credit_balance || 0) },
  ];

  return h("div", { style: styles.root },
    h("div", { style: { display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 24 } },
      h("div", null,
        h("h1", { style: { color: "var(--erp-accent)", fontSize: 38, fontWeight: 900, margin: 0 } }, language === "fa" ? "اسناد و گزارش‌های حسابداری" : language === "ar" ? "سندات وتقارير المحاسبة" : language === "tr" ? "Muhasebe Fişleri ve Raporları" : "Accounting Vouchers & Reports"),
        h("p", { style: { color: "var(--erp-muted)" } }, language === "fa" ? "ثبت سند دوطرفه، دفتر روزنامه، دفتر کل و تراز آزمایشی" : language === "ar" ? "سندات القيد المزدوج، دفتر اليومية، دفتر الأستاذ، وميزان المراجعة" : language === "tr" ? "Çift taraflı fişler, yevmiye defteri, büyük defter ve mizan" : "Double-entry vouchers, journal, ledger and trial balance")
      ),
      h("button", { onClick: load, style: { ...styles.btn, background: "var(--erp-accent)", color: "#020617" } }, loading ? "..." : language === "fa" ? "به‌روزرسانی" : language === "ar" ? "تحديث" : language === "tr" ? "Yenile" : "Refresh")
    ),
    message && h("div", { style: { ...styles.card, marginBottom: 20, color: "var(--erp-accent)" } }, message),
    summaryCards(),
    h("div", { style: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 } },
      h(TabButton, { id: "vouchers", label: language === "fa" ? "ثبت سند" : language === "ar" ? "تسجيل السندات" : language === "tr" ? "Fiş Girişi" : "Vouchers" }),
      h(TabButton, { id: "journal", label: language === "fa" ? "دفتر روزنامه" : language === "ar" ? "دفتر اليومية" : language === "tr" ? "Yevmiye Defteri" : "Journal" }),
      h(TabButton, { id: "ledger", label: language === "fa" ? "دفتر کل" : language === "ar" ? "دفتر الأستاذ" : language === "tr" ? "Büyük Defter" : "Ledger" }),
      h(TabButton, { id: "trial", label: language === "fa" ? "تراز آزمایشی" : language === "ar" ? "ميزان المراجعة" : language === "tr" ? "Mizan" : "Trial Balance" })
    ),
    activeTab !== "vouchers" && reportFilters(),
    activeTab === "vouchers" && vouchersView(),
    activeTab === "journal" && tableView(journal, journalColumns),
    activeTab === "ledger" && tableView(ledger, ledgerColumns),
    activeTab === "trial" && h("div", null,
      tableView(trial.rows || [], trialColumns),
      h("div", { style: { ...styles.card, marginTop: 16, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" } },
        h("b", { style: { color: "var(--erp-accent)" } }, language === "fa" ? "جمع مانده بدهکار: " : language === "ar" ? "إجمالي الرصيد المدين: " : language === "tr" ? "Toplam Borç Bakiyesi: " : "Debit balance total: ", money(trial.totals?.debit_balance || 0)),
        h("b", { style: { color: "var(--erp-accent)" } }, language === "fa" ? "جمع مانده بستانکار: " : language === "ar" ? "إجمالي الرصيد الدائن: " : language === "tr" ? "Toplam Alacak Bakiyesi: " : "Credit balance total: ", money(trial.totals?.credit_balance || 0)),
        h("b", { className: trial.totals?.balanced ? "text-green-300" : "text-red-300" }, trial.totals?.balanced ? (language === "fa" ? "تراز است" : language === "ar" ? "متوازن" : language === "tr" ? "Dengeli" : "Balanced") : `${language === "fa" ? "اختلاف" : language === "ar" ? "الفرق" : language === "tr" ? "Fark" : "Difference"}: ${money(trial.totals?.difference || 0)}`)
      )
    )
  );
}
