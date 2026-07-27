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
import { countPending, syncPendingRecords, useOnlineSync } from "../storage/offlineSync";
import { toPersianDigits, toEnglishDigits } from "../localization/helpers";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import Notice from "../components/ui/Notice";
import { Input, Select } from "../components/ui/Field";
import { Table, Thead, Tbody, Tr, Th, Td, EmptyRow } from "../components/ui/Table";

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
  if (balance > 0) return language === "fa" ? "بدهکار" : language === "ar" ? "مدين" : language === "tr" ? "Borçlu" : "Debtor";
  if (balance < 0) return language === "fa" ? "بستانکار" : language === "ar" ? "دائن" : language === "tr" ? "Alacaklı" : "Creditor";
  return language === "fa" ? "تسویه" : language === "ar" ? "مسدد" : language === "tr" ? "Kapandı" : "Settled";
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
  if (score >= 85) return { key: "A+", tone: "success" };
  if (score >= 70) return { key: "A", tone: "success" };
  if (score >= 50) return { key: "B", tone: "info" };
  return { key: "C", tone: "danger" };
}

function crmStatus(item, language) {
  const fa = language === "fa";
  const ar = language === "ar";
  const tr = language === "tr";
  const balance = toNumber(item.balance);
  const limit = toNumber(item.credit_limit);
  if (balance > 0 && limit > 0 && balance > limit) {
    return { key: "over_limit", label: fa ? "بیش از سقف اعتبار" : ar ? "تجاوز حد الائتمان" : tr ? "Kredi limiti aşıldı" : "Over credit limit", tone: "danger" };
  }
  if (balance > 0) {
    return { key: "debtor", label: fa ? "نیازمند پیگیری" : ar ? "بحاجة إلى متابعة" : tr ? "Takip gerekiyor" : "Needs follow-up", tone: "warning" };
  }
  if (balance < 0) {
    return { key: "creditor", label: fa ? "بستانکار" : ar ? "دائن" : tr ? "Alacaklı" : "Creditor", tone: "success" };
  }
  return { key: "healthy", label: fa ? "سالم" : ar ? "سليم" : tr ? "Sağlıklı" : "Healthy", tone: "info" };
}

function crmTags(item, language) {
  const fa = language === "fa";
  const ar = language === "ar";
  const tr = language === "tr";
  const tags = [];
  const type = item.party_type || item.customer_type;
  const balance = toNumber(item.balance);
  const limit = toNumber(item.credit_limit);

  if (type === "vip") tags.push(fa ? "VIP" : ar ? "VIP" : tr ? "VIP" : "VIP");
  if (type === "doctor") tags.push(fa ? "پزشک" : ar ? "طبيب" : tr ? "Doktor" : "Doctor");
  if (type === "company") tags.push(fa ? "شرکتی" : ar ? "شركة" : tr ? "Şirket" : "Company");
  if (type === "supplier") tags.push(fa ? "تأمین‌کننده" : ar ? "مورّد" : tr ? "Tedarikçi" : "Supplier");
  if (balance > 0) tags.push(fa ? "مطالبات" : ar ? "ذمم مدينة" : tr ? "Alacak" : "Receivable");
  if (limit > 0) tags.push(fa ? "اعتباری" : ar ? "ائتمان" : tr ? "Kredili" : "Credit");
  if (balance > limit && limit > 0) tags.push(fa ? "ریسک" : ar ? "مخاطرة" : tr ? "Risk" : "Risk");
  if (item.pending_sync) tags.push(fa ? "آفلاین" : ar ? "غير متصل" : tr ? "Çevrimdışı" : "Offline");

  return tags.slice(0, 4);
}

