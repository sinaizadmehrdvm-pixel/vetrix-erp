import { Receipt, Percent, Truck, Calculator } from "lucide-react";
import { useLanguage } from "../localization/useLanguage";

export default function InvoiceSummary({
  subtotal = 0,
  discount = 0,
  tax = 0,
  shipping = 0,
  total = 0,
  previousBalance = null,
  projectedBalance = null,
  balanceStatus = "",
}) {
  const { t, money, dir, language } = useLanguage();

  const rows = [
    { label: t("subtotal"), value: money(subtotal), icon: <Calculator size={18} /> },
    { label: t("discount"), value: money(discount), icon: <Percent size={18} /> },
    { label: t("tax"), value: money(tax), icon: <Receipt size={18} /> },
    { label: language === "fa" ? "هزینه حمل" : "Shipping", value: money(shipping), icon: <Truck size={18} /> },
  ];

  if (previousBalance !== null && previousBalance !== undefined) {
    rows.push({
      label: language === "fa" ? "مانده قبلی طرف حساب" : "Previous customer balance",
      value: money(Math.abs(previousBalance)),
      icon: <Receipt size={18} />,
    });
  }

  return (
    <div style={{ background: "rgba(15,23,42,0.72)", border: "1px solid rgba(34,211,238,0.22)", borderRadius: 28, padding: 22, color: "white", direction: dir, boxShadow: "0 18px 50px rgba(0,0,0,0.28)" }}>
      <h2 style={{ color: "#22d3ee", fontSize: 24, fontWeight: 900, marginBottom: 18, textAlign: dir === "rtl" ? "right" : "left" }}>
        {language === "fa" ? "خلاصه مالی فاکتور" : "Invoice Financial Summary"}
      </h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 14 }}>
        {rows.map((row) => (
          <div key={row.label} style={{ background: "rgba(15,23,42,0.72)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: 16 }}>
            <div style={{ color: "#94a3b8", display: "flex", alignItems: "center", gap: 8, marginBottom: 10, justifyContent: dir === "rtl" ? "flex-end" : "flex-start" }}>
              {row.icon}<span>{row.label}</span>
            </div>
            <div style={{ color: "white", fontSize: 20, fontWeight: 900, textAlign: dir === "rtl" ? "right" : "left" }}>{row.value}</div>
          </div>
        ))}

        <div style={{ background: "linear-gradient(135deg, rgba(34,211,238,0.2), rgba(16,185,129,0.18))", border: "1px solid rgba(34,211,238,0.35)", borderRadius: 18, padding: 16 }}>
          <div style={{ color: "#a5f3fc", marginBottom: 10, fontWeight: 800, textAlign: dir === "rtl" ? "right" : "left" }}>{t("grandTotal")}</div>
          <div style={{ color: "#22d3ee", fontSize: 26, fontWeight: 1000, textAlign: dir === "rtl" ? "right" : "left" }}>{money(total)}</div>
        </div>

        {projectedBalance !== null && projectedBalance !== undefined ? (
          <div style={{ background: "rgba(8,47,73,0.5)", border: "1px solid rgba(34,211,238,0.35)", borderRadius: 18, padding: 16 }}>
            <div style={{ color: "#a5f3fc", marginBottom: 10, fontWeight: 800, textAlign: dir === "rtl" ? "right" : "left" }}>
              {language === "fa" ? "مانده بعد از این فاکتور" : "Balance after this invoice"}
            </div>
            <div style={{ color: "#22d3ee", fontSize: 24, fontWeight: 1000, textAlign: dir === "rtl" ? "right" : "left" }}>
              {money(Math.abs(projectedBalance))}
            </div>
            <div style={{ color: "#94a3b8", marginTop: 6, textAlign: dir === "rtl" ? "right" : "left" }}>{balanceStatus}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
