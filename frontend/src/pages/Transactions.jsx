import { useCallback, useEffect, useMemo, useState } from "react";
import { useStableCallback } from "../hooks/useStableCallback";
import { Link } from "react-router-dom";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Plus,
  Search,
  Trash2,
  Wallet,
  UserRound,
  CalendarDays,
  Edit3,
  Save,
  X,
  Printer,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";

import { useLanguage } from "../localization/useLanguage";
import {
  getCustomers,
  openAuthenticatedDocument,
  getTransactions,
  createTransaction,
  deleteTransaction,
} from "../services/api";
import { getCache, setCache } from "../storage/db";

const TRANSACTIONS_CACHE_KEY = "transactions";
const CUSTOMERS_CACHE_KEY = "customers";

const emptyForm = {
  type: "income",
  reason: "invoice_payment",
  party_id: "",
  invoice_id: "",
  amount: "",
  method: "cash",
  date: "",
  description: "",
};

const inputClass =
  "bg-slate-800 text-white placeholder-slate-400 border border-cyan-500/10 focus:border-cyan-400 rounded-2xl p-4 outline-none transition-all min-h-[58px]";

const faReasons = {
  invoice_payment: "بابت فاکتور",
  advance: "علی‌الحساب",
  debt_settlement: "تسویه بدهی",
  service_fee: "هزینه خدمات",
  salary: "حقوق / دستمزد",
  rent: "اجاره",
  other: "سایر",
};

const enReasons = {
  invoice_payment: "Invoice payment",
  advance: "Advance payment",
  debt_settlement: "Debt settlement",
  service_fee: "Service fee",
  salary: "Salary",
  rent: "Rent",
  other: "Other",
};

function toEnglishDigits(value) {
  return String(value || "")
    .replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))
    .replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
}

function toPersianDigits(value) {
  return String(value || "").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]);
}

function cleanNumber(value) {
  return toEnglishDigits(value).replace(/[,،]/g, "").replace(/[^\d.-]/g, "");
}

function toNumber(value) {
  const num = Number(cleanNumber(value));
  return Number.isFinite(num) ? num : 0;
}

function todayByLanguage() {
  // Business dates stay ISO in storage; presentation uses the selected country calendar.
  return new Date().toISOString().slice(0, 10);
}

function getReasonLabel(reason, language) {
  return language === "fa"
    ? faReasons[reason] || reason || "-"
    : enReasons[reason] || reason || "-";
}

function normalizeParty(party = {}) {
  const balance = Number(party.balance || 0);
  return {
    ...party,
    opening_balance: Number(party.opening_balance || 0),
    debtor: Number(party.debit ?? party.debtor ?? (balance > 0 ? balance : 0)),
    creditor: Number(party.credit ?? party.creditor ?? (balance < 0 ? Math.abs(balance) : 0)),
    credit_limit: Number(party.credit_limit || 0),
    balance,
  };
}

function normalizeTransaction(item = {}) {
  const sourceType = item.source_type || item.transaction_type || item.type || "";
  const isReceipt = sourceType === "receipt" || sourceType === "income";
  const isPayment = sourceType === "payment" || sourceType === "outcome" || sourceType === "expense";
  const debit = toNumber(item.debit);
  const credit = toNumber(item.credit);
  const amount = toNumber(item.amount || credit || debit);

  return {
    ...item,
    id: item.id,
    type: isReceipt ? "income" : isPayment ? "outcome" : sourceType,
    transaction_type: isReceipt ? "receipt" : isPayment ? "payment" : sourceType,
    source_type: sourceType,
    party_id: item.party_id ?? item.customer_id ?? "",
    customer_id: item.customer_id ?? item.party_id ?? "",
    invoice_id: item.invoice_id ?? (sourceType === "receipt" || sourceType === "payment" ? item.source_id : null),
    source_id: item.source_id ?? item.invoice_id ?? null,
    amount,
    debit,
    credit,
    reason: item.reason || (item.invoice_id || item.source_id ? "invoice_payment" : "other"),
    method: item.method || "cash",
    date: item.date || item.created_at || "",
    description: item.description || item.note || "",
    balance_after: toNumber(item.balance_after),
    created_at: item.created_at || item.date || new Date().toISOString(),
  };
}

