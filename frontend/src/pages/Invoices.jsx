import { useEffect, useMemo, useState } from "react";
import {
  FileText,
  Plus,
  Trash2,
  Printer,
  QrCode,
  Truck,
  CreditCard,
  Percent,
  Calculator,
  Package,
  UserRound,
  ClipboardList,
  ReceiptText,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Edit3,
  Save,
  X,
} from "lucide-react";

import {
  getCustomers,
  getProducts,
  getInvoices,
  createInvoice as apiCreateInvoice,
  getCustomerLedger,
} from "../services/api";

import axios from "axios";
import { useLanguage } from "../localization/LanguageContext";
import InvoiceSummary from "../invoice/InvoiceSummary";
import InvoicePrint from "../invoice/InvoicePrint";
import { getCache, setCache } from "../storage/db";
import { toPersianDigits, toEnglishDigits } from "../localization/helpers";

const API = "http://127.0.0.1:8001";

const CUSTOMERS_CACHE_KEY = "customers";
const PRODUCTS_CACHE_KEY = "products";
const INVOICES_CACHE_KEY = "invoices";

function toNumber(value) {
  if (value === "" || value === null || value === undefined) return 0;
  const cleaned = toEnglishDigits(String(value))
    .replace(/[,،]/g, "")
    .replace(/[^\d.-]/g, "");
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : 0;
}

function faText(value, fa) {
  if (value === null || value === undefined) return "";
  return fa ? toPersianDigits(String(value)) : String(value);
}

function normalizeNumberInput(value, fa) {
  const cleaned = toEnglishDigits(String(value || ""))
    .replace(/[,،]/g, "")
    .replace(/[^\d.-]/g, "");
  return fa ? toPersianDigits(cleaned) : cleaned;
}

