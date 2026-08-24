import { useState } from "react";
import { Clock, Play, ShoppingCart, Wallet, Users, StickyNote, Phone, CheckCircle2, MapPinCheck, ClipboardList } from "lucide-react";
import { useLanguage } from "../../localization/useLanguage";
import { useFieldSales } from "./useFieldSales";
import { overdueTier, TIER_TONE, OUTCOMES, formatElapsed } from "./fieldSalesHelpers";
import { crmScore, crmRank, toNumber } from "../../utils/crmHeuristics";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Select from "../../components/ui/Select";
import MoneyDisplay from "../../components/ui/MoneyDisplay";
import JalaliDateField from "../../components/forms/JalaliDateField";
import FieldOrderDrawer from "./FieldOrderDrawer";
import FieldCollectionDrawer from "./FieldCollectionDrawer";
import Customer360Drawer from "./Customer360Drawer";
import VisitCompletionPanel from "./VisitCompletionPanel";

function priorityLabel(tier, tr) {
  return tr(
    tier === "high" ? "فوری" : tier === "medium" ? "متوسط" : "عادی",
    tier === "high" ? "عاجل" : tier === "medium" ? "متوسط" : "عادي",
    tier === "high" ? "Acil" : tier === "medium" ? "Orta" : "Normal",
    tier === "high" ? "High" : tier === "medium" ? "Medium" : "Normal"
  );
}

