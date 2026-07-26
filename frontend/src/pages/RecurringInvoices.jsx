import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Pause, Play, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import { useLanguage } from "../localization/useLanguage";
import {
  createRecurringInvoice,
  deleteRecurringInvoice,
  getCustomers,
  getProducts,
  getRecurringInvoices,
  pauseRecurringInvoice,
  resumeRecurringInvoice,
} from "../services/api";

const cardClass = "rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-panel)] p-5";
const inputClass = "w-full mb-3 p-3 rounded-xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] outline-none focus:ring-2 focus:ring-cyan-400";
const buttonClass = "rounded-xl bg-[var(--erp-accent)] text-black font-black px-4 py-3 disabled:opacity-60 flex items-center gap-2";

const emptyItem = { product_id: "", quantity: "1", unit_price: "" };

function frequencyLabel(template, language) {
  if (template.frequency === "weekly") {
    return language === "fa" ? "هفتگی" : language === "ar" ? "أسبوعي" : language === "tr" ? "Haftalık" : "Weekly";
  }
  if (template.frequency === "monthly") {
    return language === "fa" ? "ماهانه" : language === "ar" ? "شهري" : language === "tr" ? "Aylık" : "Monthly";
  }
  return language === "fa"
    ? `هر ${template.custom_interval_days} روز`
    : language === "ar"
    ? `كل ${template.custom_interval_days} يوم`
    : language === "tr"
    ? `Her ${template.custom_interval_days} günde`
    : `Every ${template.custom_interval_days} days`;
}

