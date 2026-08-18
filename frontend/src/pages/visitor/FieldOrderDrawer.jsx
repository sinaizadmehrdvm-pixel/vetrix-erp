import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Send, Search, RotateCcw, Package } from "lucide-react";
import toast from "react-hot-toast";
import { useLanguage } from "../../localization/useLanguage";
import { getProducts, createInvoice, getInvoice, isNetworkError } from "../../services/api";
import { translateApiError } from "../../localization/apiErrors";
import { toEnglishDigits, toPersianDigits } from "../../localization/helpers";
import { getCache, setCache } from "../../storage/db";
import { syncPendingRecords, useOnlineSync } from "../../storage/offlineSync";
import { useFieldSales } from "./useFieldSales";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import MoneyDisplay from "../../components/ui/MoneyDisplay";
import Badge from "../../components/ui/Badge";
import Tooltip from "../../components/ui/Tooltip";

const PRODUCTS_CACHE_KEY = "visitor_products";
const PENDING_ORDERS_CACHE_KEY = "visitor_pending_orders";

function extractOrderPayload(item) {
  return { invoice_type: "sale", customer_id: Number(item.customer_id), items: item.items, payment_status: "unpaid", source: "visitor" };
}

async function createOrderForSync(payload) {
  const res = await createInvoice(payload);
  if (res?.status !== "created") throw new Error(res?.message || "sync failed");
  return res;
}

