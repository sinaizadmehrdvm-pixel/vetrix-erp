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

const cardClass = "rounded-2xl border border-white/10 bg-white/5 p-5";
const inputClass = "w-full mb-3 p-3 rounded-xl bg-black/20 border border-white/10 outline-none focus:ring-2 focus:ring-cyan-400";
const buttonClass = "rounded-xl bg-cyan-400 text-black font-black px-4 py-3 disabled:opacity-60 flex items-center gap-2";

const emptyItem = { product_id: "", quantity: "1", unit_price: "" };

function frequencyLabel(template, fa) {
  if (template.frequency === "weekly") return fa ? "هفتگی" : "Weekly";
  if (template.frequency === "monthly") return fa ? "ماهانه" : "Monthly";
  return fa ? `هر ${template.custom_interval_days} روز` : `Every ${template.custom_interval_days} days`;
}

export default function RecurringInvoices() {
  const { dir, language, money } = useLanguage();
  const fa = language === "fa";

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
      toast.error(fa ? "یک مشتری انتخاب کنید." : "Select a customer.");
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
      toast.error(fa ? "حداقل یک کالا انتخاب کنید." : "Select at least one product.");
      return;
    }
    if (frequency === "custom" && !customIntervalDays) {
      toast.error(fa ? "فاصله تکرار را وارد کنید." : "Enter a repeat interval.");
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
      toast.success(fa ? "فاکتور تکرارشونده ساخته شد." : "Recurring invoice created.");
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
      toast.success(fa ? "متوقف شد." : "Paused.");
      await loadAll();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleResume(id) {
    try {
      await resumeRecurringInvoice(id);
      toast.success(fa ? "از سر گرفته شد." : "Resumed.");
      await loadAll();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleDelete(id) {
    try {
      await deleteRecurringInvoice(id);
      toast.success(fa ? "حذف شد." : "Deleted.");
      await loadAll();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div dir={dir} className="p-4 md:p-6 space-y-6 text-white">
      <h1 className="text-2xl font-black flex items-center gap-2">
        <CalendarClock className="text-cyan-400" />
        {fa ? "فاکتورهای تکرارشونده / اشتراکی" : "Recurring / subscription invoices"}
      </h1>

      <section className={cardClass}>
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Plus size={18} /> {fa ? "ساخت الگوی جدید" : "Create a new template"}
        </h2>
        <form onSubmit={handleCreate}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select className={inputClass} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">{fa ? "انتخاب مشتری..." : "Select customer..."}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select className={inputClass} value={invoiceType} onChange={(e) => setInvoiceType(e.target.value)}>
              <option value="sale">{fa ? "فروش" : "Sale"}</option>
              <option value="buy">{fa ? "خرید" : "Purchase"}</option>
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
                  <option value="">{fa ? "انتخاب کالا..." : "Select product..."}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  className={inputClass + " mb-0"}
                  placeholder={fa ? "تعداد" : "Quantity"}
                  value={item.quantity}
                  onChange={(e) => updateItem(index, "quantity", e.target.value)}
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    className={inputClass + " mb-0"}
                    placeholder={fa ? "قیمت واحد" : "Unit price"}
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
            <button type="button" onClick={addRow} className="text-sm text-cyan-300 hover:text-cyan-200 flex items-center gap-1">
              <Plus size={14} /> {fa ? "افزودن ردیف" : "Add row"}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select className={inputClass} value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              <option value="weekly">{fa ? "هفتگی" : "Weekly"}</option>
              <option value="monthly">{fa ? "ماهانه" : "Monthly"}</option>
              <option value="custom">{fa ? "فاصله دلخواه (روز)" : "Custom interval (days)"}</option>
            </select>
            {frequency === "custom" && (
              <input
                type="number"
                min="1"
                className={inputClass}
                placeholder={fa ? "هر چند روز؟" : "Every N days"}
                value={customIntervalDays}
                onChange={(e) => setCustomIntervalDays(e.target.value)}
              />
            )}
            <input
              type="date"
              className={inputClass}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              title={fa ? "تاریخ شروع (پیش‌فرض: امروز)" : "Start date (defaults to today)"}
            />
          </div>

          <textarea
            className={inputClass}
            placeholder={fa ? "یادداشت فاکتور (اختیاری)" : "Invoice note (optional)"}
            value={invoiceNote}
            onChange={(e) => setInvoiceNote(e.target.value)}
          />

          <button type="submit" disabled={creating} className={buttonClass}>
            <Plus size={16} />
            {creating ? (fa ? "در حال ساخت..." : "Creating...") : (fa ? "ساخت الگو" : "Create template")}
          </button>
        </form>
      </section>

      <section className={cardClass}>
        <h2 className="text-lg font-bold mb-4">{fa ? "الگوهای فعال" : "Your templates"}</h2>
        {loading ? (
          <p className="text-slate-400">{fa ? "در حال بارگذاری..." : "Loading..."}</p>
        ) : templates.length === 0 ? (
          <p className="text-slate-400">{fa ? "هنوز الگویی نساخته‌اید." : "No recurring templates yet."}</p>
        ) : (
          <div className="space-y-3">
            {templates.map((template) => (
              <div key={template.id} className="rounded-xl bg-black/20 p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-bold">
                    {template.customer_name || `#${template.customer_id}`}
                    <span className="ms-2 text-cyan-300 font-black">
                      {money((template.items || []).reduce((sum, item) => sum + item.quantity * item.unit_price, 0))}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">
                    {frequencyLabel(template, fa)} •{" "}
                    {fa ? "اجرای بعدی: " : "Next run: "}{template.next_run_date} •{" "}
                    {template.active ? (fa ? "فعال" : "Active") : (fa ? "متوقف" : "Paused")}
                  </div>
                  {template.last_generated_invoice_id && (
                    <div className="text-xs text-emerald-300 mt-1">
                      {fa ? "آخرین فاکتور ساخته‌شده: " : "Last generated invoice: "}#{template.last_generated_invoice_id}
                    </div>
                  )}
                  {template.last_generation_error && (
                    <div className="text-xs text-red-300 mt-1">
                      {fa ? "خطای آخرین اجرا: " : "Last generation error: "}{template.last_generation_error}
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {template.active ? (
                    <button onClick={() => handlePause(template.id)} className="px-3 py-2 rounded-xl bg-amber-500/15 text-amber-200 text-sm font-bold flex items-center gap-1">
                      <Pause size={14} /> {fa ? "توقف" : "Pause"}
                    </button>
                  ) : (
                    <button onClick={() => handleResume(template.id)} className="px-3 py-2 rounded-xl bg-emerald-500/20 text-emerald-200 text-sm font-bold flex items-center gap-1">
                      <Play size={14} /> {fa ? "ازسرگیری" : "Resume"}
                    </button>
                  )}
                  <button onClick={() => handleDelete(template.id)} className="px-3 py-2 rounded-xl bg-red-500/15 text-red-200 text-sm font-bold flex items-center gap-1">
                    <Trash2 size={14} /> {fa ? "حذف" : "Delete"}
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