export default function Transactions() {
  const { t, money, language, dir, date } = useLanguage();
  const fa = language === "fa";

  const [transactions, setTransactions] = useState([]);
  const [parties, setParties] = useState([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    ...emptyForm,
    date: todayByLanguage(language),
  });
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [offlineMode, setOfflineMode] = useState(false);

  async function load() {
    setLoading(true);
    setMessage("");
    setOfflineMode(false);

    try {
      const [customersData, transactionsData] = await Promise.all([
        getCustomers(),
        getTransactions(),
      ]);

      const normalizedParties = Array.isArray(customersData)
        ? customersData.map(normalizeParty)
        : [];
      const normalizedTransactions = Array.isArray(transactionsData)
        ? transactionsData.map(normalizeTransaction)
        : [];

      setParties(normalizedParties);
      setTransactions(normalizedTransactions);

      await setCache(CUSTOMERS_CACHE_KEY, normalizedParties);
      await setCache(TRANSACTIONS_CACHE_KEY, normalizedTransactions);
    } catch (error) {
      console.error("Transactions loading error:", error);

      const cachedParties = await getCache(CUSTOMERS_CACHE_KEY);
      const cachedTransactions = await getCache(TRANSACTIONS_CACHE_KEY);

      setParties(Array.isArray(cachedParties) ? cachedParties.map(normalizeParty) : []);
      setTransactions(
        Array.isArray(cachedTransactions)
          ? cachedTransactions.map(normalizeTransaction)
          : []
      );

      setOfflineMode(true);
      setMessage(
        fa
          ? "اتصال به سرور برقرار نشد؛ تراکنش‌ها از حافظه آفلاین نمایش داده شدند."
          : "Server unavailable; transactions loaded from offline cache."
      );
    } finally {
      setLoading(false);
    }
  }

  const stableLoad = useStableCallback(load);

  useEffect(() => {
    const timer = setTimeout(() => { void stableLoad(); }, 0);
    return () => clearTimeout(timer);
  }, [language, stableLoad]);

  useEffect(() => {
    const timer = setTimeout(() => setForm((prev) => ({
      ...prev,
      date: prev.date || todayByLanguage(language),
    })), 0);
    return () => clearTimeout(timer);
  }, [language]);

  const partyName = useCallback((id) => {
    return parties.find((p) => String(p.id) === String(id))?.name || "-";
  }, [parties]);

  function methodLabel(method) {
    const map = {
      cash: t("cash"),
      card: t("card"),
      pos: fa ? "کارتخوان" : "POS",
      bank: t("bank"),
      cheque: t("cheque"),
    };

    return map[method] || method || "-";
  }

  function transactionTypeLabel(item) {
    if (item.type === "income" || item.source_type === "receipt") {
      return fa ? "دریافت" : "Receipt";
    }
    if (item.type === "outcome" || item.source_type === "payment") {
      return fa ? "پرداخت" : "Payment";
    }
    if (item.source_type === "invoice") return fa ? "فاکتور" : "Invoice";
    if (item.source_type === "opening_balance") return fa ? "مانده اول دوره" : "Opening balance";
    return item.source_type || "-";
  }

  function transactionColor(item) {
    if (item.type === "income" || item.source_type === "receipt") return "#22c55e";
    if (item.type === "outcome" || item.source_type === "payment") return "#ef4444";
    if (item.source_type === "invoice") return "#22d3ee";
    return "#f59e0b";
  }

  const totalIncome = transactions
    .filter((item) => item.type === "income" || item.source_type === "receipt")
    .reduce((sum, item) => sum + toNumber(item.amount || item.credit), 0);

  const totalOutcome = transactions
    .filter((item) => item.type === "outcome" || item.source_type === "payment")
    .reduce((sum, item) => sum + toNumber(item.amount || item.debit), 0);

  const balance = totalIncome - totalOutcome;

  const filteredTransactions = useMemo(() => {
    const keyword = toEnglishDigits(search).trim().toLowerCase();
    if (!keyword) return transactions;

    return transactions.filter((item) =>
      [
        getReasonLabel(item.reason, language),
        item.title,
        partyName(item.party_id || item.customer_id),
        item.party_name,
        item.customer_name,
        item.method,
        item.type,
        item.source_type,
        item.description,
        item.amount,
        item.date,
        item.created_at,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [transactions, search, language, partyName]);

  function resetForm() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      date: todayByLanguage(language),
    });
  }

  function buildPayload() {
    return {
      customer_id: Number(form.party_id),
      amount: toNumber(form.amount),
      transaction_type: form.type === "income" ? "receipt" : "payment",
      method: form.method || "cash",
      note: [getReasonLabel(form.reason, language), form.description]
        .filter(Boolean)
        .join(" - "),
      invoice_id: form.invoice_id ? Number(form.invoice_id) : null,
    };
  }

  async function saveTransaction() {
    if (!form.party_id || !form.amount) {
      alert(fa ? "طرف‌حساب و مبلغ را وارد کن" : "Enter party and amount");
      return;
    }

    const amount = toNumber(form.amount);

    if (amount <= 0) {
      alert(fa ? "مبلغ معتبر نیست" : "Invalid amount");
      return;
    }

    const payload = buildPayload();

    try {
      if (editingId) {
        await deleteTransaction(editingId);
      }

      const result = await createTransaction(payload);

      if (result?.status === "error") {
        throw new Error(result.message || (fa ? "خطا در ثبت تراکنش" : "Transaction error"));
      }

      resetForm();
      await load();
    } catch (error) {
      console.error("Save transaction error:", error);
      alert(error.message || (fa ? "خطا در ثبت تراکنش" : "Error saving transaction"));
    }
  }

  function editTransaction(item) {
    if (!["receipt", "payment"].includes(item.source_type)) {
      alert(
        fa
          ? "فقط دریافت و پرداخت دستی قابل ویرایش است. فاکتور یا مانده اول دوره باید از صفحه خودش ویرایش شود."
          : "Only manual receipts/payments can be edited. Edit invoices or opening balances from their own pages."
      );
      return;
    }

    setEditingId(item.id);
    setForm({
      type: item.source_type === "receipt" ? "income" : "outcome",
      reason: item.reason || "invoice_payment",
      party_id: String(item.customer_id || item.party_id || ""),
      invoice_id: item.invoice_id ? String(item.invoice_id) : "",
      amount: String(item.amount || item.credit || item.debit || ""),
      method: item.method || "cash",
      date: item.date || todayByLanguage(language),
      description: item.description || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function removeTransaction(item) {
    if (!["receipt", "payment"].includes(item.source_type)) {
      alert(
        fa
          ? "این رکورد از فاکتور یا مانده اول دوره ساخته شده و از این صفحه حذف نمی‌شود."
          : "This record is generated from invoice/opening balance and cannot be deleted here."
      );
      return;
    }

    const ok = window.confirm(fa ? "آیا از حذف تراکنش مطمئنی؟" : "Delete this transaction?");
    if (!ok) return;

    try {
      await deleteTransaction(item.id);

      if (String(editingId) === String(item.id)) {
        resetForm();
      }

      await load();
    } catch (error) {
      console.error("Delete transaction error:", error);
      alert(error.message || (fa ? "خطا در حذف تراکنش" : "Error deleting transaction"));
    }
  }

  async function printTransactionReceipt(item) {
    try {
      await openAuthenticatedDocument(`/print/transaction/${item.id}`);
    } catch (error) {
      alert(error.message || (fa ? "خطا در دریافت رسید" : "Receipt loading error"));
    }
  }

  function displayDate(value) {
    if (!value) return "-";
    try {
      return date ? date(value) : value;
    } catch {
      return value;
    }
  }

  return (
    <div dir={dir} className="space-y-6" style={{ direction: dir }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-cyan-400">{t("transactions")}</h1>
          <p className="text-slate-400 mt-2">
            {fa
              ? "ثبت دریافت و پرداخت، مشاهده گردش حساب و چاپ رسید"
              : "Create receipts/payments, review cashflow and print receipts"}
          </p>
        </div>

        <button
          type="button"
          onClick={load}
          className="px-4 py-3 rounded-2xl bg-slate-800 text-cyan-200 font-black flex items-center gap-2 border border-cyan-500/20"
        >
          <RefreshCw size={18} />
          {fa ? "به‌روزرسانی" : "Refresh"}
        </button>
      </div>

      {message && (
        <div
          className={`rounded-2xl p-4 flex items-center gap-2 ${
            offlineMode
              ? "bg-amber-500/15 border border-amber-400/30 text-amber-100"
              : "bg-rose-500/15 border border-rose-400/30 text-rose-100"
          }`}
        >
          <AlertTriangle size={20} />
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <SummaryCard
          title={fa ? "جمع دریافت" : "Total receipts"}
          value={money(totalIncome)}
          icon={<ArrowDownCircle size={28} />}
          color="#22c55e"
        />
        <SummaryCard
          title={fa ? "جمع پرداخت" : "Total payments"}
          value={money(totalOutcome)}
          icon={<ArrowUpCircle size={28} />}
          color="#ef4444"
        />
        <SummaryCard
          title={fa ? "خالص نقدی" : "Net cash"}
          value={money(balance)}
          icon={<Wallet size={28} />}
          color="#22d3ee"
        />
      </div>

      <div
        style={{
          background: "rgba(15,23,42,0.65)",
          border: "1px solid rgba(34,211,238,0.18)",
          borderRadius: 28,
          padding: 20,
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            className={inputClass}
          >
            <option value="income">{fa ? "دریافت" : "Receipt"}</option>
            <option value="outcome">{fa ? "پرداخت" : "Payment"}</option>
          </select>

          <select
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            className={inputClass}
          >
            {Object.keys(faReasons).map((key) => (
              <option key={key} value={key}>
                {getReasonLabel(key, language)}
              </option>
            ))}
          </select>

          <select
            value={form.party_id}
            onChange={(e) => setForm({ ...form, party_id: e.target.value })}
            className={inputClass}
          >
            <option value="">
              {form.type === "income"
                ? fa
                  ? "انتخاب پرداخت‌کننده"
                  : "Select payer"
                : fa
                ? "انتخاب دریافت‌کننده"
                : "Select receiver"}
            </option>

            {parties.map((party) => (
              <option key={party.id} value={party.id}>
                {party.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            inputMode="numeric"
            value={fa ? toPersianDigits(form.amount) : form.amount}
            onChange={(e) =>
              setForm({
                ...form,
                amount: cleanNumber(e.target.value),
              })
            }
            placeholder={t("amount")}
            className={inputClass}
          />

          <select
            value={form.method}
            onChange={(e) => setForm({ ...form, method: e.target.value })}
            className={inputClass}
          >
            <option value="cash">{t("cash")}</option>
            <option value="pos">{fa ? "کارتخوان" : "POS"}</option>
            <option value="card">{t("card")}</option>
            <option value="bank">{t("bank")}</option>
            <option value="cheque">{t("cheque")}</option>
          </select>

          <input
            type="text"
            inputMode="numeric"
            value={fa ? toPersianDigits(form.invoice_id) : form.invoice_id}
            onChange={(e) => setForm({ ...form, invoice_id: cleanNumber(e.target.value) })}
            placeholder={fa ? "شماره فاکتور مرتبط (اختیاری)" : "Linked invoice ID (optional)"}
            className={inputClass}
          />

          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              value={fa ? toPersianDigits(form.date) : form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              placeholder={fa ? "تاریخ شمسی مثل ۱۴۰۵/۰۳/۰۹" : "Date like 2026-05-30"}
              className={inputClass}
              style={{ width: "100%" }}
            />

            <button
              type="button"
              onClick={() => setForm({ ...form, date: todayByLanguage(language) })}
              className="px-4 rounded-2xl bg-cyan-400 text-slate-950 font-black flex items-center gap-2"
              style={{ minWidth: 105 }}
            >
              <CalendarDays size={17} />
              {fa ? "امروز" : "Today"}
            </button>
          </div>
        </div>

        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder={fa ? "توضیحات تکمیلی" : "Additional description"}
          className={`${inputClass} w-full mt-3`}
          rows={3}
        />

        <div className="flex gap-3 flex-wrap mt-4">
          <button
            type="button"
            onClick={saveTransaction}
            style={{
              padding: "14px 20px",
              borderRadius: 18,
              border: "none",
              background: "#22d3ee",
              color: "#071028",
              fontWeight: 900,
              display: "flex",
              alignItems: "center",
              gap: 8,
              cursor: "pointer",
            }}
          >
            {editingId ? <Save size={18} /> : <Plus size={18} />}
            {editingId ? (fa ? "ذخیره ویرایش" : "Save Edit") : t("addTransaction")}
          </button>

          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="px-5 py-3 rounded-2xl bg-slate-700 text-white font-black flex items-center gap-2"
            >
              <X size={18} />
              {fa ? "لغو ویرایش" : "Cancel Edit"}
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          background: "rgba(15,23,42,0.65)",
          border: "1px solid rgba(34,211,238,0.18)",
          borderRadius: 28,
          padding: 20,
        }}
      >
        <div className="flex items-center gap-2 bg-slate-800 rounded-2xl px-4 py-3 mb-5">
          <Search size={18} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchTransaction")}
            className="bg-transparent outline-none w-full text-white placeholder-slate-400"
          />
        </div>

        {loading ? (
          <p style={{ color: "#94a3b8" }}>{fa ? "در حال دریافت..." : "Loading..."}</p>
        ) : filteredTransactions.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>{t("noData")}</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", color: "white" }}>
              <thead>
                <tr style={{ color: "#22d3ee" }}>
                  <th className="p-3 text-start">{t("transactionType")}</th>
                  <th className="p-3 text-start">{fa ? "بابت" : "Reason"}</th>
                  <th className="p-3 text-start">{t("party")}</th>
                  <th className="p-3 text-start">{t("method")}</th>
                  <th className="p-3 text-start">{t("amount")}</th>
                  <th className="p-3 text-start">{fa ? "مانده بعد" : "Balance after"}</th>
                  <th className="p-3 text-start">{t("date")}</th>
                  <th className="p-3 text-start">{t("actions")}</th>
                </tr>
              </thead>

              <tbody>
                {filteredTransactions.map((item) => (
                  <tr key={item.id} style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                    <td className="p-3">
                      <span style={{ color: transactionColor(item), fontWeight: 900 }}>
                        {transactionTypeLabel(item)}
                      </span>
                    </td>

                    <td className="p-3">{getReasonLabel(item.reason, language)}</td>

                    <td className="p-3">
                      {item.party_id || item.customer_id ? (
                        <Link
                          to={`/customers/${item.party_id || item.customer_id}`}
                          className="text-cyan-300 font-bold inline-flex items-center gap-2"
                        >
                          <UserRound size={16} />
                          {partyName(item.party_id || item.customer_id)}
                        </Link>
                      ) : (
                        "-"
                      )}
                    </td>

                    <td className="p-3">{methodLabel(item.method)}</td>
                    <td className="p-3 font-black">{money(item.amount)}</td>
                    <td className="p-3 font-bold text-cyan-200">
                      {item.balance_after ? money(item.balance_after) : "-"}
                    </td>
                    <td className="p-3">{displayDate(item.created_at || item.date)}</td>

                    <td className="p-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => editTransaction(item)}
                          title={fa ? "ویرایش" : "Edit"}
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 12,
                            border: "none",
                            background: "rgba(34,211,238,0.18)",
                            color: "#67e8f9",
                            cursor: "pointer",
                          }}
                        >
                          <Edit3 size={17} />
                        </button>

                        <button
                          type="button"
                          onClick={() => printTransactionReceipt(item)}
                          title={fa ? "چاپ رسید" : "Print receipt"}
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 12,
                            border: "none",
                            background: "rgba(34,211,238,0.18)",
                            color: "#67e8f9",
                            cursor: "pointer",
                          }}
                        >
                          <Printer size={17} />
                        </button>

                        <button
                          type="button"
                          onClick={() => removeTransaction(item)}
                          title={fa ? "حذف" : "Delete"}
                          style={{
                            width: 38,
                            height: 38,
                            borderRadius: 12,
                            border: "none",
                            background: "rgba(239,68,68,0.18)",
                            color: "#fca5a5",
                            cursor: "pointer",
                          }}
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ title, value, icon, color }) {
  return (
    <div
      style={{
        background: "rgba(15,23,42,0.75)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 24,
        padding: 20,
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxShadow: "0 16px 40px rgba(0,0,0,0.25)",
      }}
    >
      <div>
        <div style={{ color: "#94a3b8", marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 26, fontWeight: 900 }}>{value}</div>
      </div>

      <div
        style={{
          width: 58,
          height: 58,
          borderRadius: 18,
          background: color,
          color: "#071028",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </div>
    </div>
  );
}
