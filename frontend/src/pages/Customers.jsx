import { useCallback, useEffect, useMemo, useState } from "react";
import { useStableCallback } from "../hooks/useStableCallback";
import { Link } from "react-router-dom";
import {
  Plus,
  Search,
  Edit3,
  Save,
  X,
  Trash2,
  Eye,
  Building2,
  Wallet,
  RefreshCcw,
  AlertTriangle,
  Crown,
  PhoneCall,
  CalendarClock,
  ShieldCheck,
  Activity,
  Download,
} from "lucide-react";

import { useLanguage } from "../localization/useLanguage";
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  resetAccountingData,
} from "../services/api";

import { getCache, setCache } from "../storage/db";
import { toPersianDigits, toEnglishDigits } from "../localization/helpers";

const CUSTOMERS_CACHE_KEY = "customers";

const emptyForm = {
  name: "",
  phone: "",
  mobile: "",
  email: "",
  national_id: "",
  economic_code: "",
  city: "",
  address: "",
  contact_person: "",
  party_type: "customer",
  opening_balance: "",
  credit_limit: "",
  notes: "",
  pricing_group: "retail",
};

const inputClass =
  "bg-slate-800 text-white placeholder-slate-400 border border-cyan-500/10 focus:border-cyan-400 rounded-2xl p-4 outline-none transition-all";

function toNumber(value) {
  const cleaned = toEnglishDigits(String(value ?? ""))
    .replace(/[,،]/g, "")
    .replace(/[^\d.-]/g, "");
  return Number(cleaned || 0);
}

function faText(value, fa) {
  if (value === null || value === undefined) return "";
  return fa ? toPersianDigits(value) : String(value);
}

function normalizeNumberInput(value, fa) {
  const cleaned = toEnglishDigits(String(value || ""))
    .replace(/[,،]/g, "")
    .replace(/[^\d.-]/g, "");
  return fa ? toPersianDigits(cleaned) : cleaned;
}

function normalizeParty(item = {}) {
  const balance = toNumber(item.balance);
  return {
    ...emptyForm,
    ...item,
    party_type: item.party_type || item.customer_type || "customer",
    customer_type: item.customer_type || item.party_type || "customer",
    opening_balance: toNumber(item.opening_balance),
    credit_limit: toNumber(item.credit_limit),
    balance,
    debtor: toNumber(item.debit ?? item.debtor ?? (balance > 0 ? balance : 0)),
    creditor: toNumber(item.credit ?? item.creditor ?? (balance < 0 ? Math.abs(balance) : 0)),
  };
}

function balanceLabel(balance, language) {
  if (balance > 0) return language === "fa" ? "بدهکار" : "Debtor";
  if (balance < 0) return language === "fa" ? "بستانکار" : "Creditor";
  return language === "fa" ? "تسویه" : "Settled";
}

