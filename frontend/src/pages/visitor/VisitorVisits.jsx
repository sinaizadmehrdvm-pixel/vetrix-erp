import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Clock, Play, CheckCircle2, Navigation, MapPinOff } from "lucide-react";
import toast from "react-hot-toast";
import { useLanguage } from "../../localization/useLanguage";
import { getCustomers } from "../../services/api";
import { listFieldVisits, createFieldVisit } from "../../services/fieldVisitsApi";
import { isNetworkError } from "../../services/api";
import { translateApiError } from "../../localization/apiErrors";
import { getCache, setCache } from "../../storage/db";
import { syncPendingRecords, useOnlineSync } from "../../storage/offlineSync";
import { getCurrentPosition, formatDistance } from "./geo";
import VisitorLayout from "./VisitorLayout";
import Select from "../../components/ui/Select";

const CUSTOMERS_CACHE_KEY = "visitor_customers";
const PENDING_VISITS_CACHE_KEY = "visitor_pending_visits";
const ACTIVE_VISIT_CACHE_KEY = "visitor_active_visit";

// Mirrors app/field_visits.py's OUTCOMES exactly - a real field-sales
// taxonomy so "no order" carries a reason a manager can act on.
const OUTCOMES = [
  { value: "order_placed", label: { fa: "سفارش ثبت شد", ar: "تم تسجيل الطلب", tr: "Sipariş alındı", en: "Order placed" } },
  { value: "no_order_no_need", label: { fa: "بدون سفارش - نیازی نبود", ar: "بدون طلب - لا حاجة", tr: "Siparişsiz - ihtiyaç yok", en: "No order - no need" } },
  { value: "no_order_price_objection", label: { fa: "بدون سفارش - اعتراض قیمت", ar: "بدون طلب - اعتراض على السعر", tr: "Siparişsiz - fiyat itirazı", en: "No order - price objection" } },
  { value: "no_order_out_of_stock", label: { fa: "بدون سفارش - موجودی ما تمام شده", ar: "بدون طلب - نفاد المخزون", tr: "Siparişsiz - stok yok", en: "No order - we're out of stock" } },
  { value: "customer_unavailable", label: { fa: "مشتری در دسترس نبود", ar: "العميل غير متوفر", tr: "Müşteri müsait değildi", en: "Customer unavailable" } },
  { value: "store_closed", label: { fa: "فروشگاه بسته بود", ar: "المتجر مغلق", tr: "Mağaza kapalıydı", en: "Store closed" } },
  { value: "complaint_lodged", label: { fa: "شکایت ثبت شد", ar: "تم تسجيل شكوى", tr: "Şikayet kaydedildi", en: "Complaint lodged" } },
  { value: "information_only", label: { fa: "فقط اطلاع‌رسانی", ar: "معلومات فقط", tr: "Sadece bilgilendirme", en: "Information only" } },
  { value: "other", label: { fa: "سایر", ar: "أخرى", tr: "Diğer", en: "Other" } },
];

function extractVisitPayload(item) {
  return {
    customer_id: Number(item.customer_id),
    visit_time: item.visit_time,
    outcome: item.outcome,
    note: item.note,
    client_ref: item.client_ref,
    check_in_time: item.check_in_time,
    check_in_latitude: item.check_in_latitude,
    check_in_longitude: item.check_in_longitude,
    latitude: item.latitude,
    longitude: item.longitude,
  };
}

async function createVisitForSync(payload) {
  const res = await createFieldVisit(payload);
  if (res?.status !== "created" && res?.status !== "already_recorded") {
    throw new Error("sync failed");
  }
  return res;
}

