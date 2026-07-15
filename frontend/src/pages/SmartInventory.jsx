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

function levelLabel(level, fa) {
  const mapFa = {
    critical: "بحرانی",
    danger: "پرریسک",
    warning: "هشدار",
    slow: "کندفروش",
    dead_stock: "راکد",
    safe: "ایمن",
  };
  const mapEn = {
    critical: "Critical",
    danger: "High risk",
    warning: "Warning",
    slow: "Slow moving",
    dead_stock: "Dead stock",
    safe: "Safe",
  };
  return fa ? mapFa[level] || level : mapEn[level] || level;
}

export default function SmartInventory() {
  const { language, dir, money, n } = useLanguage();
  const fa = language === "fa";

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
      setError(fa ? "خطا در دریافت اطلاعات انبار هوشمند" : "Smart inventory loading error");
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
    <div dir={dir} className="min-h-screen p-6 bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 text-white">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-4xl font-black text-cyan-400 flex items-center gap-3">
            <Warehouse />
            {fa ? "انبار هوشمند" : "Smart Inventory"}
          </h1>
          <p className="text-slate-400 mt-2">
            {fa
              ? "پیش‌بینی کمبود موجودی، کالای راکد، سفارش مجدد و تحلیل ABC"
              : "Stockout forecast, dead stock, reorder plan and ABC analysis"}
          </p>
        </div>

        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="px-5 py-3 rounded-2xl bg-cyan-400 text-slate-950 font-black flex items-center gap-2 disabled:opacity-60"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
          {fa ? "به‌روزرسانی" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="mb-5 rounded-2xl p-4 bg-rose-500/10 border border-rose-400/20 text-rose-200 flex items-center gap-2">
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <KpiCard icon={<Boxes />} title={fa ? "تعداد کالا" : "Products"} value={n(summary.products_count || 0)} color="cyan" />
        <KpiCard icon={<ShieldAlert />} title={fa ? "ریسک کمبود" : "Stockout risk"} value={n(summary.low_stock_count || 0)} color="rose" />
        <KpiCard icon={<ClipboardList />} title={fa ? "نیاز به سفارش" : "Need reorder"} value={n(summary.reorder_count || 0)} color="amber" />
        <KpiCard icon={<TrendingUp />} title={fa ? "ارزش فروش موجودی" : "Stock sell value"} value={money(summary.stock_value_sell || 0)} color="emerald" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-5 mb-5">
        <div className="rounded-[2rem] bg-slate-900/70 border border-cyan-500/20 p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <h2 className="text-cyan-300 font-black text-xl flex items-center gap-2">
              <Brain />
              {fa ? "تحلیل هوشمند انبار" : "Inventory intelligence"}
            </h2>
            <div className="relative min-w-[260px]">
              <Search className="absolute top-3 right-3 text-slate-500" size={18} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={fa ? "جستجوی کالا، برند، کد..." : "Search product, brand, code..."}
                className="w-full bg-slate-800 border border-cyan-500/10 rounded-2xl py-3 pr-10 pl-4 outline-none text-white"
              />
            </div>
          </div>

          <div className="flex gap-2 flex-wrap mb-4">
            <TabButton active={tab === "reorder"} onClick={() => setTab("reorder")} label={fa ? "برنامه سفارش" : "Reorder"} />
            <TabButton active={tab === "low"} onClick={() => setTab("low")} label={fa ? "کمبود" : "Low stock"} />
            <TabButton active={tab === "dead"} onClick={() => setTab("dead")} label={fa ? "راکد" : "Dead stock"} />
            <TabButton active={tab === "abcA"} onClick={() => setTab("abcA")} label={fa ? "کلاس A" : "ABC A"} />
            <TabButton active={tab === "all"} onClick={() => setTab("all")} label={fa ? "همه کالاها" : "All"} />
          </div>

          <div className="overflow-auto rounded-2xl border border-slate-700">
            <table className="w-full text-sm min-w-[980px]">
              <thead className="bg-slate-800 text-cyan-200">
                <tr>
                  <th className="p-3 text-right">{fa ? "کالا" : "Product"}</th>
                  <th className="p-3">{fa ? "موجودی" : "Stock"}</th>
                  <th className="p-3">{fa ? "فروش ۹۰ روز" : "90d sales"}</th>
                  <th className="p-3">{fa ? "دوام موجودی" : "Days left"}</th>
                  <th className="p-3">{fa ? "سفارش پیشنهادی" : "Suggested reorder"}</th>
                  <th className="p-3">ABC</th>
                  <th className="p-3">{fa ? "وضعیت" : "Status"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? rows.map((item) => (
                  <tr key={item.id} className="border-t border-slate-800 hover:bg-slate-800/50">
                    <td className="p-3">
                      <div className="font-black text-white">{item.name || "-"}</div>
                      <div className="text-xs text-slate-400 mt-1">{item.brand || item.code || item.barcode || "-"}</div>
                    </td>
                    <td className="p-3 text-center font-bold">{n(item.stock || 0)} {item.unit || ""}</td>
                    <td className="p-3 text-center">{n(item.net_qty_90d || 0)}</td>
                    <td className="p-3 text-center">{item.days_left == null ? "-" : `${n(item.days_left)} ${fa ? "روز" : "days"}`}</td>
                    <td className="p-3 text-center font-black text-amber-300">{n(item.suggested_reorder_qty || 0)}</td>
                    <td className="p-3 text-center"><span className="px-3 py-1 rounded-full bg-cyan-400/10 text-cyan-200 font-black">{item.abc_class || "C"}</span></td>
                    <td className="p-3 text-center">
                      <span className={`px-3 py-1 rounded-full border text-xs font-black ${levelClass(item.risk_level)}`}>
                        {levelLabel(item.risk_level, fa)}
                      </span>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400">
                      {loading ? (fa ? "در حال دریافت..." : "Loading...") : (fa ? "داده‌ای برای نمایش وجود ندارد." : "No data.")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-[2rem] bg-slate-900/70 border border-cyan-500/20 p-5">
            <h2 className="text-cyan-300 font-black text-xl mb-4 flex items-center gap-2">
              <PackageCheck />
              {fa ? "پیشنهادهای عملیاتی" : "Actionable insights"}
            </h2>
            <div className="space-y-3">
              {safeArray(data?.insights).map((insight, index) => (
                <div key={index} className={`rounded-2xl p-4 border ${insight.type === "danger" ? "bg-rose-500/10 border-rose-400/20" : insight.type === "warning" ? "bg-amber-500/10 border-amber-400/20" : insight.type === "success" ? "bg-emerald-500/10 border-emerald-400/20" : "bg-cyan-500/10 border-cyan-400/20"}`}>
                  <div className="font-black text-white">{insight.title}</div>
                  <div className="text-slate-300 text-sm mt-1">{insight.message}</div>
                  <div className="text-cyan-300 text-xs font-bold mt-2">{insight.action}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] bg-slate-900/70 border border-cyan-500/20 p-5">
            <h2 className="text-cyan-300 font-black text-xl mb-4">{fa ? "تحلیل ABC" : "ABC analysis"}</h2>
            <AbcRow fa={fa} n={n} label="A" items={safeArray(data?.abc?.A)} desc={fa ? "کالاهای حیاتی و پرفروش" : "Critical high-value items"} />
            <AbcRow fa={fa} n={n} label="B" items={safeArray(data?.abc?.B)} desc={fa ? "کالاهای متوسط" : "Medium-value items"} />
            <AbcRow fa={fa} n={n} label="C" items={safeArray(data?.abc?.C)} desc={fa ? "کالاهای کم‌اثر" : "Low-impact items"} />
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, title, value, color }) {
  const colorClass = {
    cyan: "text-cyan-300 bg-cyan-500/10 border-cyan-400/20",
    rose: "text-rose-300 bg-rose-500/10 border-rose-400/20",
    amber: "text-amber-300 bg-amber-500/10 border-amber-400/20",
    emerald: "text-emerald-300 bg-emerald-500/10 border-emerald-400/20",
  }[color] || "text-cyan-300 bg-cyan-500/10 border-cyan-400/20";

  return (
    <div className={`rounded-[2rem] border p-5 ${colorClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-slate-300 text-sm font-bold">{title}</div>
          <div className="text-2xl font-black mt-2 text-white">{value}</div>
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
      className={`px-4 py-2 rounded-2xl font-black ${active ? "bg-cyan-400 text-slate-950" : "bg-slate-800 text-slate-300"}`}
    >
      {label}
    </button>
  );
}

function AbcRow({ label, items, desc, fa, n }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-800 py-3 last:border-b-0">
      <div>
        <div className="font-black text-white">{label}</div>
        <div className="text-xs text-slate-400">{desc}</div>
      </div>
      <div className="text-cyan-300 font-black">{n(items.length)} {fa ? "کالا" : "items"}</div>
    </div>
  );
}
