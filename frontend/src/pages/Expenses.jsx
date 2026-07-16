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

import { useLanguage } from "../localization/useLanguage";
import { createExpense, deleteExpense, getExpenses } from "../services/api";
import { toPersianDigits, toEnglishDigits } from "../localization/helpers";

const inputClass =
  "bg-slate-800 text-white placeholder-slate-400 border border-cyan-500/10 focus:border-cyan-400 rounded-2xl p-4 outline-none transition-all w-full";

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
      <label className="text-sm font-bold text-cyan-200 block">{label}</label>
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
    category: "",
    amount: "",
    expense_date: "",
    note: "",
  });

  const label = {
    title: fa ? "هزینه‌ها" : "Expenses",
    subtitle: fa
      ? "ثبت هزینه‌های کسب‌وکار و نمایش در گزارش سود و زیان"
      : "Business expense tracking",
    expenseTitle: fa ? "عنوان هزینه" : "Expense title",
    category: fa ? "دسته‌بندی" : "Category",
    amount: fa ? "مبلغ" : "Amount",
    date: fa ? "تاریخ شمسی" : "Date",
    note: fa ? "توضیحات" : "Note",
    add: fa ? "ثبت هزینه" : "Add expense",
    search: fa ? "جستجوی عنوان، دسته‌بندی یا توضیحات..." : "Search...",
    noData: fa ? "هنوز هزینه‌ای ثبت نشده است." : "No data",
    refresh: fa ? "به‌روزرسانی" : "Refresh",
    loading: fa ? "در حال دریافت..." : "Loading...",
    totalExpenses: fa ? "جمع هزینه‌ها" : "Total expenses",
    records: fa ? "تعداد رکورد" : "Records",
    datePlaceholder: fa ? "۱۴۰۵/۰۳/۲۸" : "1405/03/28",
  };

  async function load() {
    try {
      setLoading(true);
      setError("");

      const data = await getExpenses();
      setExpenses(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setError(fa ? "خطا در دریافت هزینه‌ها" : "Error loading expenses");
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
      alert(fa ? "عنوان و مبلغ هزینه را وارد کن" : "Title & amount required");
      return;
    }

    try {
      const result = await createExpense({
        title: form.title,
        category: form.category,
        amount,
        note: form.note,
        expense_date: form.expense_date ? saveDate(form.expense_date) : null,
      });

      if (result?.status === "error") {
        throw new Error(result.message);
      }

      setForm({
        title: "",
        category: "",
        amount: "",
        expense_date: "",
        note: "",
      });

      await load();
    } catch (e) {
      alert(e.message || (fa ? "خطا در ثبت هزینه" : "Error creating expense"));
    }
  }

  async function removeExpense(id) {
    if (!confirm(fa ? "این هزینه حذف شود؟" : "Delete this expense?")) return;

    await deleteExpense(id);
    await load();
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
          <h1 className="text-4xl font-black text-cyan-400">{label.title}</h1>
          <p className="text-slate-400 mt-2">{label.subtitle}</p>
        </div>

        <button
          onClick={load}
          className="px-4 py-3 rounded-2xl bg-slate-800 text-cyan-200 font-bold flex items-center gap-2 border border-cyan-500/20"
        >
          <RefreshCw size={18} />
          {label.refresh}
        </button>
      </div>

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

      <div className="bg-slate-900/60 border border-cyan-500/20 rounded-3xl p-5">
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
            <input
              className={inputClass}
              value={faText(form.category, fa)}
              onChange={(e) =>
                setForm({
                  ...form,
                  category: faText(e.target.value, fa),
                })
              }
              placeholder={label.category}
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
              placeholder={fa ? "۰" : "0"}
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
          className="mt-5 px-5 py-3 rounded-2xl bg-cyan-400 text-slate-950 font-black flex items-center gap-2"
        >
          <Plus size={18} />
          {label.add}
        </button>
      </div>

      <div className="bg-slate-900/60 border border-cyan-500/20 rounded-3xl p-5">
        <div className="flex items-center gap-2 bg-slate-800 rounded-2xl px-4 py-3 mb-5">
          <Search size={18} />
          <input
            value={faText(search, fa)}
            onChange={(e) => setSearch(faText(e.target.value, fa))}
            placeholder={label.search}
            className="bg-transparent outline-none w-full text-white placeholder-slate-400"
          />
        </div>

        {loading ? (
          <p className="text-slate-400">{label.loading}</p>
        ) : filtered.length === 0 ? (
          <p className="text-slate-400">{label.noData}</p>
        ) : (
          <div className="space-y-4">
            {filtered.map((expense) => (
              <div
                key={expense.id}
                className="bg-slate-800/60 rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap"
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-cyan-500/20 flex items-center justify-center">
                    <Wallet className="text-cyan-300" />
                  </div>

                  <div>
                    <h3 className="font-bold text-lg">
                      {faText(expense.title, fa)}
                    </h3>

                    <div className="text-slate-400 text-sm">
                      {expense.category ? faText(expense.category, fa) : "-"}
                    </div>

                    <div className="text-slate-500 text-xs mt-1 flex items-center gap-1">
                      <CalendarDays size={14} />
                      {showDate(
                        expense.expense_date || expense.created_at,
                        fa,
                        date
                      )}
                    </div>

                    {expense.note && (
                      <div className="text-slate-500 text-xs mt-1">
                        {faText(expense.note, fa)}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-2xl font-black text-cyan-300">
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
    <div className="bg-slate-900/60 border border-cyan-500/20 rounded-3xl p-5">
      <div className="flex items-center gap-3 text-cyan-300 mb-3">
        <Wallet />
        <span className="text-slate-300 font-bold">{title}</span>
      </div>

      <div className="text-3xl font-black text-cyan-300">{value}</div>
    </div>
  );
}
