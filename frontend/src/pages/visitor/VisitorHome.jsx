import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, Phone, MapPin, ShoppingCart, ClipboardCheck, Search, TrendingUp, Navigation, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import { useLanguage } from "../../localization/useLanguage";
import { getCustomers } from "../../services/api";
import { getFieldVisitSummary, getFieldVisitCoverage } from "../../services/fieldVisitsApi";
import { getCache, setCache } from "../../storage/db";
import { haversineMeters, formatDistance, getCurrentPosition } from "./geo";
import VisitorLayout from "./VisitorLayout";

const CUSTOMERS_CACHE_KEY = "visitor_customers";

function KpiTile({ label, value, accent }) {
  return (
    <div style={{ flex: 1, background: "var(--erp-panel-solid)", border: "1px solid var(--erp-border)", borderRadius: 14, padding: "10px 12px", textAlign: "center" }}>
      <div style={{ fontSize: 18, fontWeight: 900, color: accent ? "var(--erp-accent)" : "var(--erp-text)" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--erp-muted)", marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function VisitorHome() {
  const { language, money } = useLanguage();
  const navigate = useNavigate();
  const fa = language === "fa";
  const tr = (faText, arText, trText, enText) =>
    fa ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [summary, setSummary] = useState(null);
  const [coverage, setCoverage] = useState({});
  const [position, setPosition] = useState(null);
  const [sortMode, setSortMode] = useState("default"); // default | distance | overdue

  async function load() {
    setLoading(true);
    try {
      const data = await getCustomers();
      const list = Array.isArray(data) ? data : [];
      setCustomers(list);
      await setCache(CUSTOMERS_CACHE_KEY, list);
    } catch {
      const cached = await getCache(CUSTOMERS_CACHE_KEY);
      if (cached) {
        setCustomers(cached);
        toast(tr("حالت آفلاین — فهرست ذخیره‌شده نمایش داده می‌شود", "وضع عدم الاتصال — عرض القائمة المحفوظة", "Çevrimdışı — kaydedilen liste gösteriliyor", "Offline — showing saved list"));
      } else {
        toast.error(tr("دریافت مشتریان ناموفق بود", "فشل تحميل العملاء", "Müşteriler yüklenemedi", "Failed to load customers"));
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadKpis() {
    try {
      setSummary(await getFieldVisitSummary("self"));
    } catch {
      // KPI strip is a convenience layer - the customer list below still
      // works fully without it (e.g. offline).
    }
    try {
      const result = await getFieldVisitCoverage();
      const map = {};
      for (const item of result.items || []) map[item.customer_id] = item;
      setCoverage(map);
    } catch {
      // Coverage badges are best-effort too.
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void load(); void loadKpis(); }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function useMyLocation() {
    const pos = await getCurrentPosition();
    if (!pos) {
      toast.error(tr("دریافت موقعیت ممکن نشد", "تعذر تحديد الموقع", "Konum alınamadı", "Could not get your location"));
      return;
    }
    setPosition(pos);
    setSortMode("distance");
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(language);
    let list = customers.filter((customer) => {
      if (!needle) return true;
      return `${customer.name || ""} ${customer.phone || ""} ${customer.mobile || ""}`.toLocaleLowerCase(language).includes(needle);
    });
    list = list.map((customer) => {
      const cov = coverage[customer.id];
      const distance = position ? haversineMeters(position.latitude, position.longitude, customer.latitude, customer.longitude) : null;
      return { ...customer, __coverage: cov, __distance: distance };
    });
    if (sortMode === "distance") {
      list.sort((a, b) => {
        if (a.__distance === null && b.__distance === null) return 0;
        if (a.__distance === null) return 1;
        if (b.__distance === null) return -1;
        return a.__distance - b.__distance;
      });
    } else if (sortMode === "overdue") {
      list.sort((a, b) => {
        const aOverdue = a.__coverage?.overdue ? 1 : 0;
        const bOverdue = b.__coverage?.overdue ? 1 : 0;
        if (aOverdue !== bOverdue) return bOverdue - aOverdue;
        return (b.__coverage?.days_since_last_visit ?? 9999) - (a.__coverage?.days_since_last_visit ?? 9999);
      });
    }
    return list;
  }, [customers, query, language, coverage, position, sortMode]);

  const overdueCount = Object.values(coverage).filter((c) => c.overdue).length;

  return (
    <VisitorLayout title={tr("مشتریان من", "عملائي", "Müşterilerim", "My Customers")}>
      {summary && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <KpiTile label={tr("ویزیت امروز", "زيارات اليوم", "Bugünkü ziyaret", "Visits today")} value={fa ? String(summary.today.visits).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]) : summary.today.visits} accent />
          <KpiTile label={tr("سفارش امروز", "طلبات اليوم", "Bugünkü sipariş", "Orders today")} value={fa ? String(summary.today.orders).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]) : summary.today.orders} />
          <KpiTile label={tr("نرخ تبدیل", "معدل التحويل", "Dönüşüm oranı", "Conversion")} value={`${fa ? String(summary.today.conversion_rate).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]) : summary.today.conversion_rate}%`} />
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <label style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, background: "var(--erp-panel-solid)", borderRadius: 14, padding: "10px 12px", border: "1px solid var(--erp-border)" }}>
          <Search size={16} color="var(--erp-muted)" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tr("جستجوی مشتری...", "ابحث عن عميل...", "Müşteri ara...", "Search customer...")}
            style={{ flex: 1, background: "transparent", border: 0, outline: "none", color: "var(--erp-text)" }}
          />
        </label>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          style={{ width: 44, height: 44, borderRadius: 14, border: "1px solid var(--erp-border)", background: "var(--erp-panel-solid)", color: "var(--erp-accent)", display: "grid", placeItems: "center" }}
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, overflowX: "auto" }}>
        <button
          type="button"
          onClick={useMyLocation}
          style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", fontSize: 12, fontWeight: 800, padding: "8px 12px", borderRadius: 999, border: "1px solid var(--erp-border)", background: sortMode === "distance" ? "var(--erp-accent)" : "var(--erp-panel-solid)", color: sortMode === "distance" ? "#071028" : "var(--erp-text)" }}
        >
          <Navigation size={13} /> {tr("نزدیک‌ترین", "الأقرب", "En yakın", "Nearest")}
        </button>
        <button
          type="button"
          onClick={() => setSortMode(sortMode === "overdue" ? "default" : "overdue")}
          style={{ display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", fontSize: 12, fontWeight: 800, padding: "8px 12px", borderRadius: 999, border: "1px solid var(--erp-border)", background: sortMode === "overdue" ? "#f59e0b" : "var(--erp-panel-solid)", color: sortMode === "overdue" ? "#451a03" : "var(--erp-text)" }}
        >
          <AlertCircle size={13} /> {tr("عقب‌افتاده", "متأخر", "Gecikmiş", "Overdue")} {overdueCount > 0 && `(${fa ? String(overdueCount).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]) : overdueCount})`}
        </button>
      </div>

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--erp-muted)", padding: "40px 0" }}>
          {tr("مشتری‌ای برای شما تعریف نشده است.", "لا يوجد عملاء مخصصون لك.", "Size atanmış müşteri yok.", "No customers assigned to you.")}
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {filtered.map((customer) => {
          const cov = customer.__coverage;
          const distanceLabel = formatDistance(customer.__distance, language);
          return (
            <article
              key={customer.id}
              style={{ background: "var(--erp-panel-solid)", border: cov?.overdue ? "1px solid #f59e0b" : "1px solid var(--erp-border)", borderRadius: 16, padding: 14 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ fontWeight: 900, fontSize: 15 }}>{customer.name}</div>
                {distanceLabel && (
                  <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 11, color: "var(--erp-accent)", whiteSpace: "nowrap" }}>
                    <Navigation size={11} /> {distanceLabel}
                  </span>
                )}
              </div>
              {(customer.phone || customer.mobile) && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--erp-muted)", fontSize: 13, marginTop: 4 }}>
                  <Phone size={13} /> {customer.phone || customer.mobile}
                </div>
              )}
              {customer.address && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--erp-muted)", fontSize: 13, marginTop: 4 }}>
                  <MapPin size={13} /> {customer.address}
                </div>
              )}
              {typeof customer.balance === "number" && customer.balance !== 0 && (
                <div style={{ marginTop: 6, fontSize: 13, color: customer.balance > 0 ? "#fca5a5" : "#86efac" }}>
                  {tr("مانده حساب", "الرصيد", "Bakiye", "Balance")}: {money(Math.abs(customer.balance))}
                </div>
              )}
              {cov && (
                <div style={{ marginTop: 6, fontSize: 12, display: "flex", alignItems: "center", gap: 4, color: cov.overdue ? "#f59e0b" : "var(--erp-muted)" }}>
                  {cov.overdue && <TrendingUp size={12} />}
                  {cov.days_since_last_visit === null
                    ? tr("تا به حال ویزیت نشده", "لم تتم زيارته بعد", "Henüz ziyaret edilmedi", "Never visited")
                    : tr(`${fa ? String(cov.days_since_last_visit).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[d]) : cov.days_since_last_visit} روز از آخرین ویزیت`, `منذ ${cov.days_since_last_visit} يومًا من آخر زيارة`, `Son ziyaretten ${cov.days_since_last_visit} gün önce`, `${cov.days_since_last_visit} days since last visit`)}
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button
                  type="button"
                  onClick={() => navigate(`/visitor/order/${customer.id}`)}
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, border: 0, borderRadius: 12, padding: "10px 0", background: "var(--erp-accent)", color: "#071028", fontWeight: 900 }}
                >
                  <ShoppingCart size={16} /> {tr("ثبت سفارش", "طلب جديد", "Sipariş al", "New order")}
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/visitor/visits?customer_id=${customer.id}`)}
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, border: "1px solid var(--erp-border)", borderRadius: 12, padding: "10px 0", background: "transparent", color: "var(--erp-text)", fontWeight: 800 }}
                >
                  <ClipboardCheck size={16} /> {tr("ثبت ویزیت", "تسجيل زيارة", "Ziyaret kaydet", "Log visit")}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </VisitorLayout>
  );
}
