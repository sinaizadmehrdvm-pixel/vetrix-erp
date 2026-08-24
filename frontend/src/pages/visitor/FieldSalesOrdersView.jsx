import { useMemo, useState } from "react";
import { Receipt, Search, ShoppingCart } from "lucide-react";
import { useLanguage } from "../../localization/useLanguage";
import { useDebounce } from "../../hooks/useDebounce";
import { paymentStatusLabel, toEnglishDigits, toPersianDigits } from "../../localization/helpers";
import { useFieldSales } from "./useFieldSales";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import MoneyDisplay from "../../components/ui/MoneyDisplay";
import { SkeletonRows } from "../../components/ui/Skeleton";
import Customer360Drawer from "./Customer360Drawer";

function statusTone(status) {
  if (status === "paid" || status === "final") return "success";
  if (status === "partial") return "warning";
  return "danger";
}

// Internal "Orders" view (spec section 6/11): a read-only feed of this
// rep's own customers' recent orders, scoped via the same customerIds set
// the KPI strip uses - never a navigation to the generic /invoices page.
// Placing a NEW order still only happens through an active visit's order
// drawer (Today/Customers tab -> Start visit -> Add order), consistent
// with the spec's "no order engine outside a visit" intent; a row here
// just opens that customer's 360 profile for context.
export default function FieldSalesOrdersView() {
  const { language, n, date } = useLanguage();
  const { invoices, customers, customerIds, loadingCustomers } = useFieldSales();
  const fa = language === "fa";
  const tr = (faText, arText, trText, enText) =>
    fa ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 250);
  const [c360CustomerId, setC360CustomerId] = useState(null);

  const nameById = useMemo(() => {
    const map = new Map();
    for (const c of customers) map.set(c.id, c.name);
    return map;
  }, [customers]);

  const rows = useMemo(() => {
    // Digit-normalize the typed query so a Persian/Arabic-Indic-digit
    // search still matches (customer names aren't usually digit-heavy,
    // but this keeps the same normalization boundary as every other
    // Field Sales search box, in case a name contains digits).
    const needle = toEnglishDigits(debouncedQuery.trim()).toLocaleLowerCase(language);
    return invoices
      .filter((inv) => customerIds.has(inv.customer_id))
      .filter((inv) => !needle || (nameById.get(inv.customer_id) || "").toLocaleLowerCase(language).includes(needle))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 60);
  }, [invoices, customerIds, nameById, debouncedQuery, language]);

  return (
    <Card icon={Receipt} title={tr("سفارش‌های فروش میدانی", "طلبات المبيعات الميدانية", "Saha satış siparişleri", "Field sales orders")} action={<span style={{ fontSize: 12, color: "var(--erp-muted)" }}>{n(rows.length)}</span>} clip={false}>
      <label className="vitalix-input-group flex items-center gap-2 mb-3" style={{ padding: "0 12px" }}>
        <Search size={16} color="var(--erp-muted)" />
        <input
          value={fa ? toPersianDigits(query) : query}
          onChange={(e) => setQuery(toEnglishDigits(e.target.value))}
          placeholder={tr("جستجوی مشتری...", "ابحث عن عميل...", "Müşteri ara...", "Search customer...")}
          className="flex-1 min-w-0"
          style={{ color: "var(--erp-text)", padding: "10px 0" }}
        />
      </label>

      {loadingCustomers ? (
        <SkeletonRows rows={5} height={56} gap={8} />
      ) : rows.length === 0 ? (
        <p style={{ color: "var(--erp-muted)", fontSize: 13, textAlign: "center", padding: "30px 0" }}>
          {tr("سفارشی ثبت نشده است.", "لا توجد طلبات.", "Sipariş yok.", "No orders yet.")}
        </p>
      ) : (
        <div className="grid gap-2">
          {rows.map((inv) => (
            <button
              key={inv.id}
              type="button"
              onClick={() => setC360CustomerId(inv.customer_id)}
              className="flex items-center justify-between gap-2 w-full text-start"
              style={{ background: "var(--erp-panel-solid)", border: "1px solid var(--erp-border)", borderRadius: 12, padding: "10px 12px", color: "var(--erp-text)" }}
            >
              <span className="flex items-center gap-2 min-w-0">
                <ShoppingCart size={14} color="var(--erp-accent)" className="shrink-0" />
                <span className="min-w-0">
                  <div className="truncate" style={{ fontWeight: 800, fontSize: 13 }}>{nameById.get(inv.customer_id) || "-"}</div>
                  <div style={{ fontSize: 11, color: "var(--erp-muted)" }}>#{n(inv.id)} · {inv.created_at ? date(inv.created_at) : "-"}</div>
                </span>
              </span>
              <span className="flex flex-col items-end gap-1 shrink-0">
                <MoneyDisplay value={inv.total_amount} fontSize={13} />
                <Badge tone={statusTone(inv.payment_status || inv.status)}>{paymentStatusLabel(inv.payment_status || inv.status, language)}</Badge>
              </span>
            </button>
          ))}
        </div>
      )}

      <Customer360Drawer key={c360CustomerId || "none"} customerId={c360CustomerId} open={Boolean(c360CustomerId)} onClose={() => setC360CustomerId(null)} />
    </Card>
  );
}
