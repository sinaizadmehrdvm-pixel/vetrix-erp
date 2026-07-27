import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useStableCallback } from "../hooks/useStableCallback";
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
  Clock,
  RefreshCw,
  Edit3,
  Save,
  X,
  ScanBarcode,
  FileCheck2,
} from "lucide-react";

import {
  getCustomers,
  getProducts,
  getInvoices,
  getInvoice,
  createInvoice as apiCreateInvoice,
  updateInvoice as apiUpdateInvoice,
  deleteInvoice as apiDeleteInvoice,
  getCustomerLedger,
  getPriceQuote,
  lookupProductByCode,
  requestInvoicePaymentLink,
  submitInvoiceEinvoice,
  getWarehouses,
} from "../services/api";
import toast from "react-hot-toast";
import BarcodeScannerModal from "../components/BarcodeScannerModal";

import { useLanguage } from "../localization/useLanguage";
import InvoiceSummary from "../invoice/InvoiceSummary";
import InvoicePrint from "../invoice/InvoicePrint";
import { getCache, setCache } from "../storage/db";
import { countPending, syncPendingRecords, useOnlineSync } from "../storage/offlineSync";
import { toPersianDigits, toEnglishDigits } from "../localization/helpers";
import Button from "../components/ui/Button";
import IconButton from "../components/ui/IconButton";
import Notice from "../components/ui/Notice";
import Badge from "../components/ui/Badge";
import { Table, Thead, Tbody, Tr, Th, Td, EmptyRow } from "../components/ui/Table";


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

function faText(value, language) {
  if (value === null || value === undefined) return "";
  return language === "fa" ? toPersianDigits(String(value)) : String(value);
}

function normalizeNumberInput(value, language) {
  const cleaned = toEnglishDigits(String(value || ""))
    .replace(/[,،]/g, "")
    .replace(/[^\d.-]/g, "");
  return language === "fa" ? toPersianDigits(cleaned) : cleaned;
}

function Field({ label, hint, icon, children }) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-bold text-[var(--erp-accent)]">
        {icon}
        <span>{label}</span>
      </label>
      {children}
      {hint ? <p className="text-xs text-[var(--erp-muted)]">{hint}</p> : null}
    </div>
  );
}

