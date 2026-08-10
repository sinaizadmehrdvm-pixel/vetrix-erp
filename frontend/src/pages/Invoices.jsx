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
  Wallet,
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
  ArrowRightLeft,
  TrendingUp,
  ShoppingCart,
  FileClock,
  Undo2,
  RotateCcw,
  Award,
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
  convertProformaToInvoice,
  isNetworkError,
  getSettings,
  getIndustryFieldDefinitions,
  createCustomer,
  getCustomerLoyalty,
} from "../services/api";
import toast from "react-hot-toast";
import BarcodeScannerModal from "../components/BarcodeScannerModal";
import Modal from "../components/ui/Modal";

import { useLanguage } from "../localization/useLanguage";
import InvoiceSummary from "../invoice/InvoiceSummary";
import InvoicePrint from "../invoice/InvoicePrint";
import PaymentPanel from "../invoice/PaymentPanel";
import PaymentAllocationsModal from "../invoice/PaymentAllocationsModal";
import { getCache, setCache } from "../storage/db";
import { countPending, syncPendingRecords, useOnlineSync } from "../storage/offlineSync";
import { toPersianDigits, toEnglishDigits } from "../localization/helpers";
import { translateApiError } from "../localization/apiErrors";
import Button from "../components/ui/Button";
import IconButton from "../components/ui/IconButton";
import Notice from "../components/ui/Notice";
import Badge from "../components/ui/Badge";
import { Table, Thead, Tbody, Tr, Th, Td, EmptyRow } from "../components/ui/Table";
import JalaliDateField from "../components/forms/JalaliDateField";


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
  const { language, dir, n, money, date } = useLanguage();
  const fa = language === "fa";
  const tr = (faText, arText, trText, enText) =>
    fa ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;
  const location = useLocation();
  const navigate = useNavigate();
  const todayIso = new Date().toISOString().slice(0, 10);

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
    paymentTermsDays: fa ? "مهلت پرداخت (روز)" : language === "ar" ? "مهلة السداد (أيام)" : language === "tr" ? "Ödeme Vadesi (gün)" : "Payment terms (days)",
    dueDate: fa ? "سررسید" : language === "ar" ? "تاريخ الاستحقاق" : language === "tr" ? "Vade Tarihi" : "Due date",
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
    loadFailed: fa ? "خطا در دریافت اطلاعات فاکتورها" : language === "ar" ? "خطأ في تحميل بيانات الفواتير" : language === "tr" ? "Fatura verileri yüklenirken hata oluştu" : "Error loading invoice data",
    saleInvoice: fa ? "فاکتور فروش" : language === "ar" ? "فاتورة مبيعات" : language === "tr" ? "Satış Faturası" : "Sales invoice",
    buyInvoice: fa ? "فاکتور خرید" : language === "ar" ? "فاتورة مشتريات" : language === "tr" ? "Alış Faturası" : "Purchase invoice",
    proformaInvoice: fa ? "پیش‌فاکتور" : language === "ar" ? "فاتورة أولية" : language === "tr" ? "Proforma Fatura" : "Proforma invoice",
    returnSaleInvoice: fa ? "برگشت از فروش" : language === "ar" ? "مرتجع مبيعات" : language === "tr" ? "Satış İadesi" : "Sales return",
    returnBuyInvoice: fa ? "برگشت از خرید" : language === "ar" ? "مرتجع مشتريات" : language === "tr" ? "Alış İadesi" : "Purchase return",
    stock: fa ? "موجودی" : language === "ar" ? "المخزون" : language === "tr" ? "Stok" : "Stock",
    offline: fa ? "آفلاین" : language === "ar" ? "غير متصل" : language === "tr" ? "Çevrimdışı" : "Offline",
  };

  // Each invoice type gets its own accent color, icon and short description
  // so the type picker below reads as a set of distinct destinations rather
  // than a plain dropdown - the fields shown further down the form (customer
  // label, due-date label, item pricing) also key off this.
  const invoiceTypeConfig = [
    {
      value: "sale",
      label: label.saleInvoice,
      desc: fa ? "فروش کالا یا خدمات به مشتری" : language === "ar" ? "بيع منتج أو خدمة للعميل" : language === "tr" ? "Müşteriye ürün veya hizmet satışı" : "Sell products or services to a customer",
      effect: fa ? "موجودی انبار کم می‌شود و سند حسابداری فروش ثبت می‌شود." : language === "ar" ? "ينخفض المخزون ويتم ترحيل قيد محاسبي للبيع." : language === "tr" ? "Stok azalır ve satış muhasebe kaydı oluşturulur." : "Stock decreases and a sales accounting entry is posted.",
      icon: TrendingUp,
      accent: "#34d399",
      soft: "rgba(52,211,153,.14)",
    },
    {
      value: "buy",
      label: label.buyInvoice,
      desc: fa ? "خرید کالا از تامین‌کننده" : language === "ar" ? "شراء منتج من مورد" : language === "tr" ? "Tedarikçiden ürün alımı" : "Purchase products from a supplier",
      effect: fa ? "موجودی انبار افزایش می‌یابد و سند حسابداری خرید ثبت می‌شود." : language === "ar" ? "يزداد المخزون ويتم ترحيل قيد محاسبي للشراء." : language === "tr" ? "Stok artar ve alış muhasebe kaydı oluşturulur." : "Stock increases and a purchase accounting entry is posted.",
      icon: ShoppingCart,
      accent: "#38bdf8",
      soft: "rgba(56,189,248,.14)",
    },
    {
      value: "proforma",
      label: label.proformaInvoice,
      desc: fa ? "پیش‌نویس بدون اثر بر انبار یا حساب" : language === "ar" ? "مسودة بدون تأثير على المخزون أو الحساب" : language === "tr" ? "Stok veya hesabı etkilemeyen taslak" : "A draft with no effect on stock or accounts",
      effect: fa ? "نه موجودی انبار تغییر می‌کند و نه سندی ثبت می‌شود. بعداً می‌توانید به فاکتور فروش واقعی تبدیلش کنید." : language === "ar" ? "لا يتغير المخزون ولا يُرحّل أي قيد. يمكنك لاحقًا تحويلها إلى فاتورة بيع فعلية." : language === "tr" ? "Ne stok değişir ne de kayıt oluşturulur. Daha sonra gerçek satış faturasına dönüştürebilirsiniz." : "Neither stock nor accounts change. You can later convert it into a real sale invoice.",
      icon: FileClock,
      accent: "#a78bfa",
      soft: "rgba(167,139,250,.14)",
    },
    {
      value: "return_sale",
      label: label.returnSaleInvoice,
      desc: fa ? "بازگشت کالا از مشتری" : language === "ar" ? "إرجاع منتج من العميل" : language === "tr" ? "Müşteriden ürün iadesi" : "A product returned by a customer",
      effect: fa ? "موجودی انبار برمی‌گردد و سند اصلاحی برای حساب مشتری ثبت می‌شود." : language === "ar" ? "يعود المخزون ويتم ترحيل قيد تصحيحي لحساب العميل." : language === "tr" ? "Stok geri döner ve müşteri hesabı için düzeltme kaydı oluşturulur." : "Stock is restored and a correcting entry is posted to the customer's account.",
      icon: Undo2,
      accent: "#fbbf24",
      soft: "rgba(251,191,36,.14)",
    },
    {
      value: "return_buy",
      label: label.returnBuyInvoice,
      desc: fa ? "بازگشت کالا به تامین‌کننده" : language === "ar" ? "إرجاع منتج إلى المورد" : language === "tr" ? "Tedarikçiye ürün iadesi" : "A product returned to a supplier",
      effect: fa ? "موجودی انبار کم می‌شود و سند اصلاحی برای حساب تامین‌کننده ثبت می‌شود." : language === "ar" ? "ينخفض المخزون ويتم ترحيل قيد تصحيحي لحساب المورد." : language === "tr" ? "Stok azalır ve tedarikçi hesabı için düzeltme kaydı oluşturulur." : "Stock decreases and a correcting entry is posted to the supplier's account.",
      icon: RotateCcw,
      accent: "#fb7185",
      soft: "rgba(251,113,133,.14)",
    },
  ];

  const emptyForm = {
    invoice_type: "sale",
    customer_id: "",
    discount_percent: "",
    tax_percent: "",
    shipping_cost: "",
    payment_status: "unpaid",
    invoice_note: "",
    qr_enabled: true,
    payment_terms_days: "",
    due_date: "",
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
  const [selectedCustomerLoyalty, setSelectedCustomerLoyalty] = useState(null);
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateDraft, setQuickCreateDraft] = useState({ name: "", mobile: "" });
  const [quickCreateSaving, setQuickCreateSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [payments, setPayments] = useState([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [paymentsModalInvoiceId, setPaymentsModalInvoiceId] = useState(null);
  const [industryFieldDefs, setIndustryFieldDefs] = useState([]);
  const [industryFieldValues, setIndustryFieldValues] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const [settingsData, defsData] = await Promise.all([getSettings(), getIndustryFieldDefinitions()]);
        const industry = settingsData?.industry || "general";
        const match = (defsData?.industries || []).find((entry) => entry.key === industry);
        setIndustryFieldDefs(match ? match.fields : []);
      } catch {
        // Non-critical - invoices remain fully usable without this panel.
        setIndustryFieldDefs([]);
      }
    })();
  }, []);

  // Best-effort loyalty-tier badge next to the selected customer - reuses
  // the existing CRM loyalty endpoint (backend/app/crm/router.py), no new
  // backend work. Silently shows nothing if it fails (offline, no history).
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      if (!form.customer_id) {
        setSelectedCustomerLoyalty(null);
        return;
      }
      getCustomerLoyalty(form.customer_id)
        .then((data) => { if (!cancelled) setSelectedCustomerLoyalty(data?.level ? data : null); })
        .catch(() => { if (!cancelled) setSelectedCustomerLoyalty(null); });
    }, 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [form.customer_id]);

  async function submitQuickCreateCustomer() {
    if (!quickCreateDraft.name.trim()) return;
    setQuickCreateSaving(true);
    try {
      const result = await createCustomer({
        name: quickCreateDraft.name.trim(),
        mobile: quickCreateDraft.mobile.trim(),
      });
      if (result?.status === "error") throw new Error(result.message);
      const newCustomer = { id: result.id, name: result.name };
      setCustomers((prev) => [newCustomer, ...prev]);
      setForm((prev) => ({ ...prev, customer_id: String(result.id) }));
      setQuickCreateOpen(false);
      setQuickCreateDraft({ name: "", mobile: "" });
      toast.success(tr("مشتری جدید ثبت شد", "تم تسجيل عميل جديد", "Yeni müşteri kaydedildi", "New customer created"));
    } catch (error) {
      toast.error(translateApiError(error.message, language) || tr("ثبت مشتری ناموفق بود", "فشل تسجيل العميل", "Müşteri oluşturulamadı", "Failed to create customer"));
    } finally {
      setQuickCreateSaving(false);
    }
  }

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

      // Only fall back to the offline cache when the server was genuinely
      // unreachable. A real server response (RBAC rejection, validation
      // error, 500, ...) must be surfaced as-is - silently swapping in
      // stale cached data would hide a real problem behind a misleading
      // "offline" banner (see the earlier products-not-saving bug).
      if (!isNetworkError(error)) {
        setLoadError(translateApiError(error.message, language) || label.loadFailed);
        return;
      }

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

  // Purchase-side invoices (buy / return_buy) should price items at the
  // product's purchase cost, not its sell price - the two were previously
  // conflated, silently pre-filling every "buy" invoice with the sell price.
  function priceForProduct(product) {
    if (!product) return "";
    const isBuyType = form.invoice_type === "buy" || form.invoice_type === "return_buy";
    const price = isBuyType ? (product.buy_price ?? product.price) : (product.sell_price ?? product.price);
    return price ?? "";
  }

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
      const price = priceForProduct(product);
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
        unit_price: faText(priceForProduct(product) || 0, fa),
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

  function buildCleanPayments(grandTotal) {
    const rows = payments
      .filter((row) => row.method && toNumber(row.amount) > 0)
      .map((row) => ({
        method: row.method,
        amount: toNumber(row.amount),
        reference_number: row.reference_number || "",
        cheque_number: row.cheque_number || "",
        cheque_bank_name: row.cheque_bank_name || "",
        cheque_branch_name: row.cheque_branch_name || "",
        cheque_due_date: row.cheque_due_date || "",
        note: row.note || "",
      }));
    const allocated = rows.reduce((sum, row) => sum + row.amount, 0);
    // Backend rejects any leg that pushes the total past the invoice's
    // remaining balance unless explicitly allowed - PaymentPanel already
    // shows the user the "over invoice" figure before they submit, so
    // reaching the server in that state means they saw and intended it.
    const allowOverpayment = allocated > grandTotal;
    return rows.map((row) => ({ ...row, allow_overpayment: allowOverpayment }));
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
      payments: item.payments || [],
      // Generated once at first offline-save time (see createInvoice()) and
      // reused on every retry - a fresh key per retry would defeat the
      // point (the backend could no longer tell a lost-response retry from
      // a genuine second invoice) and duplicate the invoice.
      idempotency_key: item.idempotency_key,
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
    const { idempotency_key, ...body } = payload;
    const res = await apiCreateInvoice(body, idempotency_key);
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

    const cleanPayments = editingId ? [] : buildCleanPayments(calc.grandTotal);
    // Generated once per submit attempt and reused verbatim if this falls
    // through to the offline queue below - see extractInvoicePayload's
    // comment for why a fresh key per retry would be wrong.
    const idempotencyKey = editingId ? null : (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

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
      payment_terms_days: toNumber(form.payment_terms_days),
      due_date: form.due_date || "",
      payments: cleanPayments,
      industry_fields: industryFieldValues,
    };

    try {
      let savedInvoice;

      if (editingId) {
        const result = await apiUpdateInvoice(editingId, payload);
        if (result?.status === "error") throw new Error(result.message);
        savedInvoice = enrichInvoice(payload, cleanItems, editingId);
      } else {
        const res = await apiCreateInvoice(payload, idempotencyKey);
        if (res?.status !== "created") {
          throw new Error(res?.message || label.createError);
        }
        savedInvoice = enrichInvoice({ ...payload, payment_status: res.payment_status, amount_paid: res.amount_paid }, cleanItems, res.invoice_id);
      }

      setCreatedInvoice(savedInvoice);
      setEditingId(null);
      setForm(emptyForm);
      setItems([{ ...emptyItem }]);
      setPayments([]);
      setIndustryFieldValues({});

      await loadData();
      alert(editingId ? label.saveInvoice : label.createdAlert);
    } catch (error) {
      console.error("Create/update invoice error:", error);

      // The server was reached and rejected the request (RBAC, validation,
      // "New invoices must start with unpaid payment_status", ...) -
      // retrying later would fail identically, so this must NOT be queued
      // offline. Surface the real reason immediately instead; the form is
      // left as-is so the user can fix it and resubmit.
      if (!isNetworkError(error)) {
        alert(translateApiError(error.message, language) || label.createError);
        return;
      }

      const offlineId = editingId || Date.now();

      const offlineInvoice = enrichInvoice(
        {
          ...payload,
          id: offlineId,
          status: form.payment_status,
          pending_sync: true,
          offline_created: !editingId,
          offline_updated_at: new Date().toISOString(),
          idempotency_key: idempotencyKey,
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
      setPayments([]);
      setIndustryFieldValues({});
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
    payment_terms_days: fullInvoice.payment_terms_days ? faText(fullInvoice.payment_terms_days, language) : "",
    due_date: fullInvoice.due_date || "",
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

      // The server was reached and rejected the delete (linked payments,
      // RBAC, ...) - hiding the invoice locally while claiming it was
      // "removed from offline cache" would be misleading since it still
      // exists on the server. Only a genuine connectivity failure should
      // fall back to a local-only removal.
      if (!isNetworkError(error)) {
        alert(translateApiError(error.message, language) || label.createError);
        return;
      }

      const next = invoices.filter((inv) => String(inv.id) !== String(invoice.id));
      setInvoices(next);
      await setCache(INVOICES_CACHE_KEY, next);

      setOfflineMode(true);
      setLoadError(
        fa
          ? "سرور در دسترس نبود؛ فاکتور فقط از حافظه آفلاین حذف شد."
          : language === "ar"
          ? "الخادم غير متاح؛ تم حذف الفاتورة من الذاكرة المؤقتة غير المتصلة فقط."
          : language === "tr"
          ? "Sunucuya ulaşılamadı; fatura yalnızca çevrimdışı önbellekten kaldırıldı."
          : "Server unavailable; invoice removed from offline cache only."
      );
    }
  }

  async function convertInvoice(invoice) {
    const ok = window.confirm(
      fa
        ? `پیش‌فاکتور شماره ${n(invoice.id)} به فاکتور فروش واقعی تبدیل شود؟ این باعث کسر موجودی انبار و ثبت سند حسابداری می‌شود.`
        : language === "ar"
        ? `تحويل الفاتورة الأولية رقم ${n(invoice.id)} إلى فاتورة بيع فعلية؟ سيؤدي هذا إلى خصم المخزون وترحيل قيد محاسبي.`
        : language === "tr"
        ? `${n(invoice.id)} numaralı proforma fatura gerçek bir satış faturasına dönüştürülsün mü? Bu stoktan düşer ve muhasebe kaydı oluşturur.`
        : `Convert proforma invoice #${invoice.id} into a real sale invoice? This will deduct stock and post a real accounting entry.`
    );
    if (!ok) return;

    try {
      const result = await convertProformaToInvoice(invoice.id);
      if (result?.status === "error") throw new Error(result.message);
      toast.success(
        fa ? "فاکتور فروش واقعی ساخته شد." : language === "ar" ? "تم إنشاء فاتورة بيع فعلية." : language === "tr" ? "Gerçek satış faturası oluşturuldu." : "A real sale invoice was created."
      );
      await loadData();
    } catch (error) {
      toast.error(error.message || (fa ? "خطا در تبدیل پیش‌فاکتور" : language === "ar" ? "خطأ في تحويل الفاتورة الأولية" : language === "tr" ? "Proforma dönüştürülürken hata oluştu" : "Error converting proforma invoice"));
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

  const activeType = invoiceTypeConfig.find((t) => t.value === form.invoice_type) || invoiceTypeConfig[0];
  const isBuyType = form.invoice_type === "buy" || form.invoice_type === "return_buy";
  const counterpartyLabel = isBuyType
    ? (fa ? "تامین‌کننده / طرف‌حساب" : language === "ar" ? "المورد / الطرف" : language === "tr" ? "Tedarikçi / Cari" : "Supplier / Account")
    : label.customer;
  const dueDateLabel = form.invoice_type === "proforma"
    ? (fa ? "اعتبار پیش‌فاکتور تا" : language === "ar" ? "صلاحية العرض حتى" : language === "tr" ? "Teklif geçerlilik tarihi" : "Quote valid until")
    : label.dueDate;

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

        <Field label={label.invoiceType} icon={<ClipboardList size={16} />}>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
            {invoiceTypeConfig.map((type) => {
              const TypeIcon = type.icon;
              const selected = form.invoice_type === type.value;
              return (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setForm({ ...form, invoice_type: type.value })}
                  className="text-start rounded-[var(--erp-radius-md)] p-3.5 border transition-all"
                  style={{
                    borderColor: selected ? type.accent : "var(--erp-border)",
                    background: selected ? type.soft : "var(--erp-panel-solid)",
                    boxShadow: selected ? `0 0 0 3px ${type.soft}` : "none",
                  }}
                >
                  <TypeIcon size={20} style={{ color: type.accent }} />
                  <div className="font-black text-sm mt-2" style={{ color: selected ? type.accent : "var(--erp-text)" }}>
                    {type.label}
                  </div>
                  <div className="text-xs mt-1 leading-5 text-[var(--erp-muted)]">{type.desc}</div>
                </button>
              );
            })}
          </div>
        </Field>

        <div
          key={form.invoice_type}
          className="erp-fade-in flex items-start gap-3 rounded-[var(--erp-radius-md)] p-3.5 my-5 border"
          style={{ borderColor: activeType.accent, background: activeType.soft }}
        >
          <activeType.icon size={18} style={{ color: activeType.accent, flexShrink: 0, marginTop: 2 }} />
          <p className="text-sm leading-6" style={{ color: "var(--erp-text)" }}>{activeType.effect}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <Field label={counterpartyLabel} icon={<UserRound size={16} />}>
            <div className="flex items-center gap-2">
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
              <button
                type="button"
                onClick={() => setQuickCreateOpen(true)}
                title={tr("مشتری جدید", "عميل جديد", "Yeni müşteri", "New customer")}
                className="shrink-0 w-11 h-11 rounded-[var(--erp-radius-md)] bg-[var(--erp-accent)] text-black flex items-center justify-center"
              >
                <Plus size={18} />
              </button>
            </div>
            {customers.length === 0 ? (
              <p className="text-xs mt-2" style={{ color: "var(--erp-warning)" }}>{label.emptyCustomers}</p>
            ) : null}
            {selectedCustomerLoyalty && (
              <div className="mt-2 flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full w-fit" style={{ background: "var(--erp-glow)", color: "var(--erp-accent)" }}>
                <Award size={12} />
                {tr(
                  `سطح ${selectedCustomerLoyalty.level}${selectedCustomerLoyalty.discount_percent ? ` (${selectedCustomerLoyalty.discount_percent}٪ تخفیف)` : ""}`,
                  `مستوى ${selectedCustomerLoyalty.level}${selectedCustomerLoyalty.discount_percent ? ` (خصم ${selectedCustomerLoyalty.discount_percent}٪)` : ""}`,
                  `${selectedCustomerLoyalty.level} seviyesi${selectedCustomerLoyalty.discount_percent ? ` (%${selectedCustomerLoyalty.discount_percent} indirim)` : ""}`,
                  `${selectedCustomerLoyalty.level} tier${selectedCustomerLoyalty.discount_percent ? ` (${selectedCustomerLoyalty.discount_percent}% discount)` : ""}`
                )}
              </div>
            )}
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

          <Field label={label.paymentTermsDays} icon={<Clock size={16} />}>
            <input
              type="text"
              inputMode="numeric"
              value={form.payment_terms_days}
              onChange={(e) =>
                setForm({
                  ...form,
                  payment_terms_days: normalizeNumberInput(e.target.value, language),
                  due_date: "",
                })
              }
              className="bg-[var(--erp-panel-solid)] rounded-[var(--erp-radius-md)] p-3 outline-none w-full border border-[var(--erp-border)] focus:border-cyan-400"
              placeholder={fa ? "۰" : "0"}
            />
          </Field>

          <Field label={dueDateLabel} icon={<Clock size={16} />}>
            <JalaliDateField
              value={form.due_date}
              onChange={(iso) => setForm({ ...form, due_date: iso, payment_terms_days: "" })}
              fa={fa}
              language={language}
              className="bg-[var(--erp-panel-solid)] rounded-[var(--erp-radius-md)] p-3 outline-none w-full border border-[var(--erp-border)] focus:border-cyan-400"
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

        <Modal open={quickCreateOpen} onClose={() => setQuickCreateOpen(false)} maxWidthClassName="max-w-sm" className="p-5" labelledBy="quick-create-customer-title">
          <div className="flex items-center justify-between mb-4">
            <h3 id="quick-create-customer-title" className="font-black flex items-center gap-2" style={{ color: "var(--erp-accent)" }}>
              <UserRound size={18} /> {tr("مشتری جدید", "عميل جديد", "Yeni müşteri", "New customer")}
            </h3>
            <button onClick={() => setQuickCreateOpen(false)} className="text-[var(--erp-muted)] hover:text-[var(--erp-text)]"><X size={20} /></button>
          </div>
          <div className="space-y-3">
            <input
              autoFocus
              value={quickCreateDraft.name}
              onChange={(e) => setQuickCreateDraft((prev) => ({ ...prev, name: e.target.value }))}
              placeholder={tr("نام مشتری", "اسم العميل", "Müşteri adı", "Customer name")}
              className="w-full p-3 rounded-xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] outline-none text-[var(--erp-text)]"
            />
            <input
              value={quickCreateDraft.mobile}
              onChange={(e) => setQuickCreateDraft((prev) => ({ ...prev, mobile: e.target.value }))}
              placeholder={tr("شماره موبایل (اختیاری)", "رقم الجوال (اختياري)", "Cep telefonu (isteğe bağlı)", "Mobile number (optional)")}
              className="w-full p-3 rounded-xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] outline-none text-[var(--erp-text)]"
            />
            <button
              type="button"
              onClick={submitQuickCreateCustomer}
              disabled={quickCreateSaving || !quickCreateDraft.name.trim()}
              className="w-full py-3 rounded-xl bg-[var(--erp-accent)] text-black font-black disabled:opacity-60"
            >
              {quickCreateSaving ? "..." : tr("ثبت و انتخاب", "حفظ واختيار", "Kaydet ve seç", "Save & select")}
            </button>
          </div>
        </Modal>

        {!editingId && (
          <div className="mt-5">
            <PaymentPanel rows={payments} onChange={setPayments} total={calc.grandTotal} />
          </div>
        )}

        {industryFieldDefs.length > 0 && (
          <div className="mt-5 rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-panel)] p-5">
            <h3 className="font-black mb-3 text-[var(--erp-accent)]">
              {fa ? "اطلاعات تخصصی فاکتور" : language === "ar" ? "بيانات الفاتورة المتخصصة" : language === "tr" ? "Özel fatura bilgileri" : "Specialized invoice details"}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {industryFieldDefs.map((def) => (
                <Field key={def.key} label={def.label[language] || def.label.en}>
                  {def.type === "date" ? (
                    <JalaliDateField
                      value={industryFieldValues[def.key] || ""}
                      onChange={(value) => setIndustryFieldValues((prev) => ({ ...prev, [def.key]: value }))}
                      fa={fa}
                      language={language}
                      className="bg-[var(--erp-panel-solid)] rounded-[var(--erp-radius-md)] p-3 outline-none w-full border border-[var(--erp-border)] focus:border-cyan-400"
                    />
                  ) : (
                    <input
                      className="w-full px-3 py-2 rounded-xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--erp-accent)]"
                      value={industryFieldValues[def.key] || ""}
                      onChange={(e) => setIndustryFieldValues((prev) => ({ ...prev, [def.key]: e.target.value }))}
                      required={def.required}
                    />
                  )}
                </Field>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          <Button variant="primary" className="mt-5" icon={editingId ? Save : FileText} onClick={createInvoice}>
            {editingId
              ? label.saveInvoice
              : payments.some((row) => toNumber(row.amount) > 0)
              ? (fa ? "ثبت فاکتور و دریافت وجه" : language === "ar" ? "تسجيل الفاتورة واستلام المبلغ" : language === "tr" ? "Faturayı kaydet ve tahsil et" : "Save invoice and collect payment")
              : label.createInvoice}
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
                setPayments([]);
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
            <Th>#</Th>
            <Th>{label.id}</Th>
            <Th>{label.invoiceType}</Th>
            <Th>{label.customer}</Th>
            <Th>{label.total}</Th>
            <Th>{label.status}</Th>
            <Th>{label.dueDate}</Th>
            <Th>{fa ? "عملیات" : language === "ar" ? "الإجراءات" : language === "tr" ? "İşlemler" : "Actions"}</Th>
          </Thead>

          <Tbody>
            {invoices.length === 0 ? (
              <EmptyRow colSpan={8}>{label.noInvoices}</EmptyRow>
            ) : (
              invoices.map((invoice, index) => (
                <Tr key={invoice.id}>
                  <Td className="text-[var(--erp-muted)] font-bold">{n(index + 1)}</Td>
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
                    {invoice.due_date ? (
                      <span className={invoice.due_date < todayIso && (invoice.payment_status || invoice.status) !== "paid" ? "text-red-300 font-bold" : undefined}>
                        {date(invoice.due_date)}
                      </span>
                    ) : (
                      "-"
                    )}
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

                      {invoice.invoice_type !== "proforma" && (
                        <IconButton
                          size="sm"
                          variant="ghost"
                          icon={Wallet}
                          onClick={() => setPaymentsModalInvoiceId(invoice.id)}
                          label={fa ? "پرداخت‌ها" : language === "ar" ? "الدفعات" : language === "tr" ? "Ödemeler" : "Payments"}
                          style={{ color: "var(--erp-accent)", background: "var(--erp-glow)" }}
                        />
                      )}

                      {invoice.invoice_type === "proforma" && (
                        <IconButton
                          size="sm"
                          variant="ghost"
                          icon={ArrowRightLeft}
                          onClick={() => convertInvoice(invoice)}
                          label={fa ? "تبدیل به فاکتور فروش" : language === "ar" ? "تحويل إلى فاتورة بيع" : language === "tr" ? "Satış faturasına dönüştür" : "Convert to sale invoice"}
                          style={{ color: "var(--erp-success)", background: "var(--erp-success-soft)" }}
                        />
                      )}

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

      {paymentsModalInvoiceId && (
        <PaymentAllocationsModal
          invoiceId={paymentsModalInvoiceId}
          onClose={() => setPaymentsModalInvoiceId(null)}
          onChanged={loadData}
        />
      )}
    </div>
  );
}
