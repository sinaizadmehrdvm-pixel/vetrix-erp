import { useEffect, useState } from "react";
import { X, Wallet, CheckCircle2, Clock, Ban } from "lucide-react";
import toast from "react-hot-toast";
import { useLanguage } from "../localization/useLanguage";
import { getInvoice, voidInvoicePaymentAllocation } from "../services/api";
import { translateApiError } from "../localization/apiErrors";
import Modal from "../components/ui/Modal";

const METHOD_LABELS = {
  cash: { fa: "نقدی", ar: "نقدًا", tr: "Nakit", en: "Cash" },
  card: { fa: "کارت‌خوان", ar: "بطاقة", tr: "Kart", en: "Card / POS" },
  bank_transfer: { fa: "حواله بانکی", ar: "تحويل بنكي", tr: "Banka havalesi", en: "Bank transfer" },
  cheque: { fa: "چک", ar: "شيك", tr: "Çek", en: "Cheque" },
  wallet: { fa: "کیف پول", ar: "محفظة", tr: "Cüzdan", en: "Wallet" },
  store_credit: { fa: "اعتبار فروشگاهی", ar: "رصيد المتجر", tr: "Mağaza kredisi", en: "Store credit" },
  installment: { fa: "اقساطی", ar: "أقساط", tr: "Taksit", en: "Installment" },
  online_gateway: { fa: "درگاه آنلاین", ar: "بوابة دفع إلكترونية", tr: "Online ödeme", en: "Online gateway" },
  crypto: { fa: "ارز دیجیتال", ar: "عملة رقمية", tr: "Kripto", en: "Crypto" },
  custom: { fa: "سایر", ar: "أخرى", tr: "Diğer", en: "Custom" },
};

