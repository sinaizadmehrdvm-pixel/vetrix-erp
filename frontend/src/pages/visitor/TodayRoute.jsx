import { Navigation, ChevronLeft, Clock3, Wallet } from "lucide-react";
import { useLanguage } from "../../localization/useLanguage";
import { useFieldSales } from "./useFieldSales";
import { overdueTier, TIER_TONE } from "./fieldSalesHelpers";
import { toNumber } from "../../utils/crmHeuristics";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import MoneyDisplay from "../../components/ui/MoneyDisplay";
import Tooltip from "../../components/ui/Tooltip";
import { SkeletonRows } from "../../components/ui/Skeleton";

function priorityLabel(tier, tr) {
  return tr(
    tier === "high" ? "فوری" : tier === "medium" ? "متوسط" : "عادی",
    tier === "high" ? "عاجل" : tier === "medium" ? "متوسط" : "عادي",
    tier === "high" ? "Acil" : tier === "medium" ? "Orta" : "Normal",
    tier === "high" ? "High" : tier === "medium" ? "Medium" : "Normal"
  );
}

// Today's visit plan: completed customers stay in the list with a "Done"
// badge instead of disappearing, so the route reads as a real plan, not a
// shrinking queue. Starting a visit here calls the shared context's
// startVisit() directly - no navigation, no page change - so the
// persistent ActiveVisitWorkspace mounted above this just lights up.
//
// Each row is two compact lines (name+priority+action, then the actual
// "why due" signal + balance) instead of the earlier bare name-only row,
// so the route reads as real operational data rather than an empty list.
// Both lines use flex-wrap so a long name/address can never push the row
// wider than its card and force page-level horizontal scroll.
export default function TodayRoute({ compact = false }) {
  const { language, n, dir } = useLanguage();
  const { dueTodayCustomers, completedTodayIds, coverage, loadingCustomers, startVisit, startingVisit } = useFieldSales();
  const fa = language === "fa";
  const tr = (faText, arText, trText, enText) =>
    fa ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  return (
    <Card icon={Navigation} title={tr("برنامه مسیر امروز", "مسار اليوم", "Bugünkü rota", "Today's route")} action={<span style={{ fontSize: 12, color: "var(--erp-muted)" }}>{n(dueTodayCustomers.length)}</span>} clip={false} className={compact ? "" : "mb-4"}>
      {loadingCustomers ? (
        <SkeletonRows rows={4} height={52} gap={8} />
      ) : dueTodayCustomers.length === 0 ? (
        <p style={{ color: "var(--erp-muted)", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
          {tr("امروز مشتری سررسیدی برای ویزیت ندارید.", "لا يوجد عملاء مستحقون للزيارة اليوم.", "Bugün ziyaret sırası gelen müşteri yok.", "No customers are due for a visit today.")}
        </p>
      ) : (
        // Capped + internally scrollable (not a growing full-height list):
        // in the desktop 2-column workspace row this column sits beside a
        // deliberately-compact ActiveVisitWorkspace, so an uncapped route
        // list on a busy day (10+ due customers) would otherwise dominate
        // the row and push everything below - including the KPI strip -
        // past the fold. Same contained-scroll pattern already used for
        // Customer360Drawer's own list tabs.
        <div className="grid gap-1.5" style={{ maxHeight: 300, overflowY: "auto", paddingInlineEnd: 2 }}>
          {dueTodayCustomers.slice(0, 20).map((customer, index) => {
            const cov = coverage[customer.id];
            const tier = overdueTier(cov);
            const completed = completedTodayIds.has(customer.id);
            const balance = toNumber(customer.balance);
            const dueReason = cov?.days_since_last_visit == null
              ? tr("هرگز ویزیت نشده", "لم تتم زيارته", "Hiç ziyaret edilmedi", "Never visited")
              : tr(`${n(cov.days_since_last_visit)} روز از آخرین ویزیت`, `منذ ${n(cov.days_since_last_visit)} يوم`, `Son ziyaretten ${n(cov.days_since_last_visit)} gün önce`, `${n(cov.days_since_last_visit)}d since last visit`);
            return (
              <div key={customer.id} style={{ background: "var(--erp-panel-solid)", border: "1px solid var(--erp-border)", borderRadius: 12, padding: "8px 12px" }} dir={dir}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--erp-glow)", color: "var(--erp-accent)", fontSize: 10.5, fontWeight: 900, display: "grid", placeItems: "center", flexShrink: 0 }}>
                    {n(index + 1)}
                  </span>
                  <span className="truncate" style={{ fontWeight: 800, fontSize: 13, minWidth: 0, flex: "1 1 auto" }}>{customer.name}</span>
                  {tier && !completed ? <Badge tone={TIER_TONE[tier]}>{priorityLabel(tier, tr)}</Badge> : null}
                  <span className="shrink-0">
                    {completed ? (
                      <Badge tone="success">{tr("انجام‌شد", "تمت", "Tamamlandı", "Done")}</Badge>
                    ) : (
                      <Tooltip label={tr("شروع ویزیت", "بدء الزيارة", "Ziyareti başlat", "Start visit")}>
                        <Button size="sm" variant="secondary" onClick={() => startVisit(customer.id)} loading={startingVisit} aria-label={tr("شروع ویزیت", "بدء الزيارة", "Ziyareti başlat", "Start visit")}>
                          <ChevronLeft size={13} style={{ transform: dir === "rtl" ? "none" : "rotate(180deg)" }} />
                          {tr("شروع", "بدء", "Başlat", "Start")}
                        </Button>
                      </Tooltip>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 4, fontSize: 11, color: "var(--erp-muted)" }}>
                  <span className="flex items-center gap-1"><Clock3 size={11} /> {dueReason}</span>
                  {balance !== 0 && (
                    <span className="flex items-center gap-1">
                      <Wallet size={11} /> <MoneyDisplay value={Math.abs(balance)} fontSize={11} tone={balance > 0 ? "var(--erp-danger)" : "var(--erp-success)"} />
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