export default function RecurringInvoices() {
  const { dir, language, money } = useLanguage();
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [customerId, setCustomerId] = useState("");
  const [invoiceType, setInvoiceType] = useState("sale");
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [frequency, setFrequency] = useState("monthly");
  const [customIntervalDays, setCustomIntervalDays] = useState("30");
  const [startDate, setStartDate] = useState("");
  const [invoiceNote, setInvoiceNote] = useState("");

  async function loadAll() {
    setLoading(true);
    try {
      const [customersData, productsData, templatesData] = await Promise.all([
        getCustomers(),
        getProducts(),
        getRecurringInvoices(),
      ]);
      setCustomers(Array.isArray(customersData) ? customersData : []);
      setProducts(Array.isArray(productsData) ? productsData : []);
      setTemplates(templatesData.items || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void loadAll(); }, 0);
    return () => clearTimeout(timer);
  }, []);

  const productPrice = useMemo(() => {
    const map = new Map();
    products.forEach((p) => map.set(String(p.id), p.sell_price || p.price || 0));
    return map;
  }, [products]);

  function updateItem(index, field, value) {
    setItems((current) => {
      const next = [...current];
      next[index] = { ...next[index], [field]: value };
      if (field === "product_id") {
        next[index].unit_price = String(productPrice.get(String(value)) || "");
      }
      return next;
    });
  }

  function addRow() {
    setItems((current) => [...current, { ...emptyItem }]);
  }

  function removeRow(index) {
    setItems((current) => current.filter((_, i) => i !== index));
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (!customerId) {
      toast.error(tr("یک مشتری انتخاب کنید.", "الرجاء اختيار عميل.", "Bir müşteri seçin.", "Select a customer."));
      return;
    }
    const cleanItems = items
      .filter((item) => item.product_id && Number(item.quantity) > 0)
      .map((item) => ({
        product_id: Number(item.product_id),
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price) || 0,
      }));
    if (cleanItems.length === 0) {
      toast.error(tr("حداقل یک کالا انتخاب کنید.", "الرجاء اختيار منتج واحد على الأقل.", "En az bir ürün seçin.", "Select at least one product."));
      return;
    }
    if (frequency === "custom" && !customIntervalDays) {
      toast.error(tr("فاصله تکرار را وارد کنید.", "الرجاء إدخال فترة التكرار.", "Tekrar aralığını girin.", "Enter a repeat interval."));
      return;
    }

    setCreating(true);
    try {
      await createRecurringInvoice({
        customer_id: Number(customerId),
        invoice_type: invoiceType,
        items: cleanItems,
        frequency,
        custom_interval_days: frequency === "custom" ? Number(customIntervalDays) : null,
        start_date: startDate || null,
        invoice_note: invoiceNote,
      });
      toast.success(tr("فاکتور تکرارشونده ساخته شد.", "تم إنشاء الفاتورة المتكررة.", "Tekrarlayan fatura oluşturuldu.", "Recurring invoice created."));
      setCustomerId("");
      setItems([{ ...emptyItem }]);
      setInvoiceNote("");
      setStartDate("");
      await loadAll();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handlePause(id) {
    try {
      await pauseRecurringInvoice(id);
      toast.success(tr("متوقف شد.", "تم الإيقاف.", "Duraklatıldı.", "Paused."));
      await loadAll();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleResume(id) {
    try {
      await resumeRecurringInvoice(id);
      toast.success(tr("از سر گرفته شد.", "تم الاستئناف.", "Devam ettirildi.", "Resumed."));
      await loadAll();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleDelete(id) {
    try {
      await deleteRecurringInvoice(id);
      toast.success(tr("حذف شد.", "تم الحذف.", "Silindi.", "Deleted."));
      await loadAll();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div dir={dir} className="p-4 md:p-6 space-y-6 text-[var(--erp-text)]">
      <h1 className="text-2xl font-black flex items-center gap-2">
        <CalendarClock className="text-[var(--erp-accent)]" />
        {tr("فاکتورهای تکرارشونده / اشتراکی", "الفواتير المتكررة / الاشتراكات", "Tekrarlayan / abonelik faturaları", "Recurring / subscription invoices")}
      </h1>

      <section className={cardClass}>
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Plus size={18} /> {tr("ساخت الگوی جدید", "إنشاء نموذج جديد", "Yeni şablon oluştur", "Create a new template")}
        </h2>
        <form onSubmit={handleCreate}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select className={inputClass} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">{tr("انتخاب مشتری...", "اختر عميلاً...", "Müşteri seçin...", "Select customer...")}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select className={inputClass} value={invoiceType} onChange={(e) => setInvoiceType(e.target.value)}>
              <option value="sale">{tr("فروش", "بيع", "Satış", "Sale")}</option>
              <option value="buy">{tr("خرید", "شراء", "Alış", "Purchase")}</option>
            </select>
          </div>

          <div className="space-y-2 mb-3">
            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
                <select
                  className={inputClass + " mb-0 md:col-span-2"}
                  value={item.product_id}
                  onChange={(e) => updateItem(index, "product_id", e.target.value)}
                >
                  <option value="">{tr("انتخاب کالا...", "اختر منتجاً...", "Ürün seçin...", "Select product...")}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  className={inputClass + " mb-0"}
                  placeholder={tr("تعداد", "الكمية", "Miktar", "Quantity")}
                  value={item.quantity}
                  onChange={(e) => updateItem(index, "quantity", e.target.value)}
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    className={inputClass + " mb-0"}
                    placeholder={tr("قیمت واحد", "سعر الوحدة", "Birim fiyat", "Unit price")}
                    value={item.unit_price}
                    onChange={(e) => updateItem(index, "unit_price", e.target.value)}
                  />
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeRow(index)} className="text-red-300 hover:text-red-200 px-2">
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button type="button" onClick={addRow} className="text-sm text-[var(--erp-accent)] hover:text-cyan-200 flex items-center gap-1">
              <Plus size={14} /> {tr("افزودن ردیف", "إضافة صف", "Satır ekle", "Add row")}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select className={inputClass} value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              <option value="weekly">{tr("هفتگی", "أسبوعي", "Haftalık", "Weekly")}</option>
              <option value="monthly">{tr("ماهانه", "شهري", "Aylık", "Monthly")}</option>
              <option value="custom">{tr("فاصله دلخواه (روز)", "فترة مخصصة (أيام)", "Özel aralık (gün)", "Custom interval (days)")}</option>
            </select>
            {frequency === "custom" && (
              <input
                type="number"
                min="1"
                className={inputClass}
                placeholder={tr("هر چند روز؟", "كل كم يوم؟", "Kaç günde bir?", "Every N days")}
                value={customIntervalDays}
                onChange={(e) => setCustomIntervalDays(e.target.value)}
              />
            )}
            <input
              type="date"
              className={inputClass}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              title={tr("تاریخ شروع (پیش‌فرض: امروز)", "تاريخ البدء (الافتراضي: اليوم)", "Başlangıç tarihi (varsayılan: bugün)", "Start date (defaults to today)")}
            />
          </div>

          <textarea
            className={inputClass}
            placeholder={tr("یادداشت فاکتور (اختیاری)", "ملاحظة الفاتورة (اختياري)", "Fatura notu (isteğe bağlı)", "Invoice note (optional)")}
            value={invoiceNote}
            onChange={(e) => setInvoiceNote(e.target.value)}
          />

          <button type="submit" disabled={creating} className={buttonClass}>
            <Plus size={16} />
            {creating ? tr("در حال ساخت...", "جارٍ الإنشاء...", "Oluşturuluyor...", "Creating...") : tr("ساخت الگو", "إنشاء النموذج", "Şablon oluştur", "Create template")}
          </button>
        </form>
      </section>

      <section className={cardClass}>
        <h2 className="text-lg font-bold mb-4">{tr("الگوهای فعال", "النماذج", "Şablonlarınız", "Your templates")}</h2>
        {loading ? (
          <p className="text-[var(--erp-muted)]">{tr("در حال بارگذاری...", "جارٍ التحميل...", "Yükleniyor...", "Loading...")}</p>
        ) : templates.length === 0 ? (
          <p className="text-[var(--erp-muted)]">{tr("هنوز الگویی نساخته‌اید.", "لم تقم بإنشاء أي نموذج بعد.", "Henüz şablon oluşturmadınız.", "No recurring templates yet.")}</p>
        ) : (
          <div className="space-y-3">
            {templates.map((template) => (
              <div key={template.id} className="rounded-xl bg-[var(--erp-panel-solid)] p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-bold">
                    {template.customer_name || `#${template.customer_id}`}
                    <span className="ms-2 text-[var(--erp-accent)] font-black">
                      {money((template.items || []).reduce((sum, item) => sum + item.quantity * item.unit_price, 0))}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--erp-muted)]">
                    {frequencyLabel(template, language)} •{" "}
                    {tr("اجرای بعدی: ", "التشغيل التالي: ", "Sonraki çalıştırma: ", "Next run: ")}{template.next_run_date} •{" "}
                    {template.active ? tr("فعال", "نشط", "Aktif", "Active") : tr("متوقف", "متوقف", "Duraklatıldı", "Paused")}
                  </div>
                  {template.last_generated_invoice_id && (
                    <div className="text-xs text-emerald-300 mt-1">
                      {tr("آخرین فاکتور ساخته‌شده: ", "آخر فاتورة تم إنشاؤها: ", "Son oluşturulan fatura: ", "Last generated invoice: ")}#{template.last_generated_invoice_id}
                    </div>
                  )}
                  {template.last_generation_error && (
                    <div className="text-xs text-red-300 mt-1">
                      {tr("خطای آخرین اجرا: ", "خطأ آخر تشغيل: ", "Son çalıştırma hatası: ", "Last generation error: ")}{template.last_generation_error}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {template.active ? (
                    <button onClick={() => handlePause(template.id)} className="px-3 py-2 rounded-xl bg-amber-500/15 text-amber-200 text-sm font-bold flex items-center gap-1">
                      <Pause size={14} /> {tr("توقف", "إيقاف", "Duraklat", "Pause")}
                    </button>
                  ) : (
                    <button onClick={() => handleResume(template.id)} className="px-3 py-2 rounded-xl bg-emerald-500/20 text-emerald-200 text-sm font-bold flex items-center gap-1">
                      <Play size={14} /> {tr("ازسرگیری", "استئناف", "Devam ettir", "Resume")}
                    </button>
                  )}
                  <button onClick={() => handleDelete(template.id)} className="px-3 py-2 rounded-xl bg-red-500/15 text-red-200 text-sm font-bold flex items-center gap-1">
                    <Trash2 size={14} /> {tr("حذف", "حذف", "Sil", "Delete")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
