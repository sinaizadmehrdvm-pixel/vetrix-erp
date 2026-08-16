import { useEffect, useState } from "react";
import { useStableCallback } from "../hooks/useStableCallback";
import { Factory, Plus, RefreshCw, Send, PackageCheck, XCircle, Trash2, History, Warehouse as WarehouseIcon } from "lucide-react";
import toast from "react-hot-toast";

import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits, cleanNumberInput } from "../localization/helpers";
import {
  getCustomers, getProducts, getPurchaseOrders, createPurchaseOrder, dispatchPurchaseOrder,
  getPurchaseOrderDispatchLog, cancelPurchaseOrder, receivePurchaseOrder, getPurchaseOrderReceipts, getWarehouses,
} from "../services/api";
import Modal from "../components/ui/Modal";
import Select from "../components/ui/Select";
import { Table, Thead, Th, Tbody, Tr, Td } from "../components/ui/Table";

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
  partially_received: "bg-amber-400/10 text-amber-300",
  received: "bg-emerald-400/10 text-emerald-300",
  cancelled: "bg-rose-400/10 text-rose-300",
};

export default function PurchaseOrders() {
  const { language, dir, n, money, date } = useLanguage();
  const fa = language === "fa";
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ supplier_id: "", note: "", default_warehouse_id: "", items: [{ product_id: "", quantity: "", unit_price: "" }] });
  const [dispatchModal, setDispatchModal] = useState(null); // { po }
  const [dispatchForm, setDispatchForm] = useState({ method: "email", destination: "", note: "" });
  const [dispatching, setDispatching] = useState(false);
  const [historyModal, setHistoryModal] = useState(null); // { po, items }
  const [historyLoading, setHistoryLoading] = useState(false);
  const [receiveModal, setReceiveModal] = useState(null); // { po, lines: [{po_item_id, product_name, ordered, previouslyReceived, remaining, receivingNow}] }
  const [receiveForm, setReceiveForm] = useState({ warehouse_id: "" });
  const [receiving, setReceiving] = useState(false);
  const [receiptsModal, setReceiptsModal] = useState(null); // { po, items }
  const [receiptsLoading, setReceiptsLoading] = useState(false);

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
      partially_received: fa ? "دریافت جزئی" : language === "ar" ? "استلام جزئي" : language === "tr" ? "Kısmen Teslim Alındı" : "Partially received",
      received: fa ? "دریافت‌شده" : language === "ar" ? "مُستلَم" : language === "tr" ? "Teslim Alındı" : "Received",
      cancelled: fa ? "لغوشده" : language === "ar" ? "ملغى" : language === "tr" ? "İptal Edildi" : "Cancelled",
    },
    defaultWarehouse: fa ? "انبار مقصد پیش‌فرض (اختیاری)" : language === "ar" ? "المستودع الافتراضي (اختياري)" : language === "tr" ? "Varsayılan hedef depo (isteğe bağlı)" : "Default destination warehouse (optional)",
    noWarehouse: fa ? "بدون انبار پیش‌فرض" : language === "ar" ? "بدون مستودع افتراضي" : language === "tr" ? "Varsayılan depo yok" : "No default warehouse",
    receiveTitle: fa ? "ثبت دریافت کالا" : language === "ar" ? "تسجيل استلام البضاعة" : language === "tr" ? "Mal Kabulünü Kaydet" : "Record goods receipt",
    receiveWarehouse: fa ? "انبار مقصد این دریافت" : language === "ar" ? "مستودع هذا الاستلام" : language === "tr" ? "Bu teslim alma için depo" : "Destination warehouse for this receipt",
    ordered: fa ? "سفارش‌شده" : language === "ar" ? "المطلوب" : language === "tr" ? "Sipariş edilen" : "Ordered",
    previouslyReceived: fa ? "قبلاً دریافت‌شده" : language === "ar" ? "المستلم سابقًا" : language === "tr" ? "Daha önce teslim alınan" : "Previously received",
    receivingNow: fa ? "دریافت الان" : language === "ar" ? "الاستلام الآن" : language === "tr" ? "Şimdi teslim al" : "Receiving now",
    remaining: fa ? "باقی‌مانده" : language === "ar" ? "المتبقي" : language === "tr" ? "Kalan" : "Remaining",
    receiveNoteLabel: fa ? "یادداشت دریافت (اختیاری)" : language === "ar" ? "ملاحظة الاستلام (اختياري)" : language === "tr" ? "Teslim alma notu (isteğe bağlı)" : "Receipt note (optional)",
    receiveSubmit: fa ? "ثبت دریافت" : language === "ar" ? "تسجيل الاستلام" : language === "tr" ? "Teslim Almayı Kaydet" : "Record receipt",
    fullyReceivedNote: fa ? "این ردیف کامل دریافت شده است." : language === "ar" ? "تم استلام هذا البند بالكامل." : language === "tr" ? "Bu kalem tamamen teslim alındı." : "This line is already fully received.",
    receiptHistory: fa ? "تاریخچه دریافت" : language === "ar" ? "سجل الاستلام" : language === "tr" ? "Teslim alma geçmişi" : "Receipt history",
    noReceipts: fa ? "هنوز دریافتی ثبت نشده است." : language === "ar" ? "لم يتم تسجيل أي استلام بعد." : language === "tr" ? "Henüz teslim alma kaydedilmedi." : "No receipts recorded yet.",
    receivedBy: fa ? "دریافت‌کننده" : language === "ar" ? "استلمها" : language === "tr" ? "Teslim alan" : "Received by",
    row: fa ? "ردیف" : "#",
  };

  async function load() {
    setLoading(true); setError("");
    try {
      const [o, c, p, w] = await Promise.all([getPurchaseOrders(), getCustomers(), getProducts(), getWarehouses()]);
      setOrders(Array.isArray(o) ? o : []);
      setCustomers(Array.isArray(c) ? c.filter((x) => x.customer_type === "supplier" || x.customer_type === "both") : []);
      setProducts(Array.isArray(p) ? p : []);
      setWarehouses(Array.isArray(w?.items) ? w.items.filter((x) => x.active) : []);
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
      const result = await createPurchaseOrder({
        supplier_id: form.supplier_id ? Number(form.supplier_id) : null, note: form.note, items,
        default_warehouse_id: form.default_warehouse_id ? Number(form.default_warehouse_id) : null,
      });
      if (result?.status === "error") throw new Error(result.message);
      toast.success(label.save);
      setForm({ supplier_id: "", note: "", default_warehouse_id: "", items: [{ product_id: "", quantity: "", unit_price: "" }] });
      await load();
    } catch (err) { toast.error(err.message); }
  }

  async function doCancel(id) { try { await cancelPurchaseOrder(id); await load(); } catch (e) { toast.error(e.message); } }

  function openReceive(po) {
    const lines = po.items
      .filter((it) => it.remaining_quantity > 0)
      .map((it) => ({
        po_item_id: it.id,
        product_name: it.product_name,
        ordered: it.quantity,
        previouslyReceived: it.received_quantity,
        remaining: it.remaining_quantity,
        receivingNow: String(it.remaining_quantity),
      }));
    setReceiveForm({ warehouse_id: po.default_warehouse_id ? String(po.default_warehouse_id) : "" });
    setReceiveModal({ po, lines, note: "" });
  }

  function setReceiveLineQty(index, value) {
    setReceiveModal((modal) => {
      const lines = modal.lines.slice();
      lines[index] = { ...lines[index], receivingNow: value };
      return { ...modal, lines };
    });
  }

  async function submitReceive(e) {
    e.preventDefault();
    const items = receiveModal.lines
      .map((l) => ({ po_item_id: l.po_item_id, quantity: toNumber(l.receivingNow) }))
      .filter((l) => l.quantity > 0);
    if (!items.length) { toast.error(fa ? "حداقل یک ردیف با تعداد دریافت لازم است" : "At least one line with a receiving quantity is required"); return; }
    const idempotencyKey = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setReceiving(true);
    try {
      const result = await receivePurchaseOrder(
        receiveModal.po.id,
        { warehouse_id: receiveForm.warehouse_id ? Number(receiveForm.warehouse_id) : null, items, note: receiveModal.note || "" },
        idempotencyKey,
      );
      toast.success(label.status[result.status] || result.status);
      setReceiveModal(null);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setReceiving(false);
    }
  }

  async function openReceipts(po) {
    setReceiptsModal({ po, items: [] });
    setReceiptsLoading(true);
    try {
      const data = await getPurchaseOrderReceipts(po.id);
      setReceiptsModal({ po, items: data.items || [] });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setReceiptsLoading(false);
    }
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label={label.supplier}>
            <Select
              className="w-full"
              value={form.supplier_id}
              onChange={(value) => setForm({ ...form, supplier_id: value })}
              options={[
                { value: "", label: label.noSupplier },
                ...customers.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </Field>
          <Field label={label.defaultWarehouse}>
            <Select
              className="w-full"
              value={form.default_warehouse_id}
              onChange={(value) => setForm({ ...form, default_warehouse_id: value })}
              options={[
                { value: "", label: label.noWarehouse },
                ...warehouses.map((w) => ({ value: w.id, label: w.name })),
              ]}
            />
          </Field>
          <Field label={label.note}>
            <input className={inputClass} value={form.note} onChange={(e) => setForm({ ...form, note: fa ? toPersianDigits(e.target.value) : e.target.value })} />
          </Field>
        </div>

        <div className="space-y-3">
          {form.items.map((item, index) => (
            <div key={index} className="grid grid-cols-1 md:grid-cols-[1fr_140px_160px_auto] gap-3 items-end">
              <Field label={label.product}>
                <Select
                  className="w-full"
                  value={item.product_id}
                  onChange={(value) => setItem(index, "product_id", value)}
                  options={[
                    { value: "", label: label.product },
                    ...products.map((p) => ({ value: p.id, label: `${p.name} | ${label.quantity}: ${n(p.stock || 0)}` })),
                  ]}
                />
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
              {po.items.map((item, index) => (
                <div key={item.id} className="flex justify-between text-sm text-[var(--erp-muted)] gap-2">
                  <span className="text-[var(--erp-muted)] font-bold">{n(index + 1)}.</span>
                  <span className="flex-1">
                    {item.product_name} × {n(item.quantity)}
                    {item.received_quantity > 0 && (
                      <span className="text-emerald-300"> ({label.previouslyReceived}: {n(item.received_quantity)})</span>
                    )}
                  </span>
                  <span>{money(item.line_total)}</span>
                </div>
              ))}
            </div>

            {po.status !== "received" && po.status !== "cancelled" && (
              <div className="flex gap-2 flex-wrap">
                {(po.status === "draft" || po.status === "sent") && (
                  <button onClick={() => openDispatch(po)} className={`${button} bg-cyan-500/15 text-cyan-200`}>
                    <Send size={15} />{po.status === "draft" ? label.send : label.resend}
                  </button>
                )}
                {po.status !== "draft" && (
                  <button onClick={() => openReceive(po)} className={`${button} bg-emerald-500/15 text-emerald-200`}><PackageCheck size={15} />{label.receive}</button>
                )}
                {(po.status === "draft" || po.status === "sent") && (
                  <button onClick={() => doCancel(po.id)} className={`${button} bg-rose-500/10 text-rose-300`}><XCircle size={15} />{label.cancel}</button>
                )}
              </div>
            )}
            <div className="flex gap-3 flex-wrap mt-2">
              <button onClick={() => openHistory(po)} className={`${button} bg-transparent text-[var(--erp-muted)] px-0 py-2 text-sm`}>
                <History size={14} />{label.history}
              </button>
              <button onClick={() => openReceipts(po)} className={`${button} bg-transparent text-[var(--erp-muted)] px-0 py-2 text-sm`}>
                <WarehouseIcon size={14} />{label.receiptHistory}
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!dispatchModal} onClose={() => setDispatchModal(null)} maxWidthClassName="max-w-lg" labelledBy="po-dispatch-title">
        {dispatchModal && (
          <form onSubmit={submitDispatch} className="p-5 space-y-3">
            <h2 id="po-dispatch-title" className="text-lg font-bold">{label.dispatchTitle} — #{n(dispatchModal.po.id)}</h2>
            <Field label={label.method}>
              <Select
                className="w-full"
                value={dispatchForm.method}
                onChange={(value) => setDispatchForm({ ...dispatchForm, method: value })}
                options={DISPATCH_METHODS.map((m) => ({ value: m, label: label.methodLabel[m] }))}
              />
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

      <Modal open={!!receiveModal} onClose={() => setReceiveModal(null)} maxWidthClassName="max-w-2xl" labelledBy="po-receive-title">
        {receiveModal && (
          <form onSubmit={submitReceive} className="p-5 space-y-4">
            <h2 id="po-receive-title" className="text-lg font-bold">{label.receiveTitle} — #{n(receiveModal.po.id)}</h2>

            <Field label={label.receiveWarehouse}>
              <Select
                className="w-full"
                value={receiveForm.warehouse_id}
                onChange={(value) => setReceiveForm({ ...receiveForm, warehouse_id: value })}
                options={[
                  { value: "", label: label.noWarehouse },
                  ...warehouses.map((w) => ({ value: w.id, label: w.name })),
                ]}
              />
            </Field>

            {receiveModal.lines.length === 0 ? (
              <p className="text-[var(--erp-muted)] text-sm">{label.fullyReceivedNote}</p>
            ) : (
              <Table dir={dir} className="text-sm">
                <Thead>
                  <Th className="w-12">{label.row}</Th>
                  <Th>{label.product}</Th>
                  <Th align="end">{label.ordered}</Th>
                  <Th align="end">{label.previouslyReceived}</Th>
                  <Th align="end">{label.remaining}</Th>
                  <Th>{label.receivingNow}</Th>
                </Thead>
                <Tbody>
                  {receiveModal.lines.map((line, index) => (
                    <Tr key={line.po_item_id}>
                      <Td className="text-[var(--erp-muted)] font-bold">{n(index + 1)}</Td>
                      <Td>{line.product_name}</Td>
                      <Td align="end">{n(line.ordered)}</Td>
                      <Td align="end">{n(line.previouslyReceived)}</Td>
                      <Td align="end" className="font-bold text-[var(--erp-accent)]">{n(line.remaining)}</Td>
                      <Td>
                        <input
                          type="text" inputMode="numeric" className={`${inputClass} !p-2`}
                          value={fa ? toPersianDigits(line.receivingNow) : line.receivingNow}
                          onChange={(e) => setReceiveLineQty(index, cleanNumberInput(e.target.value))}
                        />
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            )}

            <Field label={label.receiveNoteLabel}>
              <input className={inputClass} value={receiveModal.note} onChange={(e) => setReceiveModal({ ...receiveModal, note: fa ? toPersianDigits(e.target.value) : e.target.value })} />
            </Field>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={() => setReceiveModal(null)} className={`${button} bg-[var(--erp-panel-solid)] border border-[var(--erp-border)]`}>
                {label.cancel}
              </button>
              <button type="submit" disabled={receiving || receiveModal.lines.length === 0} className={`${button} bg-[var(--erp-accent)] text-slate-950 disabled:opacity-50`}>
                <PackageCheck size={15} />{label.receiveSubmit}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!receiptsModal} onClose={() => setReceiptsModal(null)} maxWidthClassName="max-w-2xl" labelledBy="po-receipts-title">
        {receiptsModal && (
          <div className="p-5 space-y-3">
            <h2 id="po-receipts-title" className="text-lg font-bold">{label.receiptHistory} — #{n(receiptsModal.po.id)}</h2>
            {receiptsLoading ? (
              <p className="text-[var(--erp-muted)]">…</p>
            ) : receiptsModal.items.length === 0 ? (
              <p className="text-[var(--erp-muted)]">{label.noReceipts}</p>
            ) : (
              <div className="space-y-2">
                {receiptsModal.items.map((receipt, index) => (
                  <div key={receipt.id} className="rounded-xl bg-[var(--erp-panel-solid)] px-4 py-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="font-bold">{n(index + 1)}. {receipt.warehouse_name}</span>
                      <span className="text-xs text-[var(--erp-muted)]">{date(receipt.received_at)}</span>
                    </div>
                    <div className="text-sm mt-1 space-y-0.5">
                      {receipt.items.map((item) => (
                        <div key={item.product_id} className="flex justify-between text-[var(--erp-muted)]">
                          <span>{item.product_name}</span>
                          <span>{n(item.quantity)}</span>
                        </div>
                      ))}
                    </div>
                    {(receipt.received_by_name || receipt.note) && (
                      <div className="text-xs text-[var(--erp-muted)] mt-1">
                        {receipt.received_by_name ? `${label.receivedBy}: ${receipt.received_by_name}` : ""}
                        {receipt.received_by_name && receipt.note ? " · " : ""}
                        {receipt.note}
                      </div>
                    )}
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
