import { useMemo, useState } from "react";
import { Clock, Play, Navigation, MapPinOff, FileText, ClipboardCheck, CalendarClock, AlertCircle } from "lucide-react";
import { useLanguage } from "../../localization/useLanguage";
import { useFieldSales } from "./useFieldSales";
import { formatDistance } from "./geo";
import { overdueTier, TIER_TONE, OUTCOMES, formatElapsed } from "./fieldSalesHelpers";
import { crmStatus } from "../../utils/crmHeuristics";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Tabs from "../../components/ui/Tabs";
import { SkeletonRows } from "../../components/ui/Skeleton";
import ActiveVisitWorkspace from "./ActiveVisitWorkspace";

function EmptyState({ text }) {
  return <div style={{ color: "var(--erp-muted)", fontSize: 13, textAlign: "center", padding: "30px 0" }}>{text}</div>;
}

function VisitRow({ visit, language, n, date, time, tr }) {
  const item = OUTCOMES.find((entry) => entry.value === visit.outcome);
  const duration = visit.duration_seconds != null ? formatElapsed(visit.duration_seconds, n) : null;
  return (
    <div style={{ background: "var(--erp-panel-solid)", border: "1px solid var(--erp-border)", borderRadius: 12, padding: 12 }}>
      <div className="flex justify-between" style={{ fontWeight: 800 }}>
        <span>{visit.customer_name}</span>
        <span className="flex items-center gap-1" style={{ color: "var(--erp-muted)", fontSize: 12 }}>
          <Clock size={12} /> {visit.visit_time ? `${date(visit.visit_time)} ${time(visit.visit_time)}` : "-"}
        </span>
      </div>
      <div className="flex items-center gap-2.5 flex-wrap" style={{ marginTop: 4 }}>
        <span style={{ fontSize: 12, color: "var(--erp-accent)" }}>{item?.label[language] || visit.outcome}</span>
        {duration && (
          <span className="flex items-center gap-1" style={{ fontSize: 11, color: "var(--erp-muted)" }}>
            <Clock size={11} /> {duration}
          </span>
        )}
        {visit.within_geofence === 1 || visit.within_geofence === true ? (
          <span className="flex items-center gap-1" style={{ fontSize: 11, color: "var(--erp-success)" }}>
            <Navigation size={11} /> {tr("در محدوده مشتری", "ضمن نطاق العميل", "Müşteri konumunda", "At customer location")}
            {visit.distance_meters != null && ` (${formatDistance(visit.distance_meters, n)})`}
          </span>
        ) : visit.within_geofence === 0 || visit.within_geofence === false ? (
          <span className="flex items-center gap-1" style={{ fontSize: 11, color: "var(--erp-warning)" }}>
            <MapPinOff size={11} /> {formatDistance(visit.distance_meters, n)} {tr("با محل مشتری فاصله دارد", "بعيدًا عن موقع العميل", "müşteri konumundan uzak", "from customer location")}
          </span>
        ) : null}
        {visit.resulting_invoice_id ? (
          <span className="flex items-center gap-1" style={{ fontSize: 11, color: "var(--erp-accent)" }}>
            <FileText size={11} /> #{n(visit.resulting_invoice_id)}
          </span>
        ) : null}
      </div>
      {visit.note && <div style={{ fontSize: 12, color: "var(--erp-muted)", marginTop: 4, whiteSpace: "pre-wrap" }}>{visit.note}</div>}
    </div>
  );
}