export default function Invoices() {
  const { language, dir, n, money } = useLanguage();
  const fa = language === "fa";
  const location = useLocation();
  const navigate = useNavigate();

  const label = {
    invoiceSystem: fa ? "سیستم فاکتور حرفه‌ای" : language === "ar" ? "نظام الفواتير الاحترافي" : language === "tr" ? "Profesyonel Fatura Sistemi" : "Professional Invoice System",
    subtitle: fa
      ? "ثبت فاکتور فروش، خرید، پیش‌فاکتور، مرجوعی، مالیات، تخفیف، حمل، QR و چاپ حرفه‌ای"
      : language === "ar"
      ? "إنشاء فواتير بيع وشراء وفواتير أولية ومرتجعات، مع الضريبة والخصم والشحن ورمز QR وطباعة احترافية"
      : language === "tr"
      ? "Satış, alış, proforma ve iade faturaları oluşturun; vergi, indirim, kargo, QR kod ve profesyonel yazdırma desteğiyle"
      : "Create sales, purchase, proforma, returns, tax, discount, shipping, QR and professional print",
    invoiceInfo: fa ? "اطلاعات اصلی فاکتور" : language === "ar" ? "المعلومات الأساسية للفاتورة" : language === "tr" ? "Fatura Temel Bilgileri" : "Main invoice information",
    invoiceType: fa ? "نوع فاکتور" : language === "ar" ? "نوع الفاتورة" : language === "tr" ? "Fatura Türü" : "Invoice type",
    customer: fa ? "طرف حساب / مشتری" : language === "ar" ? "الطرف / العميل" : language === "tr" ? "Cari / Müşteri" : "Customer / Account",
    selectCustomer: fa ? "طرف حساب را انتخاب کن" : language === "ar" ? "اختر الطرف" : language === "tr" ? "Cari Seç" : "Select customer",
    paymentStatus: fa ? "وضعیت پرداخت" : language === "ar" ? "حالة السداد" : language === "tr" ? "Ödeme Durumu" : "Payment status",
    unpaid: fa ? "پرداخت نشده" : language === "ar" ? "غير مسدد" : language === "tr" ? "Ödenmedi" : "Unpaid",
    partial: fa ? "پرداخت جزئی" : language === "ar" ? "مسدد جزئيًا" : language === "tr" ? "Kısmi Ödendi" : "Partial",
    paid: fa ? "تسویه شده" : language === "ar" ? "مسدد" : language === "tr" ? "Ödendi" : "Paid",
    shippingCost: fa ? "هزینه حمل" : language === "ar" ? "تكلفة الشحن" : language === "tr" ? "Kargo Ücreti" : "Shipping cost",
    shippingHint: fa ? "اگر هزینه حمل نداری خالی بگذار" : language === "ar" ? "اتركه فارغًا إذا لم تكن هناك تكلفة شحن" : language === "tr" ? "Kargo ücreti yoksa boş bırakın" : "Leave blank if there is no shipping cost",
    discountPercent: fa ? "درصد تخفیف" : language === "ar" ? "نسبة الخصم" : language === "tr" ? "İskonto Oranı" : "Discount percent",
    taxPercent: fa ? "درصد مالیات" : language === "ar" ? "نسبة الضريبة" : language === "tr" ? "Vergi Oranı" : "Tax percent",
    invoiceQR: fa ? "QR فاکتور فعال باشد" : language === "ar" ? "تفعيل رمز QR للفاتورة" : language === "tr" ? "Fatura QR Kodunu Etkinleştir" : "Enable invoice QR",
    qrHint: fa ? "برای چاپ و رهگیری فاکتور استفاده می‌شود" : language === "ar" ? "يُستخدم لطباعة الفاتورة وتتبعها" : language === "tr" ? "Fatura yazdırma ve takibi için kullanılır" : "Used for invoice print and tracking",
    itemsTitle: fa ? "ردیف‌های کالا / خدمات" : language === "ar" ? "بنود الأصناف / الخدمات" : language === "tr" ? "Ürün / Hizmet Kalemleri" : "Items / Services rows",
    item: fa ? "کالا / خدمات" : language === "ar" ? "الصنف / الخدمة" : language === "tr" ? "Kalem / Hizmet" : "Item / Service",
    selectProduct: fa ? "کالا را انتخاب کن" : language === "ar" ? "اختر المنتج" : language === "tr" ? "Ürün Seç" : "Select product",
    quantity: fa ? "تعداد" : language === "ar" ? "الكمية" : language === "tr" ? "Miktar" : "Quantity",
    unitPrice: fa ? "قیمت واحد" : language === "ar" ? "سعر الوحدة" : language === "tr" ? "Birim Fiyat" : "Unit price",
    rowTotal: fa ? "جمع ردیف" : language === "ar" ? "إجمالي البند" : language === "tr" ? "Satır Toplamı" : "Row total",
    remove: fa ? "حذف ردیف" : language === "ar" ? "حذف البند" : language === "tr" ? "Satırı Kaldır" : "Remove row",
    addItem: fa ? "افزودن ردیف جدید" : language === "ar" ? "إضافة بند جديد" : language === "tr" ? "Yeni Kalem Ekle" : "Add new row",
    notesPlaceholder: fa
      ? "توضیحات تکمیلی، شرایط پرداخت، آدرس ارسال یا هر نکته مهم..."
      : language === "ar"
      ? "ملاحظات إضافية، شروط الدفع، عنوان التسليم أو أي تفاصيل مهمة..."
      : language === "tr"
      ? "Ek notlar, ödeme koşulları, teslimat adresi veya diğer önemli bilgiler..."
      : "Extra notes...",
    createInvoice: fa ? "ثبت فاکتور" : language === "ar" ? "إنشاء فاتورة" : language === "tr" ? "Fatura Oluştur" : "Create invoice",
    saveInvoice: fa ? "ذخیره ویرایش فاکتور" : language === "ar" ? "حفظ تعديل الفاتورة" : language === "tr" ? "Fatura Düzenlemesini Kaydet" : "Save invoice edit",
    cancelEdit: fa ? "لغو ویرایش" : language === "ar" ? "إلغاء التعديل" : language === "tr" ? "Düzenlemeyi İptal Et" : "Cancel edit",
    refresh: fa ? "به‌روزرسانی اطلاعات" : language === "ar" ? "تحديث البيانات" : language === "tr" ? "Verileri Yenile" : "Refresh data",
    grandTotal: fa ? "مبلغ نهایی" : language === "ar" ? "المبلغ الإجمالي" : language === "tr" ? "Genel Toplam" : "Grand total",
    summaryTitle: fa ? "خلاصه مالی فاکتور" : language === "ar" ? "الملخص المالي للفاتورة" : language === "tr" ? "Fatura Mali Özeti" : "Invoice financial summary",
    invoicesList: fa ? "لیست فاکتورها" : language === "ar" ? "قائمة الفواتير" : language === "tr" ? "Fatura Listesi" : "Invoices list",
    id: fa ? "شناسه" : language === "ar" ? "الرقم" : language === "tr" ? "No" : "ID",
    total: fa ? "مبلغ کل" : language === "ar" ? "الإجمالي" : language === "tr" ? "Toplam" : "Total",
    status: fa ? "وضعیت" : language === "ar" ? "الحالة" : language === "tr" ? "Durum" : "Status",
    printInvoice: fa ? "چاپ فاکتور" : language === "ar" ? "طباعة الفاتورة" : language === "tr" ? "Faturayı Yazdır" : "Print invoice",
    edit: fa ? "ویرایش" : language === "ar" ? "تعديل" : language === "tr" ? "Düzenle" : "Edit",
    delete: fa ? "حذف" : language === "ar" ? "حذف" : language === "tr" ? "Sil" : "Delete",
    final: fa ? "نهایی" : language === "ar" ? "نهائي" : language === "tr" ? "Kesin" : "Final",
    emptyCustomers: fa ? "ابتدا از بخش طرف‌حساب‌ها مشتری تعریف کن" : language === "ar" ? "أنشئ عميلًا أولاً من قسم الأطراف" : language === "tr" ? "Önce Cariler bölümünden bir müşteri oluşturun" : "Create a customer first",
    emptyProducts: fa ? "ابتدا از بخش کالاها، کالا تعریف کن" : language === "ar" ? "أنشئ منتجًا أولاً من قسم المنتجات" : language === "tr" ? "Önce Ürünler bölümünden bir ürün oluşturun" : "Create a product first",
    noInvoices: fa ? "هنوز فاکتوری ثبت نشده است" : language === "ar" ? "لا توجد فواتير مسجلة بعد" : language === "tr" ? "Henüz fatura oluşturulmadı" : "No invoice has been created yet",
    loading: fa ? "در حال دریافت اطلاعات..." : language === "ar" ? "جارٍ تحميل البيانات..." : language === "tr" ? "Veriler yükleniyor..." : "Loading data...",
    chooseCustomerAlert: fa ? "لطفاً طرف حساب را انتخاب کن" : language === "ar" ? "الرجاء اختيار الطرف" : language === "tr" ? "Lütfen bir cari seçin" : "Please select customer",
    chooseProductAlert: fa ? "حداقل یک کالا با تعداد معتبر انتخاب کن" : language === "ar" ? "أضف صنفًا واحدًا على الأقل بكمية صحيحة" : language === "tr" ? "Lütfen geçerli miktarda en az bir ürün ekleyin" : "Please add at least one valid product",
    createdAlert: fa ? "فاکتور با موفقیت ثبت شد" : language === "ar" ? "تم إنشاء الفاتورة بنجاح" : language === "tr" ? "Fatura başarıyla oluşturuldu" : "Invoice created successfully",
    savedOffline: fa
      ? "سرور در دسترس نبود؛ فاکتور در حافظه آفلاین ذخیره شد."
      : language === "ar"
      ? "تعذّر الاتصال بالخادم؛ تم حفظ الفاتورة في الذاكرة المؤقتة غير المتصلة."
      : language === "tr"
      ? "Sunucuya ulaşılamadı; fatura çevrimdışı olarak kaydedildi."
      : "Server unavailable; invoice saved offline.",
    loadedOffline: fa
      ? "اتصال به سرور برقرار نشد؛ اطلاعات فاکتورها از حافظه آفلاین نمایش داده شد."
      : language === "ar"
      ? "تعذّر الاتصال بالخادم؛ تم عرض بيانات الفواتير من الذاكرة المؤقتة غير المتصلة."
      : language === "tr"
      ? "Sunucuya bağlanılamadı; faturalar çevrimdışı önbellekten yüklendi."
      : "Server unavailable; invoices loaded from offline cache.",
    createError: fa ? "خطا در ثبت فاکتور" : language === "ar" ? "خطأ في إنشاء الفاتورة" : language === "tr" ? "Fatura oluşturulurken hata oluştu" : "Error creating invoice",
    saleInvoice: fa ? "فاکتور فروش" : language === "ar" ? "فاتورة مبيعات" : language === "tr" ? "Satış Faturası" : "Sales invoice",
    buyInvoice: fa ? "فاکتور خرید" : language === "ar" ? "فاتورة مشتريات" : language === "tr" ? "Alış Faturası" : "Purchase invoice",
    proformaInvoice: fa ? "پیش‌فاکتور" : language === "ar" ? "فاتورة أولية" : language === "tr" ? "Proforma Fatura" : "Proforma invoice",
    returnSaleInvoice: fa ? "برگشت از فروش" : language === "ar" ? "مرتجع مبيعات" : language === "tr" ? "Satış İadesi" : "Sales return",
    returnBuyInvoice: fa ? "برگشت از خرید" : language === "ar" ? "مرتجع مشتريات" : language === "tr" ? "Alış İadesi" : "Purchase return",
    stock: fa ? "موجودی" : language === "ar" ? "المخزون" : language === "tr" ? "Stok" : "Stock",
    offline: fa ? "آفلاین" : language === "ar" ? "غير متصل" : language === "tr" ? "Çevrimdışı" : "Offline",
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
    warehouse_id: "",
  };

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [createdInvoice, setCreatedInvoice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [offlineMode, setOfflineMode] = useState(false);
  const [selectedCustomerLedger, setSelectedCustomerLedger] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [scannerOpen, setScannerOpen] = useState(false);
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

  const stableLoadData = useStableCallback(loadData);

  useEffect(() => {
    const timer = setTimeout(() => { void stableLoadData(); }, 0);
    return () => clearTimeout(timer);
  }, [language, stableLoadData]);

  // Warehouses are optional - if the request fails (e.g. offline) the
  // selector below just doesn't render, same as any pre-existing invoice.
  useEffect(() => {
    const timer = setTimeout(() => {
      getWarehouses()
        .then((data) => setWarehouses(data.items || []))
        .catch(() => {});
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Hand-off from an approved "sale invoice draft" voice change request
  // (ChangeRequestCenter) - prefill the form once products are loaded, then
  // clear the navigation state so a refresh/back doesn't reapply it.
  useEffect(() => {
    const prefill = location.state;
    if (!prefill?.prefillItems?.length || products.length === 0) return;
    const timer = setTimeout(() => {
      setForm((current) => ({ ...current, customer_id: String(prefill.prefillCustomerId || "") }));
      setItems(
        prefill.prefillItems.map((entry) => {
          const product = products.find((p) => String(p.id) === String(entry.product_id));
          return {
            product_id: String(entry.product_id),
            quantity: faText(entry.quantity, fa),
            unit_price: faText(product?.sell_price || product?.price || 0, fa),
          };
        })
      );
      navigate(location.pathname, { replace: true, state: null });
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

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
          ? normalizeNumberInput(value, language)
          : value,
    };

    if (field === "product_id") {
      const product = products.find((p) => String(p.id) === String(value));
      const price = product?.sell_price ?? product?.price ?? "";
      updated[index].unit_price = price ? faText(price, language) : "";
    }

    setItems(updated);

    if ((field === "product_id" || field === "quantity") && form.invoice_type === "sale") {
      const productId = field === "product_id" ? value : updated[index].product_id;
      const quantity = toNumber(field === "quantity" ? value : updated[index].quantity);
      if (productId && quantity > 0) {
        void applyPriceQuote(index, productId, quantity);
      }
    }
  }

  async function applyPriceQuote(index, productId, quantity) {
    try {
      const quote = await getPriceQuote(productId, quantity, form.customer_id || undefined);
      if (!quote?.tier_applied) return;
      setItems((current) => {
        if (!current[index] || String(current[index].product_id) !== String(productId)) return current;
        const next = [...current];
        next[index] = { ...next[index], unit_price: faText(quote.unit_price, fa) };
        return next;
      });
    } catch {
      // Keep whatever price is already shown; this is a suggestion, not a requirement.
    }
  }

  function addItem() {
    setItems([...items, { ...emptyItem }]);
  }

  async function handleBarcodeDetected(code) {
    setScannerOpen(false);
    try {
      const result = await lookupProductByCode(code);
      if (result.status !== "found") {
        toast.error(fa ? "کالایی با این بارکد پیدا نشد." : language === "ar" ? "لم يتم العثور على منتج بهذا الباركود." : language === "tr" ? "Bu barkoda ait ürün bulunamadı." : "No product found for that barcode.");
        return;
      }
      const product = result.product;
      const newItem = {
        product_id: String(product.id),
        quantity: faText(1, fa),
        unit_price: faText(product.sell_price || product.price || 0, fa),
      };
      const nextIndex = items.length;
      setItems([...items, newItem]);
      toast.success(fa ? `${product.name} اضافه شد.` : `${product.name} added.`);
      if (form.invoice_type === "sale") {
        void applyPriceQuote(nextIndex, product.id, 1);
      }
    } catch (err) {
      toast.error(err.message || (fa ? "خطا در جستجوی بارکد" : language === "ar" ? "خطأ في البحث عن الباركود" : language === "tr" ? "Barkod arama başarısız oldu" : "Barcode lookup failed"));
    }
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

  function paymentStatusStyle(status) {
    if (status === "paid" || status === "final") {
      return { tone: "success", Icon: CheckCircle2 };
    }
    if (status === "partial") {
      return { tone: "warning", Icon: Clock };
    }
    return { tone: "danger", Icon: AlertTriangle };
  }

  function buildCleanItems() {
    return items
      .filter((item) => item.product_id && toNumber(item.quantity) > 0)
      .map((item) => ({
        product_id: Number(item.product_id),
        quantity: toNumber(item.quantity),
        unit_price: toNumber(item.unit_price),
        warehouse_id: item.warehouse_id ? Number(item.warehouse_id) : null,
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

  function computeInvoiceTotals(cleanItems, { discount_percent, tax_percent, shipping_cost }) {
    const subtotal = cleanItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
    const discountAmount = subtotal * (toNumber(discount_percent) / 100);
    const afterDiscount = Math.max(subtotal - discountAmount, 0);
    const taxAmount = afterDiscount * (toNumber(tax_percent) / 100);
    const shippingAmount = toNumber(shipping_cost);
    return { subtotal, discountAmount, taxAmount, grandTotal: afterDiscount + taxAmount + shippingAmount };
  }

  function extractInvoicePayload(item) {
    return {
      invoice_type: item.invoice_type,
      customer_id: Number(item.customer_id),
      items: (item.items || []).map((line) => ({
        product_id: Number(line.product_id),
        quantity: toNumber(line.quantity),
        unit_price: toNumber(line.unit_price),
      })),
      discount_percent: toNumber(item.discount_percent),
      tax_percent: toNumber(item.tax_percent),
      shipping_cost: toNumber(item.shipping_cost),
      payment_status: item.payment_status,
      invoice_note: item.invoice_note,
      qr_enabled: item.qr_enabled,
    };
  }

  function buildSyncedInvoice(item, serverResult, payload) {
    const customer = customers.find((c) => String(c.id) === String(payload.customer_id));
    const totals = computeInvoiceTotals(payload.items, payload);
    const enrichedItems = payload.items.map((line) => {
      const product = products.find((p) => Number(p.id) === Number(line.product_id));
      return { ...line, product_name: product?.name || product?.title || "-", total: line.quantity * line.unit_price };
    });
    return {
      ...item,
      ...payload,
      id: item.offline_created ? serverResult.invoice_id : item.id,
      invoice_type_label: invoiceTypeLabel(payload.invoice_type),
      customerName: customer?.name || customer?.full_name || "",
      customer_name: customer?.name || customer?.full_name || "",
      payment_status_label: paymentStatusLabel(payload.payment_status),
      total: totals.grandTotal,
      total_amount: totals.grandTotal,
      subtotal: totals.subtotal,
      discount: totals.discountAmount,
      tax: totals.taxAmount,
      items: enrichedItems,
      pending_sync: false,
      offline_created: false,
    };
  }

  async function createInvoiceForSync(payload) {
    const res = await apiCreateInvoice(payload);
    if (res?.status !== "created") throw new Error(res?.message || "sync failed");
    return res;
  }

  async function updateInvoiceForSync(id, payload) {
    const res = await apiUpdateInvoice(id, payload);
    if (res?.status === "error") throw new Error(res.message);
    return res;
  }

  async function syncPendingInvoices() {
    if (countPending(invoices) === 0) return;
    const { items: updated, syncedCount } = await syncPendingRecords(invoices, {
      extractPayload: extractInvoicePayload,
      create: createInvoiceForSync,
      update: updateInvoiceForSync,
      mergeResult: buildSyncedInvoice,
    });
    setInvoices(updated);
    await setCache(INVOICES_CACHE_KEY, updated);
    if (syncedCount > 0) {
      toast.success(
        fa ? `${toPersianDigits(syncedCount)} فاکتور آفلاین همگام‌سازی شد.` : `${syncedCount} offline invoice(s) synced.`
      );
      if (countPending(updated) === 0) setLoadError("");
    }
  }

  useOnlineSync(syncPendingInvoices);

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
        const result = await apiUpdateInvoice(editingId, payload);
        if (result?.status === "error") throw new Error(result.message);
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
    const result = await getInvoice(invoice.id);
    fullInvoice = result || invoice;
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
        : language === "ar"
        ? "لم يتم إرجاع بنود هذه الفاتورة من الخادم. يجب أن يُعيد مسار GET /invoices/{id} بنود الفاتورة أيضًا."
        : language === "tr"
        ? "Bu faturanın kalemleri sunucudan alınamadı. Backend'deki GET /invoices/{id} uç noktası fatura kalemlerini de döndürmelidir."
        : "Invoice items were not returned from backend."
    );
    return;
  }

  setEditingId(fullInvoice.id);

  setForm({
    invoice_type: fullInvoice.invoice_type || "sale",
    customer_id: String(fullInvoice.customer_id || ""),
    discount_percent: faText(fullInvoice.discount_percent || "", language),
    tax_percent: faText(fullInvoice.tax_percent || "", language),
    shipping_cost: faText(fullInvoice.shipping_cost || "", language),
    payment_status: fullInvoice.payment_status || fullInvoice.status || "unpaid",
    invoice_note: fullInvoice.invoice_note || fullInvoice.note || "",
    qr_enabled: fullInvoice.qr_enabled ?? true,
  });

  setItems(
    invoiceItems.map((it) => ({
      product_id: String(it.product_id || it.product?.id || ""),
      quantity: faText(it.quantity || 0, language),
      unit_price: faText(it.unit_price || it.price || 0, language),
      warehouse_id: it.warehouse_id ? String(it.warehouse_id) : "",
    }))
  );

  window.scrollTo({ top: 0, behavior: "smooth" });
}

  async function deleteInvoice(invoice) {
    const ok = window.confirm(
      fa
        ? `فاکتور شماره ${n(invoice.id)} حذف شود؟`
        : language === "ar"
        ? `هل تريد حذف الفاتورة رقم ${n(invoice.id)}؟`
        : language === "tr"
        ? `${n(invoice.id)} numaralı fatura silinsin mi?`
        : `Delete invoice #${invoice.id}?`
    );
    if (!ok) return;

    try {
      const result = await apiDeleteInvoice(invoice.id);

      if (result?.status === "error") {
        throw new Error(result.message);
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
          : language === "ar"
          ? "فشل الحذف عبر الخادم؛ تم حذف الفاتورة من الذاكرة المؤقتة غير المتصلة."
          : language === "tr"
          ? "Çevrimiçi silme başarısız oldu; fatura çevrimdışı önbellekten kaldırıldı."
          : "Online delete failed; invoice removed from offline cache."
      );
    }
  }

  function openPrint(invoice) {
    // مهم: چاپ حرفه‌ای باید از صفحه فرانت باز شود تا قالب‌های ذخیره‌شده قابل انتخاب باشند.
    // مسیر بک‌اند /print/invoice فقط خروجی سریع است و Template Studio ندارد.
    window.open(`/invoice-print/${invoice.id}`, "_blank", "noreferrer");
  }

  async function getPaymentLink(invoice) {
    try {
      const result = await requestInvoicePaymentLink(invoice.id);
      await navigator.clipboard.writeText(result.redirect_url);
      toast.success(
        fa ? "لینک پرداخت کپی شد." : language === "ar" ? "تم نسخ رابط الدفع." : language === "tr" ? "Ödeme bağlantısı panoya kopyalandı." : "Payment link copied to clipboard."
      );
    } catch (error) {
      toast.error(error.message);
    }
  }

  async function submitEinvoice(invoice) {
    try {
      const result = await submitInvoiceEinvoice(invoice.id);
      toast.success(
        fa
          ? `فاکتور ثبت شد. کد مرجع: ${result.tax_reference}`
          : `Submitted. Tax reference: ${result.tax_reference}`
      );
    } catch (error) {
      toast.error(error.message);
    }
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
        : language === "ar"
        ? "مدين"
        : language === "tr"
        ? "Borçlu"
        : "Debtor"
      : selectedCustomerProjectedBalance < 0
      ? fa
        ? "بستانکار"
        : language === "ar"
        ? "دائن"
        : language === "tr"
        ? "Alacaklı"
        : "Creditor"
      : fa
      ? "تسویه"
      : language === "ar"
      ? "مسدد"
      : language === "tr"
      ? "Kapandı"
      : "Settled";

  return (
    <div dir={dir} className="space-y-6" style={{ direction: dir }}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl font-black text-[var(--erp-accent)]">{label.invoiceSystem}</h1>
          <p className="text-[var(--erp-muted)] mt-2">{label.subtitle}</p>
        </div>

        <Button variant="secondary" icon={RefreshCw} onClick={loadData}>
          {label.refresh}
        </Button>
      </div>

      {loadError ? (
        <Notice tone={offlineMode ? "warning" : "danger"} className="flex items-center gap-2">
          <AlertTriangle size={20} />
          {loadError}
        </Notice>
      ) : null}

      {countPending(invoices) > 0 ? (
        <Notice tone="warning" className="flex flex-wrap items-center justify-between gap-3">
          <span>
            {fa
              ? `${toPersianDigits(countPending(invoices))} فاکتور آفلاین در انتظار همگام‌سازی است.`
              : `${countPending(invoices)} offline invoice(s) waiting to sync.`}
          </span>
          <Button variant="primary" size="sm" icon={RefreshCw} onClick={() => void syncPendingInvoices()}>
            {fa ? "همگام‌سازی الان" : language === "ar" ? "مزامنة الآن" : language === "tr" ? "Şimdi senkronize et" : "Sync now"}
          </Button>
        </Notice>
      ) : null}

      {loading ? (
        <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-[var(--erp-radius-lg)] p-4 text-[var(--erp-accent)]">
          {label.loading}
        </div>
      ) : null}

      <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-[var(--erp-radius-lg)] p-5">
        <div className="flex items-center gap-2 mb-5">
          <ReceiptText className="text-[var(--erp-accent)]" size={24} />
          <h2 className="text-2xl font-black text-[var(--erp-accent)]">
            {editingId ? label.saveInvoice : label.invoiceInfo}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <Field label={label.invoiceType} icon={<ClipboardList size={16} />}>
            <select
              value={form.invoice_type}
              onChange={(e) => setForm({ ...form, invoice_type: e.target.value })}
              className="bg-[var(--erp-panel-solid)] rounded-[var(--erp-radius-md)] p-3 outline-none w-full border border-[var(--erp-border)] focus:border-cyan-400"
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
              className="bg-[var(--erp-panel-solid)] rounded-[var(--erp-radius-md)] p-3 outline-none w-full border border-[var(--erp-border)] focus:border-cyan-400"
            >
              <option value="">{label.selectCustomer}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.full_name || c.title || `#${c.id}`}
                </option>
              ))}
            </select>
            {customers.length === 0 ? (
              <p className="text-xs mt-2" style={{ color: "var(--erp-warning)" }}>{label.emptyCustomers}</p>
            ) : null}
          </Field>

          <Field label={label.paymentStatus} icon={<CreditCard size={16} />}>
            <select
              value={form.payment_status}
              onChange={(e) => setForm({ ...form, payment_status: e.target.value })}
              className="bg-[var(--erp-panel-solid)] rounded-[var(--erp-radius-md)] p-3 outline-none w-full border border-[var(--erp-border)] focus:border-cyan-400"
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
                  shipping_cost: normalizeNumberInput(e.target.value, language),
                })
              }
              className="bg-[var(--erp-panel-solid)] rounded-[var(--erp-radius-md)] p-3 outline-none w-full border border-[var(--erp-border)] focus:border-cyan-400"
              placeholder={fa ? "۰" : language === "ar" ? "0" : language === "tr" ? "0" : "0"}
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
                  discount_percent: normalizeNumberInput(e.target.value, language),
                })
              }
              className="bg-[var(--erp-panel-solid)] rounded-[var(--erp-radius-md)] p-3 outline-none w-full border border-[var(--erp-border)] focus:border-cyan-400"
              placeholder={fa ? "۰٪" : language === "tr" ? "%0" : "0%"}
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
                  tax_percent: normalizeNumberInput(e.target.value, language),
                })
              }
              className="bg-[var(--erp-panel-solid)] rounded-[var(--erp-radius-md)] p-3 outline-none w-full border border-[var(--erp-border)] focus:border-cyan-400"
              placeholder={fa ? "۰٪" : language === "tr" ? "%0" : "0%"}
            />
          </Field>

          <Field label={label.invoiceQR} hint={label.qrHint} icon={<QrCode size={16} />}>
            <label className="bg-[var(--erp-panel-solid)] rounded-[var(--erp-radius-md)] p-3 flex items-center justify-between gap-2 cursor-pointer border border-[var(--erp-border)]">
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
          <Package className="text-[var(--erp-accent)]" size={24} />
          <h2 className="text-2xl font-black text-[var(--erp-accent)]">{label.itemsTitle}</h2>
        </div>

        <div className="space-y-4">
          {items.map((item, index) => {
            const rowTotal = toNumber(item.quantity) * toNumber(item.unit_price);

            return (
              <div key={index} className="bg-[var(--erp-panel)] rounded-[var(--erp-radius-lg)] p-4 border border-[var(--erp-border)]">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                  <Field label={`${label.item} ${n(index + 1)}`} icon={<Package size={16} />}>
                    <select
                      value={item.product_id}
                      onChange={(e) => updateItem(index, "product_id", e.target.value)}
                      className="bg-[var(--erp-panel-solid)] rounded-[var(--erp-radius-md)] p-3 outline-none w-full border border-[var(--erp-border)] focus:border-cyan-400"
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
                      <p className="text-xs mt-2" style={{ color: "var(--erp-warning)" }}>{label.emptyProducts}</p>
                    ) : null}
                  </Field>

                  <Field label={label.quantity}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, "quantity", e.target.value)}
                      className="bg-[var(--erp-panel-solid)] rounded-[var(--erp-radius-md)] p-3 outline-none w-full border border-[var(--erp-border)] focus:border-cyan-400"
                      placeholder={label.quantity}
                    />
                  </Field>

                  <Field label={label.unitPrice}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={item.unit_price}
                      onChange={(e) => updateItem(index, "unit_price", e.target.value)}
                      className="bg-[var(--erp-panel-solid)] rounded-[var(--erp-radius-md)] p-3 outline-none w-full border border-[var(--erp-border)] focus:border-cyan-400"
                      placeholder={label.unitPrice}
                    />
                  </Field>

                  <Field label={label.rowTotal}>
                    <div className="bg-[var(--erp-panel-solid)] rounded-[var(--erp-radius-md)] p-3 min-h-[48px] border border-[var(--erp-border)] text-[var(--erp-accent)] font-black">
                      {money(rowTotal)}
                    </div>
                  </Field>

                  <Button variant="danger" icon={Trash2} onClick={() => removeItem(index)}>
                    {label.remove}
                  </Button>
                </div>

                {warehouses.length > 1 && (
                  <div className="mt-3">
                    <Field label={fa ? "انبار/شعبه (اختیاری)" : language === "ar" ? "المستودع/الفرع (اختياري)" : language === "tr" ? "Depo/Şube (opsiyonel)" : "Warehouse (optional)"}>
                      <select
                        value={item.warehouse_id}
                        onChange={(e) => updateItem(index, "warehouse_id", e.target.value)}
                        className="bg-[var(--erp-panel-solid)] rounded-[var(--erp-radius-md)] p-3 outline-none w-full border border-[var(--erp-border)] focus:border-cyan-400"
                      >
                        <option value="">{fa ? "مشخص نشده" : language === "ar" ? "غير محدد" : language === "tr" ? "Belirtilmedi" : "Unspecified"}</option>
                        {warehouses.filter((w) => w.active).map((w) => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <textarea
          value={form.invoice_note}
          onChange={(e) => setForm({ ...form, invoice_note: faText(e.target.value, language) })}
          className="bg-[var(--erp-panel-solid)] rounded-[var(--erp-radius-md)] p-3 outline-none w-full mt-5 border border-[var(--erp-border)] focus:border-cyan-400"
          rows={3}
          placeholder={label.notesPlaceholder}
        />

        <div className="flex items-center justify-between mt-5 gap-4 flex-wrap">
          <div className="flex gap-2">
            <Button variant="secondary" icon={Plus} onClick={addItem}>
              {label.addItem}
            </Button>
            <Button variant="secondary" icon={ScanBarcode} onClick={() => setScannerOpen(true)}>
              {fa ? "اسکن بارکد" : language === "ar" ? "مسح الباركود" : language === "tr" ? "Barkod tara" : "Scan barcode"}
            </Button>
          </div>

          <div className="text-2xl font-black text-[var(--erp-accent)]">
            {label.grandTotal}: {money(calc.grandTotal)}
          </div>
        </div>

        <BarcodeScannerModal
          open={scannerOpen}
          onClose={() => setScannerOpen(false)}
          onDetected={handleBarcodeDetected}
          fa={fa}
        />

        <div className="flex gap-3 flex-wrap">
          <Button variant="primary" className="mt-5" icon={editingId ? Save : FileText} onClick={createInvoice}>
            {editingId ? label.saveInvoice : label.createInvoice}
          </Button>

          {editingId && (
            <Button
              variant="secondary"
              className="mt-5"
              icon={X}
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
                setItems([{ ...emptyItem }]);
              }}
            >
              {label.cancelEdit}
            </Button>
          )}
        </div>
      </div>

      <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-[var(--erp-radius-lg)] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Calculator className="text-[var(--erp-accent)]" size={24} />
          <h2 className="text-2xl font-black text-[var(--erp-accent)]">{label.summaryTitle}</h2>
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

      <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-[var(--erp-radius-lg)] p-5">
        <h2 className="text-2xl font-black text-[var(--erp-accent)] mb-4">{label.invoicesList}</h2>

        <Table>
          <Thead>
            <Th>{label.id}</Th>
            <Th>{label.invoiceType}</Th>
            <Th>{label.customer}</Th>
            <Th>{label.total}</Th>
            <Th>{label.status}</Th>
            <Th>{fa ? "عملیات" : language === "ar" ? "الإجراءات" : language === "tr" ? "İşlemler" : "Actions"}</Th>
          </Thead>

          <Tbody>
            {invoices.length === 0 ? (
              <EmptyRow colSpan={6}>{label.noInvoices}</EmptyRow>
            ) : (
              invoices.map((invoice) => (
                <Tr key={invoice.id}>
                  <Td>
                    #{n(invoice.id)}
                    {invoice.pending_sync && (
                      <Badge tone="warning" className="mx-2">{label.offline}</Badge>
                    )}
                  </Td>
                  <Td>{invoiceTypeLabel(invoice.invoice_type)}</Td>
                  <Td>
                    {customers.find((c) => Number(c.id) === Number(invoice.customer_id))?.name ||
                      invoice.customer_name ||
                      invoice.customerName ||
                      invoice.customer_id ||
                      "-"}
                  </Td>
                  <Td>{money(invoice.total_amount || invoice.total || 0)}</Td>
                  <Td>
                    {(() => {
                      const { tone, Icon } = paymentStatusStyle(invoice.payment_status || invoice.status);
                      return (
                        <Badge tone={tone} icon={Icon}>
                          {paymentStatusLabel(invoice.payment_status || invoice.status)}
                        </Badge>
                      );
                    })()}
                  </Td>
                  <Td>
                    <div className="flex gap-1.5 flex-wrap">
                      <IconButton
                        size="sm"
                        variant="primary"
                        icon={Printer}
                        onClick={() => openPrint(invoice)}
                        label={label.printInvoice}
                      />

                      <IconButton
                        size="sm"
                        variant="secondary"
                        icon={Edit3}
                        onClick={() => editInvoice(invoice)}
                        label={label.edit}
                      />

                      {invoice.invoice_type === "sale" && (invoice.payment_status || invoice.status) !== "paid" && (
                        <IconButton
                          size="sm"
                          variant="ghost"
                          icon={CreditCard}
                          onClick={() => getPaymentLink(invoice)}
                          label={fa ? "لینک پرداخت" : language === "ar" ? "رابط الدفع" : language === "tr" ? "Ödeme bağlantısı" : "Payment link"}
                          style={{ color: "var(--erp-success)", background: "var(--erp-success-soft)" }}
                        />
                      )}

                      {invoice.invoice_type === "sale" && (
                        <IconButton
                          size="sm"
                          variant="ghost"
                          icon={FileCheck2}
                          onClick={() => submitEinvoice(invoice)}
                          label={fa ? "ارسال به مودیان" : language === "ar" ? "إرسال الفاتورة الإلكترونية" : language === "tr" ? "E-fatura gönder" : "Submit e-invoice"}
                          style={{ color: "var(--erp-accent)", background: "var(--erp-glow)" }}
                        />
                      )}

                      <IconButton
                        size="sm"
                        variant="danger"
                        icon={Trash2}
                        onClick={() => deleteInvoice(invoice)}
                        label={label.delete}
                      />
                    </div>
                  </Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      </div>
    </div>
  );
}