// The persistent core of the module: mounted once by both VisitorHome.jsx
// and VisitorVisits.jsx, reading everything from FieldSalesContext so
// Order/Payment/Customer360 opening as Modals here never unmounts the
// timer or loses check-in state - they're just more JSX rendered alongside
// this component, not a navigation.
//
// Deliberately compact (final visual pass): identity+timer+balance,
// snapshot, stepper and quick actions are each a single dense row: the
// outcome/note/follow-up form - previously always-expanded and by far the
// tallest part of the card - is now a collapsed-by-default panel toggled
// from the action row, so the default (no drawer open) height stays inside
// the ~300-380px target instead of pushing KPIs/Today's route below the fold.
export default function ActiveVisitWorkspace({ customerPickerOptions, compact = false }) {
  const { language, n, dir } = useLanguage();
  const {
    activeVisit, activeCustomer, elapsed, startingVisit, coverage, overdueBalanceCustomerIds,
    lastOrderByCustomer, openOrdersByCustomer, visitOrders, visitPayments,
    visitDraft, setVisitDraft, startVisit,
  } = useFieldSales();
  const fa = language === "fa";
  const tr = (faText, arText, trText, enText) =>
    fa ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  const [pickCustomerId, setPickCustomerId] = useState("");
  const [orderOpen, setOrderOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [customer360Open, setCustomer360Open] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  if (!activeVisit) {
    return (
      <Card icon={Play} title={tr("شروع ویزیت جدید", "بدء زيارة جديدة", "Yeni ziyaret başlat", "Start a new visit")} clip={false} className={compact ? "" : "mb-4"}>
        <Select
          value={pickCustomerId}
          onChange={setPickCustomerId}
          className="w-full mb-2"
          options={[{ value: "", label: tr("انتخاب مشتری", "اختر عميلًا", "Müşteri seçin", "Select customer") }, ...(customerPickerOptions || [])]}
        />
        <Button className="w-full" onClick={() => startVisit(pickCustomerId)} loading={startingVisit}>
          <Play size={16} /> {tr("ورود / شروع ویزیت", "تسجيل الدخول / بدء الزيارة", "Giriş yap / Ziyareti başlat", "Check in / Start visit")}
        </Button>
        <p style={{ fontSize: 11, color: "var(--erp-muted)", marginTop: 6, textAlign: "center" }}>
          {tr("موقعیت مکانی شما برای ثبت زمان و اعتبارسنجی محل ویزیت ضبط می‌شود.", "سيتم تسجيل موقعك للتحقق من زمن ومكان الزيارة.", "Ziyaret zamanını ve konumunu doğrulamak için konumunuz kaydedilecek.", "Your location is recorded to verify visit time and place.")}
        </p>
      </Card>
    );
  }

  const cov = coverage[activeVisit.customer_id];
  const tier = overdueTier(cov);
  const rank = activeCustomer ? crmRank(crmScore(activeCustomer)) : null;
  const lastOrder = lastOrderByCustomer.get(activeVisit.customer_id);
  const openOrders = openOrdersByCustomer.get(activeVisit.customer_id) || 0;
  const balance = activeCustomer ? toNumber(activeCustomer.balance) : 0;
  const isOverdue = overdueBalanceCustomerIds.has(activeVisit.customer_id);
  const creditAvailable = activeCustomer && toNumber(activeCustomer.credit_limit) > 0
    ? Math.max(0, toNumber(activeCustomer.credit_limit) - balance)
    : null;
  const hasNoteOrFollowUp = Boolean(visitDraft.note || visitDraft.followUpDate);

  // Contextual progress guidance only - not a real backend state machine.
  // "Commercial action" lights up once an order/payment has actually been
  // recorded this visit; "Result"/"Follow-up" once the rep has touched the
  // outcome form.
  const steps = [
    { key: "checkin", label: tr("ورود", "تسجيل الدخول", "Giriş", "Check-in"), done: true },
    { key: "review", label: tr("بررسی", "مراجعة", "İnceleme", "Review"), done: true },
    { key: "action", label: tr("اقدام", "إجراء", "İşlem", "Action"), done: visitOrders.length > 0 || visitPayments.length > 0 },
    { key: "result", label: tr("نتیجه", "النتيجة", "Sonuç", "Outcome"), done: Boolean(visitDraft.outcome) },
    { key: "followup", label: tr("پیگیری", "متابعة", "Takip", "Follow-up"), done: Boolean(visitDraft.followUpDate) },
    { key: "finish", label: tr("پایان", "إنهاء", "Bitiş", "Finish"), done: false },
  ];

  return (
    <Card tone="interactive" clip={false} className={compact ? "" : "mb-4"}>
      {/* Row 1: customer identity + priority/CRM rank + live timer + balance */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2.5">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <span className="truncate" style={{ fontWeight: 900, fontSize: 15 }}>{activeCustomer?.name || tr("مشتری", "العميل", "Müşteri", "Customer")}</span>
          {tier && <Badge tone={TIER_TONE[tier]}>{priorityLabel(tier, tr)}</Badge>}
          {rank && <Badge tone={rank.tone}>{rank.key}</Badge>}
        </div>
        <div className="flex items-center gap-3 flex-wrap shrink-0">
          <span className="flex items-center gap-1.5" style={{ fontWeight: 900, fontSize: 15, color: "var(--erp-accent)", fontVariantNumeric: "tabular-nums" }}>
            <Clock size={14} className="animate-pulse" /> {formatElapsed(elapsed, n)}
          </span>
          {typeof activeCustomer?.balance === "number" && (
            <span className="flex items-center gap-1" style={{ fontSize: 12 }}>
              <span style={{ color: "var(--erp-muted)" }}>{tr("مانده", "الرصيد", "Bakiye", "Bal.")}:</span>
              <MoneyDisplay value={Math.abs(balance)} fontSize={13} tone={balance > 0 ? "var(--erp-danger)" : "var(--erp-success)"} />
            </span>
          )}
        </div>
      </div>

      {/* Row 2: fixed 4-tile snapshot, always populated (no ragged/empty grid) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2.5">
        <SnapshotTile label={tr("آخرین ویزیت", "آخر زيارة", "Son ziyaret", "Last visit")}>
          <span style={{ fontSize: 13, fontWeight: 800 }}>
            {cov?.days_since_last_visit == null ? tr("هرگز", "أبدًا", "Hiç", "Never") : tr(`${n(cov.days_since_last_visit)} روز پیش`, `منذ ${n(cov.days_since_last_visit)} يوم`, `${n(cov.days_since_last_visit)} gün önce`, `${n(cov.days_since_last_visit)}d ago`)}
          </span>
        </SnapshotTile>
        <SnapshotTile label={tr("آخرین سفارش", "آخر طلب", "Son sipariş", "Last order")}>
          {lastOrder ? <MoneyDisplay value={lastOrder.total_amount} fontSize={13} /> : <span style={{ fontSize: 13, fontWeight: 800, color: "var(--erp-muted)" }}>-</span>}
        </SnapshotTile>
        <SnapshotTile label={tr("فاکتور باز", "فواتير مفتوحة", "Açık fatura", "Open invoices")}>
          <span style={{ fontSize: 13, fontWeight: 800 }}>{n(openOrders)}</span>
        </SnapshotTile>
        <SnapshotTile label={tr("اعتبار/سررسید", "الائتمان/المتأخر", "Kredi/Vade", "Credit/Overdue")}>
          {isOverdue ? (
            <Badge tone="danger">{tr("سررسیدگذشته", "متأخر", "Vadesi geçti", "Overdue")}</Badge>
          ) : creditAvailable != null ? (
            <MoneyDisplay value={creditAvailable} fontSize={13} />
          ) : (
            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--erp-muted)" }}>-</span>
          )}
        </SnapshotTile>
      </div>

      {/* Row 3: compact stepper - contextual guidance, not persisted state.
          flex-wrap keeps this from ever forcing page-level horizontal
          scroll; it simply wraps to a second short line on narrow cards. */}
      <div className="flex items-center gap-1 flex-wrap mb-2.5" dir={dir}>
        {steps.map((step, i) => (
          <span key={step.key} className="flex items-center gap-1">
            <span
              className="inline-flex items-center gap-1"
              style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: step.done ? "var(--erp-glow)" : "transparent", color: step.done ? "var(--erp-accent)" : "var(--erp-muted)" }}
            >
              {step.done ? <CheckCircle2 size={10} /> : <span style={{ width: 4, height: 4, borderRadius: "50%", background: "currentColor" }} />}
              {step.label}
            </span>
            {i < steps.length - 1 && <span style={{ color: "var(--erp-border)", fontSize: 11 }}>›</span>}
          </span>
        ))}
      </div>

      {/* Row 4: primary quick actions - all stay inside the module (Modals,
          not navigation) and share one baseline control height. Finish is a
          normal action here, not a giant full-width bar. */}
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <Button size="sm" variant="secondary" onClick={() => setOrderOpen(true)}>
          <ShoppingCart size={14} /> {tr("سفارش", "طلب", "Sipariş", "Order")}
          {visitOrders.length > 0 && <Badge tone="success">{n(visitOrders.length)}</Badge>}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setCollectionOpen(true)}>
          <Wallet size={14} /> {tr("دریافت وجه", "تحصيل", "Tahsilat", "Collection")}
          {visitPayments.length > 0 && <Badge tone="success">{n(visitPayments.length)}</Badge>}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setCustomer360Open(true)}>
          <Users size={14} /> {tr("پروفایل ۳۶۰", "ملف 360", "360 profili", "Customer 360")}
        </Button>
        {(activeCustomer?.phone || activeCustomer?.mobile) && (
          <Button size="sm" variant="ghost" onClick={() => { window.location.href = `tel:${activeCustomer.phone || activeCustomer.mobile}`; }}>
            <Phone size={14} /> {tr("تماس", "اتصال", "Ara", "Call")}
          </Button>
        )}
        <Button size="sm" variant={notesOpen ? "accent" : "ghost"} onClick={() => setNotesOpen((v) => !v)} aria-expanded={notesOpen}>
          <StickyNote size={14} /> {tr("نتیجه/یادداشت", "نتيجة/ملاحظة", "Sonuç/Not", "Outcome/Note")}
          {!notesOpen && hasNoteOrFollowUp && <Badge tone="warning">•</Badge>}
        </Button>
        <Button size="sm" onClick={() => setCompletionOpen(true)}>
          <CheckCircle2 size={14} /> {tr("پایان ویزیت", "إنهاء الزيارة", "Ziyareti bitir", "Finish visit")}
        </Button>
      </div>

      {/* Activity recorded so far this visit - compact, only when non-empty */}
      {(visitOrders.length > 0 || visitPayments.length > 0) && (
        <div className="grid gap-1.5 mt-2.5">
          {visitOrders.map((inv, i) => (
            <div key={`o${i}`} className="flex items-center justify-between" style={{ fontSize: 12, background: "var(--erp-panel-solid)", borderRadius: "var(--erp-radius-sm)", padding: "5px 10px" }}>
              <span className="flex items-center gap-1.5"><ShoppingCart size={12} color="var(--erp-accent)" /> {tr("سفارش", "طلب", "Sipariş", "Order")} #{n(inv.invoice_id)}</span>
              <MoneyDisplay value={inv.total_amount} fontSize={12} />
            </div>
          ))}
          {visitPayments.map((tx, i) => (
            <div key={`p${i}`} className="flex items-center justify-between" style={{ fontSize: 12, background: "var(--erp-panel-solid)", borderRadius: "var(--erp-radius-sm)", padding: "5px 10px" }}>
              <span className="flex items-center gap-1.5"><Wallet size={12} color="var(--erp-success)" /> {tr("دریافت", "تحصيل", "Tahsilat", "Payment")}</span>
              <MoneyDisplay value={tx.amount} fontSize={12} tone="var(--erp-success)" />
            </div>
          ))}
        </div>
      )}

      {/* Outcome/note/follow-up - collapsed by default (spec: "do not show
          a permanently huge textarea"). Still bound to visitDraft/context
          directly, so toggling this open/closed never touches saved state. */}
      {notesOpen && (
        <div className="grid gap-2.5 mt-2.5" style={{ background: "var(--erp-panel-solid)", borderRadius: "var(--erp-radius-sm)", padding: 12 }}>
          <div>
            <label className="flex items-center gap-1.5 mb-1" style={{ fontSize: 12, color: "var(--erp-muted)" }}>
              <ClipboardList size={12} /> {tr("نتیجه ویزیت", "نتيجة الزيارة", "Ziyaret sonucu", "Visit outcome")}
            </label>
            <Select
              value={visitDraft.outcome}
              onChange={(value) => setVisitDraft((d) => ({ ...d, outcome: value }))}
              className="w-full"
              options={OUTCOMES.map((item) => ({ value: item.value, label: item.label[language] || item.label.en }))}
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 mb-1" style={{ fontSize: 12, color: "var(--erp-muted)" }}>
              <StickyNote size={12} /> {tr("یادداشت", "ملاحظة", "Not", "Note")}
            </label>
            <textarea
              value={visitDraft.note}
              onChange={(e) => setVisitDraft((d) => ({ ...d, note: e.target.value }))}
              rows={2}
              placeholder={tr("یادداشت (اختیاری)", "ملاحظة (اختياري)", "Not (isteğe bağlı)", "Note (optional)")}
              className="vitalix-control-inset w-full"
              style={{ borderRadius: "var(--erp-radius-sm)", padding: 10, resize: "vertical" }}
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 mb-1" style={{ fontSize: 12, color: "var(--erp-muted)" }}>
              <MapPinCheck size={12} /> {tr("تاریخ پیگیری بعدی (اختیاری)", "تاريخ المتابعة القادمة (اختياري)", "Sonraki takip tarihi (isteğe bağlı)", "Next follow-up date (optional)")}
            </label>
            <JalaliDateField
              value={visitDraft.followUpDate}
              onChange={(iso) => setVisitDraft((d) => ({ ...d, followUpDate: iso }))}
              fa={fa}
              language={language}
              className="vitalix-control-inset w-full"
              style={{ borderRadius: "var(--erp-radius-sm)", padding: 10 }}
            />
          </div>
        </div>
      )}

      {/* Keyed by client_ref (each startVisit() call mints a fresh one, even
          for a repeat visit to the same customer later the same day) so
          every new visit gets a genuinely fresh drawer instance (empty
          cart/form state), while staying mounted across multiple opens
          within one visit so an in-progress draft isn't lost between them. */}
      <FieldOrderDrawer key={`order-${activeVisit.client_ref}`} customerId={activeVisit.customer_id} customerName={activeCustomer?.name} open={orderOpen} onClose={() => setOrderOpen(false)} />
      <FieldCollectionDrawer key={`collection-${activeVisit.client_ref}`} customerId={activeVisit.customer_id} customerName={activeCustomer?.name} balance={balance} open={collectionOpen} onClose={() => setCollectionOpen(false)} />
      <Customer360Drawer key={`c360-${activeVisit.client_ref}`} customerId={activeVisit.customer_id} open={customer360Open} onClose={() => setCustomer360Open(false)} />
      <VisitCompletionPanel open={completionOpen} onClose={() => setCompletionOpen(false)} />
    </Card>
  );
}

function SnapshotTile({ label, children }) {
  return (
    <div style={{ background: "var(--erp-panel-solid)", borderRadius: "var(--erp-radius-sm)", padding: "7px 10px" }}>
      <div style={{ fontSize: 10.5, color: "var(--erp-muted)" }}>{label}</div>
      {children}
    </div>
  );
}