function formatElapsed(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
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
  const [outcome, setOutcome] = useState("order_placed");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [startingVisit, setStartingVisit] = useState(false);
  const [activeVisit, setActiveVisit] = useState(null); // { customer_id, check_in_time, check_in_latitude, check_in_longitude, client_ref }
  const [elapsed, setElapsed] = useState(0);
  const tickRef = useRef(null);

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
    (async () => {
      const saved = await getCache(ACTIVE_VISIT_CACHE_KEY);
      if (saved) setActiveVisit(saved);
    })();
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!activeVisit) {
      if (tickRef.current) clearInterval(tickRef.current);
      return;
    }
    const start = new Date(activeVisit.check_in_time).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    const initial = setTimeout(tick, 0);
    tickRef.current = setInterval(tick, 1000);
    return () => { clearTimeout(initial); clearInterval(tickRef.current); };
  }, [activeVisit]);

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

  async function startVisit() {
    if (!customerId) {
      toast.error(tr("مشتری را انتخاب کنید", "اختر عميلًا", "Müşteri seçin", "Choose a customer"));
      return;
    }
    setStartingVisit(true);
    try {
      const pos = await getCurrentPosition();
      const visit = {
        customer_id: Number(customerId),
        check_in_time: new Date().toISOString(),
        check_in_latitude: pos?.latitude ?? null,
        check_in_longitude: pos?.longitude ?? null,
        client_ref: `visit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      };
      setActiveVisit(visit);
      await setCache(ACTIVE_VISIT_CACHE_KEY, visit);
      if (!pos) {
        toast(tr("بدون موقعیت مکانی شروع شد", "بدأت بدون تحديد الموقع", "Konum olmadan başlatıldı", "Started without location"), { icon: "⚠️" });
      }
    } finally {
      setStartingVisit(false);
    }
  }

  async function completeVisit() {
    if (!activeVisit) return;
    setSubmitting(true);
    try {
      const pos = await getCurrentPosition();
      const payload = {
        customer_id: activeVisit.customer_id,
        visit_time: new Date().toISOString(),
        outcome,
        note,
        client_ref: activeVisit.client_ref,
        check_in_time: activeVisit.check_in_time,
        check_in_latitude: activeVisit.check_in_latitude,
        check_in_longitude: activeVisit.check_in_longitude,
        latitude: pos?.latitude ?? activeVisit.check_in_latitude ?? null,
        longitude: pos?.longitude ?? activeVisit.check_in_longitude ?? null,
      };

      const res = await createFieldVisit(payload);
      if (res?.status !== "created" && res?.status !== "already_recorded") throw new Error("failed");
      toast.success(tr("ویزیت با موفقیت تکمیل شد", "تم إكمال الزيارة بنجاح", "Ziyaret başarıyla tamamlandı", "Visit completed"));
      setActiveVisit(null);
      await setCache(ACTIVE_VISIT_CACHE_KEY, null);
      setNote("");
      setOutcome("order_placed");
      void loadVisits();
    } catch (error) {
      if (!isNetworkError(error)) {
        toast.error(translateApiError(error.message, language) || tr("ثبت ویزیت ناموفق بود", "فشل تسجيل الزيارة", "Ziyaret kaydedilemedi", "Failed to record visit"));
        return;
      }
      const payload = {
        customer_id: activeVisit.customer_id,
        visit_time: new Date().toISOString(),
        outcome,
        note,
        client_ref: activeVisit.client_ref,
        check_in_time: activeVisit.check_in_time,
        check_in_latitude: activeVisit.check_in_latitude,
        check_in_longitude: activeVisit.check_in_longitude,
        latitude: activeVisit.check_in_latitude,
        longitude: activeVisit.check_in_longitude,
      };
      const cached = (await getCache(PENDING_VISITS_CACHE_KEY)) || [];
      await setCache(PENDING_VISITS_CACHE_KEY, [...cached, { ...payload, id: Date.now(), pending_sync: true }]);
      toast(tr("اتصال برقرار نیست؛ ویزیت ذخیره شد.", "لا يوجد اتصال؛ تم حفظ الزيارة.", "Bağlantı yok; ziyaret kaydedildi.", "No connection; visit saved locally."));
      setActiveVisit(null);
      await setCache(ACTIVE_VISIT_CACHE_KEY, null);
      setNote("");
      setOutcome("order_placed");
    } finally {
      setSubmitting(false);
    }
  }

  const activeCustomerName = activeVisit && customers.find((c) => c.id === activeVisit.customer_id)?.name;

  return (
    <VisitorLayout title={tr("ویزیت‌ها", "الزيارات", "Ziyaretler", "Visits")}>
      {activeVisit ? (
        <div style={{ background: "linear-gradient(135deg, rgba(45,212,191,.15), rgba(45,212,191,.04))", border: "1px solid var(--erp-accent)", borderRadius: 16, padding: 16, marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontWeight: 900, fontSize: 14, display: "flex", alignItems: "center", gap: 6, color: "var(--erp-accent)" }}>
              <Clock size={16} className="animate-pulse" /> {tr("در حال ویزیت", "الزيارة جارية", "Ziyaret devam ediyor", "Visit in progress")}
            </span>
            <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 900, fontSize: 20 }}>{formatElapsed(elapsed)}</span>
          </div>
          <div style={{ fontWeight: 800, marginBottom: 12 }}>{activeCustomerName || tr("مشتری", "العميل", "Müşteri", "Customer")}</div>

          <Select
            value={outcome}
            onChange={(value) => setOutcome(value)}
            className="w-full mb-[10px]"
            options={OUTCOMES.map((item) => ({ value: item.value, label: item.label[language] || item.label.en }))}
          />
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            placeholder={tr("یادداشت (اختیاری)", "ملاحظة (اختياري)", "Not (isteğe bağlı)", "Note (optional)")}
            style={{ width: "100%", background: "var(--erp-bg)", border: "1px solid var(--erp-border)", borderRadius: 10, padding: 10, color: "var(--erp-text)", marginBottom: 12, resize: "vertical" }}
          />
          <button
            type="button"
            onClick={completeVisit}
            disabled={submitting}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: 0, borderRadius: 12, padding: "12px 0", background: "var(--erp-accent)", color: "#071028", fontWeight: 900, opacity: submitting ? 0.6 : 1 }}
          >
            <CheckCircle2 size={16} /> {submitting ? "..." : tr("پایان ویزیت و ثبت", "إنهاء الزيارة وتسجيلها", "Ziyareti bitir ve kaydet", "Complete & record visit")}
          </button>
        </div>
      ) : (
        <div style={{ background: "var(--erp-panel-solid)", border: "1px solid var(--erp-border)", borderRadius: 16, padding: 14, marginBottom: 18 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 900, color: "var(--erp-accent)" }}>
            {tr("شروع ویزیت جدید", "بدء زيارة جديدة", "Yeni ziyaret başlat", "Start a new visit")}
          </h3>
          <Select
            value={customerId}
            onChange={(value) => setCustomerId(value)}
            className="w-full mb-3"
            options={[
              { value: "", label: tr("انتخاب مشتری", "اختر عميلًا", "Müşteri seçin", "Select customer") },
              ...customers.map((customer) => ({ value: customer.id, label: customer.name })),
            ]}
          />
          <button
            type="button"
            onClick={startVisit}
            disabled={startingVisit}
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: 0, borderRadius: 12, padding: "12px 0", background: "var(--erp-accent)", color: "#071028", fontWeight: 900, opacity: startingVisit ? 0.6 : 1 }}
          >
            <Play size={16} /> {startingVisit ? "..." : tr("ورود / شروع ویزیت", "تسجيل الدخول / بدء الزيارة", "Giriş yap / Ziyareti başlat", "Check in / Start visit")}
          </button>
          <p style={{ fontSize: 11, color: "var(--erp-muted)", marginTop: 8, textAlign: "center" }}>
            {tr("موقعیت مکانی شما برای ثبت زمان و اعتبارسنجی محل ویزیت ضبط می‌شود.", "سيتم تسجيل موقعك للتحقق من زمن ومكان الزيارة.", "Ziyaret zamanını ve konumunu doğrulamak için konumunuz kaydedilecek.", "Your location is recorded to verify visit time and place.")}
          </p>
        </div>
      )}

      <h3 style={{ fontSize: 14, fontWeight: 900, color: "var(--erp-accent)", margin: "0 0 10px" }}>
        {tr("تاریخچه ویزیت‌ها", "سجل الزيارات", "Ziyaret geçmişi", "Visit history")}
      </h3>
      <div style={{ display: "grid", gap: 8 }}>
        {visits.map((visit) => {
          const item = OUTCOMES.find((entry) => entry.value === visit.outcome);
          const duration = visit.duration_seconds != null ? formatElapsed(visit.duration_seconds) : null;
          return (
            <div key={visit.id} style={{ background: "var(--erp-panel-solid)", border: "1px solid var(--erp-border)", borderRadius: 12, padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800 }}>
                <span>{visit.customer_name}</span>
                <span style={{ color: "var(--erp-muted)", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                  <Clock size={12} /> {new Date(visit.visit_time).toLocaleString(language)}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "var(--erp-accent)" }}>{item?.label[language] || visit.outcome}</span>
                {duration && (
                  <span style={{ fontSize: 11, color: "var(--erp-muted)", display: "flex", alignItems: "center", gap: 3 }}>
                    <Clock size={11} /> {duration}
                  </span>
                )}
                {visit.within_geofence === 1 || visit.within_geofence === true ? (
                  <span style={{ fontSize: 11, color: "#86efac", display: "flex", alignItems: "center", gap: 3 }}>
                    <Navigation size={11} /> {tr("در محدوده مشتری", "ضمن نطاق العميل", "Müşteri konumunda", "At customer location")}
                    {visit.distance_meters != null && ` (${formatDistance(visit.distance_meters, language)})`}
                  </span>
                ) : visit.within_geofence === 0 || visit.within_geofence === false ? (
                  <span style={{ fontSize: 11, color: "#fbbf24", display: "flex", alignItems: "center", gap: 3 }}>
                    <MapPinOff size={11} /> {formatDistance(visit.distance_meters, language)} {tr("با محل مشتری فاصله دارد", "بعيدًا عن موقع العميل", "müşteri konumundan uzak", "from customer location")}
                  </span>
                ) : null}
              </div>
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
