import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { BadgeCheck, Building2, CalendarDays, CircleAlert, Receipt, ShieldCheck } from "lucide-react";

import { API_URL } from "../services/api";
import { useLanguage } from "../localization/useLanguage";

const TYPE_LABELS = {
  sale: { fa: "فاکتور فروش", ar: "فاتورة مبيعات", tr: "Satış Faturası", en: "Sales invoice" },
  buy: { fa: "فاکتور خرید", ar: "فاتورة مشتريات", tr: "Alış Faturası", en: "Purchase invoice" },
  proforma: { fa: "پیش‌فاکتور", ar: "فاتورة أولية", tr: "Proforma Fatura", en: "Proforma invoice" },
  return_sale: { fa: "برگشت از فروش", ar: "مرتجع مبيعات", tr: "Satış İadesi", en: "Sales return" },
  return_buy: { fa: "برگشت از خرید", ar: "مرتجع مشتريات", tr: "Alış İadesi", en: "Purchase return" },
};

const STATUS_LABELS = {
  unpaid: { fa: "پرداخت‌نشده", ar: "غير مسددة", tr: "Ödenmedi", en: "Unpaid" },
  partial: { fa: "تسویه جزئی", ar: "مسددة جزئياً", tr: "Kısmi ödendi", en: "Partially paid" },
  paid: { fa: "تسویه‌شده", ar: "مسددة بالكامل", tr: "Tamamen ödendi", en: "Paid" },
  overpaid: { fa: "اضافه‌پرداخت", ar: "دفع زائد", tr: "Fazla ödendi", en: "Overpaid" },
  refunded: { fa: "بازپرداخت‌شده", ar: "مُستردة", tr: "İade edildi", en: "Refunded" },
  cancelled: { fa: "لغوشده", ar: "ملغاة", tr: "İptal edildi", en: "Cancelled" },
};

export default function InvoiceVerifyView() {
  const { id, code } = useParams();
  const { language, dir, money, date } = useLanguage();
  const tr = (fa, ar, trText, en) => (language === "fa" ? fa : language === "ar" ? ar : language === "tr" ? trText : en);

  const [state, setState] = useState({ loading: true, data: null, error: "" });

  useEffect(() => {
    let active = true;
    fetch(`${API_URL}/api/invoices/verify?id=${encodeURIComponent(id)}&code=${encodeURIComponent(code)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("invalid");
        return response.json();
      })
      .then((data) => { if (active) setState({ loading: false, data, error: "" }); })
      .catch(() => { if (active) setState({ loading: false, data: null, error: tr(
        "این کد تأیید معتبر نیست یا فاکتور یافت نشد.",
        "رمز التحقق هذا غير صالح أو لم يتم العثور على الفاتورة.",
        "Bu doğrulama kodu geçersiz veya fatura bulunamadı.",
        "This verification code is invalid or the invoice was not found."
      ) }); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, code]);

  return (
    <div dir={dir} style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "linear-gradient(160deg,#071028,#0b1730)" }}>
      <div style={{ width: "100%", maxWidth: 440, borderRadius: 24, background: "rgba(15,23,42,.85)", border: "1px solid rgba(148,163,184,.2)", padding: 28, color: "#e2e8f0", boxShadow: "0 30px 80px rgba(2,6,23,.5)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <ShieldCheck size={26} color="#22d3ee" />
          <div style={{ fontWeight: 900, fontSize: 18 }}>
            {tr("تأیید اصالت فاکتور", "التحقق من صحة الفاتورة", "Fatura doğrulaması", "Invoice verification")}
          </div>
        </div>

        {state.loading && (
          <div style={{ color: "#94a3b8", textAlign: "center", padding: "30px 0" }}>
            {tr("در حال بررسی...", "جارٍ التحقق...", "Doğrulanıyor...", "Verifying...")}
          </div>
        )}

        {!state.loading && state.error && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "24px 0", color: "#fca5a5" }}>
            <CircleAlert size={40} />
            <div style={{ textAlign: "center", fontWeight: 700 }}>{state.error}</div>
          </div>
        )}

        {!state.loading && state.data && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 14, background: "rgba(34,197,94,.12)", color: "#86efac", fontWeight: 800, marginBottom: 18 }}>
              <BadgeCheck size={18} />
              {tr("این فاکتور معتبر و اصل است.", "هذه الفاتورة صالحة وأصلية.", "Bu fatura geçerli ve orijinaldir.", "This invoice is valid and authentic.")}
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <Row icon={<Building2 size={16} />} label={tr("شرکت صادرکننده", "الشركة المُصدرة", "Düzenleyen şirket", "Issuing company")} value={state.data.company_name || "-"} />
              <Row icon={<Receipt size={16} />} label={tr("شماره فاکتور", "رقم الفاتورة", "Fatura no", "Invoice number")} value={`#${state.data.invoice_id}`} />
              <Row icon={<Receipt size={16} />} label={tr("نوع سند", "نوع المستند", "Belge türü", "Document type")} value={(TYPE_LABELS[state.data.invoice_type]?.[language]) || state.data.invoice_type} />
              <Row icon={<CalendarDays size={16} />} label={tr("تاریخ صدور", "تاريخ الإصدار", "Düzenleme tarihi", "Issue date")} value={date(state.data.created_at)} />
              <Row label={tr("مبلغ کل", "المبلغ الإجمالي", "Toplam tutar", "Total amount")} value={money(state.data.total_amount)} strong />
              <Row label={tr("وضعیت پرداخت", "حالة السداد", "Ödeme durumu", "Payment status")} value={(STATUS_LABELS[state.data.payment_status]?.[language]) || state.data.payment_status} />
              {state.data.void_status === "voided" && (
                <Row label={tr("وضعیت سند", "حالة المستند", "Belge durumu", "Document status")} value={tr("باطل‌شده", "مبطلة", "İptal edildi", "Voided")} />
              )}
            </div>
          </div>
        )}

        <div style={{ marginTop: 22, textAlign: "center", fontSize: 11, color: "#64748b" }}>VITALIX</div>
      </div>
    </div>
  );
}

function Row({ icon, label, value, strong }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, borderBottom: "1px solid rgba(148,163,184,.15)", paddingBottom: 10 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#94a3b8", fontSize: 13 }}>{icon}{label}</span>
      <span style={{ fontWeight: strong ? 900 : 700, color: strong ? "#22d3ee" : "#e2e8f0" }}>{value}</span>
    </div>
  );
}
