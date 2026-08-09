import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, Phone, MapPin, ShoppingCart, ClipboardCheck, Search } from "lucide-react";
import toast from "react-hot-toast";
import { useLanguage } from "../../localization/useLanguage";
import { getCustomers } from "../../services/api";
import { getCache, setCache } from "../../storage/db";
import VisitorLayout from "./VisitorLayout";

const CUSTOMERS_CACHE_KEY = "visitor_customers";

export default function VisitorHome() {
  const { language, money } = useLanguage();
  const navigate = useNavigate();
  const fa = language === "fa";
  const tr = (faText, arText, trText, enText) =>
    fa ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

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

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = customers.filter((customer) => {
    const needle = query.trim().toLocaleLowerCase(language);
    if (!needle) return true;
    return `${customer.name || ""} ${customer.phone || ""} ${customer.mobile || ""}`.toLocaleLowerCase(language).includes(needle);
  });

  return (
    <VisitorLayout title={tr("مشتریان من", "عملائي", "Müşterilerim", "My Customers")}>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
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

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: "center", color: "var(--erp-muted)", padding: "40px 0" }}>
          {tr("مشتری‌ای برای شما تعریف نشده است.", "لا يوجد عملاء مخصصون لك.", "Size atanmış müşteri yok.", "No customers assigned to you.")}
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {filtered.map((customer) => (
          <article
            key={customer.id}
            style={{ background: "var(--erp-panel-solid)", border: "1px solid var(--erp-border)", borderRadius: 16, padding: 14 }}
          >
            <div style={{ fontWeight: 900, fontSize: 15 }}>{customer.name}</div>
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
        ))}
      </div>
    </VisitorLayout>
  );
}
