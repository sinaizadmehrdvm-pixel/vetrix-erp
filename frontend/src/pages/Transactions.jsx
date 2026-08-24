import { useCallback, useEffect, useMemo, useState } from "react";
import { useStableCallback } from "../hooks/useStableCallback";
import { Link } from "react-router-dom";
import JalaliDateField from "../components/forms/JalaliDateField";
import { Table, Thead, Th, Tbody, Tr, Td } from "../components/ui/Table";
import Select from "../components/ui/Select";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Plus,
  Search,
  Trash2,
  Wallet,
  UserRound,
  Edit3,
  Save,
  X,
  Printer,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";

import toast from "react-hot-toast";
import { useLanguage } from "../localization/useLanguage";
import { confirmAction } from "../components/ui/confirmService";
import {
  getCustomers,
  openAuthenticatedDocument,
  getTransactions,
  createTransaction,
  updateTransaction,
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
  "bg-[var(--erp-panel-solid)] text-[var(--erp-text)] placeholder-[var(--erp-muted)] border border-[var(--erp-border)] focus:border-[var(--erp-accent)] rounded-2xl p-4 outline-none transition-all min-h-[58px]";

const REASON_LABELS = {
  fa: {
    invoice_payment: "بابت فاکتور",
    advance: "علی‌الحساب",
    debt_settlement: "تسویه بدهی",
    service_fee: "هزینه خدمات",
    salary: "حقوق / دستمزد",
    rent: "اجاره",
    other: "سایر",
  },
  ar: {
    invoice_payment: "مقابل فاتورة",
    advance: "دفعة مقدمة",
    debt_settlement: "تسوية دين",
    service_fee: "رسوم خدمة",
    salary: "راتب / أجر",
    rent: "إيجار",
    other: "أخرى",
  },
  tr: {
    invoice_payment: "Fatura karşılığı",
    advance: "Avans ödemesi",
    debt_settlement: "Borç kapatma",
    service_fee: "Hizmet ücreti",
    salary: "Maaş / ücret",
    rent: "Kira",
    other: "Diğer",
  },
  en: {
    invoice_payment: "Invoice payment",
    advance: "Advance payment",
    debt_settlement: "Debt settlement",
    service_fee: "Service fee",
    salary: "Salary",
    rent: "Rent",
    other: "Other",
  },
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
  const map = REASON_LABELS[language] || REASON_LABELS.en;
  return map[reason] || reason || "-";
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
  const { t, money, language, dir, date, n, country } = useLanguage();
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

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
        tr(
          "اتصال به سرور برقرار نشد؛ تراکنش‌ها از حافظه آفلاین نمایش داده شدند.",
          "تعذّر الاتصال بالخادم؛ يتم عرض المعاملات من الذاكرة المؤقتة دون اتصال.",
          "Sunucuya bağlanılamadı; işlemler çevrimdışı önbellekten gösteriliyor.",
          "Server unavailable; transactions loaded from offline cache."
        )
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
      pos: tr("کارتخوان", "جهاز نقاط البيع", "POS cihazı", "POS"),
      bank: t("bank"),
      cheque: t("cheque"),
    };

    return map[method] || method || "-";
  }

  function transactionTypeLabel(item) {
    if (item.type === "income" || item.source_type === "receipt") {
      return tr("دریافت", "مقبوضات", "Tahsilat", "Receipt");
    }
    if (item.type === "outcome" || item.source_type === "payment") {
      return tr("پرداخت", "مدفوعات", "Ödeme", "Payment");
    }
    if (item.source_type === "invoice") return tr("فاکتور", "فاتورة", "Fatura", "Invoice");
    if (item.source_type === "opening_balance") return tr("مانده اول دوره", "الرصيد الافتتاحي", "Açılış bakiyesi", "Opening balance");
    return item.source_type || "-";
  }

  function transactionColor(item) {
    if (item.type === "income" || item.source_type === "receipt") return "#22c55e";
    if (item.type === "outcome" || item.source_type === "payment") return "#ef4444";
    if (item.source_type === "invoice") return "var(--erp-accent)";
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
      toast.error(tr("طرف‌حساب و مبلغ را وارد کن", "أدخل الطرف والمبلغ", "Cari ve tutarı girin", "Enter party and amount"));
      return;
    }

    const amount = toNumber(form.amount);

    if (amount <= 0) {
      toast.error(tr("مبلغ معتبر نیست", "المبلغ غير صالح", "Geçersiz tutar", "Invalid amount"));
      return;
    }

    const payload = buildPayload();
    // Generated once per submit attempt so a lost-response retry (network
    // blip, double-click) reuses the same key instead of posting a second,
    // independent settlement entry - same reasoning as Invoices.jsx's own
    // idempotencyKey for invoice creation.
    const idempotencyKey = editingId ? null : (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

    try {
      const result = editingId
        ? await updateTransaction(editingId, payload)
        : await createTransaction(payload, idempotencyKey);

      if (result?.status === "error") {
        throw new Error(result.message || tr("خطا در ثبت تراکنش", "خطأ في تسجيل المعاملة", "İşlem kaydedilirken hata oluştu", "Transaction error"));
      }

      resetForm();
      await load();
    } catch (error) {
      console.error("Save transaction error:", error);
      toast.error(error.message || tr("خطا در ثبت تراکنش", "خطأ في تسجيل المعاملة", "İşlem kaydedilirken hata oluştu", "Error saving transaction"));
    }
  }

  function editTransaction(item) {
    if (!["receipt", "payment"].includes(item.source_type)) {
      toast.error(
        tr(
          "فقط دریافت و پرداخت دستی قابل ویرایش است. فاکتور یا مانده اول دوره باید از صفحه خودش ویرایش شود.",
          "يمكن تعديل المقبوضات والمدفوعات اليدوية فقط. يجب تعديل الفاتورة أو الرصيد الافتتاحي من صفحته الخاصة.",
          "Yalnızca manuel tahsilat/ödeme düzenlenebilir. Fatura veya açılış bakiyesi kendi sayfasından düzenlenmelidir.",
          "Only manual receipts/payments can be edited. Edit invoices or opening balances from their own pages."
        )
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
      toast.error(
        tr(
          "این رکورد از فاکتور یا مانده اول دوره ساخته شده و از این صفحه حذف نمی‌شود.",
          "تم إنشاء هذا السجل من فاتورة أو رصيد افتتاحي ولا يمكن حذفه من هذه الصفحة.",
          "Bu kayıt bir faturadan veya açılış bakiyesinden oluşturuldu ve bu sayfadan silinemez.",
          "This record is generated from invoice/opening balance and cannot be deleted here."
        )
      );
      return;
    }

    const ok = await confirmAction(tr("آیا از حذف تراکنش مطمئنی؟", "هل أنت متأكد من حذف المعاملة؟", "İşlemi silmek istediğinizden emin misiniz?", "Delete this transaction?"), { danger: true });
    if (!ok) return;

    try {
      await deleteTransaction(item.id);

      if (String(editingId) === String(item.id)) {
        resetForm();
      }

      await load();
    } catch (error) {
      console.error("Delete transaction error:", error);
      toast.error(error.message || tr("خطا در حذف تراکنش", "خطأ في حذف المعاملة", "İşlem silinirken hata oluştu", "Error deleting transaction"));
    }
  }

  async function printTransactionReceipt(item) {
    try {
      await openAuthenticatedDocument(`/print/transaction/${item.id}`);
    } catch (error) {
      toast.error(error.message || tr("خطا در دریافت رسید", "خطأ في تحميل الإيصال", "Fiş alınırken hata oluştu", "Receipt loading error"));
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
          <h1 className="text-4xl font-black text-[var(--erp-accent)]">{t("transactions")}</h1>
          <p className="text-[var(--erp-muted)] mt-2">
            {tr(
              "ثبت دریافت و پرداخت، مشاهده گردش حساب و چاپ رسید",
              "تسجيل المقبوضات والمدفوعات، ومراجعة حركة الحساب، وطباعة الإيصال",
              "Tahsilat ve ödeme kaydı, hesap hareketlerini görüntüleme ve fiş yazdırma",
              "Create receipts/payments, review cashflow and print receipts"
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={load}
          className="px-4 py-3 rounded-2xl bg-[var(--erp-panel-solid)] text-[var(--erp-accent)] font-black flex items-center gap-2 border border-[var(--erp-border)]"
        >
          <RefreshCw size={18} />
          {tr("به‌روزرسانی", "تحديث", "Yenile", "Refresh")}
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
          title={tr("جمع دریافت", "إجمالي المقبوضات", "Toplam tahsilat", "Total receipts")}
          value={money(totalIncome)}
          icon={<ArrowDownCircle size={28} />}
          color="#22c55e"
        />
        <SummaryCard
          title={tr("جمع پرداخت", "إجمالي المدفوعات", "Toplam ödeme", "Total payments")}
          value={money(totalOutcome)}
          icon={<ArrowUpCircle size={28} />}
          color="#ef4444"
        />
        <SummaryCard
          title={tr("خالص نقدی", "صافي النقد", "Net nakit", "Net cash")}
          value={money(balance)}
          icon={<Wallet size={28} />}
          color="var(--erp-accent)"
        />
      </div>

      <div
        style={{
          background: "var(--erp-bg-soft)",
          border: "1px solid var(--erp-border)",
          borderRadius: 28,
          padding: 20,
        }}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <Select
            className={inputClass}
            value={form.type}
            onChange={(value) => setForm({ ...form, type: value })}
            options={[
              { value: "income", label: tr("دریافت", "مقبوضات", "Tahsilat", "Receipt") },
              { value: "outcome", label: tr("پرداخت", "مدفوعات", "Ödeme", "Payment") },
            ]}
          />

          <Select
            className={inputClass}
            value={form.reason}
            onChange={(value) => setForm({ ...form, reason: value })}
            options={Object.keys(REASON_LABELS.fa).map((key) => ({
              value: key,
              label: getReasonLabel(key, language),
            }))}
          />

          <Select
            className={inputClass}
            value={form.party_id}
            onChange={(value) => setForm({ ...form, party_id: value })}
            options={[
              {
                value: "",
                label:
                  form.type === "income"
                    ? tr("انتخاب پرداخت‌کننده", "اختر الدافع", "Ödeyeni seçin", "Select payer")
                    : tr("انتخاب دریافت‌کننده", "اختر المستلم", "Alıcıyı seçin", "Select receiver"),
              },
              ...parties.map((party) => ({ value: party.id, label: party.name })),
            ]}
          />

          <input
            type="text"
            inputMode="numeric"
            value={language === "fa" ? toPersianDigits(form.amount) : form.amount}
            onChange={(e) =>
              setForm({
                ...form,
                amount: cleanNumber(e.target.value),
              })
            }
            placeholder={t("amount")}
            className={inputClass}
          />

          <Select
            value={form.method}
            onChange={(value) => setForm({ ...form, method: value })}
            options={[
              { value: "cash", label: t("cash") },
              { value: "pos", label: tr("کارتخوان", "جهاز نقاط البيع", "POS cihazı", "POS") },
              { value: "card", label: t("card") },
              { value: "bank", label: t("bank") },
              { value: "cheque", label: t("cheque") },
            ]}
          />

          <input
            type="text"
            inputMode="numeric"
            value={language === "fa" ? toPersianDigits(form.invoice_id) : form.invoice_id}
            onChange={(e) => setForm({ ...form, invoice_id: cleanNumber(e.target.value) })}
            placeholder={tr("شماره فاکتور مرتبط (اختیاری)", "رقم الفاتورة المرتبطة (اختياري)", "İlişkili fatura no (isteğe bağlı)", "Linked invoice ID (optional)")}
            className={inputClass}
          />

          <JalaliDateField
            value={form.date}
            onChange={(isoDate) => setForm({ ...form, date: isoDate })}
            fa={language === "fa"}
            language={language}
            country={country}
            className={inputClass}
          />
        </div>

        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: language === "fa" ? toPersianDigits(e.target.value) : e.target.value })}
          placeholder={tr("توضیحات تکمیلی", "وصف إضافي", "Ek açıklama", "Additional description")}
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
            {editingId ? tr("ذخیره ویرایش", "حفظ التعديل", "Düzenlemeyi kaydet", "Save Edit") : t("addTransaction")}
          </button>

          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="px-5 py-3 rounded-2xl bg-[var(--erp-panel-solid)] text-[var(--erp-text)] font-black flex items-center gap-2"
            >
              <X size={18} />
              {tr("لغو ویرایش", "إلغاء التعديل", "Düzenlemeyi iptal et", "Cancel Edit")}
            </button>
          )}
        </div>
      </div>

      <div
        style={{
          background: "var(--erp-bg-soft)",
          border: "1px solid var(--erp-border)",
          borderRadius: 28,
          padding: 20,
        }}
      >
        {/* .vitalix-input-group (index.css) owns the rounded pill's border/
            background/focus-within ring on the outer container - the bare
            <input> gives up its own outline/border/box-shadow via that
            same class's `> input` rule, so it never shows the browser's
            square focus box inside the rounded pill. !rounded-2xl keeps
            this page's existing 16px radius instead of the class's 12px
            default. */}
        <div className="vitalix-input-group !rounded-2xl flex items-center gap-2 px-4 py-3 mb-5">
          <Search size={18} />
          <input
            value={search}
            onChange={(e) => setSearch(language === "fa" ? toPersianDigits(e.target.value) : e.target.value)}
            placeholder={t("searchTransaction")}
            className="min-w-0 flex-1 text-[var(--erp-text)] placeholder-[var(--erp-muted)]"
          />
        </div>

        {loading ? (
          <p style={{ color: "var(--erp-muted)" }}>{tr("در حال دریافت...", "جارٍ التحميل...", "Yükleniyor...", "Loading...")}</p>
        ) : filteredTransactions.length === 0 ? (
          <p style={{ color: "var(--erp-muted)" }}>{t("noData")}</p>
        ) : (
          <Table dir={dir} className="text-sm">
            <Thead>
              <Th className="w-12">#</Th>
              <Th>{t("transactionType")}</Th>
              <Th>{tr("بابت", "السبب", "Sebep", "Reason")}</Th>
              <Th>{t("party")}</Th>
              <Th>{t("method")}</Th>
              <Th align="end">{t("amount")}</Th>
              <Th align="end">{tr("مانده بعد", "الرصيد بعد", "Sonraki bakiye", "Balance after")}</Th>
              <Th>{t("date")}</Th>
              <Th>{t("actions")}</Th>
            </Thead>

            <Tbody>
              {filteredTransactions.map((item, rowIndex) => (
                <Tr key={item.id}>
                  <Td className="text-[var(--erp-muted)] font-bold">{n(rowIndex + 1)}</Td>
                  <Td>
                    <span style={{ color: transactionColor(item), fontWeight: 900 }}>
                      {transactionTypeLabel(item)}
                    </span>
                  </Td>

                  <Td>{getReasonLabel(item.reason, language)}</Td>

                  <Td>
                    {item.party_id || item.customer_id ? (
                      <Link
                        to={`/customers/${item.party_id || item.customer_id}`}
                        className="text-[var(--erp-accent)] font-bold inline-flex items-center gap-2"
                      >
                        <UserRound size={16} />
                        {partyName(item.party_id || item.customer_id)}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </Td>

                  <Td>{methodLabel(item.method)}</Td>
                  <Td align="end" className="font-black">{money(item.amount)}</Td>
                  <Td align="end" className="font-bold text-[var(--erp-accent)]">
                    {item.balance_after ? money(item.balance_after) : "-"}
                  </Td>
                  <Td>{displayDate(item.created_at || item.date)}</Td>

                  <Td>
                    <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => editTransaction(item)}
                          title={tr("ویرایش", "تعديل", "Düzenle", "Edit")}
                          style={{
                            width: 38,
                            height: 38,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: 12,
                            border: "none",
                            background: "var(--erp-glow)",
                            color: "var(--erp-accent)",
                            cursor: "pointer",
                          }}
                        >
                          <Edit3 size={17} />
                        </button>

                        <button
                          type="button"
                          onClick={() => printTransactionReceipt(item)}
                          title={tr("چاپ رسید", "طباعة الإيصال", "Fişi yazdır", "Print receipt")}
                          style={{
                            width: 38,
                            height: 38,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: 12,
                            border: "none",
                            background: "var(--erp-glow)",
                            color: "var(--erp-accent)",
                            cursor: "pointer",
                          }}
                        >
                          <Printer size={17} />
                        </button>

                        <button
                          type="button"
                          onClick={() => removeTransaction(item)}
                          title={tr("حذف", "حذف", "Sil", "Delete")}
                          className="text-red-300"
                          style={{
                            width: 38,
                            height: 38,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: 12,
                            border: "none",
                            background: "rgba(239,68,68,0.18)",
                            cursor: "pointer",
                          }}
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ title, value, icon, color }) {
  return (
    <div
      style={{
        background: "var(--erp-bg-soft)",
        border: "1px solid var(--erp-border)",
        borderRadius: 24,
        padding: 20,
        color: "var(--erp-text)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxShadow: "0 16px 40px rgba(0,0,0,0.25)",
      }}
    >
      <div>
        <div style={{ color: "var(--erp-muted)", marginBottom: 8 }}>{title}</div>
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
