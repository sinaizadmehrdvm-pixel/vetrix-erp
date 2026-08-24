import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Building2, Warehouse as WarehouseIcon, LayoutGrid, ArrowRightLeft, PackageCheck, Brain, ShieldOff, ArrowUpRight } from "lucide-react";
import { toPersianDigits } from "../localization/helpers";
import toast from "react-hot-toast";

import { useLanguage } from "../localization/useLanguage";
import { useAuth } from "../auth/AuthContext";
import { getBranches, getWarehouses, getProducts } from "../services/api";
import PageHeader from "../components/ui/PageHeader";
import Tabs from "../components/ui/Tabs";
import StatsCard from "../widgets/StatsCard";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Skeleton from "../components/ui/Skeleton";

import Branches from "./Branches";
import Warehouse from "./Warehouse";
import Warehouses from "./Warehouses";

// Same numeric-cleanup used by Warehouse.jsx/Products.jsx for stock math -
// duplicated as a tiny local helper (not worth importing a whole page for
// one function) rather than changing any shared module.
function toNumber(value) {
  return Number(String(value ?? "").replace(/[,،]/g, "").replace(/[^\d.-]/g, "")) || 0;
}

// Real system behavior (unchanged, just made visible in one place instead
// of three): a "warehouse"/"viewer"/"user" role can operate Stock Movement
// (matches the old /warehouse sidebar entry's roles), but Branches/
// Warehouses/Transfers management stays admin+warehouse only (matches the
// old /branches and /warehouses entries). This is the exact same gate
// Sidebar.jsx already applied per-link; it just now lives on the tabs of
// one page instead of on three separate nav entries.
const MANAGE_ROLES = ["admin", "warehouse"];

const PREVIEW_LIMIT = 6;

