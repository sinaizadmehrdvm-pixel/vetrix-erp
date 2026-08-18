import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, Phone, Mail, MapPin, Award, ClipboardList, FileText, StickyNote } from "lucide-react";
import { useLanguage } from "../../localization/useLanguage";
import { toPersianDigits } from "../../localization/helpers";
import { getCrmCustomer360, getCrmNotes } from "../../services/api";
import { useFieldSales } from "./useFieldSales";
import { OUTCOMES } from "./fieldSalesHelpers";
import { crmRank } from "../../utils/crmHeuristics";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Tabs from "../../components/ui/Tabs";
import MoneyDisplay from "../../components/ui/MoneyDisplay";
import { SkeletonRows } from "../../components/ui/Skeleton";

// Modal-based Customer 360 embedded inside the active visit, reusing the
// existing /api/crm/customers/{id} endpoint (the same richer CRM engine
// Customer360.jsx itself uses) instead of a third customer-detail
// implementation. "Open full page" is the explicit escape hatch section 8
// of the spec asked for.
export default function Customer360Drawer({ customerId, open, onClose }) {
  const { language, n, date } = useLanguage();
  const navigate = useNavigate();
  const { visits } = useFieldSales();
  const fa = language === "fa";
  const tr = (faText, arText, trText, enText) =>
    fa ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  // No reset effect needed: the parent (ActiveVisitWorkspace) remounts
  // this component fresh via a changing `key` every time it opens, so
  // `tab`/`loading` already start clean via their own defaults below.
  const [tab, setTab] = useState("summary");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    Promise.all([
      getCrmCustomer360(customerId).then(setData).catch(() => setData(null)),
      getCrmNotes(customerId).then((res) => setNotes(res?.items || res || [])).catch(() => setNotes([])),
    ]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const customerVisits = useMemo(() => visits.filter((v) => v.customer_id === customerId), [visits, customerId]);

  const tabs = [
    { id: "summary", label: tr("خلاصه", "ملخص", "Özet", "Summary"), icon: FileText },
    { id: "orders", label: tr("سفارش‌ها", "الطلبات", "Siparişler", "Orders"), icon: ClipboardList },
    { id: "financial", label: tr("مالی", "مالي", "Finansal", "Financial"), icon: Award },
    { id: "visits", label: tr("ویزیت‌ها", "الزيارات", "Ziyaretler", "Visits"), icon: ClipboardList },
    { id: "notes", label: tr("یادداشت‌ها", "الملاحظات", "Notlar", "Notes"), icon: StickyNote },
    { id: "crm", label: "CRM", icon: Award },
  ];

  const customer = data?.customer;
  const rank = customer ? crmRank(customer.score) : null;

  return (
    <Modal open={open} onClose={onClose} maxWidthClassName="max-w-2xl" labelledBy="customer360-title">
      <div className="p-5">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <h2 id="customer360-title" className="truncate" style={{ fontWeight: 900, fontSize: 17 }}>{customer?.name || "…"}</h2>
            {customer && (
              <div className="flex items-center gap-2 flex-wrap mt-1">
                {rank && <Badge tone={rank.tone}>{rank.key}</Badge>}
                {customer.phone && <span className="flex items-center gap-1" style={{ fontSize: 12, color: "var(--erp-muted)" }}><Phone size={11} /> {fa ? toPersianDigits(customer.phone) : customer.phone}</span>}
                {customer.email && <span className="flex items-center gap-1" style={{ fontSize: 12, color: "var(--erp-muted)" }}><Mail size={11} /> {customer.email}</span>}
                {customer.address && <span className="flex items-center gap-1 truncate" style={{ fontSize: 12, color: "var(--erp-muted)" }}><MapPin size={11} className="shrink-0" /> {customer.address}</span>}
              </div>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => { onClose(); navigate(`/customers/${customerId}/360`); }}
          >
            <ExternalLink size={14} /> {tr("صفحه کامل", "الصفحة الكاملة", "Tam sayfa", "Full page")}
          </Button>
        </div>

        <Tabs tabs={tabs} activeId={tab} onChange={setTab} className="mb-4" />

        {loading ? (
          <SkeletonRows rows={5} height={20} />
        ) : !data ? (
          <p style={{ color: "var(--erp-muted)", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
            {tr("اطلاعات دریافت نشد.", "تعذر تحميل البيانات.", "Veri yüklenemedi.", "Could not load data.")}
          </p>
        ) : tab === "summary" ? (
          <div className="grid grid-cols-2 gap-2">
            <SummaryTile label={tr("نوع مشتری", "نوع العميل", "Müşteri türü", "Customer type")} value={customer.customer_type} />
            <SummaryTile label={tr("شهر", "المدينة", "Şehir", "City")} value={customer.city || "-"} />
            <SummaryTile label={tr("تاریخ عضویت", "تاريخ الانضمام", "Katılım tarihi", "Joined")} value={customer.created_at ? date(customer.created_at) : "-"} />
            <SummaryTile label={tr("سطح وفاداری", "مستوى الولاء", "Sadakat seviyesi", "Loyalty level")} value={customer.loyalty?.level || "-"} />
          </div>
        ) : tab === "orders" ? (
          <div className="grid gap-1.5" style={{ maxHeight: 280, overflowY: "auto" }}>
            {(data.invoices || []).length === 0 && <EmptyTab text={tr("سفارشی ثبت نشده.", "لا توجد طلبات.", "Sipariş yok.", "No orders.")} />}
            {(data.invoices || []).map((inv) => (
              <div key={inv.id} className="flex items-center justify-between" style={{ background: "var(--erp-panel-solid)", borderRadius: "var(--erp-radius-sm)", padding: "8px 12px", fontSize: 13 }}>
                <span>#{n(inv.id)} · {inv.created_at ? date(inv.created_at) : "-"}</span>
                <MoneyDisplay value={inv.total_amount} fontSize={13} />
              </div>
            ))}
          </div>
        ) : tab === "financial" ? (
          <div className="grid grid-cols-2 gap-2">
            <SummaryTile label={tr("مانده حساب", "الرصيد", "Bakiye", "Balance")} value={<MoneyDisplay value={Math.abs(customer.balance)} fontSize={14} tone={customer.balance > 0 ? "var(--erp-danger)" : "var(--erp-success)"} />} />
            <SummaryTile label={tr("سقف اعتبار", "حد الائتمان", "Kredi limiti", "Credit limit")} value={<MoneyDisplay value={customer.credit_limit} fontSize={14} />} />
            <SummaryTile label={tr("جمع فروش", "إجمالي المبيعات", "Toplam satış", "Total sales")} value={<MoneyDisplay value={customer.total_sales} fontSize={14} />} />
            <SummaryTile label={tr("فاکتور باز", "فواتير مفتوحة", "Açık fatura", "Open invoices")} value={n(customer.open_invoice_count)} />
          </div>
        ) : tab === "visits" ? (
          <div className="grid gap-1.5" style={{ maxHeight: 280, overflowY: "auto" }}>
            {customerVisits.length === 0 && <EmptyTab text={tr("ویزیتی ثبت نشده.", "لا توجد زيارات.", "Ziyaret yok.", "No visits.")} />}
            {customerVisits.map((v) => {
              const outcomeItem = OUTCOMES.find((entry) => entry.value === v.outcome);
              return (
                <div key={v.id} style={{ background: "var(--erp-panel-solid)", borderRadius: "var(--erp-radius-sm)", padding: "8px 12px", fontSize: 13 }}>
                  <div className="flex justify-between">
                    <span>{v.visit_time ? date(v.visit_time) : "-"}</span>
                    <span style={{ color: "var(--erp-accent)", fontSize: 12 }}>{outcomeItem?.label[language] || v.outcome}</span>
                  </div>
                  {v.note && <div style={{ fontSize: 12, color: "var(--erp-muted)", marginTop: 2 }}>{v.note}</div>}
                </div>
              );
            })}
          </div>
        ) : tab === "notes" ? (
          <div className="grid gap-1.5" style={{ maxHeight: 280, overflowY: "auto" }}>
            {notes.length === 0 && <EmptyTab text={tr("یادداشتی ثبت نشده.", "لا توجد ملاحظات.", "Not yok.", "No notes.")} />}
            {notes.map((noteItem) => (
              <div key={noteItem.id} style={{ background: "var(--erp-panel-solid)", borderRadius: "var(--erp-radius-sm)", padding: "8px 12px", fontSize: 13 }}>
                <div style={{ fontSize: 11, color: "var(--erp-muted)" }}>{noteItem.created_at ? date(noteItem.created_at) : ""}</div>
                <div style={{ marginTop: 2 }}>{noteItem.content || noteItem.text || noteItem.body}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <SummaryTile label={tr("امتیاز", "التقييم", "Puan", "Score")} value={n(customer.score)} />
            <SummaryTile label={tr("سطح ریسک", "مستوى الخطر", "Risk seviyesi", "Risk level")} value={customer.risk_level} />
            <SummaryTile label={tr("سطح CRM", "مستوى العلاقة", "CRM seviyesi", "CRM level")} value={customer.crm_level} />
            <SummaryTile label={tr("درصد استفاده از اعتبار", "نسبة استخدام الائتمان", "Kredi kullanım oranı", "Credit usage")} value={`${n(customer.credit_usage)}%`} />
          </div>
        )}
      </div>
    </Modal>
  );
}

function SummaryTile({ label, value }) {
  return (
    <div style={{ background: "var(--erp-panel-solid)", borderRadius: "var(--erp-radius-sm)", padding: "8px 12px" }}>
      <div style={{ fontSize: 11, color: "var(--erp-muted)" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function EmptyTab({ text }) {
  return <p style={{ color: "var(--erp-muted)", fontSize: 13, textAlign: "center", padding: "20px 0" }}>{text}</p>;
}
