import { useEffect, useMemo, useState } from "react";
import { useStableCallback } from "../hooks/useStableCallback";
import { Plus, Search, PackageCheck, RefreshCw, AlertTriangle, Boxes, ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal, ScanBarcode } from "lucide-react";
import JalaliDateField from "../components/forms/JalaliDateField";
import Select from "../components/ui/Select";
import toast from "react-hot-toast";
import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits, cleanNumberInput } from "../localization/helpers";
import { createStockMovement, getProducts, getStockMovements, getWarehouses } from "../services/api";
import BarcodeScannerModal from "../components/BarcodeScannerModal";

const inputClass = "bg-[var(--erp-panel-solid)] text-[var(--erp-text)] placeholder-[var(--erp-muted)] border border-[var(--erp-border)] focus:border-cyan-400 rounded-2xl p-4 outline-none transition-all w-full";
function toNumber(value) { return Number(String(value ?? "").replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[,،]/g, "").replace(/[^\d.-]/g, "") || 0); }
function Field({ label, children }) { return <div className="space-y-2"><label className="text-sm font-bold text-[var(--erp-accent)] block">{label}</label>{children}</div>; }
function defaultWarehouseLabel(language) { return language === "fa" ? "انبار اصلی" : language === "ar" ? "المستودع الرئيسي" : language === "tr" ? "Ana Depo" : "Main Warehouse"; }

