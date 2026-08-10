import { useEffect, useState } from "react";
import { useStableCallback } from "../hooks/useStableCallback";
import { Factory, Plus, RefreshCw, Send, PackageCheck, XCircle, Trash2, History } from "lucide-react";
import toast from "react-hot-toast";

import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits, cleanNumberInput } from "../localization/helpers";
import { getCustomers, getProducts, getPurchaseOrders, createPurchaseOrder, dispatchPurchaseOrder, getPurchaseOrderDispatchLog, cancelPurchaseOrder, receivePurchaseOrder } from "../services/api";
import Modal from "../components/ui/Modal";

const inputClass = "bg-[var(--erp-panel-solid)] text-[var(--erp-text)] placeholder-[var(--erp-muted)] border border-[var(--erp-border)] focus:border-cyan-400 rounded-2xl p-3 outline-none transition-all w-full";
const button = "border-0 rounded-2xl px-4 py-3 font-black cursor-pointer inline-flex items-center gap-2";

const DISPATCH_METHODS = ["email", "sms", "whatsapp", "telegram", "manual", "print_pdf", "copy_text"];

const DISPATCH_STATUS_TONE = {
  sent: "bg-emerald-400/10 text-emerald-300",
  delivered: "bg-emerald-400/10 text-emerald-300",
  failed: "bg-rose-400/10 text-rose-300",
  cancelled: "bg-rose-400/10 text-rose-300",
};

function toNumber(value) { return Number(String(value ?? "").replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[,،]/g, "").replace(/[^\d.-]/g, "") || 0); }
function Field({ label, children }) { return <div className="space-y-2"><label className="text-sm font-bold text-[var(--erp-accent)] block">{label}</label>{children}</div>; }

const STATUS_TONE = {
  draft: "bg-[var(--erp-panel-solid)] text-[var(--erp-muted)]",
  sent: "bg-cyan-400/10 text-cyan-300",
  received: "bg-emerald-400/10 text-emerald-300",
  cancelled: "bg-rose-400/10 text-rose-300",
};