function followupSuggestion(item, language) {
  const fa = language === "fa";
  const ar = language === "ar";
  const tr = language === "tr";
  const balance = toNumber(item.balance);
  const limit = toNumber(item.credit_limit);
  if (balance > 0 && limit > 0 && balance > limit) return fa ? "تماس فوری برای تسویه یا افزایش اعتبار" : ar ? "اتصال عاجل للتسوية أو مراجعة حد الائتمان" : tr ? "Tahsilat veya kredi limiti gözden geçirmesi için acil arama" : "Urgent call for settlement or credit review";
  if (balance > 0) return fa ? "پیگیری دریافت مطالبات" : ar ? "متابعة تحصيل الذمم المدينة" : tr ? "Alacak tahsilatını takip et" : "Follow up receivables";
  if (!item.phone && !item.mobile) return fa ? "تکمیل شماره تماس" : ar ? "استكمال رقم الاتصال" : tr ? "İletişim numarasını tamamla" : "Complete contact number";
  if (!item.city && !item.address) return fa ? "تکمیل اطلاعات آدرس" : ar ? "استكمال بيانات العنوان" : tr ? "Adres bilgilerini tamamla" : "Complete address info";
  return fa ? "حفظ ارتباط و ثبت تعامل بعدی" : ar ? "الحفاظ على التواصل وتسجيل التفاعل القادم" : tr ? "İlişkiyi sürdür ve bir sonraki teması kaydet" : "Maintain relationship and log next touchpoint";
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
            : language === "ar"
            ? "تعذّر الاتصال بالخادم؛ تم عرض الأطراف من الذاكرة المؤقتة غير المتصلة."
            : language === "tr"
            ? "Sunucuya bağlanılamadı; cariler çevrimdışı önbellekten yüklendi."
            : "Server unavailable; parties loaded from offline cache."
        );
      } else {
        setMessage(
          fa
            ? "خطا در دریافت طرف‌حساب‌ها از سرور و کش آفلاین موجود نیست"
            : language === "ar"
            ? "خطأ في جلب الأطراف من الخادم ولا توجد ذاكرة مؤقتة غير متصلة"
            : language === "tr"
            ? "Cariler sunucudan alınamadı ve çevrimdışı önbellek bulunamadı"
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
        const status = crmStatus(item, language);
        if (score >= 85) acc.vipCount += 1;
        if (status.key === "over_limit" || status.key === "debtor") acc.followupCount += 1;
        if (status.key === "over_limit") acc.riskCount += 1;
        acc.scoreSum += score;
        return acc;
      },
      { totalDebtor: 0, totalCreditor: 0, totalBalance: 0, vipCount: 0, followupCount: 0, riskCount: 0, scoreSum: 0 }
    );
  }, [parties, language, balanceOf, debtorOf, creditorOf]);

  const filtered = useMemo(() => {
    const keyword = toEnglishDigits(search).toLowerCase().trim();

    const list = parties.filter((item) => {
      const score = crmScore(item);
      const rank = crmRank(score);
      const status = crmStatus(item, language);
      const tags = crmTags(item, language).join(" ");

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
  }, [parties, search, typeFilter, crmFilter, sortMode, language, debtorOf, creditorOf]);

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
      alert(fa ? "نام طرف‌حساب را وارد کن" : language === "ar" ? "أدخل اسم الطرف" : language === "tr" ? "Cari adını girin" : "Enter party name");
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
          : language === "ar"
          ? "تعذّر الوصول إلى الخادم؛ تم حفظ تغييرات الطرف في وضع عدم الاتصال."
          : language === "tr"
          ? "Sunucuya ulaşılamadı; cari değişiklikleri çevrimdışı kaydedildi."
          : "Server unavailable; party changes saved offline."
      );

      setEditingId(null);
      setForm(emptyForm);
    }
  }

  function extractCustomerPayload(item) {
    return {
      name: item.name || "",
      phone: toEnglishDigits(item.phone || item.mobile || ""),
      mobile: toEnglishDigits(item.mobile || ""),
      email: item.email || "",
      address: item.address || "",
      city: item.city || "",
      national_id: toEnglishDigits(item.national_id || ""),
      economic_code: toEnglishDigits(item.economic_code || ""),
      contact_person: item.contact_person || "",
      customer_type: item.party_type || item.customer_type || "customer",
      party_type: item.party_type || item.customer_type || "customer",
      opening_balance: toNumber(item.opening_balance),
      credit_limit: toNumber(item.credit_limit),
      notes: item.notes || "",
      pricing_group: item.pricing_group || "retail",
    };
  }

  function mergeCustomerResult(item, serverResult, payload) {
    return normalizeParty({
      ...item,
      ...payload,
      id: item.offline_created ? serverResult.id : item.id,
      pending_sync: false,
      offline_created: false,
    });
  }

  async function createCustomerForSync(payload) {
    const result = await createCustomer(payload);
    if (result?.status !== "created") throw new Error(result?.message || "sync failed");
    return result;
  }

  async function updateCustomerForSync(id, payload) {
    const result = await updateCustomer(id, payload);
    if (result?.status === "error") throw new Error(result.message);
    return result;
  }

  async function syncPendingParties() {
    if (countPending(parties) === 0) return;
    const { items: updated, syncedCount } = await syncPendingRecords(parties, {
      extractPayload: extractCustomerPayload,
      create: createCustomerForSync,
      update: updateCustomerForSync,
      mergeResult: mergeCustomerResult,
    });
    await saveCache(updated);
    if (syncedCount > 0) {
      setMessage(
        fa
          ? `${toPersianDigits(syncedCount)} طرف‌حساب آفلاین همگام‌سازی شد.`
          : language === "ar"
          ? `تمت مزامنة ${syncedCount} من سجلات العملاء غير المتصلة.`
          : language === "tr"
          ? `${syncedCount} çevrimdışı cari kaydı senkronize edildi.`
          : `${syncedCount} offline customer record(s) synced.`
      );
    }
  }

  useOnlineSync(syncPendingParties);

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
      alert(fa ? "اطلاعات حسابداری پاک شد" : language === "ar" ? "تم مسح البيانات المحاسبية" : language === "tr" ? "Muhasebe verileri temizlendi" : "Accounting data cleared");
    } catch (error) {
      alert(error.message || (fa ? "خطا در پاکسازی اطلاعات" : language === "ar" ? "خطأ في مسح البيانات" : language === "tr" ? "Verileri temizleme başarısız oldu" : "Reset failed"));
    }
  }

  function exportCrmCsv() {
    const rows = [
      [
        "ID",
        fa ? "نام" : language === "ar" ? "الاسم" : language === "tr" ? "Ad" : "Name",
        fa ? "نوع" : language === "ar" ? "النوع" : language === "tr" ? "Tür" : "Type",
        fa ? "تلفن" : language === "ar" ? "الهاتف" : language === "tr" ? "Telefon" : "Phone",
        fa ? "امتیاز CRM" : language === "ar" ? "درجة CRM" : language === "tr" ? "CRM Puanı" : "CRM Score",
        fa ? "رتبه" : language === "ar" ? "الرتبة" : language === "tr" ? "Derece" : "Rank",
        fa ? "وضعیت" : language === "ar" ? "الحالة" : language === "tr" ? "Durum" : "Status",
        fa ? "بدهکار" : language === "ar" ? "مدين" : language === "tr" ? "Borçlu" : "Debtor",
        fa ? "بستانکار" : language === "ar" ? "دائن" : language === "tr" ? "Alacaklı" : "Creditor",
        fa ? "مانده" : language === "ar" ? "الرصيد" : language === "tr" ? "Bakiye" : "Balance",
        fa ? "پیشنهاد پیگیری" : language === "ar" ? "اقتراح المتابعة" : language === "tr" ? "Takip Önerisi" : "Follow-up Suggestion",
      ],
      ...filtered.map((item) => {
        const score = crmScore(item);
        const rank = crmRank(score);
        const status = crmStatus(item, language);
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
          followupSuggestion(item, language),
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
          <h1 className="text-4xl font-black text-[var(--erp-accent)]">{t("parties")}</h1>
          <p className="text-[var(--erp-muted)] mt-2">
            {fa
              ? "مدیریت طرف‌حساب‌ها، بدهکار، بستانکار، مانده حساب و پرونده مالی"
              : "Manage parties, debtors, creditors, balances and financial profiles"}
          </p>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" icon={RefreshCcw} onClick={load}>
            {fa ? "به‌روزرسانی" : language === "ar" ? "تحديث" : language === "tr" ? "Yenile" : "Refresh"}
          </Button>

          <Button
            icon={Download}
            onClick={exportCrmCsv}
            style={{ color: "var(--erp-success)", background: "var(--erp-success-soft)" }}
          >
            {fa ? "خروجی CRM" : language === "ar" ? "تصدير CRM" : language === "tr" ? "CRM Dışa Aktar" : "CRM Export"}
          </Button>

          <Button variant="danger" icon={AlertTriangle} onClick={resetAllAccounting}>
            {fa ? "پاکسازی تست‌ها" : language === "ar" ? "مسح بيانات الاختبار" : language === "tr" ? "Test verilerini temizle" : "Clear test data"}
          </Button>
        </div>
      </div>

      {message && (
        <Notice tone={offlineMode ? "warning" : "danger"}>{message}</Notice>
      )}

      {countPending(parties) > 0 && (
        <Notice tone="warning" className="flex flex-wrap items-center justify-between gap-3">
          <span>
            {fa
              ? `${toPersianDigits(countPending(parties))} طرف‌حساب آفلاین در انتظار همگام‌سازی است.`
              : `${countPending(parties)} offline customer record(s) waiting to sync.`}
          </span>
          <Button variant="primary" size="sm" onClick={() => void syncPendingParties()}>
            {fa ? "همگام‌سازی الان" : language === "ar" ? "مزامنة الآن" : language === "tr" ? "Şimdi senkronize et" : "Sync now"}
          </Button>
        </Notice>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-5">
        <SummaryCard
          icon={<Wallet size={22} />}
          title={t("debtor")}
          value={money(summary.totalDebtor)}
          colorClassName="text-[var(--erp-danger)]"
        />
        <SummaryCard
          icon={<Wallet size={22} />}
          title={t("creditor")}
          value={money(summary.totalCreditor)}
          colorClassName="text-[var(--erp-success)]"
        />
        <SummaryCard
          icon={<Building2 size={22} />}
          title={t("balance")}
          value={`${money(Math.abs(summary.totalBalance))} ${balanceLabel(
            summary.totalBalance,
            language
          )}`}
          color="var(--erp-accent)"
        />
        <SummaryCard
          icon={<Crown size={22} />}
          title={fa ? "مشتریان VIP" : language === "ar" ? "عملاء VIP" : language === "tr" ? "VIP müşteriler" : "VIP customers"}
          value={n(summary.vipCount)}
          color="#fde047"
        />
        <SummaryCard
          icon={<PhoneCall size={22} />}
          title={fa ? "نیازمند پیگیری" : language === "ar" ? "بحاجة إلى متابعة" : language === "tr" ? "Takip gerekiyor" : "Need follow-up"}
          value={n(summary.followupCount)}
          color="var(--erp-warning)"
        />
        <SummaryCard
          icon={<ShieldCheck size={22} />}
          title={fa ? "ریسک اعتباری" : language === "ar" ? "مخاطر ائتمانية" : language === "tr" ? "Kredi riski" : "Credit risk"}
          value={n(summary.riskCount)}
          color="var(--erp-danger)"
        />
      </div>

      <CrmOverview
        fa={fa}
        language={language}
        n={n}
        money={money}
        parties={parties}
        summary={summary}
      />

      <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-[var(--erp-radius-lg)] p-5">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Input
            placeholder={t("party")}
            value={faText(form.name, fa)}
            onChange={(e) => setForm({ ...form, name: faText(e.target.value, fa) })}
          />

          <Select
            value={form.party_type}
            onChange={(e) => setForm({ ...form, party_type: e.target.value })}
          >
            <option value="customer">{t("customerParty")}</option>
            <option value="supplier">{t("supplierParty")}</option>
            <option value="partner">{t("partnerParty")}</option>
            <option value="staff">{t("staffParty")}</option>
            <option value="company">{t("companyParty")}</option>
            <option value="doctor">{t("doctorParty")}</option>
            <option value="other">{t("otherParty")}</option>
          </Select>

          <Select
            value={form.pricing_group}
            onChange={(e) => setForm({ ...form, pricing_group: e.target.value })}
          >
            <option value="retail">{fa ? "خرده‌فروشی" : language === "ar" ? "بيع بالتجزئة" : language === "tr" ? "Perakende" : "Retail"}</option>
            <option value="wholesale">{fa ? "عمده‌فروشی" : language === "ar" ? "بيع بالجملة" : language === "tr" ? "Toptan" : "Wholesale"}</option>
          </Select>

          <Input
            placeholder={t("phone")}
            value={faText(form.phone, fa)}
            onChange={(e) => setForm({ ...form, phone: faText(e.target.value, fa) })}
          />

          <Input
            placeholder={t("mobile")}
            value={faText(form.mobile, fa)}
            onChange={(e) => setForm({ ...form, mobile: faText(e.target.value, fa) })}
          />

          <Input
            placeholder={t("email")}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />

          <Input
            placeholder={t("nationalId")}
            value={faText(form.national_id, fa)}
            onChange={(e) =>
              setForm({ ...form, national_id: faText(e.target.value, fa) })
            }
          />

          <Input
            placeholder={t("economicCode")}
            value={faText(form.economic_code, fa)}
            onChange={(e) =>
              setForm({ ...form, economic_code: faText(e.target.value, fa) })
            }
          />

          <Input
            placeholder={t("city")}
            value={faText(form.city, fa)}
            onChange={(e) => setForm({ ...form, city: faText(e.target.value, fa) })}
          />

          <Input
            placeholder={t("contactPerson")}
            value={faText(form.contact_person, fa)}
            onChange={(e) =>
              setForm({ ...form, contact_person: faText(e.target.value, fa) })
            }
          />

          <Input
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
          />

          <Input
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
          />

          <Input
            placeholder={t("address")}
            value={faText(form.address, fa)}
            onChange={(e) =>
              setForm({ ...form, address: faText(e.target.value, fa) })
            }
            className="xl:col-span-2"
          />

          <Input
            placeholder={t("notes")}
            value={faText(form.notes, fa)}
            onChange={(e) =>
              setForm({ ...form, notes: faText(e.target.value, fa) })
            }
            className="xl:col-span-2"
          />
        </div>

        <div className="flex gap-3 flex-wrap mt-5">
          <Button variant="primary" icon={editingId ? Save : Plus} onClick={save}>
            {editingId ? t("saveCustomer") : t("addCustomer")}
          </Button>

          {editingId && (
            <Button
              variant="secondary"
              icon={X}
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
              }}
            >
              {t("cancelEdit")}
            </Button>
          )}
        </div>
      </div>

      <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-[var(--erp-radius-lg)] p-5">
        <div className="flex flex-wrap items-center gap-3 bg-[var(--erp-panel-solid)] rounded-[var(--erp-radius-md)] px-4 py-3 mb-6">
          <Search size={20} className="text-[var(--erp-accent)]" />

          <input
            value={faText(search, fa)}
            onChange={(e) => setSearch(faText(e.target.value, fa))}
            placeholder={t("searchCustomer")}
            className="bg-transparent outline-none flex-1 min-w-[220px] text-[var(--erp-text)] placeholder-[var(--erp-muted)]"
          />

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-[var(--erp-bg-soft)] rounded-[var(--erp-radius-sm)] p-2 outline-none text-[var(--erp-text)]"
          >
            <option value="all">{fa ? "همه" : language === "ar" ? "الكل" : language === "tr" ? "Tümü" : "All"}</option>
            <option value="customer">{t("customerParty")}</option>
            <option value="supplier">{t("supplierParty")}</option>
            <option value="staff">{t("staffParty")}</option>
            <option value="company">{t("companyParty")}</option>
            <option value="doctor">{t("doctorParty")}</option>
          </select>

          <select
            value={crmFilter}
            onChange={(e) => setCrmFilter(e.target.value)}
            className="bg-[var(--erp-bg-soft)] rounded-[var(--erp-radius-sm)] p-2 outline-none text-[var(--erp-text)]"
          >
            <option value="all">{fa ? "همه CRM" : language === "ar" ? "كل CRM" : language === "tr" ? "Tüm CRM" : "All CRM"}</option>
            <option value="vip">{fa ? "VIP" : language === "ar" ? "VIP" : language === "tr" ? "VIP" : "VIP"}</option>
            <option value="followup">{fa ? "نیازمند پیگیری" : language === "ar" ? "بحاجة إلى متابعة" : language === "tr" ? "Takip gerekiyor" : "Needs follow-up"}</option>
            <option value="risk">{fa ? "ریسک اعتباری" : language === "ar" ? "مخاطر ائتمانية" : language === "tr" ? "Kredi riski" : "Credit risk"}</option>
            <option value="settled">{fa ? "تسویه" : language === "ar" ? "مسدد" : language === "tr" ? "Kapandı" : "Settled"}</option>
          </select>

          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value)}
            className="bg-[var(--erp-bg-soft)] rounded-[var(--erp-radius-sm)] p-2 outline-none text-[var(--erp-text)]"
          >
            <option value="score_desc">{fa ? "امتیاز بیشتر" : language === "ar" ? "أعلى درجة" : language === "tr" ? "En yüksek puan" : "Top score"}</option>
            <option value="debt_desc">{fa ? "بدهی بیشتر" : language === "ar" ? "أعلى دين" : language === "tr" ? "En yüksek borç" : "Highest debt"}</option>
            <option value="credit_desc">{fa ? "بستانکاری بیشتر" : language === "ar" ? "أعلى رصيد دائن" : language === "tr" ? "En yüksek alacak" : "Highest credit"}</option>
            <option value="name_asc">{fa ? "نام" : language === "ar" ? "الاسم" : language === "tr" ? "Ad" : "Name"}</option>
          </select>
        </div>

        <Table>
          <Thead>
            <Th>{t("party")}</Th>
            <Th>{fa ? "CRM" : language === "ar" ? "CRM" : language === "tr" ? "CRM" : "CRM"}</Th>
            <Th>{t("partyType")}</Th>
            <Th>{t("phone")}</Th>
            <Th>{t("debtor")}</Th>
            <Th>{t("creditor")}</Th>
            <Th>{t("balance")}</Th>
            <Th>{t("actions")}</Th>
          </Thead>

          <Tbody>
            {filtered.map((item) => {
              const balance = balanceOf(item);
              const debtor = debtorOf(item);
              const creditor = creditorOf(item);
              const score = crmScore(item);
              const rank = crmRank(score);
              const status = crmStatus(item, language);
              const tags = crmTags(item, language);

              return (
                <Tr key={item.id}>
                  <Td className="font-black">
                    <div>
                      {faText(item.name, fa)}
                      {item.pending_sync && (
                        <Badge tone="warning" className="mx-2">
                          {fa ? "آفلاین" : language === "ar" ? "غير متصل" : language === "tr" ? "Çevrimdışı" : "Offline"}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-[var(--erp-muted)]">ID #{n(item.id)}</div>
                  </Td>

                  <Td className="min-w-[220px]">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge tone={rank.tone}>{rank.key}</Badge>
                      <Badge tone={status.tone}>{status.label}</Badge>
                      <span className="text-xs text-[var(--erp-muted)]">{n(score)}/{n(100)}</span>
                    </div>
                    <div className="h-2 bg-[var(--erp-panel-solid)] rounded-full overflow-hidden mb-2">
                      <div
                        className="h-full bg-gradient-to-r from-rose-400 via-amber-300 to-emerald-400"
                        style={{ width: `${score}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {tags.map((tag, index) => (
                        <Badge key={index} tone="neutral">{tag}</Badge>
                      ))}
                    </div>
                  </Td>

                  <Td>
                    <Badge tone="info">{partyTypeLabel(item.party_type || item.customer_type)}</Badge>
                  </Td>

                  <Td>{faText(item.phone || item.mobile || "-", fa)}</Td>

                  <Td style={{ color: "var(--erp-danger)" }} className="font-black">
                    {money(debtor)}
                  </Td>

                  <Td style={{ color: "var(--erp-success)" }} className="font-black">
                    {money(creditor)}
                  </Td>

                  <Td className="font-black" style={{ color: "var(--erp-accent)" }}>
                    {money(Math.abs(balance))}
                    <div className="text-xs font-normal" style={{ color: "var(--erp-muted)" }}>
                      {balanceLabel(balance, language)}
                    </div>
                  </Td>

                  <Td>
                    <div className="text-xs text-[var(--erp-muted)] mb-2 flex items-center gap-1">
                      <CalendarClock size={13} />
                      {followupSuggestion(item, language)}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Link
                        to={`/customers/${item.id}`}
                        className="px-3 py-2 bg-[var(--erp-panel-solid)] text-[var(--erp-text)] rounded-[var(--erp-radius-sm)] flex items-center gap-1"
                      >
                        <Eye size={15} />
                        {fa ? "پرونده ۳۶۰°" : language === "ar" ? "ملف 360°" : language === "tr" ? "360° Profil" : "360° Profile"}
                      </Link>

                      <Button variant="ghost" size="sm" icon={Edit3} onClick={() => edit(item)}>
                        {t("edit")}
                      </Button>

                      <Button variant="danger" size="sm" icon={Trash2} onClick={() => remove(item.id)}>
                        {t("delete")}
                      </Button>
                    </div>
                  </Td>
                </Tr>
              );
            })}

            {!loading && filtered.length === 0 && (
              <EmptyRow colSpan={8}>
                {fa ? "طرف‌حسابی ثبت نشده است" : language === "ar" ? "لا يوجد أطراف حساب" : language === "tr" ? "Cari bulunamadı" : "No parties found"}
              </EmptyRow>
            )}
          </Tbody>
        </Table>
      </div>
    </div>
  );
}


function CrmOverview({ fa, language, n, money, parties, summary }) {
  const ar = language === "ar";
  const tr = language === "tr";
  const topCustomers = [...parties]
    .sort((a, b) => crmScore(b) - crmScore(a))
    .slice(0, 4);
  const averageScore = parties.length ? Math.round(summary.scoreSum / parties.length) : 0;

  return (
    <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-[var(--erp-radius-lg)] p-5 shadow-2xl">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 className="text-2xl font-black text-[var(--erp-accent)] flex items-center gap-2">
            <Activity size={22} />
            {fa ? "مرکز هوشمند ارتباط با مشتری" : ar ? "مركز ذكاء علاقات العملاء" : tr ? "Müşteri Zeka Merkezi" : "Customer Intelligence Center"}
          </h2>
          <p className="text-[var(--erp-muted)] text-sm mt-1">
            {fa
              ? "امتیازدهی، اولویت پیگیری، اعتبار و ارزش مشتری‌ها در یک نگاه"
              : ar
              ? "تقييم العملاء وأولوية المتابعة والائتمان وقيمة العميل في لمحة واحدة"
              : tr
              ? "Müşteri puanlaması, takip önceliği, kredi ve müşteri değeri tek bakışta"
              : "Customer scoring, follow-up priority, credit and customer value at a glance"}
          </p>
        </div>
        <div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-glow)] border border-[var(--erp-border)] px-5 py-3">
          <div className="text-[var(--erp-muted)] text-xs font-bold">{fa ? "میانگین امتیاز" : ar ? "متوسط النقاط" : tr ? "Ortalama puan" : "Average score"}</div>
          <div className="text-[var(--erp-accent)] text-2xl font-black">{n(averageScore)}/{n(100)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        {topCustomers.map((item) => {
          const score = crmScore(item);
          const rank = crmRank(score);
          const status = crmStatus(item, language);
          return (
            <div key={item.id} className="rounded-[var(--erp-radius-md)] bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="font-black text-[var(--erp-text)] truncate">{item.name || "-"}</div>
                <Badge tone={rank.tone}>{rank.key}</Badge>
              </div>
              <div className="text-xs text-[var(--erp-muted)] mb-3">{faText(item.phone || item.mobile, fa) || (fa ? "بدون شماره" : ar ? "بلا رقم" : tr ? "Numara yok" : "No phone")}</div>
              <div className="h-2 bg-[var(--erp-bg-soft)] rounded-full overflow-hidden mb-3">
                <div className="h-full" style={{ width: `${score}%`, background: "var(--erp-accent)" }} />
              </div>
              <div className="flex items-center justify-between text-xs">
                <Badge tone={status.tone}>{status.label}</Badge>
                <span className="text-[var(--erp-muted)] font-bold">{money(Math.abs(toNumber(item.balance)))}</span>
              </div>
            </div>
          );
        })}
        {topCustomers.length === 0 && (
          <div className="text-[var(--erp-muted)] col-span-full">
            {fa ? "هنوز مشتری ثبت نشده است." : ar ? "لا يوجد عملاء بعد." : tr ? "Henüz müşteri yok." : "No customers yet."}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ icon, title, value, color, colorClassName }) {
  return (
    <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-[var(--erp-radius-lg)] p-6 shadow-2xl">
      <div className="flex justify-between items-center">
        <div>
          <div className="text-[var(--erp-muted)] text-sm font-bold">{title}</div>
          <div className={`text-2xl font-black mt-3${colorClassName ? ` ${colorClassName}` : ""}`} style={colorClassName ? undefined : { color }}>
            {value}
          </div>
        </div>

        <div className="w-12 h-12 rounded-[var(--erp-radius-md)] flex items-center justify-center bg-[var(--erp-glow)] text-[var(--erp-accent)]">
          {icon}
        </div>
      </div>
    </div>
  );
}
