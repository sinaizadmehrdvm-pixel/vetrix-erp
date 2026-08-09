import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, Trash2, Send, Search } from "lucide-react";
import toast from "react-hot-toast";
import { useLanguage } from "../../localization/useLanguage";
import { getCustomer, getProducts, createInvoice, isNetworkError } from "../../services/api";
import { translateApiError } from "../../localization/apiErrors";
import { getCache, setCache } from "../../storage/db";
import { syncPendingRecords, useOnlineSync } from "../../storage/offlineSync";
import VisitorLayout from "./VisitorLayout";

const PRODUCTS_CACHE_KEY = "visitor_products";
const PENDING_ORDERS_CACHE_KEY = "visitor_pending_orders";

function extractOrderPayload(item) {
  return {
    invoice_type: "sale",
    customer_id: Number(item.customer_id),
    items: item.items,
    payment_status: "unpaid",
    source: "visitor",
  };
}

async function createOrderForSync(payload) {
  const res = await createInvoice(payload);
  if (res?.status !== "created") throw new Error(res?.message || "sync failed");
  return res;
}

export default function VisitorOrder() {
  const { language } = useLanguage();
  const { customerId } = useParams();
  const navigate = useNavigate();
  const fa = language === "fa";
  const tr = (faText, arText, trText, enText) =>
    fa ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  const [customer, setCustomer] = useState(null);
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      (async () => {
        try {
          setCustomer(await getCustomer(customerId));
        } catch {
          toast.error(tr("مشتری یافت نشد", "لم يتم العثور على العميل", "Müşteri bulunamadı", "Customer not found"));
        }
        try {
          const data = await getProducts();
          const list = Array.isArray(data) ? data : [];
          setProducts(list);
          await setCache(PRODUCTS_CACHE_KEY, list);
        } catch {
          const cached = await getCache(PRODUCTS_CACHE_KEY);
          if (cached) setProducts(cached);
        }
      })();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  async function syncPendingOrders() {
    const cached = (await getCache(PENDING_ORDERS_CACHE_KEY)) || [];
    if (!cached.some((item) => item.pending_sync)) return;
    const { items: updated, syncedCount } = await syncPendingRecords(cached, {
      extractPayload: extractOrderPayload,
      create: createOrderForSync,
      update: createOrderForSync,
      mergeResult: (item) => ({ ...item, pending_sync: false }),
    });
    await setCache(PENDING_ORDERS_CACHE_KEY, updated.filter((item) => item.pending_sync));
    if (syncedCount > 0) {
      toast.success(
        fa ? `${syncedCount} سفارش آفلاین همگام‌سازی شد.` : `${syncedCount} offline order(s) synced.`
      );
    }
  }

  useOnlineSync(syncPendingOrders);

  const filteredProducts = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(language);
    if (!needle) return products.slice(0, 30);
    return products.filter((product) =>
      `${product.name || ""} ${product.code || ""} ${product.barcode || ""}`.toLocaleLowerCase(language).includes(needle)
    ).slice(0, 30);
  }, [products, query, language]);

  function addLine(product) {
    setLines((prev) => {
      const existing = prev.find((line) => line.product_id === product.id);
      if (existing) {
        return prev.map((line) =>
          line.product_id === product.id ? { ...line, quantity: line.quantity + 1 } : line
        );
      }
      return [...prev, {
        product_id: product.id,
        name: product.name,
        quantity: 1,
        unit_price: product.sell_price || product.price || 0,
      }];
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
    const payload = {
      customer_id: Number(customerId),
      items: lines.map((line) => ({
        product_id: line.product_id,
        quantity: Number(line.quantity),
        unit_price: Number(line.unit_price),
      })),
    };

    setSubmitting(true);
    try {
      const res = await createInvoice({ ...extractOrderPayload(payload), items: payload.items });
      if (res?.status !== "created") throw new Error(res?.message || "failed");
      toast.success(tr("سفارش ثبت شد", "تم تسجيل الطلب", "Sipariş kaydedildi", "Order recorded"));
      navigate("/visitor");
    } catch (error) {
      // The server was reached and rejected the order (RBAC, invalid
      // customer/product, ...) - retrying later would fail identically, so
      // this must NOT be queued offline; it would just sit pending forever
      // with no visibility. Only a genuine connectivity failure gets queued.
      if (!isNetworkError(error)) {
        toast.error(translateApiError(error.message, language) || tr("ثبت سفارش ناموفق بود", "فشل تسجيل الطلب", "Sipariş kaydedilemedi", "Failed to record order"));
        return;
      }
      const cached = (await getCache(PENDING_ORDERS_CACHE_KEY)) || [];
      const offlineOrder = { ...payload, id: Date.now(), pending_sync: true, offline_created: true };
      await setCache(PENDING_ORDERS_CACHE_KEY, [...cached, offlineOrder]);
      toast(
        tr("اتصال برقرار نیست؛ سفارش ذخیره شد و بعداً ارسال می‌شود.", "لا يوجد اتصال؛ تم حفظ الطلب وسيُرسل لاحقًا.", "Bağlantı yok; sipariş kaydedildi, sonra gönderilecek.", "No connection; order saved and will send later.")
      );
      navigate("/visitor");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <VisitorLayout title={customer?.name || tr("سفارش جدید", "طلب جديد", "Yeni sipariş", "New order")}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--erp-panel-solid)", borderRadius: 14, padding: "10px 12px", border: "1px solid var(--erp-border)", marginBottom: 12 }}>
        <Search size={16} color="var(--erp-muted)" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={tr("جستجوی کالا...", "ابحث عن منتج...", "Ürün ara...", "Search product...")}
          style={{ flex: 1, background: "transparent", border: 0, outline: "none", color: "var(--erp-text)" }}
        />
      </label>

      <div style={{ display: "grid", gap: 8, maxHeight: 220, overflowY: "auto", marginBottom: 16 }}>
        {filteredProducts.map((product) => (
          <button
            key={product.id}
            type="button"
            onClick={() => addLine(product)}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--erp-panel-solid)", border: "1px solid var(--erp-border)", borderRadius: 12, padding: "10px 12px", color: "var(--erp-text)" }}
          >
            <span>{product.name}</span>
            <Plus size={16} color="var(--erp-accent)" />
          </button>
        ))}
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 900, color: "var(--erp-accent)", margin: "0 0 8px" }}>
        {tr("اقلام سفارش", "بنود الطلب", "Sipariş kalemleri", "Order items")}
      </h3>

      {lines.length === 0 && (
        <div style={{ color: "var(--erp-muted)", fontSize: 13, marginBottom: 14 }}>
          {tr("کالایی اضافه نشده است.", "لم تتم إضافة أي منتج.", "Ürün eklenmedi.", "No items added yet.")}
        </div>
      )}

      <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        {lines.map((line) => (
          <div key={line.product_id} style={{ display: "grid", gridTemplateColumns: "1fr 70px 90px auto", gap: 8, alignItems: "center", background: "var(--erp-panel-solid)", borderRadius: 12, padding: 10 }}>
            <span style={{ fontSize: 13 }}>{line.name}</span>
            <input
              type="number"
              min="0"
              value={line.quantity}
              onChange={(event) => updateLine(line.product_id, { quantity: event.target.value })}
              style={{ width: "100%", background: "var(--erp-bg)", border: "1px solid var(--erp-border)", borderRadius: 8, padding: 6, color: "var(--erp-text)" }}
            />
            <input
              type="number"
              min="0"
              value={line.unit_price}
              onChange={(event) => updateLine(line.product_id, { unit_price: event.target.value })}
              style={{ width: "100%", background: "var(--erp-bg)", border: "1px solid var(--erp-border)", borderRadius: 8, padding: 6, color: "var(--erp-text)" }}
            />
            <button type="button" onClick={() => removeLine(line.product_id)} style={{ border: 0, background: "transparent", color: "#fca5a5" }}>
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, marginBottom: 14 }}>
        <span>{tr("جمع کل", "الإجمالي", "Toplam", "Total")}</span>
        <span>{total.toLocaleString(language)}</span>
      </div>

      <button
        type="button"
        onClick={submitOrder}
        disabled={submitting}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, border: 0, borderRadius: 14, padding: "14px 0", background: "var(--erp-accent)", color: "#071028", fontWeight: 900, opacity: submitting ? 0.6 : 1 }}
      >
        <Send size={18} /> {submitting ? "..." : tr("ثبت سفارش", "تسجيل الطلب", "Siparişi kaydet", "Submit order")}
      </button>
    </VisitorLayout>
  );
}
