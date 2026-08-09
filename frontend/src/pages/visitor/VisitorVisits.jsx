import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Send, Clock } from "lucide-react";
import toast from "react-hot-toast";
import { useLanguage } from "../../localization/useLanguage";
import { getCustomers } from "../../services/api";
import { listFieldVisits, createFieldVisit } from "../../services/fieldVisitsApi";
import { isNetworkError } from "../../services/api";
import { translateApiError } from "../../localization/apiErrors";
import { getCache, setCache } from "../../storage/db";
import { syncPendingRecords, useOnlineSync } from "../../storage/offlineSync";
import VisitorLayout from "./VisitorLayout";

const CUSTOMERS_CACHE_KEY = "visitor_customers";
const PENDING_VISITS_CACHE_KEY = "visitor_pending_visits";

const OUTCOMES = [
  { value: "no_order", label: { fa: "بدون سفارش", ar: "بدون طلب", tr: "Siparişsiz", en: "No order" } },
  { value: "order_placed", label: { fa: "سفارش ثبت شد", ar: "تم تسجيل الطلب", tr: "Sipariş alındı", en: "Order placed" } },
  { value: "closed", label: { fa: "بسته بود", ar: "مغلق", tr: "Kapalıydı", en: "Closed" } },
  { value: "other", label: { fa: "سایر", ar: "أخرى", tr: "Diğer", en: "Other" } },
];

function extractVisitPayload(item) {
  return {
    customer_id: Number(item.customer_id),
    visit_time: item.visit_time,
    outcome: item.outcome,
    note: item.note,
    client_ref: item.client_ref,
  };
}

async function createVisitForSync(payload) {
  const res = await createFieldVisit(payload);
  if (res?.status !== "created" && res?.status !== "already_recorded") {
    throw new Error("sync failed");
  }
  return res;
}

