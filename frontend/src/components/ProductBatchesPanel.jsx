import { useEffect, useState } from "react";
import { Boxes, Plus, Trash2, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";
import { useLanguage } from "../localization/useLanguage";
import { useStableCallback } from "../hooks/useStableCallback";
import { getProductBatches, createProductBatch, deleteProductBatch } from "../services/api";

/**
 * Serial/batch/expiry tracking for one product. Recording-and-visibility
 * only (see app/product_batches.py docstring) - it does not make sales
 * consume from a specific batch automatically.
 */
export default function ProductBatchesPanel({ productId }) {
  const { language } = useLanguage();
  const fa = language === "fa";
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ batch_number: "", quantity: "1", expiry_date: "", note: "" });

  const label = {
    title: fa ? "سریال / بچ / انقضا" : language === "ar" ? "الرقم التسلسلي / الدفعة / الصلاحية" : language === "tr" ? "Seri / Parti / SKT" : "Serial / Batch / Expiry",
    batchNumber: fa ? "شماره بچ یا سریال" : language === "ar" ? "رقم الدفعة أو التسلسلي" : language === "tr" ? "Parti veya seri no" : "Batch or serial number",
    quantity: fa ? "تعداد" : language === "ar" ? "الكمية" : language === "tr" ? "Miktar" : "Quantity",
    expiry: fa ? "تاریخ انقضا (اختیاری)" : language === "ar" ? "تاريخ الصلاحية (اختياري)" : language === "tr" ? "SKT (opsiyonel)" : "Expiry date (optional)",
    add: fa ? "افزودن" : language === "ar" ? "إضافة" : language === "tr" ? "Ekle" : "Add",
    none: fa ? "بچ یا سریالی ثبت نشده است." : language === "ar" ? "لا توجد دفعات مسجلة." : language === "tr" ? "Kayıtlı parti yok." : "No batches recorded.",
    remaining: fa ? "باقی‌مانده" : language === "ar" ? "المتبقي" : language === "tr" ? "Kalan" : "Remaining",
    expired: fa ? "منقضی‌شده" : language === "ar" ? "منتهي الصلاحية" : language === "tr" ? "Süresi doldu" : "Expired",
    expiringSoon: fa ? "نزدیک انقضا" : language === "ar" ? "قريب من الانتهاء" : language === "tr" ? "Yakında dolacak" : "Expiring soon",
  };

  async function load() {
    if (!productId) return;
    setLoading(true);
    try {
      const rows = await getProductBatches(productId);
      setItems(Array.isArray(rows) ? rows : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }
  const stableLoad = useStableCallback(load);
  useEffect(() => {
    const timer = setTimeout(() => { void stableLoad(); }, 0);
    return () => clearTimeout(timer);
  }, [productId, stableLoad]);

  async function submit(e) {
    e.preventDefault();
    if (!form.batch_number.trim()) return;
    try {
      const result = await createProductBatch(productId, { ...form, quantity: Number(form.quantity) || 1 });
      if (result?.status === "error") throw new Error(result.message);
      setForm({ batch_number: "", quantity: "1", expiry_date: "", note: "" });
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleDelete(id) {
    try {
      await deleteProductBatch(id);
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (!productId) return null;

  return (
    <div className="bg-[var(--erp-panel-solid)] rounded-2xl p-4 border border-[var(--erp-border)]">
      <div className="flex items-center gap-2 text-sm font-bold text-[var(--erp-accent)] mb-3">
        <Boxes size={16} />{label.title}
      </div>

      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-[1fr_100px_150px_auto] gap-2 mb-3">
        <input value={form.batch_number} onChange={(e) => setForm({ ...form, batch_number: e.target.value })} placeholder={label.batchNumber} className="bg-[var(--erp-panel)] border border-[var(--erp-border)] rounded-xl p-2 text-sm outline-none" />
        <input type="number" min="0.01" step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder={label.quantity} className="bg-[var(--erp-panel)] border border-[var(--erp-border)] rounded-xl p-2 text-sm outline-none" />
        <input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} className="bg-[var(--erp-panel)] border border-[var(--erp-border)] rounded-xl p-2 text-sm outline-none" />
        <button type="submit" className="px-3 py-2 rounded-xl bg-[var(--erp-accent)] text-slate-950 font-bold text-sm flex items-center gap-1">
          <Plus size={14} />{label.add}
        </button>
      </form>

      {!loading && items.length === 0 && <div className="text-xs text-[var(--erp-muted)]">{label.none}</div>}

      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-2 text-xs bg-[var(--erp-panel)] rounded-lg px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="font-bold">{item.batch_number}</span>
              <span className="text-[var(--erp-muted)]">{label.remaining}: {item.remaining_quantity}/{item.quantity}</span>
              {item.expiry_date && (
                <span className={item.expired ? "text-rose-300 font-bold" : item.expiring_soon ? "text-amber-300 font-bold" : "text-[var(--erp-muted)]"}>
                  {item.expired && <AlertTriangle size={12} className="inline me-1" />}
                  {item.expiry_date} {item.expired ? `(${label.expired})` : item.expiring_soon ? `(${label.expiringSoon})` : ""}
                </span>
              )}
            </div>
            <button onClick={() => handleDelete(item.id)} className="p-1 rounded text-rose-300 shrink-0">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