export default function PaymentAllocationsModal({ invoiceId, onClose, onChanged }) {
  const { language, money, date } = useLanguage();
  const fa = language === "fa";
  const tr = (faText, arText, trText, enText) => (fa ? faText : language === "ar" ? arText : language === "tr" ? trText : enText);

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [voidingId, setVoidingId] = useState(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await getInvoice(invoiceId);
      setDetail(data);
    } catch {
      toast.error(tr("خطا در دریافت اطلاعات پرداخت", "خطأ في تحميل بيانات الدفع", "Ödeme bilgileri yüklenemedi", "Failed to load payment details"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  function startVoid(allocation) {
    setVoidingId(allocation.id);
    setVoidReason("");
  }

  function cancelVoid() {
    setVoidingId(null);
    setVoidReason("");
  }

  async function confirmVoid(allocation) {
    if (!voidReason.trim()) return;
    setVoiding(true);
    try {
      const result = await voidInvoicePaymentAllocation(allocation.id, voidReason.trim());
      if (result?.status === "pending") {
        toast.success(tr(
          "درخواست ابطال ثبت شد و در انتظار تایید یک نفر دیگر است.",
          "تم إرسال طلب الإبطال وهو بانتظار موافقة شخص آخر.",
          "İptal talebi oluşturuldu ve başka birinin onayını bekliyor.",
          "Void request submitted and is awaiting another approver."
        ));
      }
      cancelVoid();
      await load();
      onChanged?.();
    } catch (error) {
      toast.error(translateApiError(error.message, language) || tr("ابطال ناموفق بود", "فشل الإبطال", "İptal başarısız oldu", "Void failed"));
    } finally {
      setVoiding(false);
    }
  }

  const settlement = detail?.settlement;
  const allocations = detail?.payments || [];

  return (
    <Modal open onClose={onClose} maxWidthClassName="max-w-2xl" className="p-6 text-[var(--erp-text)]" labelledBy="payment-allocations-title">
        <div className="flex items-center justify-between mb-5">
          <h3 id="payment-allocations-title" className="font-black flex items-center gap-2 text-lg" style={{ color: "var(--erp-accent)" }}>
            <Wallet size={20} /> {tr("پرداخت‌های فاکتور", "دفعات الفاتورة", "Fatura ödemeleri", "Invoice payments")} #{invoiceId}
          </h3>
          <button onClick={onClose} className="text-[var(--erp-muted)] hover:text-[var(--erp-text)]">
            <X size={22} />
          </button>
        </div>

        {loading && !detail ? (
          <p className="text-[var(--erp-muted)]">{tr("در حال بارگذاری...", "جارٍ التحميل...", "Yükleniyor...", "Loading...")}</p>
        ) : (
          <>
            {settlement && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                {[
                  { label: tr("جمع کل", "الإجمالي", "Toplam", "Total"), value: settlement.total },
                  { label: tr("قطعی دریافت‌شده", "المؤكد", "Kesin tahsil", "Confirmed paid"), value: settlement.confirmed_paid, accent: true },
                  { label: tr("چک معلق", "شيك معلق", "Bekleyen çek", "Pending cheque"), value: settlement.pending_cheque_amount },
                  { label: tr("باقی‌مانده", "المتبقي", "Kalan", "Uncovered"), value: settlement.uncovered_balance },
                ].map((box) => (
                  <div key={box.label} style={{ background: "var(--erp-panel-solid)", border: "1px solid var(--erp-border)", borderRadius: 14, padding: 12 }}>
                    <div style={{ fontSize: 11, color: "var(--erp-muted)", marginBottom: 4 }}>{box.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 900, color: box.accent ? "var(--erp-success)" : "var(--erp-text)" }}>{money(box.value)}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {allocations.length === 0 ? (
                <p className="text-[var(--erp-muted)] text-sm">{tr("هنوز پرداختی ثبت نشده است.", "لم يتم تسجيل أي دفعة بعد.", "Henüz ödeme kaydedilmedi.", "No payments recorded yet.")}</p>
              ) : (
                allocations.map((allocation) => {
                  const isVoid = allocation.status === "void";
                  const methodLabel = METHOD_LABELS[allocation.method];
                  const isVoidingThis = voidingId === allocation.id;
                return (
                    <div
                      key={allocation.id}
                      style={{
                        background: "var(--erp-panel-solid)", border: "1px solid var(--erp-border)",
                        borderRadius: 12, padding: 12, opacity: isVoid ? 0.6 : 1,
                      }}
                    >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        {isVoid ? <Ban size={16} color="var(--erp-danger)" /> : allocation.cheque_id ? <Clock size={16} color="var(--erp-warning)" /> : <CheckCircle2 size={16} color="var(--erp-success)" />}
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 14 }}>
                            {methodLabel ? (methodLabel[language] || methodLabel.en) : allocation.method}
                            {isVoid && <span style={{ marginInlineStart: 8, fontSize: 11, color: "var(--erp-danger)" }}>({tr("باطل‌شده", "مبطل", "İptal edildi", "Voided")})</span>}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--erp-muted)" }}>{date(allocation.created_at)}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div style={{ fontWeight: 900 }}>{money(allocation.amount)}</div>
                        {!isVoid && !isVoidingThis && (
                          <button
                            type="button"
                            onClick={() => startVoid(allocation)}
                            style={{ border: 0, background: "var(--erp-danger-soft)", color: "var(--erp-danger)", borderRadius: 10, padding: "6px 12px", fontSize: 12, fontWeight: 700 }}
                          >
                            {tr("ابطال", "إبطال", "İptal et", "Void")}
                          </button>
                        )}
                      </div>
                    </div>
                    {isVoidingThis && (
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        <input
                          autoFocus
                          value={voidReason}
                          onChange={(event) => setVoidReason(event.target.value)}
                          placeholder={tr("دلیل ابطال این ردیف پرداخت را بنویسید...", "اكتب سبب إبطال بند الدفع هذا...", "Bu ödeme satırını iptal etme nedenini yazın...", "Enter the reason for voiding this payment line...")}
                          className="flex-1 min-w-[200px] erp-focus"
                          style={{ background: "var(--erp-bg)", color: "var(--erp-text)", border: "1px solid var(--erp-border)", borderRadius: 10, padding: "8px 10px", fontSize: 13 }}
                        />
                        <button
                          type="button"
                          disabled={voiding || !voidReason.trim()}
                          onClick={() => confirmVoid(allocation)}
                          style={{ border: 0, background: "var(--erp-danger)", color: "#fff", borderRadius: 10, padding: "8px 12px", fontSize: 12, fontWeight: 700, opacity: voiding || !voidReason.trim() ? 0.6 : 1 }}
                        >
                          {voiding ? "..." : tr("تأیید ابطال", "تأكيد الإبطال", "İptali onayla", "Confirm void")}
                        </button>
                        <button
                          type="button"
                          onClick={cancelVoid}
                          style={{ border: "1px solid var(--erp-border)", background: "transparent", color: "var(--erp-muted)", borderRadius: 10, padding: "8px 12px", fontSize: 12, fontWeight: 700 }}
                        >
                          {tr("انصراف", "إلغاء", "Vazgeç", "Cancel")}
                        </button>
                      </div>
                    )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
    </Modal>
  );
}