// Modal-based order entry embedded inside the active visit (see
// ActiveVisitWorkspace) - reuses the exact same cart/invoice logic
// VisitorOrder.jsx already had (product search, line editing, offline
// queueing, createInvoice payload shape) instead of a second order engine.
// The standalone /visitor/order/:customerId page still exists as the
// explicit "open full page" escape hatch.
export default function FieldOrderDrawer({ customerId, customerName, open, onClose }) {
  const { language, n } = useLanguage();
  const { lastOrderByCustomer, openOrdersByCustomer, recordVisitOrder } = useFieldSales();
  const fa = language === "fa";
  const tr = (faText, arText, trText, enText) =>
    fa ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [lastOrderItems, setLastOrderItems] = useState([]);

  const lastOrder = lastOrderByCustomer.get(customerId);
  const openOrders = openOrdersByCustomer.get(customerId) || 0;

  // Mount-only: the parent (ActiveVisitWorkspace) remounts this component
  // fresh via a changing `key` every time it opens, so `lines`/`query`
  // already start clean from their useState defaults above - no
  // synchronous reset needed here, only the actual data fetch.
  useEffect(() => {
    (async () => {
      try {
        const data = await getProducts();
        const list = Array.isArray(data) ? data : [];
        setProducts(list);
        await setCache(PRODUCTS_CACHE_KEY, list);
      } catch {
        const cached = await getCache(PRODUCTS_CACHE_KEY);
        if (cached) setProducts(cached);
      }
      if (lastOrder?.id) {
        try {
          const detail = await getInvoice(lastOrder.id);
          setLastOrderItems(Array.isArray(detail?.items) ? detail.items : []);
        } catch { /* best-effort - not critical to placing a new order */ }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function syncPendingOrders() {
    const cached = (await getCache(PENDING_ORDERS_CACHE_KEY)) || [];
    if (!cached.some((item) => item.pending_sync)) return;
    const { syncedCount } = await syncPendingRecords(cached, {
      extractPayload: extractOrderPayload,
      create: createOrderForSync,
      update: createOrderForSync,
      mergeResult: (item) => ({ ...item, pending_sync: false }),
    });
    if (syncedCount > 0) toast.success(fa ? `${n(syncedCount)} سفارش آفلاین همگام‌سازی شد.` : `${n(syncedCount)} offline order(s) synced.`);
  }
  useOnlineSync(syncPendingOrders);

  const filteredProducts = useMemo(() => {
    // Digit-normalize only the typed query (Persian/Arabic-Indic -> Latin)
    // so a Persian-digit product code/barcode search matches the
    // already-Latin stored code/barcode without touching product data.
    const needle = toEnglishDigits(query.trim()).toLocaleLowerCase(language);
    if (!needle) return products.slice(0, 20);
    return products.filter((p) => `${p.name || ""} ${p.code || ""} ${p.barcode || ""}`.toLocaleLowerCase(language).includes(needle)).slice(0, 20);
  }, [products, query, language]);

  function addLine(product) {
    setLines((prev) => {
      const existing = prev.find((line) => line.product_id === product.id);
      if (existing) return prev.map((line) => (line.product_id === product.id ? { ...line, quantity: line.quantity + 1 } : line));
      return [...prev, { product_id: product.id, name: product.name, stock: product.stock, quantity: 1, unit_price: product.sell_price || product.price || 0 }];
    });
  }

  function addLastOrderItem(item) {
    const product = products.find((p) => p.id === item.product_id);
    setLines((prev) => {
      const existing = prev.find((line) => line.product_id === item.product_id);
      if (existing) return prev.map((line) => (line.product_id === item.product_id ? { ...line, quantity: line.quantity + item.quantity } : line));
      return [...prev, { product_id: item.product_id, name: item.product_name, stock: product?.stock, quantity: item.quantity, unit_price: item.unit_price }];
    });
  }

  function updateLine(productId, patch) {
    setLines((prev) => prev.map((line) => (line.product_id === productId ? { ...line, ...patch } : line)));
  }

  function removeLine(productId) {
    setLines((prev) => prev.filter((line) => line.product_id !== productId));
  }

  const total = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_price || 0), 0);

  async function submitOrder() {
    if (!lines.length) {
      toast.error(tr("حداقل یک کالا اضافه کنید", "أضف منتجًا واحدًا على الأقل", "En az bir ürün ekleyin", "Add at least one product"));
      return;
    }
    const payload = { customer_id: Number(customerId), items: lines.map((line) => ({ product_id: line.product_id, quantity: Number(line.quantity), unit_price: Number(line.unit_price) })) };
    setSubmitting(true);
    try {
      const res = await createInvoice(extractOrderPayload(payload));
      if (res?.status !== "created") throw new Error(res?.message || "failed");
      toast.success(tr("سفارش ثبت شد", "تم تسجيل الطلب", "Sipariş kaydedildi", "Order recorded"));
      recordVisitOrder({ invoice_id: res.invoice_id, total_amount: res.total_amount, customer_id: customerId, created_at: new Date().toISOString() });
      onClose();
    } catch (error) {
      if (!isNetworkError(error)) {
        toast.error(translateApiError(error.message, language) || tr("ثبت سفارش ناموفق بود", "فشل تسجيل الطلب", "Sipariş kaydedilemedi", "Failed to record order"));
        return;
      }
      const cached = (await getCache(PENDING_ORDERS_CACHE_KEY)) || [];
      await setCache(PENDING_ORDERS_CACHE_KEY, [...cached, { ...payload, id: Date.now(), pending_sync: true }]);
      toast(tr("اتصال برقرار نیست؛ سفارش ذخیره شد و بعداً ارسال می‌شود.", "لا يوجد اتصال؛ تم حفظ الطلب وسيُرسل لاحقًا.", "Bağlantı yok; sipariş kaydedildi, sonra gönderilecek.", "No connection; order saved and will send later."));
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidthClassName="max-w-2xl" labelledBy="field-order-title">
      <div className="p-5">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h2 id="field-order-title" style={{ fontWeight: 900, fontSize: 17 }}>{tr("سفارش جدید", "طلب جديد", "Yeni sipariş", "New order")}</h2>
          {openOrders > 0 && <Badge tone="warning">{tr(`${n(openOrders)} فاکتور باز`, `${n(openOrders)} فاتورة مفتوحة`, `${n(openOrders)} açık fatura`, `${n(openOrders)} open`)}</Badge>}
        </div>
        <p style={{ color: "var(--erp-muted)", fontSize: 13, marginBottom: 14 }}>{customerName}</p>

        {lastOrderItems.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-1.5 mb-1.5" style={{ fontSize: 12, color: "var(--erp-muted)" }}>
              <RotateCcw size={12} /> {tr("سفارش قبلی", "الطلب السابق", "Önceki sipariş", "Last order")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {lastOrderItems.map((item) => (
                <button key={item.id} type="button" onClick={() => addLastOrderItem(item)} className="inline-flex items-center gap-1" style={{ fontSize: 12, fontWeight: 700, padding: "5px 10px", borderRadius: 999, border: "1px solid var(--erp-border)", background: "var(--erp-panel-solid)", color: "var(--erp-text)", cursor: "pointer" }}>
                  <Plus size={11} color="var(--erp-accent)" /> {item.product_name} ({n(item.quantity)})
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="vitalix-input-group flex items-center gap-2 mb-3" style={{ padding: "0 12px" }}>
          <Search size={16} color="var(--erp-muted)" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr("جستجوی کالا...", "ابحث عن منتج...", "Ürün ara...", "Search product...")} className="flex-1 min-w-0" style={{ color: "var(--erp-text)", padding: "10px 0" }} />
        </label>

        <div className="grid gap-1.5 mb-4" style={{ maxHeight: 180, overflowY: "auto" }}>
          {filteredProducts.map((product) => (
            <button key={product.id} type="button" onClick={() => addLine(product)} className="flex items-center justify-between" style={{ background: "var(--erp-panel-solid)", border: "1px solid var(--erp-border)", borderRadius: "var(--erp-radius-sm)", padding: "9px 12px", color: "var(--erp-text)" }}>
              <span className="flex items-center gap-2 min-w-0">
                <span className="truncate">{product.name}</span>
                <span className="flex items-center gap-1 shrink-0" style={{ fontSize: 11, color: Number(product.stock) > 0 ? "var(--erp-success)" : "var(--erp-danger)" }}>
                  <Package size={11} /> {product.stock != null ? n(product.stock) : "-"}
                </span>
              </span>
              <Plus size={16} color="var(--erp-accent)" className="shrink-0" />
            </button>
          ))}
        </div>

        {lines.length > 0 && (
          <div className="grid gap-2 mb-3">
            {lines.map((line) => (
              <div key={line.product_id} className="grid items-center gap-2" style={{ gridTemplateColumns: "minmax(0, 1fr) 70px 100px auto", background: "var(--erp-panel-solid)", borderRadius: "var(--erp-radius-sm)", padding: 10 }}>
                <span className="truncate" style={{ fontSize: 13, minWidth: 0 }}>{line.name}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={fa ? toPersianDigits(line.quantity) : line.quantity}
                  onChange={(e) => updateLine(line.product_id, { quantity: toEnglishDigits(e.target.value).replace(/[^\d.]/g, "") })}
                  className="vitalix-control-inset"
                  style={{ width: "100%", padding: 6, borderRadius: "var(--erp-radius-sm)" }}
                />
                <MoneyDisplay value={Number(line.quantity || 0) * Number(line.unit_price || 0)} fontSize={13} />
                <Tooltip label={tr("حذف", "حذف", "Sil", "Remove")}>
                  <button type="button" onClick={() => removeLine(line.product_id)} style={{ border: 0, background: "transparent", color: "var(--erp-danger)" }} aria-label={tr("حذف", "حذف", "Sil", "Remove")}>
                    <Trash2 size={16} />
                  </button>
                </Tooltip>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-between items-center" style={{ fontWeight: 900, marginBottom: 14, paddingTop: 10, borderTop: "1px solid var(--erp-border)" }}>
          <span>{tr("جمع کل", "الإجمالي", "Toplam", "Total")}</span>
          <MoneyDisplay value={total} fontSize={17} />
        </div>

        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>{tr("انصراف", "إلغاء", "İptal", "Cancel")}</Button>
          <Button className="flex-1" onClick={submitOrder} loading={submitting} disabled={!lines.length}>
            <Send size={16} /> {tr("ثبت سفارش", "تسجيل الطلب", "Siparişi kaydet", "Submit order")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