export default function Warehouse() {
  const { language, n, dir, date, country } = useLanguage();
  const pd = (value) => (language === "fa" ? toPersianDigits(value) : value);
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ warehouse: defaultWarehouseLabel(language), warehouse_id: "", product_id: "", quantity: "", movement_type: "in", movement_date: "", note: "" });
  const [scannerOpen, setScannerOpen] = useState(false);

  function handleBarcodeDetected(code) {
    setScannerOpen(false);
    const match = products.find(p => String(p.barcode || "") === String(code) || String(p.code || "") === String(code));
    if (!match) { toast.error(language === "fa" ? "کالایی با این بارکد پیدا نشد." : language === "ar" ? "لم يتم العثور على منتج بهذا الباركود." : language === "tr" ? "Bu barkoda ait ürün bulunamadı." : "No product found for that barcode."); return; }
    setForm(prev => ({ ...prev, product_id: String(match.id) }));
  }

  const label = {
    title: language === "fa" ? "انبار" : language === "ar" ? "المستودع" : language === "tr" ? "Depo" : "Warehouse",
    subtitle: language === "fa" ? "مدیریت موجودی کالاها، ورود، خروج و اصلاح موجودی" : language === "ar" ? "إدارة مخزون المنتجات: الإدخال والإخراج وتسوية المخزون" : language === "tr" ? "Ürün stoğunu, giriş, çıkış ve stok düzeltmelerini yönetin" : "Manage product stock, stock-in, stock-out and adjustments",
    warehouse: language === "fa" ? "نام انبار" : language === "ar" ? "اسم المستودع" : language === "tr" ? "Depo Adı" : "Warehouse name",
    product: language === "fa" ? "انتخاب کالا" : language === "ar" ? "اختيار المنتج" : language === "tr" ? "Ürün Seç" : "Select product",
    quantity: language === "fa" ? "تعداد" : language === "ar" ? "الكمية" : language === "tr" ? "Miktar" : "Quantity",
    type: language === "fa" ? "نوع حرکت" : language === "ar" ? "نوع الحركة" : language === "tr" ? "Hareket Türü" : "Movement type",
    date: language === "fa" ? "تاریخ" : language === "ar" ? "التاريخ" : language === "tr" ? "Tarih" : "Date",
    note: language === "fa" ? "توضیحات" : language === "ar" ? "ملاحظات" : language === "tr" ? "Not" : "Note",
    in: language === "fa" ? "ورود به انبار" : language === "ar" ? "إدخال مخزون" : language === "tr" ? "Depoya Giriş" : "Stock In",
    out: language === "fa" ? "خروج از انبار" : language === "ar" ? "إخراج مخزون" : language === "tr" ? "Depodan Çıkış" : "Stock Out",
    adjustment: language === "fa" ? "اصلاح موجودی نهایی" : language === "ar" ? "تسوية المخزون النهائي" : language === "tr" ? "Nihai Stoğu Ayarla" : "Set final stock",
    save: language === "fa" ? "ثبت حرکت انبار" : language === "ar" ? "حفظ حركة المخزون" : language === "tr" ? "Stok Hareketini Kaydet" : "Save stock movement",
    noData: language === "fa" ? "حرکت انباری ثبت نشده است" : language === "ar" ? "لا توجد حركة مخزون مسجلة بعد" : language === "tr" ? "Henüz depo hareketi kaydedilmedi" : "No warehouse movement yet",
    search: language === "fa" ? "جستجوی کالا، انبار یا توضیحات..." : language === "ar" ? "بحث عن منتج أو مستودع أو ملاحظة..." : language === "tr" ? "Ürün, depo veya not ara..." : "Search product, warehouse or note...",
  };

  async function load() {
    try {
      setLoading(true); setError("");
      const [p, m, w] = await Promise.all([getProducts(), getStockMovements(), getWarehouses()]);
      setProducts(Array.isArray(p) ? p : []);
      setMovements(Array.isArray(m) ? m : []);
      setWarehouses(Array.isArray(w?.items) ? w.items : []);
    } catch (e) { console.error(e); setError(language === "fa" ? "خطا در دریافت اطلاعات انبار" : language === "ar" ? "خطأ في تحميل بيانات المستودع" : language === "tr" ? "Depo verileri yüklenirken hata oluştu" : "Error loading warehouse data"); }
    finally { setLoading(false); }
  }
  const stableLoad = useStableCallback(load);

  useEffect(() => {
    const timer = setTimeout(() => { void stableLoad(); }, 0);
    return () => clearTimeout(timer);
  }, [language, stableLoad]);

  async function addMovement() {
    if (!form.product_id || !form.quantity) { toast.error(language === "fa" ? "کالا و تعداد را وارد کن" : language === "ar" ? "اختر المنتج والكمية" : language === "tr" ? "Ürün ve miktar seçin" : "Select product and quantity"); return; }
    try {
      const result = await createStockMovement({ ...form, warehouse_id: form.warehouse_id ? Number(form.warehouse_id) : null, product_id: Number(form.product_id), quantity: toNumber(form.quantity) });
      if (result?.status === "error") throw new Error(result.message);
      setForm({ warehouse: defaultWarehouseLabel(language), warehouse_id: "", product_id: "", quantity: "", movement_type: "in", movement_date: "", note: "" });
      await load();
    } catch (e) { toast.error(e.message || (language === "fa" ? "خطا در ثبت حرکت انبار" : language === "ar" ? "خطأ في حفظ حركة المخزون" : language === "tr" ? "Hareket kaydedilirken hata oluştu" : "Error saving movement")); }
  }

  const filtered = useMemo(() => movements.filter(x => [x.product_name, x.warehouse, x.note, x.movement_type].join(" ").toLowerCase().includes(search.toLowerCase())), [movements, search]);
  const totalStock = products.reduce((sum, p) => sum + toNumber(p.stock), 0);
  const lowStock = products.filter(p => toNumber(p.stock) <= toNumber(p.min_stock || 0)).length;

  function movementIcon(type) { if (type === "in") return <ArrowDownToLine className="text-green-300"/>; if (type === "out") return <ArrowUpFromLine className="text-red-300"/>; return <SlidersHorizontal className="text-cyan-300"/>; }
  function movementLabel(type) { return type === "in" ? label.in : type === "out" ? label.out : label.adjustment; }

  return <div dir={dir} style={{ direction: dir }} className="space-y-6">
    <div className="flex items-start justify-between gap-4 flex-wrap"><div><h1 className="text-4xl font-black text-[var(--erp-accent)]">{label.title}</h1><p className="text-[var(--erp-muted)] mt-2">{label.subtitle}</p></div><button onClick={load} className="px-4 py-3 rounded-2xl bg-[var(--erp-panel-solid)] text-[var(--erp-accent)] font-bold flex items-center gap-2 border border-[var(--erp-border)]"><RefreshCw size={18}/>{language === "fa" ? "به‌روزرسانی" : language === "ar" ? "تحديث" : language === "tr" ? "Yenile" : "Refresh"}</button></div>
    {error && <div className="bg-red-500/15 border border-red-400/30 text-red-200 rounded-2xl p-4 flex items-center gap-2"><AlertTriangle size={20}/>{error}</div>}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5"><Stat icon={<Boxes/>} title={language === "fa" ? "تعداد کالا" : language === "ar" ? "عدد المنتجات" : language === "tr" ? "Ürün Sayısı" : "Products"} value={n(products.length)}/><Stat icon={<PackageCheck/>} title={language === "fa" ? "موجودی کل" : language === "ar" ? "إجمالي المخزون" : language === "tr" ? "Toplam Stok" : "Total stock"} value={n(totalStock)}/><Stat icon={<AlertTriangle/>} title={language === "fa" ? "کالاهای کم‌موجودی" : language === "ar" ? "مخزون منخفض" : language === "tr" ? "Düşük Stok" : "Low stock"} value={n(lowStock)} danger={lowStock>0}/></div>
    <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-5"><div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
      <Field label={label.warehouse}><Select value={form.warehouse_id} onChange={(value)=>{ const selected = warehouses.find(w => String(w.id) === value); setForm({...form, warehouse_id: value, warehouse: selected ? selected.name : defaultWarehouseLabel(language)}); }} options={[{ value: "", label: defaultWarehouseLabel(language) }, ...warehouses.filter(w => w.active && !w.is_default).map(w=>({ value: w.id, label: pd(w.name) }))]} /></Field>
      <Field label={label.product}><div className="flex gap-2"><Select className="flex-1" value={form.product_id} onChange={(value)=>setForm({...form, product_id:value})} options={[{ value: "", label: label.product }, ...products.map(p=>({ value: p.id, label: `${pd(p.name)} | ${language === "fa" ? "موجودی" : language === "ar" ? "المخزون" : language === "tr" ? "Stok" : "Stock"}: ${n(p.stock||0)}` }))]} /><button type="button" onClick={()=>setScannerOpen(true)} className="px-3 rounded-xl bg-[var(--erp-glow)] text-[var(--erp-accent)] flex items-center justify-center" title={language === "fa" ? "اسکن بارکد" : language === "ar" ? "مسح الباركود" : language === "tr" ? "Barkod tara" : "Scan barcode"}><ScanBarcode size={18}/></button></div></Field>
      <Field label={label.quantity}><input type="text" inputMode="numeric" className={inputClass} value={language === "fa" ? toPersianDigits(form.quantity) : form.quantity} onChange={e=>setForm({...form, quantity:cleanNumberInput(e.target.value)})} placeholder={language === "fa" ? "۰" : "0"}/></Field>
      <Field label={label.type}><Select value={form.movement_type} onChange={(value)=>setForm({...form, movement_type:value})} options={[{ value: "in", label: label.in }, { value: "out", label: label.out }, { value: "adjustment", label: label.adjustment }]} /></Field>
      <Field label={label.date}><JalaliDateField className={inputClass} value={form.movement_date} onChange={(iso)=>setForm({...form, movement_date:iso})} fa={language === "fa"} language={language} country={country}/></Field>
      <Field label={label.note}><input className={inputClass} value={form.note} onChange={e=>setForm({...form, note: language === "fa" ? toPersianDigits(e.target.value) : e.target.value})} placeholder={label.note}/></Field>
    </div><button onClick={addMovement} className="mt-5 px-5 py-3 rounded-2xl bg-[var(--erp-accent)] text-slate-950 font-black flex items-center gap-2"><Plus size={18}/>{label.save}</button>
    <BarcodeScannerModal open={scannerOpen} onClose={()=>setScannerOpen(false)} onDetected={handleBarcodeDetected} fa={language === "fa"} />
    </div>
    <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-5"><div className="flex items-center gap-2 bg-[var(--erp-panel-solid)] rounded-2xl px-4 py-3 mb-5"><Search size={18}/><input value={search} onChange={e=>setSearch(language === "fa" ? toPersianDigits(e.target.value) : e.target.value)} placeholder={label.search} className="bg-transparent outline-none w-full text-[var(--erp-text)] placeholder-[var(--erp-muted)]"/></div>
    {loading ? <div className="text-[var(--erp-muted)]">{language === "fa" ? "در حال دریافت..." : language === "ar" ? "جارٍ التحميل..." : language === "tr" ? "Yükleniyor..." : "Loading..."}</div> : filtered.length === 0 ? <div className="text-[var(--erp-muted)] flex items-center gap-2"><PackageCheck size={18}/>{label.noData}</div> : <div className="space-y-3">{filtered.map(item=><div key={item.id} className="bg-[var(--erp-panel-solid)] rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap"><div className="flex items-center gap-3"><div className="w-12 h-12 rounded-2xl bg-[var(--erp-glow)] flex items-center justify-center">{movementIcon(item.movement_type)}</div><div><h3 className="font-black">{pd(item.product_name) || item.product_id}</h3><p className="text-[var(--erp-muted)] text-sm">{pd(item.warehouse) || "-"} | {movementLabel(item.movement_type)} | {item.movement_date ? date(item.movement_date) : "-"}</p>{item.note && <p className="text-[var(--erp-muted)] text-xs mt-1">{pd(item.note)}</p>}</div></div><strong className="text-[var(--erp-accent)] text-xl">{n(item.quantity)}</strong></div>)}</div>}
    </div>
  </div>;
}
function Stat({ icon, title, value, danger }) { return <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-5"><div className="flex items-center gap-3 text-[var(--erp-accent)] mb-3">{icon}<span className="text-[var(--erp-muted)] font-bold">{title}</span></div><div className={`text-3xl font-black ${danger ? "text-red-300" : "text-[var(--erp-accent)]"}`}>{value}</div></div>; }
