import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  Brain,
  ClipboardList,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldAlert,
  TrendingUp,
  Warehouse,
} from "lucide-react";
import { useLanguage } from "../localization/useLanguage";
import { getSmartInventoryOverview } from "../services/api";

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function levelClass(level) {
  if (["critical", "danger"].includes(level)) return "bg-rose-500/10 border-rose-400/20 text-rose-200";
  if (["warning", "slow", "dead_stock"].includes(level)) return "bg-amber-500/10 border-amber-400/20 text-amber-200";
  return "bg-emerald-500/10 border-emerald-400/20 text-emerald-200";
}

function levelLabel(level, language) {
  const mapFa = {
    critical: "بحرانی",
    danger: "پرریسک",
    warning: "هشدار",
    slow: "کندفروش",
    dead_stock: "راکد",
    safe: "ایمن",
  };
  const mapAr = {
    critical: "حرج",
    danger: "مخاطر عالية",
    warning: "تحذير",
    slow: "بطيء الحركة",
    dead_stock: "مخزون راكد",
    safe: "آمن",
  };
  const mapTr = {
    critical: "Kritik",
    danger: "Yüksek risk",
    warning: "Uyarı",
    slow: "Yavaş hareket eden",
    dead_stock: "Ölü stok",
    safe: "Güvenli",
  };
  const mapEn = {
    critical: "Critical",
    danger: "High risk",
    warning: "Warning",
    slow: "Slow moving",
    dead_stock: "Dead stock",
    safe: "Safe",
  };
  const map = language === "fa" ? mapFa : language === "ar" ? mapAr : language === "tr" ? mapTr : mapEn;
  return map[level] || level;
}