function Field({ label, hint, icon, children }) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-bold text-cyan-200">
        {icon}
        <span>{label}</span>
      </label>
      {children}
      {hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

export default function Invoices() {
  const { language, dir, n, money } = useLanguage();
  const fa = language === "fa";

  const label = {
    invoiceSystem: fa ? "سیستم فاکتور حرفه‌ای" : "Professional Invoice System",
    subtitle: fa
      ? "ثبت فاکتور فروش، خرید، پیش‌فاکتور، مرجوعی، مالیات، تخفیف، حمل، QR و چاپ حرفه‌ای"
      : "Create sales, purchase, proforma, returns, tax, discount, shipping, QR and professional print",
    invoiceInfo: fa ? "اطلاعات اصلی فاکتور" : "Main invoice information",
    invoiceType: fa ? "نوع فاکتور" : "Invoice type",
    customer: fa ? "طرف حساب / مشتری" : "Customer / Account",
    selectCustomer: fa ? "طرف حساب را انتخاب کن" : "Select customer",
    paymentStatus: fa ? "وضعیت پرداخت" : "Payment status",
    unpaid: fa ? "پرداخت نشده" : "Unpaid",
    partial: fa ? "پرداخت جزئی" : "Partial",
    paid: fa ? "تسویه شده" : "Paid",
    shippingCost: fa ? "هزینه حمل" : "Shipping cost",
    shippingHint: fa ? "اگر هزینه حمل نداری خالی بگذار" : "Leave blank if there is no shipping cost",
    discountPercent: fa ? "درصد تخفیف" : "Discount percent",
    taxPercent: fa ? "درصد مالیات" : "Tax percent",
    invoiceQR: fa ? "QR فاکتور فعال باشد" : "Enable invoice QR",
    qrHint: fa ? "برای چاپ و رهگیری فاکتور استفاده می‌شود" : "Used for invoice print and tracking",
    itemsTitle: fa ? "ردیف‌های کالا / خدمات" : "Items / Services rows",
    item: fa ? "کالا / خدمات" : "Item / Service",
    selectProduct: fa ? "کالا را انتخاب کن" : "Select product",
    quantity: fa ? "تعداد" : "Quantity",
    unitPrice: fa ? "قیمت واحد" : "Unit price",
    rowTotal: fa ? "جمع ردیف" : "Row total",
    remove: fa ? "حذف ردیف" : "Remove row",
    addItem: fa ? "افزودن ردیف جدید" : "Add new row",
    notesPlaceholder: fa ? "توضیحات تکمیلی، شرایط پرداخت، آدرس ارسال یا هر نکته مهم..." : "Extra notes...",
    createInvoice: fa ? "ثبت فاکتور" : "Create invoice",
    saveInvoice: fa ? "ذخیره ویرایش فاکتور" : "Save invoice edit",
    cancelEdit: fa ? "لغو ویرایش" : "Cancel edit",
    refresh: fa ? "به‌روزرسانی اطلاعات" : "Refresh data",
    grandTotal: fa ? "مبلغ نهایی" : "Grand total",
    summaryTitle: fa ? "خلاصه مالی فاکتور" : "Invoice financial summary",
    invoicesList: fa ? "لیست فاکتورها" : "Invoices list",
    id: fa ? "شناسه" : "ID",
    total: fa ? "مبلغ کل" : "Total",
    status: fa ? "وضعیت" : "Status",
    printInvoice: fa ? "چاپ فاکتور" : "Print invoice",
    edit: fa ? "ویرایش" : "Edit",
    delete: fa ? "حذف" : "Delete",
    final: fa ? "نهایی" : "Final",
    emptyCustomers: fa ? "ابتدا از بخش طرف‌حساب‌ها مشتری تعریف کن" : "Create a customer first",
    emptyProducts: fa ? "ابتدا از بخش کالاها، کالا تعریف کن" : "Create a product first",
    noInvoices: fa ? "هنوز فاکتوری ثبت نشده است" : "No invoice has been created yet",
    loading: fa ? "در حال دریافت اطلاعات..." : "Loading data...",
    chooseCustomerAlert: fa ? "لطفاً طرف حساب را انتخاب کن" : "Please select customer",
    chooseProductAlert: fa ? "حداقل یک کالا با تعداد معتبر انتخاب کن" : "Please add at least one valid product",
    createdAlert: fa ? "فاکتور با موفقیت ثبت شد" : "Invoice created successfully",
    savedOffline: fa ? "سرور در دسترس نبود؛ فاکتور در حافظه آفلاین ذخیره شد." : "Server unavailable; invoice saved offline.",
    loadedOffline: fa ? "اتصال به سرور برقرار نشد؛ اطلاعات فاکتورها از حافظه آفلاین نمایش داده شد." : "Server unavailable; invoices loaded from offline cache.",
    createError: fa ? "خطا در ثبت فاکتور" : "Error creating invoice",
    saleInvoice: fa ? "فاکتور فروش" : "Sales invoice",
    buyInvoice: fa ? "فاکتور خرید" : "Purchase invoice",
    proformaInvoice: fa ? "پیش‌فاکتور" : "Proforma invoice",
    returnSaleInvoice: fa ? "برگشت از فروش" : "Sales return",
    returnBuyInvoice: fa ? "برگشت از خرید" : "Purchase return",
    stock: fa ? "موجودی" : "Stock",
    offline: fa ? "آفلاین" : "Offline",
  };

  const emptyForm = {
    invoice_type: "sale",
    customer_id: "",
    discount_percent: "",
    tax_percent: "",
    shipping_cost: "",
    payment_status: "unpaid",
    invoice_note: "",
    qr_enabled: true,
  };

  const emptyItem = {
    product_id: "",
    quantity: "",
    unit_price: "",
  };

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [createdInvoice, setCreatedInvoice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [offlineMode, setOfflineMode] = useState(false);
  const [selectedCustomerLedger, setSelectedCustomerLedger] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [editingId, setEditingId] = useState(null);

  async function saveAllCache(payload) {
    await setCache(CUSTOMERS_CACHE_KEY, payload.customers || []);
    await setCache(PRODUCTS_CACHE_KEY, payload.products || []);
    await setCache(INVOICES_CACHE_KEY, payload.invoices || []);
  }

  async function loadData() {
    try {
      setLoading(true);
      setLoadError("");
      setOfflineMode(false);

      const [customersData, productsData, invoicesRes] = await Promise.all([
        getCustomers(),
        getProducts(),
        getInvoices(),
      ]);

      const payload = {
        customers: Array.isArray(customersData) ? customersData : [],
        products: Array.isArray(productsData) ? productsData : [],
        invoices: Array.isArray(invoicesRes) ? invoicesRes : [],
      };

      setCustomers(payload.customers);
      setProducts(payload.products);
      setInvoices(payload.invoices);
      await saveAllCache(payload);
    } catch (error) {
      console.error("Invoice data loading error:", error);

      const cachedCustomers = await getCache(CUSTOMERS_CACHE_KEY);
      const cachedProducts = await getCache(PRODUCTS_CACHE_KEY);
      const cachedInvoices = await getCache(INVOICES_CACHE_KEY);

      setCustomers(Array.isArray(cachedCustomers) ? cachedCustomers : []);
      setProducts(Array.isArray(cachedProducts) ? cachedProducts : []);
      setInvoices(Array.isArray(cachedInvoices) ? cachedInvoices : []);

      setOfflineMode(true);
      setLoadError(label.loadedOffline);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [language]);

  useEffect(() => {
    async function loadCustomerLedger() {
      if (!form.customer_id || offlineMode) {
        setSelectedCustomerLedger(null);
        return;
      }

      try {
        const data = await getCustomerLedger(form.customer_id);
        setSelectedCustomerLedger(data?.status === "success" ? data : null);
      } catch {
        setSelectedCustomerLedger(null);
      }
    }

    loadCustomerLedger();
  }, [form.customer_id, offlineMode]);

  const calc = useMemo(() => {
    const subtotal = items.reduce(
      (sum, item) => sum + toNumber(item.quantity) * toNumber(item.unit_price),
      0
    );

    const discountAmount = subtotal * (toNumber(form.discount_percent) / 100);
    const afterDiscount = Math.max(subtotal - discountAmount, 0);
    const taxAmount = afterDiscount * (toNumber(form.tax_percent) / 100);
    const shippingAmount = toNumber(form.shipping_cost);
    const grandTotal = afterDiscount + taxAmount + shippingAmount;

    return { subtotal, discountAmount, taxAmount, shippingAmount, grandTotal };
  }, [items, form.discount_percent, form.tax_percent, form.shipping_cost]);

  function updateItem(index, field, value) {
    const updated = [...items];

    updated[index] = {
      ...updated[index],
      [field]:
        field === "quantity" || field === "unit_price"
          ? normalizeNumberInput(value, fa)
          : value,
    };

    if (field === "product_id") {
      const product = products.find((p) => String(p.id) === String(value));
      const price = product?.sell_price ?? product?.price ?? "";
      updated[index].unit_price = price ? faText(price, fa) : "";
    }

    setItems(updated);
  }

  function addItem() {
    setItems([...items, { ...emptyItem }]);
  }

  function removeItem(index) {
    const next = items.filter((_, i) => i !== index);
    setItems(next.length ? next : [{ ...emptyItem }]);
  }

  function invoiceTypeLabel(type) {
    const map = {
      sale: label.saleInvoice,
      buy: label.buyInvoice,
      proforma: label.proformaInvoice,
      return_sale: label.returnSaleInvoice,
      return_buy: label.returnBuyInvoice,
    };
    return map[type] || type || "-";
  }

  function paymentStatusLabel(status) {
    const map = {
      unpaid: label.unpaid,
      partial: label.partial,
      paid: label.paid,
      final: label.final,
    };
    return map[status] || status || "-";
  }

  function buildCleanItems() {
    return items
      .filter((item) => item.product_id && toNumber(item.quantity) > 0)
      .map((item) => ({
        product_id: Number(item.product_id),
        quantity: toNumber(item.quantity),
        unit_price: toNumber(item.unit_price),
      }));
  }

  function enrichInvoice(baseInvoice, cleanItems, invoiceId) {
    const customer = customers.find(
      (c) => String(c.id) === String(baseInvoice.customer_id || form.customer_id)
    );

    const enrichedItems = cleanItems.map((item) => {
      const product = products.find((p) => Number(p.id) === Number(item.product_id));

      return {
        ...item,
        product_name: product?.name || product?.title || "-",
        total: item.quantity * item.unit_price,
      };
    });

    return {
      id: invoiceId,
      ...baseInvoice,
      invoice_type_label: invoiceTypeLabel(baseInvoice.invoice_type),
      customerName: customer?.name || customer?.full_name || "",
      customer_name: customer?.name || customer?.full_name || "",
      payment_status_label: paymentStatusLabel(baseInvoice.payment_status || baseInvoice.status),
      shipping_cost: toNumber(baseInvoice.shipping_cost),
      total: calc.grandTotal,
      total_amount: calc.grandTotal,
      subtotal: calc.subtotal,
      discount: calc.discountAmount,
      tax: calc.taxAmount,
      items: enrichedItems,
      created_at: baseInvoice.created_at || new Date().toISOString(),
    };
  }

  async function createInvoice() {
    if (!form.customer_id) {
      alert(label.chooseCustomerAlert);
      return;
    }

    const cleanItems = buildCleanItems();

    if (cleanItems.length === 0) {
      alert(label.chooseProductAlert);
      return;
    }

    const payload = {
      invoice_type: form.invoice_type,
      customer_id: Number(form.customer_id),
      items: cleanItems,
      discount_percent: toNumber(form.discount_percent),
      tax_percent: toNumber(form.tax_percent),
      shipping_cost: toNumber(form.shipping_cost),
      payment_status: form.payment_status,
      invoice_note: form.invoice_note,
      qr_enabled: form.qr_enabled,
    };

    try {
      let savedInvoice;

      if (editingId) {
        const res = await axios.put(`${API}/invoices/${editingId}`, payload);
        if (res?.data?.status === "error") throw new Error(res.data.message);
        savedInvoice = enrichInvoice(payload, cleanItems, editingId);
      } else {
        const res = await apiCreateInvoice(payload);
        if (res?.status !== "created") {
          throw new Error(res?.message || label.createError);
        }
        savedInvoice = enrichInvoice(payload, cleanItems, res.invoice_id);
      }

      setCreatedInvoice(savedInvoice);
      setEditingId(null);
      setForm(emptyForm);
      setItems([{ ...emptyItem }]);

      await loadData();
      alert(editingId ? label.saveInvoice : label.createdAlert);
    } catch (error) {
      console.error("Create/update invoice error:", error);

      const offlineId = editingId || Date.now();

      const offlineInvoice = enrichInvoice(
        {
          ...payload,
          id: offlineId,
          status: form.payment_status,
          pending_sync: true,
          offline_created: !editingId,
          offline_updated_at: new Date().toISOString(),
        },
        cleanItems,
        offlineId
      );

      const current = Array.isArray(invoices) ? [...invoices] : [];
      const next = editingId
        ? current.map((inv) =>
            String(inv.id) === String(editingId) ? offlineInvoice : inv
          )
        : [offlineInvoice, ...current];

      setInvoices(next);
      await setCache(INVOICES_CACHE_KEY, next);

      setCreatedInvoice(offlineInvoice);
      setOfflineMode(true);
      setLoadError(label.savedOffline);

      setEditingId(null);
      setForm(emptyForm);
      setItems([{ ...emptyItem }]);
    }
  }

  async function editInvoice(invoice) {
  let fullInvoice = invoice;

  try {
    const res = await axios.get(`${API}/invoices/${invoice.id}`);
    fullInvoice = res?.data || invoice;
  } catch (error) {
    console.warn("Could not load full invoice details:", error);
  }

  const invoiceItems =
    fullInvoice.items ||
    fullInvoice.invoice_items ||
    fullInvoice.lines ||
    fullInvoice.details ||
    [];

  if (!Array.isArray(invoiceItems) || invoiceItems.length === 0) {
    alert(
      fa
        ? "جزئیات کالاهای این فاکتور از بک‌اند برنگشت. باید مسیر GET /invoices/{id} در بک‌اند آیتم‌های فاکتور را هم برگرداند."
        : "Invoice items were not returned from backend."
    );
    return;
  }

  setEditingId(fullInvoice.id);

  setForm({
    invoice_type: fullInvoice.invoice_type || "sale",
    customer_id: String(fullInvoice.customer_id || ""),
    discount_percent: faText(fullInvoice.discount_percent || "", fa),
    tax_percent: faText(fullInvoice.tax_percent || "", fa),
    shipping_cost: faText(fullInvoice.shipping_cost || "", fa),
    payment_status: fullInvoice.payment_status || fullInvoice.status || "unpaid",
    invoice_note: fullInvoice.invoice_note || fullInvoice.note || "",
    qr_enabled: fullInvoice.qr_enabled ?? true,
  });

  setItems(
    invoiceItems.map((it) => ({
      product_id: String(it.product_id || it.product?.id || ""),
      quantity: faText(it.quantity || 0, fa),
      unit_price: faText(it.unit_price || it.price || 0, fa),
    }))
  );

  window.scrollTo({ top: 0, behavior: "smooth" });
}

  async function deleteInvoice(invoice) {
    const ok = window.confirm(
      fa ? `فاکتور شماره ${n(invoice.id)} حذف شود؟` : `Delete invoice #${invoice.id}?`
    );
    if (!ok) return;

    try {
      const res = await axios.delete(`${API}/invoices/${invoice.id}`);

      if (res?.data?.status === "error") {
        throw new Error(res.data.message);
      }

      const next = invoices.filter((inv) => String(inv.id) !== String(invoice.id));
      setInvoices(next);
      await setCache(INVOICES_CACHE_KEY, next);
      await loadData();
    } catch (error) {
      console.error("Delete invoice error:", error);

      const next = invoices.filter((inv) => String(inv.id) !== String(invoice.id));
      setInvoices(next);
      await setCache(INVOICES_CACHE_KEY, next);

      setOfflineMode(true);
      setLoadError(
        fa
          ? "حذف آنلاین انجام نشد؛ فاکتور از حافظه آفلاین حذف شد."
          : "Online delete failed; invoice removed from offline cache."
      );
    }
  }

  function openPrint(invoice) {
    // مهم: چاپ حرفه‌ای باید از صفحه فرانت باز شود تا قالب‌های ذخیره‌شده قابل انتخاب باشند.
    // مسیر بک‌اند /print/invoice فقط خروجی سریع است و Template Studio ندارد.
    window.open(`/invoice-print/${invoice.id}`, "_blank", "noreferrer");
  }

  const selectedCustomerBalance = Number(
    selectedCustomerLedger?.customer?.balance ?? selectedCustomerLedger?.balance ?? 0
  );

  const selectedCustomerProjectedBalance =
    form.invoice_type === "sale"
      ? selectedCustomerBalance + calc.grandTotal
      : form.invoice_type === "buy"
      ? selectedCustomerBalance - calc.grandTotal
      : selectedCustomerBalance;

  const selectedCustomerBalanceStatus =
    selectedCustomerProjectedBalance > 0
      ? fa
        ? "بدهکار"
        : "Debtor"
      : selectedCustomerProjectedBalance < 0
      ? fa
        ? "بستانکار"
        : "Creditor"
      : fa
      ? "تسویه"
      : "Settled";

  return (
    <div dir={dir} className="space-y-6" style={{ direction: dir }}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl font-black text-cyan-300">{label.invoiceSystem}</h1>
          <p className="text-slate-400 mt-2">{label.subtitle}</p>
        </div>

        <button
          type="button"
          onClick={loadData}
          className="px-4 py-3 rounded-2xl bg-slate-800 text-cyan-200 font-bold flex items-center gap-2 border border-cyan-500/20"
        >
          <RefreshCw size={18} />
          {label.refresh}
        </button>
      </div>

      {loadError ? (
        <div
          className={`rounded-2xl p-4 flex items-center gap-2 ${
            offlineMode
              ? "bg-amber-500/15 border border-amber-400/30 text-amber-100"
              : "bg-red-500/15 border border-red-400/30 text-red-200"
          }`}
        >
          <AlertTriangle size={20} />
          {loadError}
        </div>
      ) : null}

      {loading ? (
        <div className="bg-slate-900/60 border border-cyan-500/20 rounded-3xl p-4 text-cyan-200">
          {label.loading}
        </div>
      ) : null}

      <div className="bg-slate-900/60 border border-cyan-500/20 rounded-3xl p-5">
        <div className="flex items-center gap-2 mb-5">
          <ReceiptText className="text-cyan-300" size={24} />
          <h2 className="text-2xl font-black text-cyan-300">
            {editingId ? label.saveInvoice : label.invoiceInfo}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <Field label={label.invoiceType} icon={<ClipboardList size={16} />}>
            <select
              value={form.invoice_type}
              onChange={(e) => setForm({ ...form, invoice_type: e.target.value })}
              className="bg-slate-800 rounded-2xl p-3 outline-none w-full border border-slate-700 focus:border-cyan-400"
            >
              <option value="sale">{label.saleInvoice}</option>
              <option value="buy">{label.buyInvoice}</option>
              <option value="proforma">{label.proformaInvoice}</option>
              <option value="return_sale">{label.returnSaleInvoice}</option>
              <option value="return_buy">{label.returnBuyInvoice}</option>
            </select>
          </Field>

          <Field label={label.customer} icon={<UserRound size={16} />}>
            <select
              value={form.customer_id}
              onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
              className="bg-slate-800 rounded-2xl p-3 outline-none w-full border border-slate-700 focus:border-cyan-400"
            >
              <option value="">{label.selectCustomer}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.full_name || c.title || `#${c.id}`}
                </option>
              ))}
            </select>
            {customers.length === 0 ? (
              <p className="text-xs text-amber-300 mt-2">{label.emptyCustomers}</p>
            ) : null}
          </Field>

          <Field label={label.paymentStatus} icon={<CreditCard size={16} />}>
            <select
              value={form.payment_status}
              onChange={(e) => setForm({ ...form, payment_status: e.target.value })}
              className="bg-slate-800 rounded-2xl p-3 outline-none w-full border border-slate-700 focus:border-cyan-400"
            >
              <option value="unpaid">{label.unpaid}</option>
              <option value="partial">{label.partial}</option>
              <option value="paid">{label.paid}</option>
            </select>
          </Field>

          <Field label={label.shippingCost} hint={label.shippingHint} icon={<Truck size={16} />}>
            <input
              type="text"
              inputMode="numeric"
              value={form.shipping_cost}
              onChange={(e) =>
                setForm({
                  ...form,
                  shipping_cost: normalizeNumberInput(e.target.value, fa),
                })
              }
              className="bg-slate-800 rounded-2xl p-3 outline-none w-full border border-slate-700 focus:border-cyan-400"
              placeholder={fa ? "۰" : "0"}
            />
          </Field>

          <Field label={label.discountPercent} icon={<Percent size={16} />}>
            <input
              type="text"
              inputMode="numeric"
              value={form.discount_percent}
              onChange={(e) =>
                setForm({
                  ...form,
                  discount_percent: normalizeNumberInput(e.target.value, fa),
                })
              }
              className="bg-slate-800 rounded-2xl p-3 outline-none w-full border border-slate-700 focus:border-cyan-400"
              placeholder={fa ? "۰٪" : "0%"}
            />
          </Field>

          <Field label={label.taxPercent} icon={<Calculator size={16} />}>
            <input
              type="text"
              inputMode="numeric"
              value={form.tax_percent}
              onChange={(e) =>
                setForm({
                  ...form,
                  tax_percent: normalizeNumberInput(e.target.value, fa),
                })
              }
              className="bg-slate-800 rounded-2xl p-3 outline-none w-full border border-slate-700 focus:border-cyan-400"
              placeholder={fa ? "۰٪" : "0%"}
            />
          </Field>

          <Field label={label.invoiceQR} hint={label.qrHint} icon={<QrCode size={16} />}>
            <label className="bg-slate-800 rounded-2xl p-3 flex items-center justify-between gap-2 cursor-pointer border border-slate-700">
              <span className="flex items-center gap-2">
                <QrCode size={18} />
                {label.invoiceQR}
              </span>
              <input
                type="checkbox"
                checked={form.qr_enabled}
                onChange={(e) => setForm({ ...form, qr_enabled: e.target.checked })}
              />
            </label>
          </Field>
        </div>

        <div className="flex items-center gap-2 mb-4 mt-4">
          <Package className="text-cyan-300" size={24} />
          <h2 className="text-2xl font-black text-cyan-300">{label.itemsTitle}</h2>
        </div>

        <div className="space-y-4">
          {items.map((item, index) => {
            const rowTotal = toNumber(item.quantity) * toNumber(item.unit_price);

            return (
              <div key={index} className="bg-slate-950/40 rounded-3xl p-4 border border-slate-800">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                  <Field label={`${label.item} ${n(index + 1)}`} icon={<Package size={16} />}>
                    <select
                      value={item.product_id}
                      onChange={(e) => updateItem(index, "product_id", e.target.value)}
                      className="bg-slate-800 rounded-2xl p-3 outline-none w-full border border-slate-700 focus:border-cyan-400"
                    >
                      <option value="">{label.selectProduct}</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name || p.title || `#${p.id}`} | {label.stock}:{" "}
                          {n(p.stock ?? p.quantity ?? 0)}
                        </option>
                      ))}
                    </select>
                    {products.length === 0 ? (
                      <p className="text-xs text-amber-300 mt-2">{label.emptyProducts}</p>
                    ) : null}
                  </Field>

                  <Field label={label.quantity}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, "quantity", e.target.value)}
                      className="bg-slate-800 rounded-2xl p-3 outline-none w-full border border-slate-700 focus:border-cyan-400"
                      placeholder={label.quantity}
                    />
                  </Field>

                  <Field label={label.unitPrice}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={item.unit_price}
                      onChange={(e) => updateItem(index, "unit_price", e.target.value)}
                      className="bg-slate-800 rounded-2xl p-3 outline-none w-full border border-slate-700 focus:border-cyan-400"
                      placeholder={label.unitPrice}
                    />
                  </Field>

                  <Field label={label.rowTotal}>
                    <div className="bg-slate-800 rounded-2xl p-3 min-h-[48px] border border-slate-700 text-cyan-200 font-black">
                      {money(rowTotal)}
                    </div>
                  </Field>

                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="bg-red-500/20 text-red-300 rounded-2xl flex items-center justify-center gap-2 p-3 border border-red-400/20"
                  >
                    <Trash2 size={18} />
                    {label.remove}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <textarea
          value={form.invoice_note}
          onChange={(e) => setForm({ ...form, invoice_note: e.target.value })}
          className="bg-slate-800 rounded-2xl p-3 outline-none w-full mt-5 border border-slate-700 focus:border-cyan-400"
          rows={3}
          placeholder={label.notesPlaceholder}
        />

        <div className="flex items-center justify-between mt-5 gap-4 flex-wrap">
          <button
            type="button"
            onClick={addItem}
            className="px-5 py-3 rounded-2xl bg-slate-800 text-cyan-300 font-bold flex items-center gap-2 border border-cyan-500/20"
          >
            <Plus size={18} />
            {label.addItem}
          </button>

          <div className="text-2xl font-black text-cyan-300">
            {label.grandTotal}: {money(calc.grandTotal)}
          </div>
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            type="button"
            onClick={createInvoice}
            className="mt-5 px-6 py-4 rounded-2xl bg-cyan-400 text-slate-950 font-black flex items-center gap-2"
          >
            {editingId ? <Save size={20} /> : <FileText size={20} />}
            {editingId ? label.saveInvoice : label.createInvoice}
          </button>

          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
                setItems([{ ...emptyItem }]);
              }}
              className="mt-5 px-6 py-4 rounded-2xl bg-slate-700 text-white font-black flex items-center gap-2"
            >
              <X size={20} />
              {label.cancelEdit}
            </button>
          )}
        </div>
      </div>

      <div className="bg-slate-900/60 border border-cyan-500/20 rounded-3xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Calculator className="text-cyan-300" size={24} />
          <h2 className="text-2xl font-black text-cyan-300">{label.summaryTitle}</h2>
        </div>

        <InvoiceSummary
          subtotal={calc.subtotal}
          discount={calc.discountAmount}
          tax={calc.taxAmount}
          shipping={calc.shippingAmount}
          total={calc.grandTotal}
          previousBalance={form.customer_id ? selectedCustomerBalance : null}
          projectedBalance={form.customer_id ? selectedCustomerProjectedBalance : null}
          balanceStatus={selectedCustomerBalanceStatus}
        />
      </div>

      <InvoicePrint invoice={createdInvoice} />

      <div className="bg-slate-900/60 border border-cyan-500/20 rounded-3xl p-5">
        <h2 className="text-2xl font-black text-cyan-300 mb-4">{label.invoicesList}</h2>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="text-cyan-300 text-sm border-b border-slate-800">
                <th className="text-start py-3">{label.id}</th>
                <th className="text-start py-3">{label.invoiceType}</th>
                <th className="text-start py-3">{label.customer}</th>
                <th className="text-start py-3">{label.total}</th>
                <th className="text-start py-3">{label.status}</th>
                <th className="text-start py-3">{fa ? "عملیات" : "Actions"}</th>
              </tr>
            </thead>

            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td className="py-6 text-slate-400 text-center" colSpan={6}>
                    {label.noInvoices}
                  </td>
                </tr>
              ) : (
                invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-t border-slate-800">
                    <td className="py-4">
                      #{n(invoice.id)}
                      {invoice.pending_sync && (
                        <span className="mx-2 text-xs text-amber-300">{label.offline}</span>
                      )}
                    </td>
                    <td>{invoiceTypeLabel(invoice.invoice_type)}</td>
                    <td>
                      {customers.find((c) => Number(c.id) === Number(invoice.customer_id))?.name ||
                        invoice.customer_name ||
                        invoice.customerName ||
                        invoice.customer_id ||
                        "-"}
                    </td>
                    <td>{money(invoice.total_amount || invoice.total || 0)}</td>
                    <td>
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-emerald-500/15 text-emerald-300">
                        <CheckCircle2 size={15} />
                        {paymentStatusLabel(invoice.payment_status || invoice.status)}
                      </span>
                    </td>
                    <td>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => openPrint(invoice)}
                          className="px-3 py-2 rounded-xl bg-cyan-400 text-slate-950 font-bold inline-flex items-center gap-2"
                        >
                          <Printer size={16} />
                          {label.printInvoice}
                        </button>

                        <button
                          type="button"
                          onClick={() => editInvoice(invoice)}
                          className="px-3 py-2 rounded-xl bg-blue-500/20 text-blue-200 font-bold inline-flex items-center gap-2"
                        >
                          <Edit3 size={16} />
                          {label.edit}
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteInvoice(invoice)}
                          className="px-3 py-2 rounded-xl bg-red-500/20 text-red-300 font-bold inline-flex items-center gap-2"
                        >
                          <Trash2 size={16} />
                          {label.delete}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}