export default function VisitorVisits() {
  const { language } = useLanguage();
  const [searchParams] = useSearchParams();
  const fa = language === "fa";
  const tr = (faText, arText, trText, enText) =>
    fa ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  const [customers, setCustomers] = useState([]);
  const [visits, setVisits] = useState([]);
  const [customerId, setCustomerId] = useState(searchParams.get("customer_id") || "");
  const [outcome, setOutcome] = useState("no_order");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadCustomers() {
    try {
      const data = await getCustomers();
      const list = Array.isArray(data) ? data : [];
      setCustomers(list);
      await setCache(CUSTOMERS_CACHE_KEY, list);
    } catch {
      const cached = await getCache(CUSTOMERS_CACHE_KEY);
      if (cached) setCustomers(cached);
    }
  }

  async function loadVisits() {
    try {
      setVisits(await listFieldVisits());
    } catch {
      // Visit history needs a live connection; the create form below still
      // works fully offline regardless.
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void loadCustomers(); void loadVisits(); }, 0);
    return () => clearTimeout(timer);
  }, []);

  async function syncPendingVisits() {
    const cached = (await getCache(PENDING_VISITS_CACHE_KEY)) || [];
    if (!cached.some((item) => item.pending_sync)) return;
    const { items: updated, syncedCount } = await syncPendingRecords(cached, {
      extractPayload: extractVisitPayload,
      create: createVisitForSync,
      update: createVisitForSync,
      mergeResult: (item) => ({ ...item, pending_sync: false }),
    });
    await setCache(PENDING_VISITS_CACHE_KEY, updated.filter((item) => item.pending_sync));
    if (syncedCount > 0) {
      toast.success(fa ? `${syncedCount} ویزیت آفلاین همگام‌سازی شد.` : `${syncedCount} offline visit(s) synced.`);
      void loadVisits();
    }
  }

  useOnlineSync(syncPendingVisits);

  async function submitVisit() {
    if (!customerId) {
      toast.error(tr("مشتری را انتخاب کنید", "اختر عميلًا", "Müşteri seçin", "Choose a customer"));
      return;
    }
    const payload = {
      customer_id: Number(customerId),
      visit_time: new Date().toISOString(),
      outcome,
      note,
      client_ref: `visit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };

    setSubmitting(true);
    try {
      const res = await createFieldVisit(payload);
      if (res?.status !== "created" && res?.status !== "already_recorded") throw new Error("failed");
      toast.success(tr("ویزیت ثبت شد", "تم تسجيل الزيارة", "Ziyaret kaydedildi", "Visit recorded"));
      setNote("");
      void loadVisits();
    } catch (error) {
      // The server was reached and rejected the visit (RBAC, invalid
      // customer, ...) - retrying later would fail identically, so this
      // must NOT be queued offline; it would just sit pending forever with
      // no visibility. Only a genuine connectivity failure gets queued.
      if (!isNetworkError(error)) {
        toast.error(translateApiError(error.message, language) || tr("ثبت ویزیت ناموفق بود", "فشل تسجيل الزيارة", "Ziyaret kaydedilemedi", "Failed to record visit"));
        return;
      }
      const cached = (await getCache(PENDING_VISITS_CACHE_KEY)) || [];
      await setCache(PENDING_VISITS_CACHE_KEY, [...cached, { ...payload, id: Date.now(), pending_sync: true }]);
      toast(tr("اتصال برقرار نیست؛ ویزیت ذخیره شد.", "لا يوجد اتصال؛ تم حفظ الزيارة.", "Bağlantı yok; ziyaret kaydedildi.", "No connection; visit saved locally."));
      setNote("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <VisitorLayout title={tr("ویزیت‌ها", "الزيارات", "Ziyaretler", "Visits")}>
      <div style={{ background: "var(--erp-panel-solid)", border: "1px solid var(--erp-border)", borderRadius: 16, padding: 14, marginBottom: 18 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 900, color: "var(--erp-accent)" }}>
          {tr("ثبت ویزیت جدید", "تسجيل زيارة جديدة", "Yeni ziyaret kaydet", "Log a new visit")}
        </h3>
        <select
          value={customerId}
          onChange={(event) => setCustomerId(event.target.value)}
          style={{ width: "100%", background: "var(--erp-bg)", border: "1px solid var(--erp-border)", borderRadius: 10, padding: 10, color: "var(--erp-text)", marginBottom: 10 }}
        >
          <option value="">{tr("انتخاب مشتری", "اختر عميلًا", "Müşteri seçin", "Select customer")}</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>{customer.name}</option>
          ))}
        </select>
        <select
          value={outcome}
          onChange={(event) => setOutcome(event.target.value)}
          style={{ width: "100%", background: "var(--erp-bg)", border: "1px solid var(--erp-border)", borderRadius: 10, padding: 10, color: "var(--erp-text)", marginBottom: 10 }}
        >
          {OUTCOMES.map((item) => (
            <option key={item.value} value={item.value}>{item.label[language] || item.label.en}</option>
          ))}
        </select>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          placeholder={tr("یادداشت (اختیاری)", "ملاحظة (اختياري)", "Not (isteğe bağlı)", "Note (optional)")}
          style={{ width: "100%", background: "var(--erp-bg)", border: "1px solid var(--erp-border)", borderRadius: 10, padding: 10, color: "var(--erp-text)", marginBottom: 12, resize: "vertical" }}
        />
        <button
          type="button"
          onClick={submitVisit}
          disabled={submitting}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: 0, borderRadius: 12, padding: "12px 0", background: "var(--erp-accent)", color: "#071028", fontWeight: 900, opacity: submitting ? 0.6 : 1 }}
        >
          <Send size={16} /> {submitting ? "..." : tr("ثبت ویزیت", "تسجيل الزيارة", "Ziyareti kaydet", "Record visit")}
        </button>
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 900, color: "var(--erp-accent)", margin: "0 0 10px" }}>
        {tr("تاریخچه ویزیت‌ها", "سجل الزيارات", "Ziyaret geçmişi", "Visit history")}
      </h3>
      <div style={{ display: "grid", gap: 8 }}>
        {visits.map((visit) => {
          const item = OUTCOMES.find((entry) => entry.value === visit.outcome);
          return (
            <div key={visit.id} style={{ background: "var(--erp-panel-solid)", border: "1px solid var(--erp-border)", borderRadius: 12, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800 }}>
                <span>{visit.customer_name}</span>
                <span style={{ color: "var(--erp-muted)", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                  <Clock size={12} /> {new Date(visit.visit_time).toLocaleString(language)}
                </span>
              </div>
              <div style={{ fontSize: 12, color: "var(--erp-accent)", marginTop: 4 }}>{item?.label[language] || visit.outcome}</div>
              {visit.note && <div style={{ fontSize: 12, color: "var(--erp-muted)", marginTop: 4 }}>{visit.note}</div>}
            </div>
          );
        })}
        {visits.length === 0 && (
          <div style={{ color: "var(--erp-muted)", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
            {tr("هنوز ویزیتی ثبت نشده است.", "لم يتم تسجيل أي زيارة بعد.", "Henüz ziyaret kaydedilmedi.", "No visits recorded yet.")}
          </div>
        )}
      </div>
    </VisitorLayout>
  );
}