export default function PurchaseOrders() {
  const { language, dir, n, money, date } = useLanguage();
  const fa = language === "fa";
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ supplier_id: "", note: "", items: [{ product_id: "", quantity: "", unit_price: "" }] });
  const [dispatchModal, setDispatchModal] = useState(null); // { po }
  const [dispatchForm, setDispatchForm] = useState({ method: "email", destination: "", note: "" });
  const [dispatching, setDispatching] = useState(false);
  const [historyModal, setHistoryModal] = useState(null); // { po, items }
  const [historyLoading, setHistoryLoading] = useState(false);

  const label = {
    title: fa ? "سفارش خرید" : language === "ar" ? "أوامر الشراء" : language === "tr" ? "Satın Alma Siparişleri" : "Purchase Orders",
    subtitle: fa ? "ثبت سفارش خرید نزد تأمین‌کننده و دریافت خودکار موجودی هنگام تحویل" : language === "ar" ? "إنشاء أمر شراء لدى المورد واستلام المخزون تلقائيًا عند التسليم" : language === "tr" ? "Tedarikçiye sipariş oluşturun, teslimatta stok otomatik güncellensin" : "Create a purchase order for a supplier and auto-receive stock on delivery",
    newOrder: fa ? "سفارش جدید" : language === "ar" ? "أمر جديد" : language === "tr" ? "Yeni Sipariş" : "New order",
    supplier: fa ? "تأمین‌کننده" : language === "ar" ? "المورّد" : language === "tr" ? "Tedarikçi" : "Supplier",
    noSupplier: fa ? "بدون تأمین‌کننده مشخص" : language === "ar" ? "بدون مورّد محدد" : language === "tr" ? "Tedarikçi belirtilmedi" : "No supplier specified",
    note: fa ? "توضیحات" : language === "ar" ? "ملاحظات" : language === "tr" ? "Not" : "Note",
    product: fa ? "کالا" : language === "ar" ? "المنتج" : language === "tr" ? "Ürün" : "Product",
    quantity: fa ? "تعداد" : language === "ar" ? "الكمية" : language === "tr" ? "Miktar" : "Quantity",
    unitPrice: fa ? "قیمت خرید واحد" : language === "ar" ? "سعر الشراء للوحدة" : language === "tr" ? "Birim Alış Fiyatı" : "Unit buy price",
    addItem: fa ? "افزودن ردیف" : language === "ar" ? "إضافة سطر" : language === "tr" ? "Satır Ekle" : "Add line",
    removeItem: fa ? "حذف ردیف" : language === "ar" ? "حذف السطر" : language === "tr" ? "Satırı Sil" : "Remove line",
    save: fa ? "ثبت سفارش خرید" : language === "ar" ? "حفظ أمر الشراء" : language === "tr" ? "Siparişi Kaydet" : "Create order",
    refresh: fa ? "به‌روزرسانی" : language === "ar" ? "تحديث" : language === "tr" ? "Yenile" : "Refresh",
    noData: fa ? "سفارش خریدی ثبت نشده است." : language === "ar" ? "لا توجد أوامر شراء بعد." : language === "tr" ? "Henüz satın alma siparişi yok." : "No purchase orders yet.",
    send: fa ? "ارسال به تأمین‌کننده" : language === "ar" ? "إرسال إلى المورّد" : language === "tr" ? "Tedarikçiye Gönder" : "Send to supplier",
    receive: fa ? "ثبت دریافت کالا" : language === "ar" ? "تسجيل الاستلام" : language === "tr" ? "Teslim Alındı İşaretle" : "Mark received",
    cancel: fa ? "لغو" : language === "ar" ? "إلغاء" : language === "tr" ? "İptal" : "Cancel",
    total: fa ? "جمع کل" : language === "ar" ? "الإجمالي" : language === "tr" ? "Toplam" : "Total",
    history: fa ? "تاریخچه ارسال" : language === "ar" ? "سجل الإرسال" : language === "tr" ? "Gönderim geçmişi" : "Dispatch history",
    dispatchTitle: fa ? "ارسال سفارش خرید" : language === "ar" ? "إرسال أمر الشراء" : language === "tr" ? "Siparişi gönder" : "Dispatch purchase order",
    method: fa ? "روش ارسال" : language === "ar" ? "طريقة الإرسال" : language === "tr" ? "Gönderim yöntemi" : "Dispatch method",
    destination: fa ? "مقصد (اختیاری - در صورت خالی بودن از اطلاعات تأمین‌کننده استفاده می‌شود)" : language === "ar" ? "الوجهة (اختياري - إن تُرك فارغًا تُستخدم بيانات المورّد)" : language === "tr" ? "Hedef (boş bırakılırsa tedarikçi bilgisi kullanılır)" : "Destination (optional — falls back to supplier's info)",
    dispatchNote: fa ? "یادداشت (اختیاری)" : language === "ar" ? "ملاحظة (اختياري)" : language === "tr" ? "Not (isteğe bağlı)" : "Note (optional)",
    dispatchSend: fa ? "ارسال" : language === "ar" ? "إرسال" : language === "tr" ? "Gönder" : "Dispatch",
    resend: fa ? "ارسال مجدد" : language === "ar" ? "إعادة الإرسال" : language === "tr" ? "Yeniden gönder" : "Resend",
    noDispatch: fa ? "هنوز ارسالی ثبت نشده است." : language === "ar" ? "لم يتم تسجيل أي إرسال بعد." : language === "tr" ? "Henüz gönderim kaydedilmedi." : "No dispatch recorded yet.",
    methodLabel: {
      email: fa ? "ایمیل" : language === "ar" ? "بريد إلكتروني" : language === "tr" ? "E-posta" : "Email",
      sms: fa ? "پیامک" : language === "ar" ? "رسالة نصية" : language === "tr" ? "SMS" : "SMS",
      whatsapp: "WhatsApp",
      telegram: "Telegram",
      manual: fa ? "تحویل دستی" : language === "ar" ? "تسليم يدوي" : language === "tr" ? "Elden teslim" : "Manual delivery",
      print_pdf: fa ? "چاپ / دانلود PDF" : language === "ar" ? "طباعة / تنزيل PDF" : language === "tr" ? "Yazdır / PDF indir" : "Print / download PDF",
      copy_text: fa ? "کپی متن سفارش" : language === "ar" ? "نسخ نص الطلب" : language === "tr" ? "Sipariş metnini kopyala" : "Copy order text",
    },
    dispatchStatusLabel: {
      sent: fa ? "ارسال شد" : language === "ar" ? "تم الإرسال" : language === "tr" ? "Gönderildi" : "Sent",
      delivered: fa ? "تحویل شد" : language === "ar" ? "تم التسليم" : language === "tr" ? "Teslim edildi" : "Delivered",
      failed: fa ? "ناموفق" : language === "ar" ? "فشل" : language === "tr" ? "Başarısız" : "Failed",
      cancelled: fa ? "لغوشده" : language === "ar" ? "ملغى" : language === "tr" ? "İptal edildi" : "Cancelled",
    },
    status: {
      draft: fa ? "پیش‌نویس" : language === "ar" ? "مسودة" : language === "tr" ? "Taslak" : "Draft",
      sent: fa ? "ارسال‌شده" : language === "ar" ? "مُرسَل" : language === "tr" ? "Gönderildi" : "Sent",
      received: fa ? "دریافت‌شده" : language === "ar" ? "مُستلَم" : language === "tr" ? "Teslim Alındı" : "Received",
      cancelled: fa ? "لغوشده" : language === "ar" ? "ملغى" : language === "tr" ? "İptal Edildi" : "Cancelled",
    },
  };

  async function load() {
    setLoading(true); setError("");
    try {
      const [o, c, p] = await Promise.all([getPurchaseOrders(), getCustomers(), getProducts()]);
      setOrders(Array.isArray(o) ? o : []);
      setCustomers(Array.isArray(c) ? c.filter((x) => x.customer_type === "supplier" || x.customer_type === "both") : []);
      setProducts(Array.isArray(p) ? p : []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  const stableLoad = useStableCallback(load);
  useEffect(() => { const t = setTimeout(() => { void stableLoad(); }, 0); return () => clearTimeout(t); }, [language, stableLoad]);

  function setItem(index, key, value) {
    const next = form.items.slice();
    next[index] = { ...next[index], [key]: value };
    setForm({ ...form, items: next });
  }
  function addItem() { setForm({ ...form, items: [...form.items, { product_id: "", quantity: "", unit_price: "" }] }); }
  function removeItem(index) { setForm({ ...form, items: form.items.filter((_, i) => i !== index) }); }

  async function submit(e) {
    e.preventDefault();
    const items = form.items
      .filter((it) => it.product_id && toNumber(it.quantity) > 0)
      .map((it) => ({ product_id: Number(it.product_id), quantity: toNumber(it.quantity), unit_price: toNumber(it.unit_price) }));
    if (!items.length) { toast.error(fa ? "حداقل یک ردیف با کالا و تعداد لازم است" : "At least one line with product and quantity is required"); return; }
    try {
      const result = await createPurchaseOrder({ supplier_id: form.supplier_id ? Number(form.supplier_id) : null, note: form.note, items });
      if (result?.status === "error") throw new Error(result.message);
      toast.success(label.save);
      setForm({ supplier_id: "", note: "", items: [{ product_id: "", quantity: "", unit_price: "" }] });
      await load();
    } catch (err) { toast.error(err.message); }
  }

  async function doCancel(id) { try { await cancelPurchaseOrder(id); await load(); } catch (e) { toast.error(e.message); } }
  async function doReceive(id) {
    if (!window.confirm(fa ? "با ثبت دریافت، موجودی کالاها افزایش می‌یابد. ادامه می‌دهید؟" : "Marking received will increase stock for every line. Continue?")) return;
    try { await receivePurchaseOrder(id); toast.success(label.receive); await load(); } catch (e) { toast.error(e.message); }
  }

  function openDispatch(po) {
    setDispatchForm({ method: "email", destination: "", note: "" });
    setDispatchModal({ po });
  }

  async function submitDispatch(e) {
    e.preventDefault();
    if (dispatchForm.method === "copy_text") {
      const po = dispatchModal.po;
      const text = `${label.title} #${po.id} — ${po.supplier_name || label.noSupplier}\n` +
        po.items.map((it) => `${it.product_name} × ${it.quantity} = ${it.line_total}`).join("\n") +
        `\n${label.total}: ${po.total_amount}`;
      try { await navigator.clipboard.writeText(text); } catch { /* clipboard may be unavailable; the log entry below still records the attestation */ }
    }
    if (dispatchForm.method === "print_pdf") {
      window.print();
    }
    setDispatching(true);
    try {
      const result = await dispatchPurchaseOrder(dispatchModal.po.id, dispatchForm);
      if (result.status === "sent" || result.status === "delivered") {
        toast.success(`${label.methodLabel[dispatchForm.method]}: ${label.dispatchStatusLabel[result.status]}`);
      } else {
        toast.error(result.detail || label.dispatchStatusLabel[result.status] || result.status);
      }
      setDispatchModal(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDispatching(false);
    }
  }

  async function openHistory(po) {
    setHistoryModal({ po, items: [] });
    setHistoryLoading(true);
    try {
      const data = await getPurchaseOrderDispatchLog(po.id);
      setHistoryModal({ po, items: data.items || [] });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <div dir={dir} style={{ direction: dir }} className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl font-black text-[var(--erp-accent)] flex items-center gap-3"><Factory size={32} />{label.title}</h1>
          <p className="text-[var(--erp-muted)] mt-2">{label.subtitle}</p>
        </div>
        <button onClick={load} className={`${button} bg-[var(--erp-panel-solid)] text-[var(--erp-accent)] border border-[var(--erp-border)]`}>
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />{label.refresh}
        </button>
      </div>

      {error && <div className="bg-red-500/15 border border-red-400/30 text-red-200 rounded-2xl p-4">{error}</div>}

      <form onSubmit={submit} className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-5 space-y-4">
        <h2 className="text-xl font-black text-[var(--erp-accent)]">{label.newOrder}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label={label.supplier}>
            <select className={inputClass} value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
              <option value="">{label.noSupplier}</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label={label.note}>
            <input className={inputClass} value={form.note} onChange={(e) => setForm({ ...form, note: fa ? toPersianDigits(e.target.value) : e.target.value })} />
          </Field>
        </div>

        <div className="space-y-3">
          {form.items.map((item, index) => (
            <div key={index} className="grid grid-cols-1 md:grid-cols-[1fr_140px_160px_auto] gap-3 items-end">
              <Field label={label.product}>
                <select className={inputClass} value={item.product_id} onChange={(e) => setItem(index, "product_id", e.target.value)}>
                  <option value="">{label.product}</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.name} | {label.quantity}: {n(p.stock || 0)}</option>)}
                </select>
              </Field>
              <Field label={label.quantity}>
                <input type="text" inputMode="numeric" className={inputClass} value={fa ? toPersianDigits(item.quantity) : item.quantity} onChange={(e) => setItem(index, "quantity", cleanNumberInput(e.target.value))} placeholder={fa ? "۰" : "0"} />
              </Field>
              <Field label={label.unitPrice}>
                <input type="text" inputMode="numeric" className={inputClass} value={fa ? toPersianDigits(item.unit_price) : item.unit_price} onChange={(e) => setItem(index, "unit_price", cleanNumberInput(e.target.value))} placeholder={fa ? "قیمت خرید کالا" : "product buy price"} />
              </Field>
              <button type="button" onClick={() => removeItem(index)} disabled={form.items.length === 1} className={`${button} bg-rose-500/10 text-rose-300 disabled:opacity-40`} title={label.removeItem}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button type="button" onClick={addItem} className={`${button} bg-[var(--erp-panel-solid)] text-[var(--erp-accent)] border border-[var(--erp-border)]`}>
            <Plus size={16} />{label.addItem}
          </button>
          <button type="submit" className={`${button} bg-[var(--erp-accent)] text-slate-950`}>
            <Plus size={16} />{label.save}
          </button>
        </div>
      </form>

      <div className="space-y-3">
        {orders.length === 0 && !loading && (
          <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-8 text-center text-[var(--erp-muted)]">{label.noData}</div>
        )}
        {orders.map((po) => (
          <div key={po.id} className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
              <div>
                <div className="font-black text-lg text-[var(--erp-text)]">#{n(po.id)} — {po.supplier_name || label.noSupplier}</div>
                <div className="text-xs text-[var(--erp-muted)] mt-1">{date(po.created_at)}{po.note ? ` · ${po.note}` : ""}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-black ${STATUS_TONE[po.status] || ""}`}>{label.status[po.status] || po.status}</span>
                <span className="font-black text-[var(--erp-accent)]">{money(po.total_amount)}</span>
              </div>
            </div>

            <div className="space-y-1 mb-3">
              {po.items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm text-[var(--erp-muted)]">
                  <span>{item.product_name} × {n(item.quantity)}</span>
                  <span>{money(item.line_total)}</span>
                </div>
              ))}
            </div>

            {po.status !== "received" && po.status !== "cancelled" && (
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => openDispatch(po)} className={`${button} bg-cyan-500/15 text-cyan-200`}>
                  <Send size={15} />{po.status === "draft" ? label.send : label.resend}
                </button>
                <button onClick={() => doReceive(po.id)} className={`${button} bg-emerald-500/15 text-emerald-200`}><PackageCheck size={15} />{label.receive}</button>
                <button onClick={() => doCancel(po.id)} className={`${button} bg-rose-500/10 text-rose-300`}><XCircle size={15} />{label.cancel}</button>
              </div>
            )}
            <button onClick={() => openHistory(po)} className={`${button} bg-transparent text-[var(--erp-muted)] px-0 py-2 mt-2 text-sm`}>
              <History size={14} />{label.history}
            </button>
          </div>
        ))}
      </div>

      <Modal open={!!dispatchModal} onClose={() => setDispatchModal(null)} maxWidthClassName="max-w-lg" labelledBy="po-dispatch-title">
        {dispatchModal && (
          <form onSubmit={submitDispatch} className="p-5 space-y-3">
            <h2 id="po-dispatch-title" className="text-lg font-bold">{label.dispatchTitle} — #{n(dispatchModal.po.id)}</h2>
            <Field label={label.method}>
              <select className={inputClass} value={dispatchForm.method} onChange={(e) => setDispatchForm({ ...dispatchForm, method: e.target.value })}>
                {DISPATCH_METHODS.map((m) => <option key={m} value={m}>{label.methodLabel[m]}</option>)}
              </select>
            </Field>
            {!["manual", "print_pdf", "copy_text"].includes(dispatchForm.method) && (
              <Field label={label.destination}>
                <input className={inputClass} value={dispatchForm.destination} onChange={(e) => setDispatchForm({ ...dispatchForm, destination: e.target.value })} />
              </Field>
            )}
            <Field label={label.dispatchNote}>
              <input className={inputClass} value={dispatchForm.note} onChange={(e) => setDispatchForm({ ...dispatchForm, note: e.target.value })} />
            </Field>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={() => setDispatchModal(null)} className={`${button} bg-[var(--erp-panel-solid)] border border-[var(--erp-border)]`}>
                {label.cancel}
              </button>
              <button type="submit" disabled={dispatching} className={`${button} bg-[var(--erp-accent)] text-slate-950`}>
                <Send size={15} />{label.dispatchSend}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!historyModal} onClose={() => setHistoryModal(null)} maxWidthClassName="max-w-xl" labelledBy="po-history-title">
        {historyModal && (
          <div className="p-5 space-y-3">
            <h2 id="po-history-title" className="text-lg font-bold">{label.history} — #{n(historyModal.po.id)}</h2>
            {historyLoading ? (
              <p className="text-[var(--erp-muted)]">…</p>
            ) : historyModal.items.length === 0 ? (
              <p className="text-[var(--erp-muted)]">{label.noDispatch}</p>
            ) : (
              <div className="space-y-2">
                {historyModal.items.map((entry) => (
                  <div key={entry.id} className="rounded-xl bg-[var(--erp-panel-solid)] px-4 py-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-bold">{label.methodLabel[entry.method] || entry.method}{entry.destination ? ` — ${entry.destination}` : ""}</span>
                      <span className={`px-2 py-1 rounded-lg text-xs font-black ${DISPATCH_STATUS_TONE[entry.status] || ""}`}>{label.dispatchStatusLabel[entry.status] || entry.status}</span>
                    </div>
                    <div className="text-xs text-[var(--erp-muted)] mt-1">{date(entry.created_at)}{entry.detail ? ` · ${entry.detail}` : ""}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