export default function SmartInventory() {
  const { language, dir, money, n } = useLanguage();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("reorder");

  async function load() {
    try {
      setLoading(true);
      setError("");
      const res = await getSmartInventoryOverview();
      if (res?.status === "error") throw new Error(res.message);
      setData(res);
    } catch (err) {
      console.error("Smart inventory loading error", err);
      setError(language === "fa" ? "خطا در دریافت اطلاعات انبار هوشمند" : language === "ar" ? "خطأ في تحميل بيانات المخزون الذكي" : language === "tr" ? "Akıllı stok verileri yüklenirken hata oluştu" : "Smart inventory loading error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initialTimer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(initialTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const rows = useMemo(() => {
    const source =
      tab === "all"
        ? safeArray(data?.items)
        : tab === "low"
        ? safeArray(data?.low_stock)
        : tab === "dead"
        ? safeArray(data?.dead_stock)
        : tab === "abcA"
        ? safeArray(data?.abc?.A)
        : safeArray(data?.reorder_plan);

    const q = query.trim().toLowerCase();
    if (!q) return source;
    return source.filter((item) => {
      return [item.name, item.code, item.barcode, item.brand, item.category]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [data, tab, query]);

  const summary = data?.summary || {};

  return (
    <div dir={dir} className="min-h-screen p-6 bg-[var(--erp-bg)] text-[var(--erp-text)]">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-4xl font-black text-[var(--erp-accent)] flex items-center gap-3">
            <Warehouse />
            {language === "fa" ? "انبار هوشمند" : language === "ar" ? "المخزون الذكي" : language === "tr" ? "Akıllı Stok" : "Smart Inventory"}
          </h1>
          <p className="text-[var(--erp-muted)] mt-2">
            {language === "fa"
              ? "پیش‌بینی کمبود موجودی، کالای راکد، سفارش مجدد و تحلیل ABC"
              : language === "ar"
              ? "توقع نفاد المخزون، المخزون الراكد، خطة إعادة الطلب وتحليل ABC"
              : language === "tr"
              ? "Stok tükenme tahmini, ölü stok, yeniden sipariş planı ve ABC analizi"
              : "Stockout forecast, dead stock, reorder plan and ABC analysis"}
          </p>
        </div>

        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="px-5 py-3 rounded-2xl bg-[var(--erp-accent)] text-slate-950 font-black flex items-center gap-2 disabled:opacity-60"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          {language === "fa" ? "به‌روزرسانی" : language === "ar" ? "تحديث" : language === "tr" ? "Yenile" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="mb-5 rounded-2xl p-4 bg-rose-500/10 border border-rose-400/20 text-rose-200 flex items-center gap-2">
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <KpiCard icon={<Boxes />} title={language === "fa" ? "تعداد کالا" : language === "ar" ? "عدد المنتجات" : language === "tr" ? "Ürün Sayısı" : "Products"} value={n(summary.products_count || 0)} color="cyan" />
        <KpiCard icon={<ShieldAlert />} title={language === "fa" ? "ریسک کمبود" : language === "ar" ? "مخاطر نفاد المخزون" : language === "tr" ? "Stok tükenme riski" : "Stockout risk"} value={n(summary.low_stock_count || 0)} color="rose" />
        <KpiCard icon={<ClipboardList />} title={language === "fa" ? "نیاز به سفارش" : language === "ar" ? "بحاجة لإعادة الطلب" : language === "tr" ? "Yeniden sipariş gerekli" : "Need reorder"} value={n(summary.reorder_count || 0)} color="amber" />
        <KpiCard icon={<TrendingUp />} title={language === "fa" ? "ارزش فروش موجودی" : language === "ar" ? "قيمة بيع المخزون" : language === "tr" ? "Stok satış değeri" : "Stock sell value"} value={money(summary.stock_value_sell || 0)} color="emerald" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-5 mb-5">
        <div className="rounded-[2rem] bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <h2 className="text-[var(--erp-accent)] font-black text-xl flex items-center gap-2">
              <Brain />
              {language === "fa" ? "تحلیل هوشمند انبار" : language === "ar" ? "ذكاء المخزون" : language === "tr" ? "Stok zekası" : "Inventory intelligence"}
            </h2>
            <div className="relative min-w-[260px]">
              <Search className="absolute top-3 right-3 text-[var(--erp-muted)]" size={18} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={language === "fa" ? "جستجوی کالا، برند، کد..." : language === "ar" ? "بحث عن منتج أو علامة تجارية أو رمز..." : language === "tr" ? "Ürün, marka, kod ara..." : "Search product, brand, code..."}
                className="w-full bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] rounded-2xl py-3 pr-10 pl-4 outline-none text-[var(--erp-text)]"
              />
            </div>
          </div>

          <div className="flex gap-2 flex-wrap mb-4">
            <TabButton active={tab === "reorder"} onClick={() => setTab("reorder")} label={language === "fa" ? "برنامه سفارش" : language === "ar" ? "إعادة الطلب" : language === "tr" ? "Yeniden Sipariş" : "Reorder"} />
            <TabButton active={tab === "low"} onClick={() => setTab("low")} label={language === "fa" ? "کمبود" : language === "ar" ? "مخزون منخفض" : language === "tr" ? "Düşük Stok" : "Low stock"} />
            <TabButton active={tab === "dead"} onClick={() => setTab("dead")} label={language === "fa" ? "راکد" : language === "ar" ? "مخزون راكد" : language === "tr" ? "Ölü Stok" : "Dead stock"} />
            <TabButton active={tab === "abcA"} onClick={() => setTab("abcA")} label={language === "fa" ? "کلاس A" : language === "ar" ? "فئة A" : language === "tr" ? "ABC A" : "ABC A"} />
            <TabButton active={tab === "all"} onClick={() => setTab("all")} label={language === "fa" ? "همه کالاها" : language === "ar" ? "الكل" : language === "tr" ? "Tümü" : "All"} />
          </div>

          <div className="overflow-auto rounded-2xl border border-[var(--erp-border)]">
            <table className="w-full text-sm min-w-[980px]">
              <thead className="bg-[var(--erp-panel-solid)] text-[var(--erp-accent)]">
                <tr>
                  <th className="p-3 text-right">{language === "fa" ? "کالا" : language === "ar" ? "المنتج" : language === "tr" ? "Ürün" : "Product"}</th>
                  <th className="p-3">{language === "fa" ? "موجودی" : language === "ar" ? "المخزون" : language === "tr" ? "Stok" : "Stock"}</th>
                  <th className="p-3">{language === "fa" ? "فروش ۹۰ روز" : language === "ar" ? "مبيعات 90 يومًا" : language === "tr" ? "90 günlük satış" : "90d sales"}</th>
                  <th className="p-3">{language === "fa" ? "دوام موجودی" : language === "ar" ? "الأيام المتبقية" : language === "tr" ? "Kalan gün" : "Days left"}</th>
                  <th className="p-3">{language === "fa" ? "سفارش پیشنهادی" : language === "ar" ? "إعادة الطلب المقترحة" : language === "tr" ? "Önerilen yeniden sipariş" : "Suggested reorder"}</th>
                  <th className="p-3">ABC</th>
                  <th className="p-3">{language === "fa" ? "وضعیت" : language === "ar" ? "الحالة" : language === "tr" ? "Durum" : "Status"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? rows.map((item) => (
                  <tr key={item.id} className="border-t border-[var(--erp-border)] hover:bg-[var(--erp-panel-solid)]/50">
                    <td className="p-3">
                      <div className="font-black text-[var(--erp-text)]">{item.name || "-"}</div>
                      <div className="text-xs text-[var(--erp-muted)] mt-1">{item.brand || item.code || item.barcode || "-"}</div>
                    </td>
                    <td className="p-3 text-center font-bold">{n(item.stock || 0)} {item.unit || ""}</td>
                    <td className="p-3 text-center">{n(item.net_qty_90d || 0)}</td>
                    <td className="p-3 text-center">{item.days_left == null ? "-" : `${n(item.days_left)} ${language === "fa" ? "روز" : language === "ar" ? "يومًا" : language === "tr" ? "gün" : "days"}`}</td>
                    <td className="p-3 text-center font-black text-amber-300">{n(item.suggested_reorder_qty || 0)}</td>
                    <td className="p-3 text-center"><span className="px-3 py-1 rounded-full bg-[var(--erp-glow)] text-[var(--erp-accent)] font-black">{item.abc_class || "C"}</span></td>
                    <td className="p-3 text-center">
                      <span className={`px-3 py-1 rounded-full border text-xs font-black ${levelClass(item.risk_level)}`}>
                        {levelLabel(item.risk_level, language)}
                      </span>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-[var(--erp-muted)]">
                      {loading ? (language === "fa" ? "در حال دریافت..." : language === "ar" ? "جارٍ التحميل..." : language === "tr" ? "Yükleniyor..." : "Loading...") : (language === "fa" ? "داده‌ای برای نمایش وجود ندارد." : language === "ar" ? "لا توجد بيانات لعرضها." : language === "tr" ? "Gösterilecek veri yok." : "No data.")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[2rem] bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] p-5">
            <h2 className="text-[var(--erp-accent)] font-black text-xl mb-4 flex items-center gap-2">
              <PackageCheck />
              {language === "fa" ? "پیشنهادهای عملیاتی" : language === "ar" ? "رؤى قابلة للتنفيذ" : language === "tr" ? "Uygulanabilir öngörüler" : "Actionable insights"}
            </h2>
            <div className="space-y-3">
              {safeArray(data?.insights).map((insight, index) => (
                <div key={index} className={`rounded-2xl p-4 border ${insight.type === "danger" ? "bg-rose-500/10 border-rose-400/20" : insight.type === "warning" ? "bg-amber-500/10 border-amber-400/20" : insight.type === "success" ? "bg-emerald-500/10 border-emerald-400/20" : "bg-[var(--erp-glow)] border-[var(--erp-border)]"}`}>
                  <div className="font-black text-[var(--erp-text)]">{insight.title}</div>
                  <div className="text-[var(--erp-muted)] text-sm mt-1">{insight.message}</div>
                  <div className="text-[var(--erp-accent)] text-xs font-bold mt-2">{insight.action}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] p-5">
            <h2 className="text-[var(--erp-accent)] font-black text-xl mb-4">{language === "fa" ? "تحلیل ABC" : language === "ar" ? "تحليل ABC" : language === "tr" ? "ABC analizi" : "ABC analysis"}</h2>
            <AbcRow language={language} n={n} label="A" items={safeArray(data?.abc?.A)} desc={language === "fa" ? "کالاهای حیاتی و پرفروش" : language === "ar" ? "أصناف حرجة عالية القيمة" : language === "tr" ? "Kritik yüksek değerli ürünler" : "Critical high-value items"} />
            <AbcRow language={language} n={n} label="B" items={safeArray(data?.abc?.B)} desc={language === "fa" ? "کالاهای متوسط" : language === "ar" ? "أصناف متوسطة القيمة" : language === "tr" ? "Orta değerli ürünler" : "Medium-value items"} />
            <AbcRow language={language} n={n} label="C" items={safeArray(data?.abc?.C)} desc={language === "fa" ? "کالاهای کم‌اثر" : language === "ar" ? "أصناف منخفضة الأثر" : language === "tr" ? "Düşük etkili ürünler" : "Low-impact items"} />
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, title, value, color }) {
  const colorClass = {
    cyan: "text-[var(--erp-accent)] bg-[var(--erp-glow)] border-[var(--erp-border)]",
    rose: "text-rose-300 bg-rose-500/10 border-rose-400/20",
    amber: "text-amber-300 bg-amber-500/10 border-amber-400/20",
    emerald: "text-emerald-300 bg-emerald-500/10 border-emerald-400/20",
  }[color] || "text-[var(--erp-accent)] bg-[var(--erp-glow)] border-[var(--erp-border)]";

  return (
    <div className={`rounded-[2rem] border p-5 ${colorClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[var(--erp-muted)] text-sm font-bold">{title}</div>
          <div className="text-2xl font-black mt-2 text-[var(--erp-text)]">{value}</div>
        </div>
        <div className="text-3xl">{icon}</div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-2xl font-black ${active ? "bg-[var(--erp-accent)] text-slate-950" : "bg-[var(--erp-panel-solid)] text-[var(--erp-muted)]"}`}
    >
      {label}
    </button>
  );
}

function AbcRow({ label, items, desc, language, n }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--erp-border)] py-3 last:border-b-0">
      <div>
        <div className="font-black text-[var(--erp-text)]">{label}</div>
        <div className="text-xs text-[var(--erp-muted)]">{desc}</div>
      </div>
      <div className="text-[var(--erp-accent)] font-black">{n(items.length)} {language === "fa" ? "کالا" : language === "ar" ? "عنصر" : language === "tr" ? "ürün" : "items"}</div>
    </div>
  );
}
