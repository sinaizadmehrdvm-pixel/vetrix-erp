import { useEffect, useMemo, useState } from "react";
import { Warehouse as WarehouseIcon, Plus, Search, PackageCheck, RefreshCw, AlertTriangle, Boxes, ArrowDownToLine, ArrowUpFromLine, SlidersHorizontal } from "lucide-react";
import { useLanguage } from "../localization/LanguageContext";
import { createStockMovement, getProducts, getStockMovements } from "../services/api";

const inputClass = "bg-slate-800 text-white placeholder-slate-400 border border-cyan-500/10 focus:border-cyan-400 rounded-2xl p-4 outline-none transition-all w-full";
function toNumber(value) { return Number(String(value ?? "").replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[,،]/g, "").replace(/[^\d.-]/g, "") || 0); }
function Field({ label, children }) { return <div className="space-y-2"><label className="text-sm font-bold text-cyan-200 block">{label}</label>{children}</div>; }

export default function Warehouse() {
  const { language, n, dir, date } = useLanguage();
  const fa = language === "fa";
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ warehouse: fa ? "انبار اصلی" : "Main Warehouse", product_id: "", quantity: "", movement_type: "in", movement_date: "", note: "" });

  const label = {
    title: fa ? "انبار" : "Warehouse",
    subtitle: fa ? "مدیریت موجودی کالاها، ورود، خروج و اصلاح موجودی" : "Manage product stock, stock-in, stock-out and adjustments",
    warehouse: fa ? "نام انبار" : "Warehouse name",
    product: fa ? "انتخاب کالا" : "Select product",
    quantity: fa ? "تعداد" : "Quantity",
    type: fa ? "نوع حرکت" : "Movement type",
    date: fa ? "تاریخ" : "Date",
    note: fa ? "توضیحات" : "Note",
    in: fa ? "ورود به انبار" : "Stock In",
    out: fa ? "خروج از انبار" : "Stock Out",
    adjustment: fa ? "اصلاح موجودی نهایی" : "Set final stock",
    save: fa ? "ثبت حرکت انبار" : "Save stock movement",
    noData: fa ? "حرکت انباری ثبت نشده است" : "No warehouse movement yet",
    search: fa ? "جستجوی کالا، انبار یا توضیحات..." : "Search product, warehouse or note...",
  };

  async function load() {
    try {
      setLoading(true); setError("");
      const [p, m] = await Promise.all([getProducts(), getStockMovements()]);
      setProducts(Array.isArray(p) ? p : []);
      setMovements(Array.isArray(m) ? m : []);
    } catch (e) { console.error(e); setError(fa ? "خطا در دریافت اطلاعات انبار" : "Error loading warehouse data"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [language]);

  async function addMovement() {
    if (!form.product_id || !form.quantity) { alert(fa ? "کالا و تعداد را وارد کن" : "Select product and quantity"); return; }
    try {
      const result = await createStockMovement({ ...form, product_id: Number(form.product_id), quantity: toNumber(form.quantity) });
      if (result?.status === "error") throw new Error(result.message);
      setForm({ warehouse: fa ? "انبار اصلی" : "Main Warehouse", product_id: "", quantity: "", movement_type: "in", movement_date: "", note: "" });
      await load();
    } catch (e) { alert(e.message || (fa ? "خطا در ثبت حرکت انبار" : "Error saving movement")); }
  }

  const filtered = useMemo(() => movements.filter(x => [x.product_name, x.warehouse, x.note, x.movement_type].join(" ").toLowerCase().includes(search.toLowerCase())), [movements, search]);
  const totalStock = products.reduce((sum, p) => sum + toNumber(p.stock), 0);
  const lowStock = products.filter(p => toNumber(p.stock) <= 5).length;

  function movementIcon(type) { if (type === "in") return <ArrowDownToLine className="text-green-300"/>; if (type === "out") return <ArrowUpFromLine className="text-red-300"/>; return <SlidersHorizontal className="text-cyan-300"/>; }
  function movementLabel(type) { return type === "in" ? label.in : type === "out" ? label.out : label.adjustment; }

  return <div dir={dir} style={{ direction: dir }} className="space-y-6">
    <div className="flex items-start justify-between gap-4 flex-wrap"><div><h1 className="text-4xl font-black text-cyan-400">{label.title}</h1><p className="text-slate-400 mt-2">{label.subtitle}</p></div><button onClick={load} className="px-4 py-3 rounded-2xl bg-slate-800 text-cyan-200 font-bold flex items-center gap-2 border border-cyan-500/20"><RefreshCw size={18}/>{fa ? "به‌روزرسانی" : "Refresh"}</button></div>
    {error && <div className="bg-red-500/15 border border-red-400/30 text-red-200 rounded-2xl p-4 flex items-center gap-2"><AlertTriangle size={20}/>{error}</div>}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5"><Stat icon={<Boxes/>} title={fa ? "تعداد کالا" : "Products"} value={n(products.length)}/><Stat icon={<PackageCheck/>} title={fa ? "موجودی کل" : "Total stock"} value={n(totalStock)}/><Stat icon={<AlertTriangle/>} title={fa ? "کالاهای کم‌موجودی" : "Low stock"} value={n(lowStock)} danger={lowStock>0}/></div>
    <div className="bg-slate-900/60 border border-cyan-500/20 rounded-3xl p-5"><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-4">
      <Field label={label.warehouse}><input className={inputClass} value={form.warehouse} onChange={e=>setForm({...form, warehouse:e.target.value})}/></Field>
      <Field label={label.product}><select className={inputClass} value={form.product_id} onChange={e=>setForm({...form, product_id:e.target.value})}><option value="">{label.product}</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} | {fa ? "موجودی" : "Stock"}: {n(p.stock||0)}</option>)}</select></Field>
      <Field label={label.quantity}><input type="number" className={inputClass} value={form.quantity} onChange={e=>setForm({...form, quantity:e.target.value})} placeholder="0"/></Field>
      <Field label={label.type}><select className={inputClass} value={form.movement_type} onChange={e=>setForm({...form, movement_type:e.target.value})}><option value="in">{label.in}</option><option value="out">{label.out}</option><option value="adjustment">{label.adjustment}</option></select></Field>
      <Field label={label.date}><input type="date" className={inputClass} value={form.movement_date} onChange={e=>setForm({...form, movement_date:e.target.value})}/></Field>
      <Field label={label.note}><input className={inputClass} value={form.note} onChange={e=>setForm({...form, note:e.target.value})} placeholder={label.note}/></Field>
    </div><button onClick={addMovement} className="mt-5 px-5 py-3 rounded-2xl bg-cyan-400 text-slate-950 font-black flex items-center gap-2"><Plus size={18}/>{label.save}</button></div>
    <div className="bg-slate-900/60 border border-cyan-500/20 rounded-3xl p-5"><div className="flex items-center gap-2 bg-slate-800 rounded-2xl px-4 py-3 mb-5"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={label.search} className="bg-transparent outline-none w-full text-white placeholder-slate-400"/></div>
    {loading ? <div className="text-slate-400">{fa ? "در حال دریافت..." : "Loading..."}</div> : filtered.length === 0 ? <div className="text-slate-400 flex items-center gap-2"><PackageCheck size={18}/>{label.noData}</div> : <div className="space-y-3">{filtered.map(item=><div key={item.id} className="bg-slate-800/70 rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap"><div className="flex items-center gap-3"><div className="w-12 h-12 rounded-2xl bg-cyan-500/20 flex items-center justify-center">{movementIcon(item.movement_type)}</div><div><h3 className="font-black">{item.product_name || item.product_id}</h3><p className="text-slate-400 text-sm">{item.warehouse || "-"} | {movementLabel(item.movement_type)} | {item.movement_date ? date(item.movement_date) : "-"}</p>{item.note && <p className="text-slate-500 text-xs mt-1">{item.note}</p>}</div></div><strong className="text-cyan-300 text-xl">{n(item.quantity)}</strong></div>)}</div>}
    </div>
  </div>;
}
function Stat({ icon, title, value, danger }) { return <div className="bg-slate-900/60 border border-cyan-500/20 rounded-3xl p-5"><div className="flex items-center gap-3 text-cyan-300 mb-3">{icon}<span className="text-slate-300 font-bold">{title}</span></div><div className={`text-3xl font-black ${danger ? "text-red-300" : "text-cyan-300"}`}>{value}</div></div>; }
