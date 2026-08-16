import { useEffect, useMemo, useState } from "react";
import { useStableCallback } from "../hooks/useStableCallback";
import {
  Wallet,
  Plus,
  Search,
  CalendarDays,
  Trash2,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";

import toast from "react-hot-toast";
import { useLanguage } from "../localization/useLanguage";
import { createExpense, deleteExpense, getExpenses, isNetworkError } from "../services/api";
import { confirmAction } from "../components/ui/confirmService";
import { translateApiError } from "../localization/apiErrors";
import { toPersianDigits, toEnglishDigits } from "../localization/helpers";
import { getCache, setCache } from "../storage/db";
import { countPending, syncPendingRecords, useOnlineSync } from "../storage/offlineSync";
import ReceiptScanner from "../components/ReceiptScanner";
import AttachmentsPanel from "../components/AttachmentsPanel";
import Select from "../components/ui/Select";

const EXPENSES_CACHE_KEY = "expenses";

const inputClass =
  "bg-[var(--erp-panel-solid)] text-[var(--erp-text)] placeholder-[var(--erp-muted)] border border-[var(--erp-border)] focus:border-cyan-400 rounded-[var(--erp-radius-md)] py-2.5 px-3 outline-none transition-all w-full";

function toNumber(value) {
  const cleaned = toEnglishDigits(String(value || ""))
    .replace(/[,،]/g, "")
    .replace(/[^\d.-]/g, "");

  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

function faText(value, fa) {
  if (value === null || value === undefined) return "";
  return fa ? toPersianDigits(value) : String(value);
}

function normalizeAmount(value, fa) {
  const cleaned = toEnglishDigits(String(value || ""))
    .replace(/[,،]/g, "")
    .replace(/[^\d.]/g, "");

  return fa ? toPersianDigits(cleaned) : cleaned;
}

function normalizeJalaliDate(value, fa) {
  const cleaned = toEnglishDigits(String(value || ""))
    .replace(/[^\d/]/g, "")
    .slice(0, 10);

  return fa ? toPersianDigits(cleaned) : cleaned;
}

function saveDate(value) {
  return toEnglishDigits(String(value || ""));
}

function showDate(value, fa, fallbackDateFn) {
  if (!value) return "-";

  const text = String(value);

  if (text.includes("/")) {
    return fa ? toPersianDigits(text) : toEnglishDigits(text);
  }

  return fallbackDateFn(value);
}

function Field({ label, children }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-bold text-[var(--erp-accent)] block">{label}</label>
      {children}
    </div>
  );
}

export default function Expenses() {
  const { language, money, date, dir } = useLanguage();
  const fa = language === "fa";

  const [search, setSearch] = useState("");
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    title: "",
    category: "general",
    amount: "",
    expense_date: "",
    note: "",
  });

  const label = {
    title: language === "fa" ? "هزینه‌ها" : language === "ar" ? "المصروفات" : language === "tr" ? "Giderler" : "Expenses",
    subtitle: language === "fa"
      ? "ثبت هزینه‌های کسب‌وکار و نمایش در گزارش سود و زیان"
      : language === "ar"
      ? "تسجيل مصروفات الأعمال وعرضها في قائمة الدخل"
      : language === "tr"
      ? "İşletme giderlerini kaydedin ve gelir tablosunda görüntüleyin"
      : "Business expense tracking",
    expenseTitle: language === "fa" ? "عنوان هزینه" : language === "ar" ? "عنوان المصروف" : language === "tr" ? "Gider Başlığı" : "Expense title",
    category: language === "fa" ? "دسته‌بندی" : language === "ar" ? "التصنيف" : language === "tr" ? "Kategori" : "Category",
    categoryOptions: {
      general: language === "fa" ? "اداری و عمومی" : language === "ar" ? "إداري وعام" : language === "tr" ? "Genel ve idari" : "General & administrative",
      rent_utilities: language === "fa" ? "اجاره و تأسیسات" : language === "ar" ? "الإيجار والمرافق" : language === "tr" ? "Kira ve faturalar" : "Rent & utilities",
      marketing: language === "fa" ? "بازاریابی و تبلیغات" : language === "ar" ? "التسويق والإعلان" : language === "tr" ? "Pazarlama ve reklam" : "Marketing & advertising",
      payroll: language === "fa" ? "حقوق و دستمزد" : language === "ar" ? "الرواتب والأجور" : language === "tr" ? "Maaş ve ücretler" : "Salaries & payroll",
      transport: language === "fa" ? "حمل و نقل" : language === "ar" ? "النقل والشحن" : language === "tr" ? "Nakliye ve kargo" : "Transport & shipping",
      office_supplies: language === "fa" ? "لوازم و تجهیزات اداری" : language === "ar" ? "لوازم ومعدات مكتبية" : language === "tr" ? "Ofis malzemeleri" : "Office supplies & equipment",
      maintenance: language === "fa" ? "تعمیر و نگهداری" : language === "ar" ? "الصيانة والإصلاح" : language === "tr" ? "Bakım ve onarım" : "Maintenance & repairs",
    },
    amount: language === "fa" ? "مبلغ" : language === "ar" ? "المبلغ" : language === "tr" ? "Tutar" : "Amount",
    date: language === "fa" ? "تاریخ شمسی" : language === "ar" ? "التاريخ" : language === "tr" ? "Tarih" : "Date",
    note: language === "fa" ? "توضیحات" : language === "ar" ? "ملاحظة" : language === "tr" ? "Not" : "Note",
    add: language === "fa" ? "ثبت هزینه" : language === "ar" ? "إضافة مصروف" : language === "tr" ? "Gider Ekle" : "Add expense",
    search: language === "fa" ? "جستجوی عنوان، دسته‌بندی یا توضیحات..." : language === "ar" ? "بحث عن العنوان أو التصنيف أو الملاحظات..." : language === "tr" ? "Başlık, kategori veya not ara..." : "Search...",
    noData: language === "fa" ? "هنوز هزینه‌ای ثبت نشده است." : language === "ar" ? "لا توجد بيانات" : language === "tr" ? "Veri yok" : "No data",
    refresh: language === "fa" ? "به‌روزرسانی" : language === "ar" ? "تحديث" : language === "tr" ? "Yenile" : "Refresh",
    loading: language === "fa" ? "در حال دریافت..." : language === "ar" ? "جارٍ التحميل..." : language === "tr" ? "Yükleniyor..." : "Loading...",
    totalExpenses: language === "fa" ? "جمع هزینه‌ها" : language === "ar" ? "إجمالي المصروفات" : language === "tr" ? "Toplam Giderler" : "Total expenses",
    records: language === "fa" ? "تعداد رکورد" : language === "ar" ? "عدد السجلات" : language === "tr" ? "Kayıt Sayısı" : "Records",
    datePlaceholder: language === "fa" ? "۱۴۰۵/۰۳/۲۸" : "1405/03/28",
  };

  async function load() {
    try {
      setLoading(true);
      setError("");

      const data = await getExpenses();
      const normalized = Array.isArray(data) ? data : [];
      setExpenses(normalized);
      await setCache(EXPENSES_CACHE_KEY, normalized);
    } catch (e) {
      console.error(e);
      const cached = await getCache(EXPENSES_CACHE_KEY);
      if (Array.isArray(cached) && cached.length) {
        setExpenses(cached);
        setError(language === "fa" ? "اتصال برقرار نیست؛ داده‌های ذخیره‌شده نمایش داده می‌شود." : language === "ar" ? "غير متصل؛ يتم عرض البيانات المخزّنة مؤقتًا." : language === "tr" ? "Çevrimdışı; önbelleğe alınmış veriler gösteriliyor." : "Offline; showing cached expenses.");
      } else {
        setError(language === "fa" ? "خطا در دریافت هزینه‌ها" : language === "ar" ? "خطأ في تحميل المصروفات" : language === "tr" ? "Giderler yüklenirken hata oluştu" : "Error loading expenses");
      }
    } finally {
      setLoading(false);
    }
  }

  const stableLoad = useStableCallback(load);

  useEffect(() => {
    const timer = setTimeout(() => { void stableLoad(); }, 0);
    return () => clearTimeout(timer);
  }, [language, stableLoad]);

  async function addExpense() {
    const amount = toNumber(form.amount);

    if (!form.title || amount <= 0) {
      toast.error(language === "fa" ? "عنوان و مبلغ هزینه را وارد کن" : language === "ar" ? "العنوان والمبلغ مطلوبان" : language === "tr" ? "Başlık ve tutar zorunludur" : "Title & amount required");
      return;
    }

    const payload = {
      title: form.title,
      category: form.category,
      amount,
      note: form.note,
      expense_date: form.expense_date ? saveDate(form.expense_date) : null,
    };

    try {
      const result = await createExpense(payload);

      if (result?.status === "error") {
        throw new Error(result.message);
      }

      setForm({
        title: "",
        category: "general",
        amount: "",
        expense_date: "",
        note: "",
      });

      await load();
    } catch (e) {
      console.error("Create expense error:", e);

      // The server was reached and rejected the request (RBAC, validation,
      // ...) - retrying later would fail identically, so this must NOT be
      // queued offline. Surface the real reason immediately instead.
      if (!isNetworkError(e)) {
        toast.error(translateApiError(e.message, language) || (language === "fa" ? "خطا در ثبت هزینه" : language === "ar" ? "خطأ في تسجيل المصروف" : language === "tr" ? "Gider kaydedilirken hata oluştu" : "Error saving expense"));
        return;
      }

      const offlineExpense = {
        ...payload,
        id: Date.now(),
        created_at: new Date().toISOString(),
        pending_sync: true,
        offline_created: true,
      };

      const next = [offlineExpense, ...(Array.isArray(expenses) ? expenses : [])];
      setExpenses(next);
      await setCache(EXPENSES_CACHE_KEY, next);

      setForm({ title: "", category: "general", amount: "", expense_date: "", note: "" });
      setError(language === "fa" ? "سرور در دسترس نبود؛ هزینه در حافظه آفلاین ذخیره شد." : language === "ar" ? "الخادم غير متاح؛ تم حفظ المصروف دون اتصال." : language === "tr" ? "Sunucuya ulaşılamadı; gider çevrimdışı kaydedildi." : "Server unavailable; expense saved offline.");
    }
  }

  function extractExpensePayload(item) {
    return {
      title: item.title,
      category: item.category,
      amount: toNumber(item.amount),
      note: item.note,
      expense_date: item.expense_date || null,
    };
  }

  function mergeExpenseResult(item, serverResult, payload) {
    return {
      ...item,
      ...payload,
      id: item.offline_created ? serverResult?.id || item.id : item.id,
      pending_sync: false,
      offline_created: false,
    };
  }

  async function createExpenseForSync(payload) {
    const result = await createExpense(payload);
    if (result?.status === "error") throw new Error(result.message || "sync failed");
    return result;
  }

  async function syncPendingExpenses() {
    if (countPending(expenses) === 0) return;
    const { items: updated, syncedCount } = await syncPendingRecords(expenses, {
      extractPayload: extractExpensePayload,
      create: createExpenseForSync,
      update: async () => { throw new Error("expenses are never offline-updated"); },
      mergeResult: mergeExpenseResult,
    });
    setExpenses(updated);
    await setCache(EXPENSES_CACHE_KEY, updated);
    if (syncedCount > 0) {
      setError("");
    }
  }

  useOnlineSync(syncPendingExpenses);

  function applyScannedExpense(items) {
    if (!items?.length) return;
    const total = items.reduce((sum, item) => sum + toNumber(item.total || item.unit_price), 0);
    const title = items.map((item) => item.description).filter(Boolean).join(", ");
    setForm((current) => ({
      ...current,
      title: faText(title || current.title, fa),
      amount: normalizeAmount(String(total || current.amount), fa),
    }));
  }

  async function removeExpense(id) {
    if (!(await confirmAction(language === "fa" ? "این هزینه حذف شود؟" : language === "ar" ? "هل تريد حذف هذا المصروف؟" : language === "tr" ? "Bu gider silinsin mi?" : "Delete this expense?", { danger: true }))) return;

    try {
      await deleteExpense(id);
      await load();
    } catch (e) {
      console.error("Delete expense error:", e);
      const filtered = expenses.filter((item) => String(item.id) !== String(id));
      setExpenses(filtered);
      await setCache(EXPENSES_CACHE_KEY, filtered);
      setError(language === "fa" ? "سرور در دسترس نبود؛ هزینه فقط از حافظه آفلاین حذف شد." : language === "ar" ? "الخادم غير متاح؛ تمت إزالة المصروف من الذاكرة المؤقتة دون اتصال فقط." : language === "tr" ? "Sunucuya ulaşılamadı; gider yalnızca çevrimdışı önbellekten kaldırıldı." : "Server unavailable; expense removed from offline cache only.");
    }
  }

  const filtered = useMemo(() => {
    return expenses.filter((item) =>
      [item.title, item.category, item.note]
        .join(" ")
        .toLowerCase()
        .includes(toEnglishDigits(search).toLowerCase())
    );
  }, [expenses, search]);

  const total = expenses.reduce((sum, item) => sum + toNumber(item.amount), 0);

  return (
    <div className="space-y-6" dir={dir} style={{ direction: dir }}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl font-black text-[var(--erp-accent)]">{label.title}</h1>
          <p className="text-[var(--erp-muted)] mt-2">{label.subtitle}</p>
        </div>

        <div className="flex items-center gap-2">
          <ReceiptScanner onApply={applyScannedExpense} />
          <button
            onClick={load}
            className="px-4 py-3 rounded-2xl bg-[var(--erp-panel-solid)] text-[var(--erp-accent)] font-bold flex items-center gap-2 border border-[var(--erp-border)]"
          >
            <RefreshCw size={18} />
            {label.refresh}
          </button>
        </div>
      </div>

      {countPending(expenses) > 0 && (
        <div className="bg-amber-500/15 border border-amber-400/30 text-amber-100 rounded-2xl p-4 text-sm">
          {language === "fa"
            ? `${toPersianDigits(countPending(expenses))} هزینه آفلاین در انتظار همگام‌سازی است.`
            : language === "ar"
            ? `${countPending(expenses)} مصروف غير متصل بانتظار المزامنة.`
            : language === "tr"
            ? `${countPending(expenses)} çevrimdışı gider senkronizasyon bekliyor.`
            : `${countPending(expenses)} offline expense(s) waiting to sync.`}
        </div>
      )}

      {error && (
        <div className="bg-red-500/15 border border-red-400/30 text-red-200 rounded-2xl p-4 flex items-center gap-2">
          <AlertTriangle size={20} />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Summary title={label.totalExpenses} value={money(total)} />
        <Summary
          title={label.records}
          value={fa ? toPersianDigits(expenses.length) : String(expenses.length)}
        />
      </div>

      <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <Field label={label.expenseTitle}>
            <input
              className={inputClass}
              value={faText(form.title, fa)}
              onChange={(e) =>
                setForm({
                  ...form,
                  title: faText(e.target.value, fa),
                })
              }
              placeholder={label.expenseTitle}
            />
          </Field>

          <Field label={label.category}>
            <Select
              value={form.category}
              onChange={(value) => setForm({ ...form, category: value })}
              className="w-full"
              options={Object.entries(label.categoryOptions).map(([key, text]) => ({ value: key, label: text }))}
            />
          </Field>

          <Field label={label.amount}>
            <input
              type="text"
              inputMode="numeric"
              className={inputClass}
              value={form.amount}
              onChange={(e) =>
                setForm({
                  ...form,
                  amount: normalizeAmount(e.target.value, fa),
                })
              }
              placeholder={fa ? "۰" : language === "ar" ? "0" : language === "tr" ? "0" : "0"}
            />
          </Field>

          <Field label={label.date}>
            <input
              type="text"
              inputMode="numeric"
              className={inputClass}
              value={form.expense_date}
              onChange={(e) =>
                setForm({
                  ...form,
                  expense_date: normalizeJalaliDate(e.target.value, fa),
                })
              }
              placeholder={label.datePlaceholder}
            />
          </Field>

          <Field label={label.note}>
            <input
              className={inputClass}
              value={faText(form.note, fa)}
              onChange={(e) =>
                setForm({
                  ...form,
                  note: faText(e.target.value, fa),
                })
              }
              placeholder={label.note}
            />
          </Field>
        </div>

        <button
          onClick={addExpense}
          className="mt-5 px-5 py-3 rounded-2xl bg-[var(--erp-accent)] text-slate-950 font-black flex items-center gap-2"
        >
          <Plus size={18} />
          {label.add}
        </button>
      </div>

      <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-5">
        <div className="flex items-center gap-2 bg-[var(--erp-panel-solid)] rounded-2xl px-4 py-3 mb-5">
          <Search size={18} />
          <input
            value={faText(search, fa)}
            onChange={(e) => setSearch(faText(e.target.value, fa))}
            placeholder={label.search}
            className="bg-transparent outline-none w-full text-[var(--erp-text)] placeholder-[var(--erp-muted)]"
          />
        </div>

        {loading ? (
          <p className="text-[var(--erp-muted)]">{label.loading}</p>
        ) : filtered.length === 0 ? (
          <p className="text-[var(--erp-muted)]">{label.noData}</p>
        ) : (
          <div className="space-y-4">
            {filtered.map((expense) => (
              <div
                key={expense.id}
                className="bg-[var(--erp-panel-solid)] rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap"
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-[var(--erp-glow)] flex items-center justify-center">
                    <Wallet className="text-[var(--erp-accent)]" />
                  </div>

                  <div>
                    <h3 className="font-bold text-lg">
                      {faText(expense.title, fa)}
                      {expense.pending_sync && (
                        <span className="mx-2 text-xs text-amber-300">{language === "fa" ? "آفلاین" : language === "ar" ? "غير متصل" : language === "tr" ? "Çevrimdışı" : "Offline"}</span>
                      )}
                    </h3>

                    <div className="text-[var(--erp-muted)] text-sm">
                      {expense.category ? (label.categoryOptions[expense.category] || faText(expense.category, fa)) : "-"}
                    </div>

                    <div className="text-[var(--erp-muted)] text-xs mt-1 flex items-center gap-1">
                      <CalendarDays size={14} />
                      {showDate(
                        expense.expense_date || expense.created_at,
                        fa,
                        date
                      )}
                    </div>

                    {expense.note && (
                      <div className="text-[var(--erp-muted)] text-xs mt-1">
                        {faText(expense.note, fa)}
                      </div>
                    )}

                    {!expense.pending_sync && (
                      <div className="mt-2">
                        <AttachmentsPanel entityType="expense" entityId={expense.id} compact />
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-2xl font-black text-[var(--erp-accent)]">
                    {money(expense.amount)}
                  </div>

                  <button
                    onClick={() => removeExpense(expense.id)}
                    className="w-11 h-11 rounded-xl bg-red-500/20 flex items-center justify-center"
                  >
                    <Trash2 size={18} className="text-red-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Summary({ title, value }) {
  return (
    <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-5">
      <div className="flex items-center gap-3 text-[var(--erp-accent)] mb-3">
        <Wallet />
        <span className="text-[var(--erp-muted)] font-bold">{title}</span>
      </div>

      <div className="text-3xl font-black text-[var(--erp-accent)]">{value}</div>
    </div>
  );
}
