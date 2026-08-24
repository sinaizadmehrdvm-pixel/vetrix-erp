import { useMemo, useState } from "react";
import { Wallet, Search } from "lucide-react";
import { useLanguage } from "../../localization/useLanguage";
import { toEnglishDigits, toPersianDigits } from "../../localization/helpers";
import { useDebounce } from "../../hooks/useDebounce";
import { toNumber } from "../../utils/crmHeuristics";
import { useFieldSales } from "./useFieldSales";
import Card from "../../components/ui/Card";
import MoneyDisplay from "../../components/ui/MoneyDisplay";
import { SkeletonRows } from "../../components/ui/Skeleton";
import Customer360Drawer from "./Customer360Drawer";

// Internal "Collections" view (spec section 6/11): read-only feed of this
// rep's own customers' recent receipts, scoped the same way Orders is.
// Recording a NEW payment still only happens through an active visit's
// collection drawer - this view is for visibility, not data entry, exactly
// like Orders.
export default function FieldSalesCollectionsView() {
  const { language, n, date } = useLanguage();
  const { transactions, customers, customerIds, loadingCustomers } = useFieldSales();
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
    // Digit-normalize the typed query - same normalization boundary as
    // every other Field Sales search box (see FieldSalesCustomerList.jsx).
    const needle = toEnglishDigits(debouncedQuery.trim()).toLocaleLowerCase(language);
    return transactions
      .filter((t) => t.source_type === "receipt" && customerIds.has(t.customer_id))
      .filter((t) => !needle || (nameById.get(t.customer_id) || "").toLocaleLowerCase(language).includes(needle))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 60);
  }, [transactions, customerIds, nameById, debouncedQuery, language]);

  return (
    <Card icon={Wallet} title={tr("دریافت‌های فروش میدانی", "مقبوضات المبيعات الميدانية", "Saha satış tahsilatları", "Field sales collections")} action={<span style={{ fontSize: 12, color: "var(--erp-muted)" }}>{n(rows.length)}</span>} clip={false}>
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
          {tr("دریافتی ثبت نشده است.", "لا توجد مقبوضات.", "Tahsilat yok.", "No collections yet.")}
        </p>
      ) : (
        <div className="grid gap-2">
          {rows.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setC360CustomerId(t.customer_id)}
              className="flex items-center justify-between gap-2 w-full text-start"
              style={{ background: "var(--erp-panel-solid)", border: "1px solid var(--erp-border)", borderRadius: 12, padding: "10px 12px", color: "var(--erp-text)" }}
            >
              <span className="flex items-center gap-2 min-w-0">
                <Wallet size={14} color="var(--erp-success)" className="shrink-0" />
                <span className="min-w-0">
                  <div className="truncate" style={{ fontWeight: 800, fontSize: 13 }}>{nameById.get(t.customer_id) || "-"}</div>
                  <div style={{ fontSize: 11, color: "var(--erp-muted)" }}>{t.created_at ? date(t.created_at) : "-"}{t.method ? ` · ${t.method}` : ""}</div>
                </span>
              </span>
              <MoneyDisplay value={toNumber(t.credit) || toNumber(t.amount)} fontSize={13} tone="var(--erp-success)" />
            </button>
          ))}
        </div>
      )}

      <Customer360Drawer key={c360CustomerId || "none"} customerId={c360CustomerId} open={Boolean(c360CustomerId)} onClose={() => setC360CustomerId(null)} />
    </Card>
  );
}
