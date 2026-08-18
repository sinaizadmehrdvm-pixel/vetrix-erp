import { useMemo, useState } from "react";
import {
  RefreshCw, Phone, MapPin, ClipboardCheck, Search, Navigation,
  Users, FileText, Wallet2, Crown, Sparkles, Play,
} from "lucide-react";
import toast from "react-hot-toast";
import { useLanguage } from "../../localization/useLanguage";
import { toPersianDigits, toEnglishDigits } from "../../localization/helpers";
import { useDebounce } from "../../hooks/useDebounce";
import { useFieldSales } from "./useFieldSales";
import { daysSince, overdueTier } from "./fieldSalesHelpers";
import { crmScore, crmRank, crmStatus, toNumber } from "../../utils/crmHeuristics";
import { haversineMeters, formatDistance, getCurrentPosition } from "./geo";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import MoneyDisplay from "../../components/ui/MoneyDisplay";
import { SkeletonRows } from "../../components/ui/Skeleton";
import Tooltip from "../../components/ui/Tooltip";
import Select from "../../components/ui/Select";
import Customer360Drawer from "./Customer360Drawer";

// Operational customer list (spec section 4/14): the same 9 segments as
// Phase 1, but "Start visit" now calls the shared context's startVisit()
// directly instead of navigating to /visitor/visits - the persistent
// ActiveVisitWorkspace mounted above this list is what lights up. Customer
// 360 opens as a standalone drawer here (no active visit required to peek
// at a profile); Order/Payment are intentionally NOT quick-launchable from
// this list anymore - both only make sense inside an active visit now.
export default function FieldSalesCustomerList({ id }) {
  const { language, n } = useLanguage();
  const {
    customers, loadingCustomers, coverage, followupCustomerIds,
    lastOrderByCustomer, openOrdersByCustomer, overdueBalanceCustomerIds,
    startVisit, startingVisit, refreshAll,
  } = useFieldSales();
  const fa = language === "fa";
  const tr = (faText, arText, trText, enText) =>
    fa ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 250);
  const [segment, setSegment] = useState("all");
  const [position, setPosition] = useState(null);
  const [sortByDistance, setSortByDistance] = useState(false);
  const [locating, setLocating] = useState(false);
  const [c360CustomerId, setC360CustomerId] = useState(null);

  async function locateNearest() {
    setLocating(true);
    try {
      const pos = await getCurrentPosition();
      if (!pos) {
        toast.error(tr("دریافت موقعیت ممکن نشد", "تعذر تحديد الموقع", "Konum alınamadı", "Could not get your location"));
        return;
      }
      setPosition(pos);
      setSortByDistance(true);
    } finally {
      setLocating(false);
    }
  }

  const segments = [
    { id: "all", label: tr("همه", "الكل", "Tümü", "All") },
    { id: "today", label: tr("امروز", "اليوم", "Bugün", "Today") },
    { id: "needs_visit", label: tr("نیاز به ویزیت", "بحاجة لزيارة", "Ziyaret gerekli", "Needs Visit") },
    { id: "needs_followup", label: tr("نیاز به پیگیری", "بحاجة لمتابعة", "Takip gerekli", "Needs Follow-up") },
    { id: "no_recent_purchase", label: tr("بدون خرید اخیر", "بدون شراء حديث", "Yakın zamanda alışveriş yok", "No Recent Purchase") },
    { id: "debtor", label: tr("بدهکار", "مدين", "Borçlu", "Debtor") },
    { id: "overdue", label: tr("سررسیدگذشته", "متأخر السداد", "Vadesi geçmiş", "Overdue") },
    { id: "vip", label: tr("VIP", "VIP", "VIP", "VIP") },
    { id: "new", label: tr("مشتری جدید", "عميل جديد", "Yeni müşteri", "New Customer") },
  ];

  const filtered = useMemo(() => {
    // Only the typed query is digit-normalized (Persian/Arabic-Indic ->
    // Latin) before matching - phone/national_id/economic_code are already
    // stored as Latin-digit data, so canonicalizing the query is what lets
    // a Persian-digit search actually match them, without touching any
    // stored value.
    const needle = toEnglishDigits(debouncedQuery.trim()).toLocaleLowerCase(language);
    let list = customers.filter((customer) => {
      if (!needle) return true;
      const haystack = `${customer.name || ""} ${customer.phone || ""} ${customer.mobile || ""} ${customer.national_id || ""} ${customer.economic_code || ""} ${customer.address || ""} ${customer.city || ""}`.toLocaleLowerCase(language);
      return haystack.includes(needle);
    });

    if (segment === "today") {
      list = list.filter((c) => coverage[c.id]?.overdue);
    } else if (segment === "needs_visit") {
      list = list.filter((c) => coverage[c.id]?.days_since_last_visit === null);
    } else if (segment === "needs_followup") {
      list = list.filter((c) => followupCustomerIds.has(c.id));
    } else if (segment === "no_recent_purchase") {
      list = list.filter((c) => {
        const last = lastOrderByCustomer.get(c.id);
        return !last || daysSince(last.created_at) > 30;
      });
    } else if (segment === "debtor") {
      list = list.filter((c) => toNumber(c.balance) > 0);
    } else if (segment === "overdue") {
      list = list.filter((c) => overdueBalanceCustomerIds.has(c.id));
    } else if (segment === "vip") {
      list = list.filter((c) => c.customer_type === "vip" || c.party_type === "vip");
    } else if (segment === "new") {
      list = list.filter((c) => c.created_at && daysSince(c.created_at) <= 30);
    }

    if (sortByDistance && position) {
      list = list
        .map((c) => ({ ...c, __distance: haversineMeters(position.latitude, position.longitude, c.latitude, c.longitude) }))
        .sort((a, b) => {
          if (a.__distance === null && b.__distance === null) return 0;
          if (a.__distance === null) return 1;
          if (b.__distance === null) return -1;
          return a.__distance - b.__distance;
        });
    }

    return list;
  }, [customers, debouncedQuery, language, segment, coverage, followupCustomerIds, lastOrderByCustomer, overdueBalanceCustomerIds, sortByDistance, position]);

  return (
    <Card id={id} icon={Users} title={tr("مشتریان من", "عملائي", "Müşterilerim", "My Customers")} action={<span style={{ fontSize: 12, color: "var(--erp-muted)" }}>{n(filtered.length)}</span>} clip={false}>
      <div className="flex gap-2 flex-wrap mb-2.5">
        <label className="vitalix-input-group flex items-center gap-2 flex-1 min-w-0" style={{ padding: "0 12px" }}>
          <Search size={16} color="var(--erp-muted)" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tr("جستجوی نام، تلفن، کد یا آدرس...", "بحث بالاسم أو الهاتف أو الرمز أو العنوان...", "Ad, telefon, kod veya adres ara...", "Search name, phone, code, or address...")}
            className="min-w-0 flex-1"
            style={{ color: "var(--erp-text)", padding: "10px 0" }}
          />
        </label>
        <Select value={segment} onChange={setSegment} className="shrink-0 w-[190px]" options={segments.map((s) => ({ value: s.id, label: s.label }))} />
        <Tooltip label={tr("نزدیک‌ترین", "الأقرب", "En yakın", "Nearest")}>
          <Button
            variant={sortByDistance ? "accent" : "secondary"}
            size="sm"
            onClick={() => (sortByDistance ? setSortByDistance(false) : locateNearest())}
            loading={locating}
            aria-pressed={sortByDistance}
            aria-label={tr("مرتب‌سازی بر اساس نزدیک‌ترین", "الترتيب حسب الأقرب", "En yakına göre sırala", "Sort by nearest")}
          >
            <Navigation size={16} />
          </Button>
        </Tooltip>
        <Tooltip label={tr("به‌روزرسانی", "تحديث", "Yenile", "Refresh")}>
          <Button variant="secondary" size="sm" onClick={() => refreshAll()} disabled={loadingCustomers} aria-label={tr("به‌روزرسانی", "تحديث", "Yenile", "Refresh")}>
            <RefreshCw size={16} className={loadingCustomers ? "animate-spin" : ""} />
          </Button>
        </Tooltip>
      </div>

      {loadingCustomers ? (
        <SkeletonRows rows={6} height={54} gap={6} />
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", color: "var(--erp-muted)", padding: "40px 0" }}>
          {customers.length === 0
            ? tr("مشتری‌ای برای شما تعریف نشده است.", "لا يوجد عملاء مخصصون لك.", "Size atanmış müşteri yok.", "No customers assigned to you.")
            : tr("موردی با این فیلتر یافت نشد.", "لا توجد نتائج لهذا الفلتر.", "Bu filtre için sonuç yok.", "No results for this filter.")}
        </div>
      ) : (
        <div className="grid gap-1.5">
          {filtered.map((customer) => {
            const cov = coverage[customer.id];
            const tier = overdueTier(cov);
            const lastOrder = lastOrderByCustomer.get(customer.id);
            const openOrders = openOrdersByCustomer.get(customer.id) || 0;
            const balance = toNumber(customer.balance);
            const status = crmStatus(customer, language);
            const rank = crmRank(crmScore(customer));
            const needsFollowup = followupCustomerIds.has(customer.id);
            return (
              <article key={customer.id} style={{ background: "var(--erp-panel-solid)", border: tier === "high" ? "1px solid var(--erp-danger)" : "1px solid var(--erp-border)", borderRadius: 12, padding: "9px 12px" }}>
                {/* Line 1: identity + badges + primary action, dense single row */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="truncate" style={{ fontWeight: 900, fontSize: 14, minWidth: 0, flex: "0 1 auto" }}>{customer.name}</span>
                  {(customer.customer_type === "vip" || customer.party_type === "vip") && <Crown size={13} color="var(--erp-accent-2)" className="shrink-0" />}
                  <Badge tone={rank.tone}>{rank.key}</Badge>
                  <Badge tone={status.tone}>{status.label}</Badge>
                  {needsFollowup && <Badge tone="warning" icon={Sparkles}>{tr("پیگیری", "متابعة", "Takip", "Follow-up")}</Badge>}
                  <span style={{ flex: 1 }} />
                  {balance !== 0 && (
                    <span className="flex items-center gap-1 shrink-0" style={{ fontSize: 12 }}>
                      <span style={{ color: "var(--erp-muted)" }}>{tr("مانده", "الرصيد", "Bakiye", "Bal.")}:</span>
                      <MoneyDisplay value={Math.abs(balance)} fontSize={13} tone={balance > 0 ? "var(--erp-danger)" : "var(--erp-success)"} />
                    </span>
                  )}
                  <Button size="sm" onClick={() => startVisit(customer.id)} loading={startingVisit}>
                    <Play size={13} /> {tr("شروع", "بدء", "Başlat", "Start")}
                  </Button>
                  <Tooltip label={tr("پروفایل ۳۶۰", "ملف 360", "360 profili", "Customer 360")}>
                    <Button size="sm" variant="ghost" onClick={() => setC360CustomerId(customer.id)} aria-label={tr("پروفایل ۳۶۰", "ملف 360", "360 profili", "Customer 360")}>
                      <Users size={14} />
                    </Button>
                  </Tooltip>
                  {(customer.phone || customer.mobile) && (
                    <Tooltip label={tr("تماس", "اتصال", "Ara", "Call")}>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { window.location.href = `tel:${customer.phone || customer.mobile}`; }}
                        aria-label={tr("تماس", "اتصال", "Ara", "Call")}
                      >
                        <Phone size={14} />
                      </Button>
                    </Tooltip>
                  )}
                </div>

                {/* Line 2: contact + cadence + last order + open invoices + distance - one compact muted row */}
                <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 4, fontSize: 11, color: "var(--erp-muted)" }}>
                  {(customer.phone || customer.mobile) && (
                    <span className="flex items-center gap-1"><Phone size={11} /> {fa ? toPersianDigits(customer.phone || customer.mobile) : (customer.phone || customer.mobile)}</span>
                  )}
                  {customer.address && (
                    <span className="flex items-center gap-1 truncate" style={{ maxWidth: 220 }}><MapPin size={11} className="shrink-0" /> <span className="truncate">{customer.address}</span></span>
                  )}
                  <span className="flex items-center gap-1"><ClipboardCheck size={11} />
                    {cov?.days_since_last_visit == null
                      ? tr("تا به حال ویزیت نشده", "لم تتم زيارته بعد", "Henüz ziyaret edilmedi", "Never visited")
                      : tr(`${n(cov.days_since_last_visit)} روز از آخرین ویزیت`, `منذ ${n(cov.days_since_last_visit)} يومًا`, `${n(cov.days_since_last_visit)} gün önce`, `${n(cov.days_since_last_visit)}d since last visit`)}
                  </span>
                  {lastOrder ? (
                    <span className="flex items-center gap-1"><FileText size={11} />
                      {tr("آخرین سفارش", "آخر طلب", "Son sipariş", "Last order")}: <MoneyDisplay value={lastOrder.total_amount} fontSize={11} />
                    </span>
                  ) : null}
                  {openOrders > 0 ? (
                    <span className="flex items-center gap-1"><Wallet2 size={11} />
                      {tr(`${n(openOrders)} فاکتور باز`, `${n(openOrders)} فاتورة مفتوحة`, `${n(openOrders)} açık fatura`, `${n(openOrders)} open invoice(s)`)}
                    </span>
                  ) : null}
                  {customer.__distance != null && (
                    <span className="flex items-center gap-1" style={{ color: "var(--erp-accent)" }}><Navigation size={11} /> {formatDistance(customer.__distance, n)}</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Customer360Drawer key={c360CustomerId || "none"} customerId={c360CustomerId} open={Boolean(c360CustomerId)} onClose={() => setC360CustomerId(null)} />
    </Card>
  );
}
