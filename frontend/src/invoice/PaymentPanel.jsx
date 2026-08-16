import { Plus, Trash2, Wallet, Landmark } from "lucide-react";
import { useLanguage } from "../localization/useLanguage";
import { toEnglishDigits } from "../localization/helpers";
import JalaliDateField from "../components/forms/JalaliDateField";
import Select from "../components/ui/Select";

// Mirrors backend/app/accounting/integrity.py's ALLOWED_PAYMENT_METHODS.
const METHODS = [
  { value: "cash", label: { fa: "نقدی", ar: "نقدًا", tr: "Nakit", en: "Cash" } },
  { value: "card", label: { fa: "کارت‌خوان", ar: "بطاقة", tr: "Kart", en: "Card / POS" } },
  { value: "bank_transfer", label: { fa: "حواله بانکی", ar: "تحويل بنكي", tr: "Banka havalesi", en: "Bank transfer" } },
  { value: "cheque", label: { fa: "چک", ar: "شيك", tr: "Çek", en: "Cheque" } },
  { value: "wallet", label: { fa: "کیف پول", ar: "محفظة", tr: "Cüzdan", en: "Wallet" } },
  { value: "store_credit", label: { fa: "اعتبار فروشگاهی", ar: "رصيد المتجر", tr: "Mağaza kredisi", en: "Store credit" } },
  { value: "installment", label: { fa: "اقساطی", ar: "أقساط", tr: "Taksit", en: "Installment" } },
  { value: "online_gateway", label: { fa: "درگاه آنلاین", ar: "بوابة دفع إلكترونية", tr: "Online ödeme", en: "Online gateway" } },
  { value: "crypto", label: { fa: "ارز دیجیتال", ar: "عملة رقمية", tr: "Kripto", en: "Crypto" } },
  { value: "custom", label: { fa: "سایر", ar: "أخرى", tr: "Diğer", en: "Custom" } },
];

function normalizeNumber(value) {
  return toEnglishDigits(String(value ?? "")).replace(/[,،]/g, "").replace(/[^\d.-]/g, "");
}

function emptyRow() {
  return {
    method: "cash", amount: "", reference_number: "", cheque_number: "",
    cheque_bank_name: "", cheque_branch_name: "", cheque_due_date: "", note: "",
  };
}