function OverviewPanel({ tr, n, language, canManage, onOpenTab }) {
  const pd = (value) => (language === "fa" ? toPersianDigits(value) : value);
  const [branches, setBranches] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [branchesData, warehousesData, productsData] = await Promise.all([
          getBranches(), getWarehouses(), getProducts(),
        ]);
        if (cancelled) return;
        setBranches(branchesData.items || []);
        setWarehouses(warehousesData.items || []);
        setProducts(Array.isArray(productsData) ? productsData : []);
      } catch (err) {
        if (!cancelled) toast.error(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const totalStock = useMemo(() => products.reduce((sum, p) => sum + toNumber(p.stock), 0), [products]);
  const lowStockCount = useMemo(() => products.filter((p) => toNumber(p.stock) <= toNumber(p.min_stock || 0)).length, [products]);
  const inactiveBranches = useMemo(() => branches.filter((b) => !b.active).length, [branches]);
  const inactiveWarehouses = useMemo(() => warehouses.filter((w) => !w.active).length, [warehouses]);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} height={124} radius="var(--erp-radius-lg)" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton height={160} radius="var(--erp-radius-lg)" />
          <Skeleton height={160} radius="var(--erp-radius-lg)" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[var(--erp-accent)] font-black text-xl flex items-center gap-2 mb-3">
          <PackageCheck size={19} />
          {tr("شاخص‌های کلی", "المؤشرات الرئيسية", "Genel göstergeler", "Key metrics")}
        </h2>
        {/* Two full rows of three instead of one cramped row of six - at
            six-per-row the longer Persian/Arabic titles ("انبارهای
            غیرفعال"/"المستودعات غير النشطة") didn't fit StatsCard's
            single-line title and were showing an ellipsis mid-word. Each
            card gets roughly double the width here, which is enough for
            every title in every language to render in full. */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatsCard title={tr("تعداد شعبه", "عدد الفروع", "Şube sayısı", "Branches")} value={n(branches.length)} icon={<Building2 />} color="var(--erp-accent)" />
          <StatsCard title={tr("تعداد انبار", "عدد المستودعات", "Depo sayısı", "Warehouses")} value={n(warehouses.length)} icon={<WarehouseIcon />} color="var(--erp-accent-2)" />
          <StatsCard title={tr("موجودی کل", "إجمالي المخزون", "Toplam stok", "Total stock")} value={n(totalStock)} icon={<PackageCheck />} color="var(--erp-success)" />
          <StatsCard title={tr("کالاهای کم‌موجود", "مخزون منخفض", "Az stoklu ürün", "Low stock")} value={n(lowStockCount)} icon={<PackageCheck />} color={lowStockCount > 0 ? "var(--erp-danger)" : "var(--erp-success)"} />
          <StatsCard title={tr("شعبه‌های غیرفعال", "الفروع غير النشطة", "Pasif şubeler", "Inactive branches")} value={n(inactiveBranches)} icon={<ShieldOff />} color="var(--erp-muted)" />
          <StatsCard title={tr("انبارهای غیرفعال", "المستودعات غير النشطة", "Pasif depolar", "Inactive warehouses")} value={n(inactiveWarehouses)} icon={<ShieldOff />} color="var(--erp-muted)" />
        </div>
      </div>

      <div>
        <h2 className="text-[var(--erp-accent-2)] font-black text-xl flex items-center gap-2 mb-3">
          <Building2 size={19} />
          {tr("شعبه‌ها و انبارها", "الفروع والمستودعات", "Şubeler ve depolar", "Branches & warehouses")}
        </h2>
        {/* Real branch/warehouse rows instead of leaving this space empty -
            reuses the exact data this panel already fetched for the stat
            cards above (no extra API calls). A quick, read-only preview,
            not a duplicate of the full CRUD table each tab already owns -
            capped at PREVIEW_LIMIT with a "view all" link once there's
            more data than fits here. Rows are only clickable for roles
            that can actually reach the Branches/Warehouses tabs. */}
        {/* `items-stretch` (grid's own default, stated explicitly here as
            the intentional choice) - not `items-start` - so the two cards
            always match height exactly regardless of how many branches vs
            warehouses exist, rather than each card sizing independently to
            its own row count. PREVIEW_LIMIT already caps each card at 6
            rows, so the worst-case mismatch this can stretch across is
            bounded, not an open-ended gap. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
          <EntityPreviewCard
            icon={Building2}
            title={tr("شعبه‌ها", "الفروع", "Şubeler", "Branches")}
            items={branches}
            total={branches.length}
            getSecondaryText={(b) => (b.city ? pd(b.city) : null)}
            emptyLabel={tr("هنوز شعبه‌ای ثبت نشده است.", "لم يتم تسجيل أي فرع بعد.", "Henüz şube kaydedilmedi.", "No branches registered yet.")}
            viewAllLabel={tr("مشاهده همه", "عرض الكل", "Tümünü gör", "View all")}
            statusLabels={{ active: tr("فعال", "نشط", "Aktif", "Active"), inactive: tr("غیرفعال", "غير نشط", "Pasif", "Inactive") }}
            onOpen={canManage ? () => onOpenTab("branches") : undefined}
            pd={pd}
            n={n}
          />
          <EntityPreviewCard
            icon={WarehouseIcon}
            title={tr("انبارها", "المستودعات", "Depolar", "Warehouses")}
            items={warehouses}
            total={warehouses.length}
            getSecondaryText={(w) => {
              if (!w.branch_id) return null;
              const branch = branches.find((b) => b.id === w.branch_id);
              return branch ? pd(branch.name) : null;
            }}
            emptyLabel={tr("هنوز انباری ثبت نشده است.", "لم يتم تسجيل أي مستودع بعد.", "Henüz depo kaydedilmedi.", "No warehouses registered yet.")}
            viewAllLabel={tr("مشاهده همه", "عرض الكل", "Tümünü gör", "View all")}
            statusLabels={{ active: tr("فعال", "نشط", "Aktif", "Active"), inactive: tr("غیرفعال", "غير نشط", "Pasif", "Inactive") }}
            onOpen={canManage ? () => onOpenTab("warehouses") : undefined}
            pd={pd}
            n={n}
          />
        </div>
      </div>

      <Card icon={Brain} title={tr("تحلیل هوشمند انبار", "ذكاء المخزون", "Stok zekası", "Inventory intelligence")}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-[var(--erp-muted)] m-0">
            {tr(
              "پیش‌بینی تقاضا، پیشنهاد سفارش مجدد و هشدارهای کمبود موجودی در صفحه تحلیل هوشمند انبار در دسترس است.",
              "توقع الطلب، اقتراحات إعادة الطلب، وتنبيهات نقص المخزون متوفرة في صفحة ذكاء المخزون.",
              "Talep tahmini, yeniden sipariş önerileri ve düşük stok uyarıları Akıllı Stok sayfasında.",
              "Demand forecasting, reorder suggestions and low-stock alerts live on the Smart Inventory page."
            )}
          </p>
          <Link
            to="/smart-inventory"
            className="inline-flex items-center gap-1.5 shrink-0 font-bold text-sm"
            style={{ color: "var(--erp-accent)" }}
          >
            {tr("باز کردن", "فتح", "Aç", "Open")}
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </Card>
    </div>
  );
}

// Compact, read-only list used by both the Branches and Warehouses
// preview blocks on the Overview tab - `onOpen` (only passed for roles
// that can reach the full management tab) makes the whole card header
// clickable to jump straight there.
function EntityPreviewCard({ icon: Icon, title, items, total, getSecondaryText, emptyLabel, viewAllLabel, statusLabels, onOpen, pd, n }) {
  const shown = items.slice(0, PREVIEW_LIMIT);
  const hasMore = total > PREVIEW_LIMIT;

  return (
    <Card
      padding={false}
      fillHeight
      icon={Icon}
      title={
        <>
          {title}
          <span className="text-xs text-[var(--erp-muted)] font-normal"> ({n(total)})</span>
        </>
      }
      action={
        onOpen && hasMore ? (
          <button type="button" onClick={onOpen} className="inline-flex items-center gap-1 shrink-0 font-bold text-xs" style={{ color: "var(--erp-accent)" }}>
            {viewAllLabel}
            <ArrowUpRight size={13} />
          </button>
        ) : undefined
      }
    >
      {shown.length === 0 ? (
        // `flex-1` + centered - with the sibling card's `items-stretch`
        // height, an empty list would otherwise leave its message pinned
        // to the top with blank space below; centering it in whatever
        // height this card was stretched to reads as intentional instead.
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-[var(--erp-muted)] text-center" style={{ padding: "20px 16px", margin: 0 }}>{emptyLabel}</p>
        </div>
      ) : (
        // `flex-1` + `justify-center` - same reasoning: when this card's
        // row count is fewer than its stretched sibling's, the rows
        // vertically center in the available height instead of bunching
        // at the top with a gap below, so a real branch/warehouse-count
        // imbalance reads as balanced whitespace, not a leftover void.
        <div style={{ padding: 10 }} className="space-y-1 flex-1 flex flex-col justify-center">
          {shown.map((item) => {
            const secondary = getSecondaryText(item);
            return (
              <div
                key={item.id}
                role={onOpen ? "link" : undefined}
                tabIndex={onOpen ? 0 : undefined}
                onClick={onOpen}
                onKeyDown={onOpen ? (e) => { if (e.key === "Enter") { e.preventDefault(); onOpen(); } } : undefined}
                className={`erp-table-row w-full flex items-center justify-between gap-2 text-start ${onOpen ? "cursor-pointer" : ""}`}
                style={{ borderRadius: "var(--erp-radius-sm)", padding: "8px 10px", background: "transparent", border: "none" }}
              >
                <span className="truncate" style={{ fontSize: 13, fontWeight: 700, color: "var(--erp-text)" }}>
                  {pd(item.name)}
                  {secondary && <span className="text-[var(--erp-muted)] font-normal"> · {secondary}</span>}
                </span>
                <Badge tone={item.active ? "success" : "neutral"} className="shrink-0">
                  {item.active ? statusLabels.active : statusLabels.inactive}
                </Badge>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export default function BranchesWarehouses() {
  const { dir, language, n } = useLanguage();
  const { user } = useAuth();
  const role = user?.role || "viewer";
  const canManage = MANAGE_ROLES.includes(role);
  const tr = (fa, ar, trText, en) => (language === "fa" ? fa : language === "ar" ? ar : language === "tr" ? trText : en);

  const [searchParams, setSearchParams] = useSearchParams();

  const tabDefs = useMemo(() => [
    { id: "overview", label: tr("نمای کلی", "نظرة عامة", "Genel bakış", "Overview"), icon: LayoutGrid, manageOnly: false },
    { id: "branches", label: tr("شعبه‌ها", "الفروع", "Şubeler", "Branches"), icon: Building2, manageOnly: true },
    { id: "warehouses", label: tr("انبارها", "المستودعات", "Depolar", "Warehouses"), icon: WarehouseIcon, manageOnly: true },
    { id: "stock-movement", label: tr("گردش انبار", "حركة المخزون", "Stok hareketi", "Stock movement"), icon: PackageCheck, manageOnly: false },
    { id: "transfers", label: tr("انتقال بین انبارها", "نقل بين المستودعات", "Depolar arası transfer", "Warehouse transfers"), icon: ArrowRightLeft, manageOnly: true },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [language]);

  const availableTabs = useMemo(() => tabDefs.filter((t) => !t.manageOnly || canManage), [tabDefs, canManage]);

  const requestedTab = searchParams.get("tab") || "overview";
  const activeTab = availableTabs.some((t) => t.id === requestedTab) ? requestedTab : (availableTabs[0]?.id || "overview");

  function changeTab(id) {
    const next = new URLSearchParams(searchParams);
    next.set("tab", id);
    setSearchParams(next, { replace: false });
  }

  // Keeps the URL truthful when a redirect (or a hand-typed link) names a
  // tab this role can't reach - `activeTab` already falls back to a safe
  // tab for rendering, but without this the address bar would keep
  // showing the inaccessible `?tab=` while different content renders.
  // `replace: true` so this correction doesn't add a extra back-button
  // stop the user never asked for.
  useEffect(() => {
    if (requestedTab !== activeTab) {
      const next = new URLSearchParams(searchParams);
      next.set("tab", activeTab);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedTab, activeTab]);

  return (
    <div dir={dir} className="p-4 md:p-6 space-y-5 text-[var(--erp-text)]">
      <PageHeader
        icon={Building2}
        title={tr("شعب و انبارها", "الفروع والمستودعات", "Şubeler ve Depolar", "Branches & Warehouses")}
        description={tr(
          "مدیریت یکپارچه شعبه‌ها، انبارها، گردش موجودی و انتقال بین انبارها",
          "إدارة موحّدة للفروع والمستودعات وحركة المخزون والنقل بين المستودعات",
          "Şubeler, depolar, stok hareketi ve depolar arası transferin birleşik yönetimi",
          "One place to manage branches, warehouses, stock movement and inter-warehouse transfers"
        )}
      />

      <Tabs
        tabs={availableTabs.map(({ id, label, icon }) => ({ id, label, icon }))}
        activeId={activeTab}
        onChange={changeTab}
      />

      {activeTab === "overview" && <OverviewPanel tr={tr} n={n} language={language} canManage={canManage} onOpenTab={changeTab} />}
      {activeTab === "branches" && canManage && <Branches />}
      {activeTab === "warehouses" && canManage && <Warehouses section="list" />}
      {activeTab === "stock-movement" && <Warehouse />}
      {activeTab === "transfers" && canManage && <Warehouses section="transfers" />}
    </div>
  );
}
