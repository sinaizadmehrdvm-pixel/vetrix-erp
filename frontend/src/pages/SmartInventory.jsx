import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Boxes,
  Brain,
  ClipboardList,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldAlert,
  ShoppingCart,
  TrendingUp,
  Warehouse,
} from "lucide-react";
import toast from "react-hot-toast";
import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits } from "../localization/helpers";
import { getSmartInventoryOverview, createPurchaseOrder, getExpiringBatches, getBranches } from "../services/api";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "../components/ui/Table";
import Select from "../components/ui/Select";

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
  const pd = (value) => (language === "fa" ? toPersianDigits(value) : value);
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [expiringBatches, setExpiringBatches] = useState([]);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [creatingPo, setCreatingPo] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("reorder");

  async function load(currentBranchId) {
    try {
      setLoading(true);
      setError("");
      const params = currentBranchId ? { branch_id: currentBranchId } : {};
      const res = await getSmartInventoryOverview(params);
      if (res?.status === "error") throw new Error(res.message);
      setData(res);
    } catch (err) {
      console.error("Smart inventory loading error", err);
      setError(language === "fa" ? "خطا در دریافت اطلاعات انبار هوشمند" : language === "ar" ? "خطأ في تحميل بيانات المخزون الذكي" : language === "tr" ? "Akıllı stok verileri yüklenirken hata oluştu" : "Smart inventory loading error");
    } finally {
      setLoading(false);
    }
    try {
      const batches = await getExpiringBatches(30);
      setExpiringBatches(Array.isArray(batches) ? batches : []);
    } catch {
      setExpiringBatches([]);
    }
    try {
      const b = await getBranches();
      setBranches(Array.isArray(b?.items) ? b.items.filter((x) => x.active) : []);
    } catch {
      setBranches([]);
    }
  }

  useEffect(() => {
    const initialTimer = setTimeout(() => { void load(branchId); }, 0);
    return () => clearTimeout(initialTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  function changeBranch(value) {
    setBranchId(value);
    void load(value);
  }

  async function createOrdersFromReorderPlan() {
    const plan = safeArray(data?.reorder_plan).filter((item) => (item.suggested_reorder_qty || 0) > 0);
    if (!plan.length) return;
    setCreatingPo(true);
    try {
      const groups = new Map();
      for (const item of plan) {
        const key = item.preferred_supplier_id || "none";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
      }
      let created = 0;
      for (const [supplierId, items] of groups) {
        const result = await createPurchaseOrder({
          supplier_id: supplierId === "none" ? null : Number(supplierId),
          note: language === "fa" ? "سفارش خودکار از پیشنهاد هوش موجودی" : language === "ar" ? "أُنشئ تلقائيًا من اقتراح المخزون الذكي" : language === "tr" ? "Akıllı stok önerisinden otomatik oluşturuldu" : "Auto-created from SmartInventory suggestion",
          items: items.map((it) => ({ product_id: it.id, quantity: it.suggested_reorder_qty, unit_price: it.buy_price || 0 })),
        });
        if (result?.status !== "error") created += 1;
      }
      toast.success(language === "fa" ? `${n(created)} سفارش خرید ساخته شد.` : language === "ar" ? `تم إنشاء ${n(created)} أمر شراء.` : language === "tr" ? `${n(created)} satın alma siparişi oluşturuldu.` : `${created} purchase order(s) created.`);
      navigate("/purchase-orders");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreatingPo(false);
    }
  }

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

        <div className="flex items-center gap-3 flex-wrap">
          <Select
            value={branchId}
            onChange={(value) => changeBranch(value)}
            options={[
              { value: "", label: language === "fa" ? "کل شرکت (همه شعب)" : language === "ar" ? "الشركة بأكملها (كل الفروع)" : language === "tr" ? "Tüm şirket (tüm şubeler)" : "Whole company (all branches)" },
              ...branches.map((b) => ({ value: b.id, label: pd(b.name) })),
            ]}
          />
          <button
            type="button"
            onClick={() => load(branchId)}
            disabled={loading}
            className="px-5 py-3 rounded-2xl bg-[var(--erp-accent)] text-slate-950 font-black flex items-center gap-2 disabled:opacity-60"
          >
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            {language === "fa" ? "به‌روزرسانی" : language === "ar" ? "تحديث" : language === "tr" ? "Yenile" : "Refresh"}
          </button>
        </div>
      </div>

      {data?.scope?.branch_id && (
        <div className="mb-5 rounded-2xl p-4 bg-[var(--erp-glow)] border border-[var(--erp-border)] text-[var(--erp-accent)] text-sm flex items-center gap-2">
          <Warehouse size={16} />
          {data.scope.note}
        </div>
      )}

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

      {expiringBatches.length > 0 && (
        <div className="rounded-[2rem] bg-[var(--erp-bg-soft)] border border-amber-400/20 p-5 mb-5">
          <h2 className="text-amber-300 font-black text-xl flex items-center gap-2 mb-4">
            <AlertTriangle />
            {language === "fa" ? "بچ‌های نزدیک به انقضا (۳۰ روز آینده)" : language === "ar" ? "دفعات قريبة من انتهاء الصلاحية (30 يومًا)" : language === "tr" ? "Süresi yakında dolacak partiler (30 gün)" : "Batches expiring soon (next 30 days)"}
          </h2>
          <Table dir={dir} className="min-w-[600px] text-sm">
            <Thead>
              <Th className="w-12">#</Th>
              <Th>{language === "fa" ? "کالا" : language === "ar" ? "المنتج" : language === "tr" ? "Ürün" : "Product"}</Th>
              <Th>{language === "fa" ? "بچ/سریال" : language === "ar" ? "الدفعة/التسلسلي" : language === "tr" ? "Parti/Seri" : "Batch/Serial"}</Th>
              <Th align="end">{language === "fa" ? "باقی‌مانده" : language === "ar" ? "المتبقي" : language === "tr" ? "Kalan" : "Remaining"}</Th>
              <Th>{language === "fa" ? "انقضا" : language === "ar" ? "الصلاحية" : language === "tr" ? "SKT" : "Expiry"}</Th>
            </Thead>
            <Tbody>
              {expiringBatches.map((b, rowIndex) => (
                <Tr key={b.id}>
                  <Td className="text-[var(--erp-muted)] font-bold">{n(rowIndex + 1)}</Td>
                  <Td className="font-black text-[var(--erp-text)]">{pd(b.product_name)}</Td>
                  <Td>{pd(b.batch_number)}</Td>
                  <Td align="end">{n(b.remaining_quantity)}</Td>
                  <Td className={`font-bold ${b.expired ? "text-rose-300" : "text-amber-300"}`}>
                    {b.expiry_date} {b.expired ? `(${language === "fa" ? "منقضی" : language === "ar" ? "منتهي" : language === "tr" ? "Süresi doldu" : "expired"})` : `(${n(b.days_to_expiry)} ${language === "fa" ? "روز" : language === "ar" ? "يوم" : language === "tr" ? "gün" : "days"})`}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-5 mb-5">
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
                onChange={(e) => setQuery(language === "fa" ? toPersianDigits(e.target.value) : e.target.value)}
                placeholder={language === "fa" ? "جستجوی کالا، برند، کد..." : language === "ar" ? "بحث عن منتج أو علامة تجارية أو رمز..." : language === "tr" ? "Ürün, marka, kod ara..." : "Search product, brand, code..."}
                className="w-full bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] rounded-2xl py-3 pr-10 pl-4 outline-none text-[var(--erp-text)]"
              />
            </div>
          </div>

          {tab === "reorder" && safeArray(data?.reorder_plan).some((item) => (item.suggested_reorder_qty || 0) > 0) && (
            <div className="mb-4">
              <button
                onClick={createOrdersFromReorderPlan}
                disabled={creatingPo}
                className="px-4 py-3 rounded-2xl bg-[var(--erp-accent)] text-slate-950 font-black inline-flex items-center gap-2 disabled:opacity-60"
              >
                <ShoppingCart size={18} />
                {language === "fa" ? "ساخت سفارش خرید از همه پیشنهادها" : language === "ar" ? "إنشاء أوامر شراء من كل الاقتراحات" : language === "tr" ? "Tüm önerilerden satın alma siparişi oluştur" : "Create purchase orders from all suggestions"}
              </button>
            </div>
          )}

          <div className="flex gap-2 flex-wrap mb-4">
            <TabButton active={tab === "reorder"} onClick={() => setTab("reorder")} label={language === "fa" ? "برنامه سفارش" : language === "ar" ? "إعادة الطلب" : language === "tr" ? "Yeniden Sipariş" : "Reorder"} />
            <TabButton active={tab === "low"} onClick={() => setTab("low")} label={language === "fa" ? "کمبود" : language === "ar" ? "مخزون منخفض" : language === "tr" ? "Düşük Stok" : "Low stock"} />
            <TabButton active={tab === "dead"} onClick={() => setTab("dead")} label={language === "fa" ? "راکد" : language === "ar" ? "مخزون راكد" : language === "tr" ? "Ölü Stok" : "Dead stock"} />
            <TabButton active={tab === "abcA"} onClick={() => setTab("abcA")} label={language === "fa" ? "کلاس A" : language === "ar" ? "فئة A" : language === "tr" ? "ABC A" : "ABC A"} />
            <TabButton active={tab === "all"} onClick={() => setTab("all")} label={language === "fa" ? "همه کالاها" : language === "ar" ? "الكل" : language === "tr" ? "Tümü" : "All"} />
          </div>

          <Table dir={dir} className="min-w-[980px] text-sm">
            <Thead>
              <Th className="w-12">#</Th>
              <Th>{language === "fa" ? "کالا" : language === "ar" ? "المنتج" : language === "tr" ? "Ürün" : "Product"}</Th>
              <Th align="end">{language === "fa" ? "موجودی" : language === "ar" ? "المخزون" : language === "tr" ? "Stok" : "Stock"}</Th>
              <Th align="end">{language === "fa" ? "فروش ۹۰ روز" : language === "ar" ? "مبيعات 90 يومًا" : language === "tr" ? "90 günlük satış" : "90d sales"}</Th>
              <Th align="end">{language === "fa" ? "دوام موجودی" : language === "ar" ? "الأيام المتبقية" : language === "tr" ? "Kalan gün" : "Days left"}</Th>
              <Th align="end">{language === "fa" ? "سفارش پیشنهادی" : language === "ar" ? "إعادة الطلب المقترحة" : language === "tr" ? "Önerilen yeniden sipariş" : "Suggested reorder"}</Th>
              <Th>ABC</Th>
              <Th>{language === "fa" ? "وضعیت" : language === "ar" ? "الحالة" : language === "tr" ? "Durum" : "Status"}</Th>
            </Thead>
            <Tbody>
              {rows.length ? rows.map((item, rowIndex) => (
                <Tr key={item.id} className="hover:bg-[var(--erp-panel-solid)]/50">
                  <Td className="text-[var(--erp-muted)] font-bold">{n(rowIndex + 1)}</Td>
                  <Td>
                    <div className="font-black text-[var(--erp-text)]">{pd(item.name) || "-"}</div>
                    <div className="text-xs text-[var(--erp-muted)] mt-1">{pd(item.brand || item.code || item.barcode) || "-"}</div>
                  </Td>
                  <Td align="end" className="font-bold">
                    {n(item.stock || 0)} {item.unit || ""}
                    {branchId && (
                      <div className="text-xs text-[var(--erp-muted)] font-normal mt-0.5">
                        {language === "fa" ? "کل شرکت" : language === "ar" ? "إجمالي الشركة" : language === "tr" ? "Şirket toplamı" : "Company total"}: {n(item.company_stock || 0)}
                      </div>
                    )}
                  </Td>
                  <Td align="end">{n(item.net_qty_90d || 0)}</Td>
                  <Td align="end">{item.days_left == null ? "-" : `${n(item.days_left)} ${language === "fa" ? "روز" : language === "ar" ? "يومًا" : language === "tr" ? "gün" : "days"}`}</Td>
                  <Td align="end" className="font-black text-amber-300">{n(item.suggested_reorder_qty || 0)}</Td>
                  <Td><span className="px-3 py-1 rounded-full bg-[var(--erp-glow)] text-[var(--erp-accent)] font-black">{item.abc_class || "C"}</span></Td>
                  <Td>
                    <span className={`px-3 py-1 rounded-full border text-xs font-black ${levelClass(item.risk_level)}`}>
                      {levelLabel(item.risk_level, language)}
                    </span>
                  </Td>
                </Tr>
              )) : (
                <EmptyRow colSpan={8}>
                  {loading ? (language === "fa" ? "در حال دریافت..." : language === "ar" ? "جارٍ التحميل..." : language === "tr" ? "Yükleniyor..." : "Loading...") : (language === "fa" ? "داده‌ای برای نمایش وجود ندارد." : language === "ar" ? "لا توجد بيانات لعرضها." : language === "tr" ? "Gösterilecek veri yok." : "No data.")}
                </EmptyRow>
              )}
            </Tbody>
          </Table>
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
                  <div className="font-black text-[var(--erp-text)]">{pd(insight.title)}</div>
                  <div className="text-[var(--erp-muted)] text-sm mt-1">{pd(insight.message)}</div>
                  <div className="text-[var(--erp-accent)] text-xs font-bold mt-2">{pd(insight.action)}</div>
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