export default function PaymentPanel({ rows, onChange, total }) {
  const { language, dir, money } = useLanguage();
  const tr = (fa, ar, trText, en) => (language === "fa" ? fa : language === "ar" ? ar : language === "tr" ? trText : en);

  const allocated = rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const remaining = Math.max(total - allocated, 0);
  const over = allocated - total;

  function updateRow(index, patch) {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onChange(next);
  }

  function addRow() {
    onChange([...rows, emptyRow()]);
  }

  function removeRow(index) {
    onChange(rows.filter((_, i) => i !== index));
  }

  const inputStyle = {
    background: "var(--erp-bg)", border: "1px solid var(--erp-border)", borderRadius: 10,
    padding: 9, color: "var(--erp-text)", width: "100%", fontSize: 13,
  };

  return (
    <div className="erp-surface" style={{ borderRadius: 24, padding: 20, direction: dir }}>
      <div className="flex items-center gap-2 mb-4" style={{ color: "var(--erp-accent)" }}>
        <Wallet size={20} />
        <h3 style={{ fontSize: 18, fontWeight: 900 }}>
          {tr("دریافت وجه فاکتور (اختیاری)", "استلام مبلغ الفاتورة (اختياري)", "Fatura tahsilatı (opsiyonel)", "Collect payment for this invoice (optional)")}
        </h3>
      </div>
      <p style={{ color: "var(--erp-muted)", fontSize: 13, marginBottom: 14 }}>
        {tr(
          "اگر همین الان وجهی دریافت می‌کنید، ردیف اضافه کنید. در غیر این صورت فاکتور به‌صورت «پرداخت‌نشده» ثبت می‌شود و می‌توانید بعداً از بخش دریافت/پرداخت، تسویه کنید.",
          "إذا كنت تستلم مبلغًا الآن، أضف بندًا. وإلا سيتم تسجيل الفاتورة كـ «غير مسددة» ويمكنك التسوية لاحقًا من قسم الدفعات.",
          "Şimdi bir ödeme alıyorsanız bir satır ekleyin. Aksi halde fatura «ödenmedi» olarak kaydedilir; daha sonra Ödemeler bölümünden tahsil edebilirsiniz.",
          "If you're collecting payment right now, add a row. Otherwise the invoice is saved as unpaid and you can settle it later from Payments."
        )}
      </p>

      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((row, index) => (
          <div key={index} style={{ background: "var(--erp-panel-solid)", border: "1px solid var(--erp-border)", borderRadius: 14, padding: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 8, alignItems: "end" }}>
              <div>
                <label style={{ fontSize: 11, color: "var(--erp-muted)", display: "block", marginBottom: 4 }}>
                  {tr("روش پرداخت", "طريقة الدفع", "Ödeme yöntemi", "Payment method")}
                </label>
                <Select
                  value={row.method}
                  onChange={(value) => updateRow(index, { method: value })}
                  className="w-full"
                  options={METHODS.map((m) => ({ value: m.value, label: m.label[language] || m.label.en }))}
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--erp-muted)", display: "block", marginBottom: 4 }}>
                  {tr("مبلغ", "المبلغ", "Tutar", "Amount")}
                </label>
                <input
                  type="text" inputMode="numeric" value={row.amount}
                  onChange={(e) => updateRow(index, { amount: normalizeNumber(e.target.value) })}
                  style={inputStyle} placeholder="0"
                />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--erp-muted)", display: "block", marginBottom: 4 }}>
                  {tr("شماره پیگیری", "رقم مرجعي", "Referans no", "Reference number")}
                </label>
                <input
                  type="text" value={row.reference_number}
                  onChange={(e) => updateRow(index, { reference_number: e.target.value })}
                  style={inputStyle}
                />
              </div>
              <button
                type="button" onClick={() => removeRow(index)}
                style={{ border: 0, background: "var(--erp-danger-soft)", color: "var(--erp-danger)", borderRadius: 10, padding: 9 }}
                aria-label={tr("حذف ردیف", "حذف البند", "Satırı kaldır", "Remove row")}
              >
                <Trash2 size={16} />
              </button>
            </div>

            {row.method === "cheque" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: "var(--erp-muted)", display: "block", marginBottom: 4 }}>
                    {tr("شماره چک", "رقم الشيك", "Çek numarası", "Cheque number")}
                  </label>
                  <input type="text" value={row.cheque_number} onChange={(e) => updateRow(index, { cheque_number: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "var(--erp-muted)", display: "block", marginBottom: 4 }}>
                    {tr("نام بانک", "اسم البنك", "Banka adı", "Bank name")}
                  </label>
                  <input type="text" value={row.cheque_bank_name} onChange={(e) => updateRow(index, { cheque_bank_name: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: "var(--erp-muted)", display: "block", marginBottom: 4 }}>
                    {tr("تاریخ سررسید", "تاريخ الاستحقاق", "Vade tarihi", "Due date")}
                  </label>
                  <JalaliDateField
                    value={row.cheque_due_date}
                    onChange={(iso) => updateRow(index, { cheque_due_date: iso })}
                    fa={language === "fa"} language={language}
                    className="bg-[var(--erp-bg)] rounded-[10px] p-2 outline-none w-full border border-[var(--erp-border)] text-sm"
                  />
                </div>
                <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 6, color: "var(--erp-warning)", fontSize: 12 }}>
                  <Landmark size={14} />
                  {tr(
                    "این مبلغ تا وصول چک، «معلق» شمرده می‌شود و فاکتور را «پرداخت‌شده» نمی‌کند.",
                    "يُعتبر هذا المبلغ «معلقًا» حتى تحصيل الشيك ولا يجعل الفاتورة «مسددة».",
                    "Bu tutar çek tahsil edilene kadar «beklemede» sayılır ve faturayı «ödendi» yapmaz.",
                    "This amount stays 'pending' until the cheque clears - it won't mark the invoice as paid yet."
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
        <button
          type="button" onClick={addRow}
          style={{ display: "flex", alignItems: "center", gap: 6, border: "1px dashed var(--erp-border)", background: "transparent", color: "var(--erp-accent)", borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 700 }}
        >
          <Plus size={16} /> {tr("افزودن ردیف پرداخت", "إضافة بند دفع", "Ödeme satırı ekle", "Add payment row")}
        </button>

        <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
          <span style={{ color: "var(--erp-muted)" }}>
            {tr("تخصیص‌یافته: ", "المخصص: ", "Tahsis edilen: ", "Allocated: ")}
            <b style={{ color: "var(--erp-text)" }}>{money(allocated)}</b>
          </span>
          {over > 0 ? (
            <span style={{ color: "var(--erp-warning)" }}>
              {tr("مازاد بر فاکتور: ", "زائد عن الفاتورة: ", "Fatura üzerinde: ", "Over invoice: ")}
              <b>{money(over)}</b>
            </span>
          ) : (
            <span style={{ color: "var(--erp-muted)" }}>
              {tr("باقی‌مانده: ", "المتبقي: ", "Kalan: ", "Remaining: ")}
              <b style={{ color: "var(--erp-text)" }}>{money(remaining)}</b>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
