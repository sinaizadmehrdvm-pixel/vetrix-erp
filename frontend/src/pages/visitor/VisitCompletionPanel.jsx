import { CheckCircle2, Clock, ShoppingCart, Wallet } from "lucide-react";
import { useLanguage } from "../../localization/useLanguage";
import { useFieldSales } from "./useFieldSales";
import { formatElapsed } from "./fieldSalesHelpers";
import { toNumber } from "../../utils/crmHeuristics";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import MoneyDisplay from "../../components/ui/MoneyDisplay";

// Read-only confirmation step before actually finishing the visit (spec
// section 10: "Display before finishing: duration, orders created, order
// total, payments collected. Then: Finish Visit") - outcome/note/
// follow-up date are already captured inline in ActiveVisitWorkspace's own
// form before this opens; this only summarizes what really happened
// during the visit (visitOrders/visitPayments, tracked as each drawer
// actually saves - not a timestamp-based guess) and submits.
export default function VisitCompletionPanel({ open, onClose }) {
  const { language, n } = useLanguage();
  const { activeCustomer, elapsed, visitOrders, visitPayments, completeVisit, completingVisit } = useFieldSales();
  const fa = language === "fa";
  const tr = (faText, arText, trText, enText) =>
    fa ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  const orderTotal = visitOrders.reduce((sum, inv) => sum + toNumber(inv.total_amount), 0);
  const paymentTotal = visitPayments.reduce((sum, tx) => sum + toNumber(tx.amount), 0);

  async function finish() {
    const ok = await completeVisit();
    if (ok) onClose();
  }

  return (
    <Modal open={open} onClose={onClose} maxWidthClassName="max-w-md" labelledBy="visit-completion-title">
      <div className="p-5">
        <h2 id="visit-completion-title" style={{ fontWeight: 900, fontSize: 17, marginBottom: 4 }}>
          {tr("پایان ویزیت", "إنهاء الزيارة", "Ziyareti bitir", "Finish visit")}
        </h2>
        <p style={{ color: "var(--erp-muted)", fontSize: 13, marginBottom: 16 }}>{activeCustomer?.name}</p>

        <div className="grid grid-cols-2 gap-2 mb-5">
          <div style={{ background: "var(--erp-panel-solid)", borderRadius: "var(--erp-radius-sm)", padding: 12 }}>
            <div className="flex items-center gap-1.5" style={{ fontSize: 11, color: "var(--erp-muted)" }}><Clock size={12} /> {tr("مدت ویزیت", "مدة الزيارة", "Ziyaret süresi", "Duration")}</div>
            <div style={{ fontSize: 16, fontWeight: 900, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{formatElapsed(elapsed, n)}</div>
          </div>
          <div style={{ background: "var(--erp-panel-solid)", borderRadius: "var(--erp-radius-sm)", padding: 12 }}>
            <div className="flex items-center gap-1.5" style={{ fontSize: 11, color: "var(--erp-muted)" }}><ShoppingCart size={12} /> {tr("سفارش ثبت‌شده", "الطلبات المسجلة", "Oluşturulan sipariş", "Orders created")}</div>
            <div style={{ fontSize: 16, fontWeight: 900, marginTop: 4 }}>{n(visitOrders.length)}</div>
          </div>
          <div style={{ background: "var(--erp-panel-solid)", borderRadius: "var(--erp-radius-sm)", padding: 12 }}>
            <div style={{ fontSize: 11, color: "var(--erp-muted)" }}>{tr("جمع سفارش‌ها", "إجمالي الطلبات", "Sipariş toplamı", "Order total")}</div>
            <MoneyDisplay value={orderTotal} fontSize={16} />
          </div>
          <div style={{ background: "var(--erp-panel-solid)", borderRadius: "var(--erp-radius-sm)", padding: 12 }}>
            <div className="flex items-center gap-1.5" style={{ fontSize: 11, color: "var(--erp-muted)" }}><Wallet size={12} /> {tr("دریافت‌شده", "المحصّل", "Tahsil edilen", "Collected")}</div>
            <MoneyDisplay value={paymentTotal} fontSize={16} tone="var(--erp-success)" />
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>{tr("بازگشت", "رجوع", "Geri", "Back")}</Button>
          <Button className="flex-1" onClick={finish} loading={completingVisit}>
            <CheckCircle2 size={16} /> {tr("پایان ویزیت و ثبت", "إنهاء الزيارة وتسجيلها", "Ziyareti bitir ve kaydet", "Finish & record visit")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