function crmScore(item) {
  const balance = Math.abs(toNumber(item.balance));
  const creditLimit = toNumber(item.credit_limit);
  const opening = Math.abs(toNumber(item.opening_balance));
  let score = 45;

  if (item.party_type === "vip" || item.customer_type === "vip") score += 25;
  if (item.party_type === "company" || item.customer_type === "company") score += 12;
  if (item.party_type === "doctor" || item.customer_type === "doctor") score += 10;
  if (item.phone || item.mobile) score += 8;
  if (item.email) score += 4;
  if (item.city || item.address) score += 5;
  if (opening > 0) score += Math.min(12, opening / 1000000);
  if (creditLimit > 0) score += 6;
  if (balance > 0 && creditLimit > 0 && balance > creditLimit) score -= 20;
  if (balance > 0 && creditLimit === 0) score -= 8;
  if (item.pending_sync) score -= 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function crmRank(score) {
  if (score >= 85) return { key: "A+", color: "text-yellow-300", bg: "bg-yellow-400/10", border: "border-yellow-400/20" };
  if (score >= 70) return { key: "A", color: "text-emerald-300", bg: "bg-emerald-400/10", border: "border-emerald-400/20" };
  if (score >= 50) return { key: "B", color: "text-cyan-300", bg: "bg-cyan-400/10", border: "border-cyan-400/20" };
  return { key: "C", color: "text-rose-300", bg: "bg-rose-400/10", border: "border-rose-400/20" };
}

function crmStatus(item, fa) {
  const balance = toNumber(item.balance);
  const limit = toNumber(item.credit_limit);
  if (balance > 0 && limit > 0 && balance > limit) {
    return { key: "over_limit", label: fa ? "بیش از سقف اعتبار" : "Over credit limit", color: "text-rose-300", bg: "bg-rose-500/10" };
  }
  if (balance > 0) {
    return { key: "debtor", label: fa ? "نیازمند پیگیری" : "Needs follow-up", color: "text-amber-300", bg: "bg-amber-500/10" };
  }
  if (balance < 0) {
    return { key: "creditor", label: fa ? "بستانکار" : "Creditor", color: "text-emerald-300", bg: "bg-emerald-500/10" };
  }
  return { key: "healthy", label: fa ? "سالم" : "Healthy", color: "text-cyan-300", bg: "bg-cyan-500/10" };
}

function crmTags(item, fa) {
  const tags = [];
  const type = item.party_type || item.customer_type;
  const balance = toNumber(item.balance);
  const limit = toNumber(item.credit_limit);

  if (type === "vip") tags.push(fa ? "VIP" : "VIP");
  if (type === "doctor") tags.push(fa ? "پزشک" : "Doctor");
  if (type === "company") tags.push(fa ? "شرکتی" : "Company");
  if (type === "supplier") tags.push(fa ? "تأمین‌کننده" : "Supplier");
  if (balance > 0) tags.push(fa ? "مطالبات" : "Receivable");
  if (limit > 0) tags.push(fa ? "اعتباری" : "Credit");
  if (balance > limit && limit > 0) tags.push(fa ? "ریسک" : "Risk");
  if (item.pending_sync) tags.push(fa ? "آفلاین" : "Offline");

  return tags.slice(0, 4);
}

function followupSuggestion(item, fa) {
  const balance = toNumber(item.balance);
  const limit = toNumber(item.credit_limit);
  if (balance > 0 && limit > 0 && balance > limit) return fa ? "تماس فوری برای تسویه یا افزایش اعتبار" : "Urgent call for settlement or credit review";
  if (balance > 0) return fa ? "پیگیری دریافت مطالبات" : "Follow up receivables";
  if (!item.phone && !item.mobile) return fa ? "تکمیل شماره تماس" : "Complete contact number";
  if (!item.city && !item.address) return fa ? "تکمیل اطلاعات آدرس" : "Complete address info";
  return fa ? "حفظ ارتباط و ثبت تعامل بعدی" : "Maintain relationship and log next touchpoint";
}


export default function Customers() {
  const { t, language, n, money, dir } = useLanguage();
  const fa = language === "fa";

  const [parties, setParties] = useState([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [crmFilter, setCrmFilter] = useState("all");
  const [sortMode, setSortMode] = useState("score_desc");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [offlineMode, setOfflineMode] = useState(false);

  async function saveCache(items) {
    const normalized = Array.isArray(items) ? items.map(normalizeParty) : [];
    await setCache(CUSTOMERS_CACHE_KEY, normalized);
    setParties(normalized);
  }

  async function load() {
    setLoading(true);
    setMessage("");
    setOfflineMode(false);

    try {
      const serverParties = await getCustomers();
      const normalized = Array.isArray(serverParties)
        ? serverParties.map(normalizeParty)
        : [];

      await saveCache(normalized);
    } catch (error) {
      console.error("Customers loading error:", error);

      const cached = await getCache(CUSTOMERS_CACHE_KEY);

      if (Array.isArray(cached)) {
        setParties(cached.map(normalizeParty));
        setOfflineMode(true);
        setMessage(
          fa
            ? "اتصال به سرور برقرار نشد؛ طرف‌حساب‌ها از حافظه آفلاین نمایش داده شدند."
            : "Server unavailable; parties loaded from offline cache."
        );
      } else {
        setMessage(
          fa
            ? "خطا در دریافت طرف‌حساب‌ها از سرور و کش آفلاین موجود نیست"
            : "Error loading parties and no offline cache found"
        );
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

  function partyTypeLabel(type) {
    const map = {
      customer: t("customerParty"),
      supplier: t("supplierParty"),
      partner: t("partnerParty"),
      staff: t("staffParty"),
      company: t("companyParty"),
      doctor: t("doctorParty"),
      other: t("otherParty"),
      regular: t("customerParty"),
      vip: "VIP",
    };
    return map[type] || "-";
  }

  const balanceOf = useCallback((item) => toNumber(item.balance), []);

  const debtorOf = useCallback((item) => Math.max(balanceOf(item), 0), [balanceOf]);

  const creditorOf = useCallback((item) => Math.max(-balanceOf(item), 0), [balanceOf]);

  const summary = useMemo(() => {
    return parties.reduce(
      (acc, item) => {
        acc.totalDebtor += debtorOf(item);
        acc.totalCreditor += creditorOf(item);
        acc.totalBalance += balanceOf(item);
        const score = crmScore(item);
        const status = crmStatus(item, fa);
        if (score >= 85) acc.vipCount += 1;
        if (status.key === "over_limit" || status.key === "debtor") acc.followupCount += 1;
        if (status.key === "over_limit") acc.riskCount += 1;
        acc.scoreSum += score;
        return acc;
      },
      { totalDebtor: 0, totalCreditor: 0, totalBalance: 0, vipCount: 0, followupCount: 0, riskCount: 0, scoreSum: 0 }
    );
  }, [parties, fa, balanceOf, debtorOf, creditorOf]);

  const filtered = useMemo(() => {
    const keyword = toEnglishDigits(search).toLowerCase().trim();

    const list = parties.filter((item) => {
      const score = crmScore(item);
      const rank = crmRank(score);
      const status = crmStatus(item, fa);
      const tags = crmTags(item, fa).join(" ");

      const matchesText = [
        item.name,
        item.phone,
        item.mobile,
        item.email,
        item.address,
        item.city,
        item.national_id,
        item.economic_code,
        item.contact_person,
        item.notes,
        rank.key,
        status.label,
        tags,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);

      const matchesType =
        typeFilter === "all" ||
        item.party_type === typeFilter ||
        item.customer_type === typeFilter;

      const matchesCrm =
        crmFilter === "all" ||
        (crmFilter === "vip" && score >= 85) ||
        (crmFilter === "followup" && ["debtor", "over_limit"].includes(status.key)) ||
        (crmFilter === "risk" && status.key === "over_limit") ||
        (crmFilter === "settled" && status.key === "healthy");

      return matchesText && matchesType && matchesCrm;
    });

    return [...list].sort((a, b) => {
      if (sortMode === "score_desc") return crmScore(b) - crmScore(a);
      if (sortMode === "debt_desc") return debtorOf(b) - debtorOf(a);
      if (sortMode === "credit_desc") return creditorOf(b) - creditorOf(a);
      if (sortMode === "name_asc") return String(a.name || "").localeCompare(String(b.name || ""));
      return 0;
    });
  }, [parties, search, typeFilter, crmFilter, sortMode, fa, debtorOf, creditorOf]);

  function payloadFromForm() {
    return {
      name: form.name.trim(),
      phone: toEnglishDigits(form.phone || form.mobile || ""),
      mobile: toEnglishDigits(form.mobile || ""),
      email: form.email || "",
      address: form.address || "",
      city: form.city || "",
      national_id: toEnglishDigits(form.national_id || ""),
      economic_code: toEnglishDigits(form.economic_code || ""),
      contact_person: form.contact_person || "",
      customer_type: form.party_type || "customer",
      party_type: form.party_type || "customer",
      opening_balance: toNumber(form.opening_balance),
      credit_limit: toNumber(form.credit_limit),
      notes: form.notes || "",
      pricing_group: form.pricing_group || "retail",
    };
  }

  async function save() {
    if (!form.name.trim()) {
      alert(fa ? "نام طرف‌حساب را وارد کن" : "Enter party name");
      return;
    }

    const payload = payloadFromForm();

    try {
      if (editingId) {
        await updateCustomer(editingId, payload);
      } else {
        await createCustomer(payload);
      }

      setEditingId(null);
      setForm(emptyForm);
      await load();
    } catch (error) {
      console.error("Save customer error:", error);

      const current = Array.isArray(parties) ? [...parties] : [];

      if (editingId) {
        const updated = current.map((item) =>
          String(item.id) === String(editingId)
            ? normalizeParty({
                ...item,
                ...payload,
                id: item.id,
                pending_sync: true,
                offline_updated_at: new Date().toISOString(),
              })
            : item
        );

        await saveCache(updated);
      } else {
        const offlineItem = normalizeParty({
          ...payload,
          id: Date.now(),
          balance: toNumber(payload.opening_balance),
          created_at: new Date().toISOString(),
          pending_sync: true,
          offline_created: true,
        });

        await saveCache([offlineItem, ...current]);
      }

      setOfflineMode(true);
      setMessage(
        fa
          ? "سرور در دسترس نبود؛ تغییرات طرف‌حساب در حافظه آفلاین ذخیره شد."
          : "Server unavailable; party changes saved offline."
      );

      setEditingId(null);
      setForm(emptyForm);
    }
  }

  function edit(item) {
    setEditingId(item.id);
    setForm({
      ...emptyForm,
      ...item,
      party_type: item.party_type || item.customer_type || "customer",
      phone: faText(item.phone || "", fa),
      mobile: faText(item.mobile || "", fa),
      national_id: faText(item.national_id || "", fa),
      economic_code: faText(item.economic_code || "", fa),
      opening_balance:
        toNumber(item.opening_balance) === 0
          ? ""
          : faText(String(item.opening_balance), fa),
      credit_limit:
        toNumber(item.credit_limit) === 0
          ? ""
          : faText(String(item.credit_limit), fa),
    });
  }

  async function remove(id) {
    const ok = window.confirm(
      fa
        ? "آیا از حذف این طرف‌حساب مطمئنی؟"
        : "Are you sure you want to delete this party?"
    );
    if (!ok) return;

    try {
      await deleteCustomer(id);

      if (String(editingId) === String(id)) {
        setEditingId(null);
        setForm(emptyForm);
      }

      await load();
    } catch (error) {
      console.error("Delete customer error:", error);

      const filteredItems = parties.filter((item) => String(item.id) !== String(id));
      await saveCache(filteredItems);

      if (String(editingId) === String(id)) {
        setEditingId(null);
        setForm(emptyForm);
      }

      setOfflineMode(true);
      setMessage(
        fa
          ? "سرور در دسترس نبود یا حذف آنلاین انجام نشد؛ طرف‌حساب فقط از حافظه آفلاین حذف شد."
          : "Server unavailable or online delete failed; party removed from offline cache only."
      );
    }
  }

  async function resetAllAccounting() {
    const ok = window.confirm(
      fa
        ? "همه طرف‌حساب‌ها، فاکتورها، دریافت‌ها و پرداخت‌ها حذف شوند؟ این کار برگشت ندارد."
        : "Delete all parties, invoices, receipts and payments? This cannot be undone."
    );
    if (!ok) return;

    try {
      await resetAccountingData();
      await saveCache([]);
      setEditingId(null);
      setForm(emptyForm);
      alert(fa ? "اطلاعات حسابداری پاک شد" : "Accounting data cleared");
    } catch (error) {
      alert(error.message || (fa ? "خطا در پاکسازی اطلاعات" : "Reset failed"));
    }
  }

  function exportCrmCsv() {
    const rows = [
      [
        "ID",
        fa ? "نام" : "Name",
        fa ? "نوع" : "Type",
        fa ? "تلفن" : "Phone",
        fa ? "امتیاز CRM" : "CRM Score",
        fa ? "رتبه" : "Rank",
        fa ? "وضعیت" : "Status",
        fa ? "بدهکار" : "Debtor",
        fa ? "بستانکار" : "Creditor",
        fa ? "مانده" : "Balance",
        fa ? "پیشنهاد پیگیری" : "Follow-up Suggestion",
      ],
      ...filtered.map((item) => {
        const score = crmScore(item);
        const rank = crmRank(score);
        const status = crmStatus(item, fa);
        const balance = balanceOf(item);
        return [
          item.id,
          item.name || "",
          partyTypeLabel(item.party_type || item.customer_type),
          item.phone || item.mobile || "",
          score,
          rank.key,
          status.label,
          debtorOf(item),
          creditorOf(item),
          balance,
          followupSuggestion(item, fa),
        ];
      }),
    ];

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vetrix-crm-customers.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div dir={dir} className="space-y-6" style={{ direction: dir }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-4xl font-black text-cyan-400">{t("parties")}</h1>
          <p className="text-slate-400 mt-2">
            {fa
              ? "مدیریت طرف‌حساب‌ها، بدهکار، بستانکار، مانده حساب و پرونده مالی"
              : "Manage parties, debtors, creditors, balances and financial profiles"}
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={load}
            className="px-4 py-3 rounded-2xl bg-slate-800 text-cyan-200 font-black flex items-center gap-2"
          >
            <RefreshCcw size={18} />
            {fa ? "به‌روزرسانی" : "Refresh"}
          </button>

          <button
            onClick={exportCrmCsv}
            className="px-4 py-3 rounded-2xl bg-emerald-500/15 text-emerald-200 border border-emerald-400/30 font-black flex items-center gap-2"
          >
            <Download size={18} />
            {fa ? "خروجی CRM" : "CRM Export"}
          </button>

          <button
            onClick={resetAllAccounting}
            className="px-4 py-3 rounded-2xl bg-rose-500/20 text-rose-200 border border-rose-400/30 font-black flex items-center gap-2"
          >
            <AlertTriangle size={18} />
            {fa ? "پاکسازی تست‌ها" : "Clear test data"}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-2xl p-4 ${
            offlineMode
              ? "bg-amber-500/15 border border-amber-400/30 text-amber-100"
              : "bg-rose-500/15 border border-rose-400/30 text-rose-100"
          }`}
        >
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-5">
        <SummaryCard
          icon={<Wallet size={22} />}
          title={t("debtor")}
          value={money(summary.totalDebtor)}
          color="#fca5a5"
        />
        <SummaryCard
          icon={<Wallet size={22} />}
          title={t("creditor")}
          value={money(summary.totalCreditor)}
          color="#86efac"
        />
        <SummaryCard
          icon={<Building2 size={22} />}
          title={t("balance")}
          value={`${money(Math.abs(summary.totalBalance))} ${balanceLabel(
            summary.totalBalance,
            language
          )}`}
          color="#22d3ee"
        />
        <SummaryCard
          icon={<Crown size={22} />}
          title={fa ? "مشتریان VIP" : "VIP customers"}
          value={n(summary.vipCount)}
          color="#fde047"
        />
        <SummaryCard
          icon={<PhoneCall size={22} />}
          title={fa ? "نیازمند پیگیری" : "Need follow-up"}
          value={n(summary.followupCount)}
          color="#fbbf24"
        />
        <SummaryCard
          icon={<ShieldCheck size={22} />}
          title={fa ? "ریسک اعتباری" : "Credit risk"}
          value={n(summary.riskCount)}
          color="#fb7185"
        />
      </div>

      <CrmOverview
        fa={fa}
        n={n}
        money={money}
        parties={parties}
        summary={summary}
      />

      <div className="bg-slate-900/60 border border-cyan-500/20 rounded-3xl p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <input
            placeholder={t("party")}
            value={faText(form.name, fa)}
            onChange={(e) => setForm({ ...form, name: faText(e.target.value, fa) })}
            className={inputClass}
          />

          <select
            value={form.party_type}
            onChange={(e) => setForm({ ...form, party_type: e.target.value })}
            className={inputClass}
          >
            <option value="customer">{t("customerParty")}</option>
            <option value="supplier">{t("supplierParty")}</option>
            <option value="partner">{t("partnerParty")}</option>
            <option value="staff">{t("staffParty")}</option>
            <option value="company">{t("companyParty")}</option>
            <option value="doctor">{t("doctorParty")}</option>
            <option value="other">{t("otherParty")}</option>
          </select>

          <select
            value={form.pricing_group}
            onChange={(e) => setForm({ ...form, pricing_group: e.target.value })}
            className={inputClass}
          >
            <option value="retail">{fa ? "خرده‌فروشی" : "Retail"}</option>
            <option value="wholesale">{fa ? "عمده‌فروشی" : "Wholesale"}</option>
          </select>

          <input
            placeholder={t("phone")}
            value={faText(form.phone, fa)}
            onChange={(e) => setForm({ ...form, phone: faText(e.target.value, fa) })}
            className={inputClass}
          />

          <input
            placeholder={t("mobile")}
            value={faText(form.mobile, fa)}
            onChange={(e) => setForm({ ...form, mobile: faText(e.target.value, fa) })}
            className={inputClass}
          />

          <input
            placeholder={t("email")}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={inputClass}
          />

          <input
            placeholder={t("nationalId")}
            value={faText(form.national_id, fa)}
            onChange={(e) =>
              setForm({ ...form, national_id: faText(e.target.value, fa) })
            }
            className={inputClass}
          />

          <input
            placeholder={t("economicCode")}
            value={faText(form.economic_code, fa)}
            onChange={(e) =>
              setForm({ ...form, economic_code: faText(e.target.value, fa) })
            }
            className={inputClass}
          />

          <input
            placeholder={t("city")}
            value={faText(form.city, fa)}
            onChange={(e) => setForm({ ...form, city: faText(e.target.value, fa) })}
            className={inputClass}
          />

          <input
            placeholder={t("contactPerson")}
            value={faText(form.contact_person, fa)}
            onChange={(e) =>
              setForm({ ...form, contact_person: faText(e.target.value, fa) })
            }
            className={inputClass}
          />

          <input
            type="text"
            inputMode="numeric"
            placeholder={t("openingBalance")}
            value={form.opening_balance}
            onChange={(e) =>
              setForm({
                ...form,
                opening_balance: normalizeNumberInput(e.target.value, fa),
              })
            }
            className={inputClass}
          />

          <input
            type="text"
            inputMode="numeric"
            placeholder={t("creditLimit")}
            value={form.credit_limit}
            onChange={(e) =>
              setForm({
                ...form,
                credit_limit: normalizeNumberInput(e.target.value, fa),
              })
            }
            className={inputClass}
          />

          <input
            placeholder={t("address")}
            value={faText(form.address, fa)}
            onChange={(e) =>
              setForm({ ...form, address: faText(e.target.value, fa) })
            }
            className={`${inputClass} xl:col-span-2`}
          />

          <input
            placeholder={t("notes")}
            value={faText(form.notes, fa)}
            onChange={(e) =>
              setForm({ ...form, notes: faText(e.target.value, fa) })
            }
            className={`${inputClass} xl:col-span-2`}
          />
        </div>

        <div className="flex gap-3 flex-wrap mt-5">
          <button
            onClick={save}
            className="px-5 py-3 rounded-2xl bg-cyan-400 text-slate-950 font-black flex items-center gap-2"
          >
            {editingId ? <Save size={18} /> : <Plus size={18} />}
            {editingId ? t("saveCustomer") : t("addCustomer")}
          </button>

          {editingId && (
            <button
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
              }}
              className="px-5 py-3 rounded-2xl bg-slate-700 text-white font-black flex items-center gap-2"
            >
              <X size={18} />
              {t("cancelEdit")}
            </button>
          )}
        </div>
      </div>

      <div className="bg-slate-900/60 border border-cyan-500/20 rounded-3xl p-5">
        <div className="flex flex-wrap items-center gap-3 bg-slate-800 rounded-2xl px-4 py-3 mb-6">
          <Search size={20} className="text-cyan-400" />

          <input
            value={faText(search, fa)}
            onChange={(e) => setSearch(faText(e.target.value, fa))}
            placeholder={t("searchCustomer")}
            className="bg-transparent outline-none flex-1 min-w-[220px] text-white placeholder-slate-400"
          />

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-slate-900 rounded-xl p-2 outline-none text-white"
          >
            <option value="all">{fa ? "همه" : "All"}</option>
            <option value="customer">{t("customerParty")}</option>
            <option value="supplier">{t("supplierParty")}</option>
            <option value="staff">{t("staffParty")}</option>
            <option value="company">{t("companyParty")}</option>
            <option value="doctor">{t("doctorParty")}</option>
          </select>

          <select
            value={crmFilter}
            onChange={(e) => setCrmFilter(e.target.value)}
            className="bg-slate-900 rounded-xl p-2 outline-none text-white"
          >
            <option value="all">{fa ? "همه CRM" : "All CRM"}</option>
            <option value="vip">{fa ? "VIP" : "VIP"}</option>
            <option value="followup">{fa ? "نیازمند پیگیری" : "Needs follow-up"}</option>
            <option value="risk">{fa ? "ریسک اعتباری" : "Credit risk"}</option>
            <option value="settled">{fa ? "تسویه" : "Settled"}</option>
          </select>

          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value)}
            className="bg-slate-900 rounded-xl p-2 outline-none text-white"
          >
            <option value="score_desc">{fa ? "امتیاز بیشتر" : "Top score"}</option>
            <option value="debt_desc">{fa ? "بدهی بیشتر" : "Highest debt"}</option>
            <option value="credit_desc">{fa ? "بستانکاری بیشتر" : "Highest credit"}</option>
            <option value="name_asc">{fa ? "نام" : "Name"}</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1180px]">
            <thead>
              <tr className="text-cyan-300 border-b border-cyan-500/20">
                <th className="p-3 text-right">{t("party")}</th>
                <th className="p-3 text-right">{fa ? "CRM" : "CRM"}</th>
                <th className="p-3 text-right">{t("partyType")}</th>
                <th className="p-3 text-right">{t("phone")}</th>
                <th className="p-3 text-right">{t("debtor")}</th>
                <th className="p-3 text-right">{t("creditor")}</th>
                <th className="p-3 text-right">{t("balance")}</th>
                <th className="p-3 text-right">{t("actions")}</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((item) => {
                const balance = balanceOf(item);
                const debtor = debtorOf(item);
                const creditor = creditorOf(item);
                const score = crmScore(item);
                const rank = crmRank(score);
                const status = crmStatus(item, fa);
                const tags = crmTags(item, fa);

                return (
                  <tr
                    key={item.id}
                    className="border-b border-slate-800 hover:bg-cyan-500/5 transition-colors"
                  >
                    <td className="p-3 font-black text-white">
                      <div>
                        {faText(item.name, fa)}
                        {item.pending_sync && (
                          <span className="mx-2 text-xs text-amber-300">
                            {fa ? "آفلاین" : "Offline"}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">ID #{n(item.id)}</div>
                    </td>

                    <td className="p-3 min-w-[220px]">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-3 py-1 rounded-full border text-xs font-black ${rank.bg} ${rank.color} ${rank.border}`}>
                          {rank.key}
                        </span>
                        <span className={`px-3 py-1 rounded-full text-xs font-black ${status.bg} ${status.color}`}>
                          {status.label}
                        </span>
                        <span className="text-xs text-slate-400">{n(score)}/100</span>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden mb-2">
                        <div
                          className="h-full bg-gradient-to-r from-rose-400 via-amber-300 to-emerald-400"
                          style={{ width: `${score}%` }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {tags.map((tag, index) => (
                          <span key={index} className="px-2 py-1 rounded-full bg-slate-800 text-slate-300 text-[10px]">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td className="p-3">
                      <span className="px-3 py-1 rounded-full bg-cyan-400/10 text-cyan-300 text-xs font-black">
                        {partyTypeLabel(item.party_type || item.customer_type)}
                      </span>
                    </td>

                    <td className="p-3 text-slate-200">
                      {faText(item.phone || item.mobile || "-", fa)}
                    </td>

                    <td className="p-3 text-rose-300 font-black">
                      {money(debtor)}
                    </td>

                    <td className="p-3 text-emerald-300 font-black">
                      {money(creditor)}
                    </td>

                    <td className="p-3 font-black text-cyan-300">
                      {money(Math.abs(balance))}
                      <div className="text-xs text-slate-400">
                        {balanceLabel(balance, language)}
                      </div>
                    </td>

                    <td className="p-3">
                      <div className="text-xs text-slate-400 mb-2 flex items-center gap-1">
                        <CalendarClock size={13} />
                        {followupSuggestion(item, fa)}
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Link
                          to={`/customers/${item.id}`}
                          className="px-3 py-2 bg-slate-700 text-white rounded-xl flex items-center gap-1"
                        >
                          <Eye size={15} />
                          {fa ? "پرونده 360°" : "360° Profile"}
                        </Link>

                        <button
                          onClick={() => edit(item)}
                          className="px-3 py-2 bg-cyan-500/20 text-cyan-200 rounded-xl flex items-center gap-1"
                        >
                          <Edit3 size={15} />
                          {t("edit")}
                        </button>

                        <button
                          onClick={() => remove(item.id)}
                          className="px-3 py-2 bg-rose-500/20 text-rose-200 rounded-xl flex items-center gap-1"
                        >
                          <Trash2 size={15} />
                          {t("delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan="8" className="p-8 text-center text-slate-400">
                    {fa ? "طرف‌حسابی ثبت نشده است" : "No parties found"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


function CrmOverview({ fa, n, money, parties, summary }) {
  const topCustomers = [...parties]
    .sort((a, b) => crmScore(b) - crmScore(a))
    .slice(0, 4);
  const averageScore = parties.length ? Math.round(summary.scoreSum / parties.length) : 0;

  return (
    <div className="bg-slate-900/60 border border-cyan-500/20 rounded-3xl p-5 shadow-2xl">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-2xl font-black text-cyan-300 flex items-center gap-2">
            <Activity size={22} />
            {fa ? "مرکز هوشمند ارتباط با مشتری" : "Customer Intelligence Center"}
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            {fa
              ? "امتیازدهی، اولویت پیگیری، اعتبار و ارزش مشتری‌ها در یک نگاه"
              : "Customer scoring, follow-up priority, credit and customer value at a glance"}
          </p>
        </div>
        <div className="rounded-2xl bg-cyan-400/10 border border-cyan-400/20 px-5 py-3">
          <div className="text-slate-400 text-xs font-bold">{fa ? "میانگین امتیاز" : "Average score"}</div>
          <div className="text-cyan-300 text-2xl font-black">{n(averageScore)}/100</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        {topCustomers.map((item) => {
          const score = crmScore(item);
          const rank = crmRank(score);
          const status = crmStatus(item, fa);
          return (
            <div key={item.id} className="rounded-2xl bg-slate-800/70 border border-white/5 p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="font-black text-white truncate">{item.name || "-"}</div>
                <span className={`px-2 py-1 rounded-full text-xs font-black ${rank.bg} ${rank.color}`}>{rank.key}</span>
              </div>
              <div className="text-xs text-slate-400 mb-3">{item.phone || item.mobile || (fa ? "بدون شماره" : "No phone")}</div>
              <div className="h-2 bg-slate-900 rounded-full overflow-hidden mb-3">
                <div className="h-full bg-cyan-400" style={{ width: `${score}%` }} />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className={status.color}>{status.label}</span>
                <span className="text-slate-300 font-bold">{money(Math.abs(toNumber(item.balance)))}</span>
              </div>
            </div>
          );
        })}
        {topCustomers.length === 0 && (
          <div className="text-slate-400 col-span-full">
            {fa ? "هنوز مشتری ثبت نشده است." : "No customers yet."}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ icon, title, value, color }) {
  return (
    <div className="bg-slate-900/60 border border-cyan-500/20 rounded-3xl p-6 shadow-2xl">
      <div className="flex justify-between items-center">
        <div>
          <div className="text-slate-400 text-sm font-bold">{title}</div>
          <div className="text-2xl font-black mt-3" style={{ color }}>
            {value}
          </div>
        </div>

        <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-cyan-400/10 text-cyan-300">
          {icon}
        </div>
      </div>
    </div>
  );
}
