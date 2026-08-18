import { useState } from "react";
import { Send, Wallet } from "lucide-react";
import toast from "react-hot-toast";
import { useLanguage } from "../../localization/useLanguage";
import { createTransaction, isNetworkError } from "../../services/api";
import { translateApiError } from "../../localization/apiErrors";
import { toEnglishDigits, toPersianDigits } from "../../localization/helpers";
import { useFieldSales } from "./useFieldSales";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import Select from "../../components/ui/Select";
import MoneyDisplay from "../../components/ui/MoneyDisplay";
import JalaliDateField from "../../components/forms/JalaliDateField";

// Modal-based receipt entry embedded inside the active visit - reuses
// Transactions.jsx's exact payload shape/API (createTransaction), not a
// second payment engine. The full Transactions page remains reachable via
// its own "?customer_id=" prefill (added for this module) as an explicit
// "open full page" escape hatch.
export default function FieldCollectionDrawer({ customerId, customerName, balance, open, onClose }) {
  const { language } = useLanguage();
  const { recordVisitPayment } = useFieldSales();
  const fa = language === "fa";
  const tr = (faText, arText, trText, enText) =>
    fa ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  // No reset effect needed: the parent (ActiveVisitWorkspace) remounts
  // this component fresh via a changing `key` every time it opens, so
  // these already start clean each time via their own defaults.
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [txDate, setTxDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const numericAmount = Number(toEnglishDigits(amount).replace(/[^\d.]/g, ""));
    if (!numericAmount || numericAmount <= 0) {
      toast.error(tr("مبلغ معتبر نیست", "المبلغ غير صالح", "Geçersiz tutar", "Invalid amount"));
      return;
    }
    const payload = {
      customer_id: Number(customerId),
      amount: numericAmount,
      transaction_type: "receipt",
      method,
      note: [reference, note].filter(Boolean).join(" - "),
      invoice_id: null,
    };
    setSubmitting(true);
    try {
      const idempotencyKey = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const res = await createTransaction(payload, idempotencyKey);
      if (res?.status === "error") throw new Error(res.message);
      toast.success(tr("دریافت ثبت شد", "تم تسجيل التحصيل", "Tahsilat kaydedildi", "Payment recorded"));
      recordVisitPayment({ ...payload, date: txDate, entry_id: res.entry_id, created_at: new Date().toISOString() });
      onClose();
    } catch (error) {
      if (!isNetworkError(error)) {
        toast.error(translateApiError(error.message, language) || tr("ثبت دریافت ناموفق بود", "فشل تسجيل التحصيل", "Tahsilat kaydedilemedi", "Failed to record payment"));
      } else {
        toast.error(tr("اتصال برقرار نیست", "لا يوجد اتصال", "Bağlantı yok", "No connection"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidthClassName="max-w-md" labelledBy="field-collection-title">
      <div className="p-5">
        <h2 id="field-collection-title" className="flex items-center gap-2" style={{ fontWeight: 900, fontSize: 17 }}>
          <Wallet size={18} color="var(--erp-accent)" /> {tr("دریافت وجه", "استلام دفعة", "Tahsilat al", "Receive payment")}
        </h2>
        <p style={{ color: "var(--erp-muted)", fontSize: 13, marginBottom: 6 }}>{customerName}</p>
        {typeof balance === "number" && balance !== 0 && (
          <div className="flex items-center gap-1.5 mb-4" style={{ fontSize: 13 }}>
            <span style={{ color: "var(--erp-muted)" }}>{tr("مانده فعلی", "الرصيد الحالي", "Mevcut bakiye", "Current balance")}:</span>
            <MoneyDisplay value={Math.abs(balance)} fontSize={13} tone={balance > 0 ? "var(--erp-danger)" : "var(--erp-success)"} />
          </div>
        )}

        <div className="grid gap-3">
          <label style={{ fontSize: 12, color: "var(--erp-muted)" }}>
            {tr("مبلغ", "المبلغ", "Tutar", "Amount")}
            <input
              type="text"
              inputMode="numeric"
              value={fa ? toPersianDigits(amount) : amount}
              onChange={(e) => setAmount(toEnglishDigits(e.target.value).replace(/[^\d.]/g, ""))}
              className="vitalix-control-inset w-full"
              style={{ borderRadius: "var(--erp-radius-sm)", padding: 10, marginTop: 5 }}
              placeholder="0"
            />
          </label>

          <label style={{ fontSize: 12, color: "var(--erp-muted)" }}>
            {tr("روش پرداخت", "طريقة الدفع", "Ödeme yöntemi", "Payment method")}
            <div style={{ marginTop: 5 }}>
              <Select
                value={method}
                onChange={setMethod}
                options={[
                  { value: "cash", label: tr("نقدی", "نقدًا", "Nakit", "Cash") },
                  { value: "card", label: tr("کارت", "بطاقة", "Kart", "Card") },
                  { value: "transfer", label: tr("انتقال بانکی", "تحويل بنكي", "Havale", "Bank transfer") },
                  { value: "cheque", label: tr("چک", "شيك", "Çek", "Cheque") },
                ]}
              />
            </div>
          </label>

          <label style={{ fontSize: 12, color: "var(--erp-muted)" }}>
            {tr("تاریخ", "التاريخ", "Tarih", "Date")}
            <div style={{ marginTop: 5 }}>
              <JalaliDateField value={txDate} onChange={setTxDate} fa={fa} language={language} className="vitalix-control-inset w-full" style={{ borderRadius: "var(--erp-radius-sm)", padding: 10 }} />
            </div>
          </label>

          <label style={{ fontSize: 12, color: "var(--erp-muted)" }}>
            {tr("مرجع (اختیاری)", "المرجع (اختياري)", "Referans (isteğe bağlı)", "Reference (optional)")}
            <input value={reference} onChange={(e) => setReference(e.target.value)} className="vitalix-control-inset w-full" style={{ borderRadius: "var(--erp-radius-sm)", padding: 10, marginTop: 5 }} />
          </label>

          <label style={{ fontSize: 12, color: "var(--erp-muted)" }}>
            {tr("یادداشت (اختیاری)", "ملاحظة (اختياري)", "Not (isteğe bağlı)", "Note (optional)")}
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="vitalix-control-inset w-full" style={{ borderRadius: "var(--erp-radius-sm)", padding: 10, marginTop: 5, resize: "vertical" }} />
          </label>
        </div>

        <div className="flex gap-2 mt-5">
          <Button variant="ghost" onClick={onClose}>{tr("انصراف", "إلغاء", "İptal", "Cancel")}</Button>
          <Button className="flex-1" onClick={submit} loading={submitting}>
            <Send size={16} /> {tr("ثبت دریافت", "تسجيل التحصيل", "Tahsilatı kaydet", "Record payment")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