// Content of the /visitor/visits route (spec section 10/17): the same
// persistent ActiveVisitWorkspace mounted at the top (so starting/ending a
// visit from here behaves identically to /visitor), plus the visit
// log/suggestions below - all reading from the shared context, no local
// data fetching of its own.
export default function VisitorVisits() {
  const { language, n, date, time } = useLanguage();
  const {
    customers, visits, coverage, loadingCustomers,
    dueTodayCustomers, followupCustomerIds, startVisit, startingVisit,
  } = useFieldSales();
  const fa = language === "fa";
  const tr = (faText, arText, trText, enText) =>
    fa ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  const [tab, setTab] = useState("today");

  const customerPickerOptions = useMemo(
    () => customers.map((customer) => ({ value: customer.id, label: customer.name })),
    [customers]
  );

  const todayVisits = useMemo(() => {
    const today = new Date();
    return visits.filter((v) => {
      const d = new Date(v.visit_time);
      return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
    });
  }, [visits]);

  const followupCustomers = useMemo(
    () => customers.filter((c) => followupCustomerIds.has(c.id)),
    [customers, followupCustomerIds]
  );

  const tabs = [
    { id: "today", label: tr("امروز", "اليوم", "Bugün", "Today"), icon: ClipboardCheck },
    { id: "scheduled", label: tr("پیشنهادی", "مقترح", "Önerilen", "Suggested"), icon: CalendarClock },
    { id: "followup", label: tr("نیازمند پیگیری", "بحاجة لمتابعة", "Takip gereken", "Follow-up"), icon: AlertCircle },
    { id: "completed", label: tr("تاریخچه کامل", "السجل الكامل", "Tüm geçmiş", "Full history"), icon: Clock },
  ];

  return (
    <div>
      <ActiveVisitWorkspace customerPickerOptions={customerPickerOptions} />

      <Tabs tabs={tabs} activeId={tab} onChange={setTab} className="mb-3" />

      {loadingCustomers ? (
        <SkeletonRows rows={4} height={70} gap={10} />
      ) : tab === "today" ? (
        <div className="grid gap-1.5">
          {todayVisits.length === 0 && <EmptyState text={tr("امروز هنوز ویزیتی ثبت نشده است.", "لم يتم تسجيل أي زيارة اليوم بعد.", "Bugün henüz ziyaret kaydedilmedi.", "No visits recorded today yet.")} />}
          {todayVisits.map((visit) => <VisitRow key={visit.id} visit={visit} language={language} n={n} date={date} time={time} tr={tr} />)}
        </div>
      ) : tab === "scheduled" ? (
        <div className="grid gap-1.5">
          {dueTodayCustomers.length === 0 && <EmptyState text={tr("مشتری سررسیدی برای ویزیت باقی نمانده است.", "لا يوجد عملاء مستحقون للزيارة.", "Ziyaret sırası gelen müşteri kalmadı.", "No customers are due for a visit.")} />}
          {dueTodayCustomers.slice(0, 30).map((customer) => {
            const tier = overdueTier(coverage[customer.id]);
            return (
              <div key={customer.id} className="flex items-center gap-3" style={{ background: "var(--erp-panel-solid)", border: "1px solid var(--erp-border)", borderRadius: 12, padding: "10px 12px" }}>
                <div className="min-w-0 flex-1">
                  <div className="truncate" style={{ fontWeight: 800, fontSize: 13 }}>{customer.name}</div>
                  {customer.address && <div className="truncate" style={{ fontSize: 11, color: "var(--erp-muted)" }}>{customer.address}</div>}
                </div>
                {tier ? <Badge tone={TIER_TONE[tier]}>{tr(tier === "high" ? "فوری" : tier === "medium" ? "متوسط" : "عادی", tier === "high" ? "عاجل" : tier === "medium" ? "متوسط" : "عادي", tier === "high" ? "Acil" : tier === "medium" ? "Orta" : "Normal", tier === "high" ? "High" : tier === "medium" ? "Medium" : "Normal")}</Badge> : null}
                <Button size="sm" variant="secondary" onClick={() => startVisit(customer.id)} loading={startingVisit}>
                  <Play size={13} /> {tr("شروع", "بدء", "Başlat", "Start")}
                </Button>
              </div>
            );
          })}
        </div>
      ) : tab === "followup" ? (
        <div className="grid gap-1.5">
          {followupCustomers.length === 0 && <EmptyState text={tr("مشتری‌ای نیازمند پیگیری نیست.", "لا يوجد عملاء بحاجة لمتابعة.", "Takip gereken müşteri yok.", "No customers need follow-up.")} />}
          {followupCustomers.map((customer) => {
            const status = crmStatus(customer, language);
            return (
              <div key={customer.id} className="flex items-center gap-3" style={{ background: "var(--erp-panel-solid)", border: "1px solid var(--erp-warning)", borderRadius: 12, padding: "10px 12px" }}>
                <div className="min-w-0 flex-1">
                  <div className="truncate" style={{ fontWeight: 800, fontSize: 13 }}>{customer.name}</div>
                  <Badge tone={status.tone}>{status.label}</Badge>
                </div>
                <Button size="sm" variant="secondary" onClick={() => startVisit(customer.id)} loading={startingVisit}>
                  <Play size={13} /> {tr("ویزیت", "زيارة", "Ziyaret", "Visit")}
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-1.5">
          {visits.length === 0 && <EmptyState text={tr("هنوز ویزیتی ثبت نشده است.", "لم يتم تسجيل أي زيارة بعد.", "Henüz ziyaret kaydedilmedi.", "No visits recorded yet.")} />}
          {visits.map((visit) => <VisitRow key={visit.id} visit={visit} language={language} n={n} date={date} time={time} tr={tr} />)}
        </div>
      )}
    </div>
  );
}
