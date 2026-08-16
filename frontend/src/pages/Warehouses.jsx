import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, Pencil, Plus, ShieldCheck, ShieldOff, Warehouse as WarehouseIcon } from "lucide-react";
import toast from "react-hot-toast";

import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits, cleanNumberInput } from "../localization/helpers";
import {
  activateWarehouse,
  createWarehouse,
  deactivateWarehouse,
  getBranches,
  getProducts,
  getWarehouseProducts,
  getWarehouseStockBreakdown,
  getWarehouses,
  transferWarehouseStock,
  updateWarehouse,
} from "../services/api";
import Modal from "../components/ui/Modal";
import Select from "../components/ui/Select";

const cardClass = "rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-panel)] p-5";
const inputClass = "w-full mb-3 p-3 rounded-xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] outline-none focus:ring-2 focus:ring-cyan-400";
const buttonClass = "rounded-xl bg-[var(--erp-accent)] text-black font-black px-4 py-3 disabled:opacity-60 flex items-center gap-2";

const WAREHOUSE_TYPES = ["main", "branch_stockroom", "distribution_center", "retail_backroom", "other"];

const emptyEditDraft = {
  name: "", code: "", address: "", branch_id: "", postal_code: "", phone: "",
  responsible_person: "", warehouse_type: "main", description: "", capacity: "", capacity_unit: "",
};

export default function Warehouses() {
  const { dir, language, n } = useLanguage();
  const tr = (fa, ar, trText, en) => (language === "fa" ? fa : language === "ar" ? ar : language === "tr" ? trText : en);

  const [warehouses, setWarehouses] = useState([]);
  const [branches, setBranches] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [transferring, setTransferring] = useState(false);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [createBranchId, setCreateBranchId] = useState("");
  const [createType, setCreateType] = useState("main");

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editDraft, setEditDraft] = useState(emptyEditDraft);
  const [savingEdit, setSavingEdit] = useState(false);

  const [breakdownProductId, setBreakdownProductId] = useState("");
  const [breakdown, setBreakdown] = useState(null);

  const [transferProductId, setTransferProductId] = useState("");
  const [fromWarehouseId, setFromWarehouseId] = useState("");
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");

  const [browseWarehouseId, setBrowseWarehouseId] = useState("");
  const [warehouseItems, setWarehouseItems] = useState(null);

  const activeWarehouses = useMemo(() => warehouses.filter((w) => w.active), [warehouses]);

  async function loadAll() {
    setLoading(true);
    try {
      const [warehousesData, productsData, branchesData] = await Promise.all([getWarehouses(), getProducts(), getBranches()]);
      setWarehouses(warehousesData.items || []);
      setProducts(Array.isArray(productsData) ? productsData : []);
      setBranches(branchesData.items || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  const branchName = (branchId) => branches.find((b) => b.id === branchId)?.name || "";

  useEffect(() => {
    const timer = setTimeout(() => { void loadAll(); }, 0);
    return () => clearTimeout(timer);
  }, []);

  async function handleCreate(event) {
    event.preventDefault();
    if (!name.trim()) {
      toast.error(language === "fa" ? "نام انبار را وارد کنید." : language === "ar" ? "أدخل اسم المستودع." : language === "tr" ? "Depo adını girin." : "Enter a warehouse name.");
      return;
    }
    setCreating(true);
    try {
      await createWarehouse({
        name: name.trim(), code,
        branch_id: createBranchId ? Number(createBranchId) : null,
        warehouse_type: createType,
      });
      toast.success(language === "fa" ? "انبار ساخته شد." : language === "ar" ? "تم إنشاء المستودع." : language === "tr" ? "Depo oluşturuldu." : "Warehouse created.");
      setName("");
      setCode("");
      setCreateBranchId("");
      setCreateType("main");
      await loadAll();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDeactivate(id) {
    try {
      await deactivateWarehouse(id);
      toast.success(language === "fa" ? "انبار غیرفعال شد." : language === "ar" ? "تم إلغاء تفعيل المستودع." : language === "tr" ? "Depo devre dışı bırakıldı." : "Warehouse deactivated.");
      await loadAll();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleActivate(id) {
    try {
      await activateWarehouse(id);
      toast.success(tr("انبار فعال شد.", "تم تفعيل المستودع.", "Depo etkinleştirildi.", "Warehouse activated."));
      await loadAll();
    } catch (err) {
      toast.error(err.message);
    }
  }

  function openEdit(w) {
    setEditId(w.id);
    setEditDraft({
      name: w.name || "", code: w.code || "", address: w.address || "",
      branch_id: w.branch_id ?? "", postal_code: w.postal_code || "", phone: w.phone || "",
      responsible_person: w.responsible_person || "", warehouse_type: w.warehouse_type || "main",
      description: w.description || "", capacity: w.capacity ?? "", capacity_unit: w.capacity_unit || "",
    });
    setEditOpen(true);
  }

  async function handleSaveEdit(event) {
    event.preventDefault();
    if (!editDraft.name.trim()) {
      toast.error(tr("نام انبار را وارد کنید.", "أدخل اسم المستودع.", "Depo adını girin.", "Enter a warehouse name."));
      return;
    }
    setSavingEdit(true);
    try {
      await updateWarehouse(editId, {
        ...editDraft,
        branch_id: editDraft.branch_id === "" ? null : Number(editDraft.branch_id),
        capacity: editDraft.capacity === "" ? null : Number(editDraft.capacity),
      });
      toast.success(tr("انبار ویرایش شد.", "تم تعديل المستودع.", "Depo güncellendi.", "Warehouse updated."));
      setEditOpen(false);
      await loadAll();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingEdit(false);
    }
  }

  async function loadBreakdown(productId) {
    setBreakdownProductId(productId);
    if (!productId) {
      setBreakdown(null);
      return;
    }
    try {
      const data = await getWarehouseStockBreakdown(productId);
      setBreakdown(data);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function loadWarehouseItems(warehouseId) {
    setBrowseWarehouseId(warehouseId);
    if (!warehouseId) {
      setWarehouseItems(null);
      return;
    }
    try {
      const data = await getWarehouseProducts(warehouseId);
      setWarehouseItems(data);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleTransfer(event) {
    event.preventDefault();
    if (!transferProductId || !fromWarehouseId || !toWarehouseId) {
      toast.error(language === "fa" ? "همه فیلدها را پر کنید." : language === "ar" ? "يرجى تعبئة جميع الحقول." : language === "tr" ? "Lütfen tüm alanları doldurun." : "Fill in all fields.");
      return;
    }
    if (fromWarehouseId === toWarehouseId) {
      toast.error(language === "fa" ? "انبار مبدا و مقصد باید متفاوت باشند." : language === "ar" ? "يجب أن يختلف المستودع المصدر عن المستودع الوجهة." : language === "tr" ? "Kaynak ve hedef depo farklı olmalıdır." : "Source and destination must differ.");
      return;
    }
    setTransferring(true);
    try {
      await transferWarehouseStock({
        product_id: Number(transferProductId),
        from_warehouse_id: Number(fromWarehouseId),
        to_warehouse_id: Number(toWarehouseId),
        quantity: Number(quantity),
        note,
      });
      toast.success(language === "fa" ? "انتقال انجام شد." : language === "ar" ? "تم إتمام النقل." : language === "tr" ? "Transfer tamamlandı." : "Transfer completed.");
      setQuantity("");
      setNote("");
      if (String(transferProductId) === String(breakdownProductId)) {
        await loadBreakdown(breakdownProductId);
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setTransferring(false);
    }
  }

  return (
    <div dir={dir} className="p-4 md:p-6 space-y-6 text-[var(--erp-text)]">
      <h1 className="text-2xl font-black flex items-center gap-2">
        <WarehouseIcon className="text-[var(--erp-accent)]" />
        {language === "fa" ? "شعبه‌ها و انبارهای متعدد" : language === "ar" ? "الفروع والمستودعات المتعددة" : language === "tr" ? "Çoklu şube ve depolar" : "Multi-branch warehouses"}
      </h1>

      <section className={cardClass}>
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Plus size={18} /> {language === "fa" ? "ساخت انبار/شعبه جدید" : language === "ar" ? "إنشاء مستودع/فرع جديد" : language === "tr" ? "Yeni depo/şube oluştur" : "Create a new warehouse/branch"}
        </h2>
        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            className={inputClass + " mb-0"}
            placeholder={language === "fa" ? "نام انبار (مثلاً «شعبه شمال»)" : language === "ar" ? "اسم المستودع (مثال: «الفرع الشمالي»)" : language === "tr" ? "Depo adı (örn. \"Kuzey şubesi\")" : "Warehouse name (e.g. \"North branch\")"}
            value={name}
            onChange={(e) => setName(language === "fa" ? toPersianDigits(e.target.value) : e.target.value)}
          />
          <input
            className={inputClass + " mb-0"}
            placeholder={language === "fa" ? "کد (اختیاری)" : language === "ar" ? "الرمز (اختياري)" : language === "tr" ? "Kod (isteğe bağlı)" : "Code (optional)"}
            value={code}
            onChange={(e) => setCode(language === "fa" ? toPersianDigits(e.target.value) : e.target.value)}
          />
          <Select
            className="mb-0"
            value={createBranchId}
            onChange={(value) => setCreateBranchId(value)}
            options={[{ value: "", label: tr("بدون شعبه", "بدون فرع", "Şubesiz", "No branch") }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
          />
          <Select
            className="mb-0"
            value={createType}
            onChange={(value) => setCreateType(value)}
            options={WAREHOUSE_TYPES.map((t) => ({ value: t, label: t }))}
          />
          <button type="submit" disabled={creating} className={buttonClass}>
            <Plus size={16} />
            {creating ? (language === "fa" ? "در حال ساخت..." : language === "ar" ? "جارٍ الإنشاء..." : language === "tr" ? "Oluşturuluyor..." : "Creating...") : (language === "fa" ? "ساخت" : language === "ar" ? "إنشاء" : language === "tr" ? "Oluştur" : "Create")}
          </button>
        </form>
      </section>

      <section className={cardClass}>
        <h2 className="text-lg font-bold mb-4">{language === "fa" ? "لیست انبارها" : language === "ar" ? "المستودعات" : language === "tr" ? "Depolar" : "Warehouses"}</h2>
        {loading ? (
          <p className="text-[var(--erp-muted)]">{language === "fa" ? "در حال بارگذاری..." : language === "ar" ? "جارٍ التحميل..." : language === "tr" ? "Yükleniyor..." : "Loading..."}</p>
        ) : (
          <div className="space-y-2">
            {warehouses.map((w) => (
              <div key={w.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--erp-panel-solid)] px-4 py-3">
                <div>
                  <div className="font-bold">
                    {w.name}
                    {w.is_default && (
                      <span className="ms-2 text-xs px-2 py-1 rounded-lg bg-[var(--erp-glow)] text-[var(--erp-accent)]">
                        {language === "fa" ? "پیش‌فرض" : language === "ar" ? "افتراضي" : language === "tr" ? "Varsayılan" : "Default"}
                      </span>
                    )}
                    {!w.active && (
                      <span className="ms-2 text-xs px-2 py-1 rounded-lg bg-red-500/15 text-red-200">
                        {language === "fa" ? "غیرفعال" : language === "ar" ? "غير نشط" : language === "tr" ? "Pasif" : "Inactive"}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--erp-muted)] flex gap-2">
                    {w.code && <span>{w.code}</span>}
                    {w.branch_id && <span>{branchName(w.branch_id)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => openEdit(w)} className="p-2 rounded-xl bg-[var(--erp-panel)] border border-[var(--erp-border)]" title={tr("ویرایش", "تعديل", "Düzenle", "Edit")}>
                    <Pencil size={14} />
                  </button>
                  {!w.is_default && (w.active ? (
                    <button
                      onClick={() => handleDeactivate(w.id)}
                      className="px-3 py-2 rounded-xl bg-red-500/15 text-red-200 text-sm font-bold flex items-center gap-1"
                    >
                      <ShieldOff size={14} /> {language === "fa" ? "غیرفعال کردن" : language === "ar" ? "إلغاء التفعيل" : language === "tr" ? "Devre Dışı Bırak" : "Deactivate"}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleActivate(w.id)}
                      className="px-3 py-2 rounded-xl bg-emerald-500/15 text-emerald-300 text-sm font-bold flex items-center gap-1"
                    >
                      <ShieldCheck size={14} /> {tr("فعال کردن", "تفعيل", "Etkinleştir", "Activate")}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} maxWidthClassName="max-w-2xl" labelledBy="warehouse-edit-title">
        <form onSubmit={handleSaveEdit} className="p-5 space-y-3">
          <h2 id="warehouse-edit-title" className="text-lg font-bold mb-2">{tr("ویرایش انبار", "تعديل المستودع", "Depoyu düzenle", "Edit warehouse")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input className={inputClass} placeholder={tr("نام", "الاسم", "Ad", "Name")} value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} />
            <input className={inputClass} placeholder={tr("کد", "الرمز", "Kod", "Code")} value={editDraft.code} onChange={(e) => setEditDraft({ ...editDraft, code: e.target.value })} />
            <Select
              className="mb-3"
              value={editDraft.branch_id}
              onChange={(value) => setEditDraft({ ...editDraft, branch_id: value })}
              options={[{ value: "", label: tr("بدون شعبه", "بدون فرع", "Şubesiz", "No branch") }, ...branches.map((b) => ({ value: b.id, label: b.name }))]}
            />
            <Select
              className="mb-3"
              value={editDraft.warehouse_type}
              onChange={(value) => setEditDraft({ ...editDraft, warehouse_type: value })}
              options={WAREHOUSE_TYPES.map((t) => ({ value: t, label: t }))}
            />
            <input className={inputClass} placeholder={tr("آدرس", "العنوان", "Adres", "Address")} value={editDraft.address} onChange={(e) => setEditDraft({ ...editDraft, address: e.target.value })} />
            <input className={inputClass} placeholder={tr("کد پستی", "الرمز البريدي", "Posta kodu", "Postal code")} value={editDraft.postal_code} onChange={(e) => setEditDraft({ ...editDraft, postal_code: e.target.value })} />
            <input className={inputClass} placeholder={tr("تلفن", "الهاتف", "Telefon", "Phone")} value={editDraft.phone} onChange={(e) => setEditDraft({ ...editDraft, phone: e.target.value })} />
            <input className={inputClass} placeholder={tr("مسئول انبار", "المسؤول", "Sorumlu kişi", "Responsible person")} value={editDraft.responsible_person} onChange={(e) => setEditDraft({ ...editDraft, responsible_person: e.target.value })} />
            <input className={inputClass} type="number" step="any" placeholder={tr("ظرفیت", "السعة", "Kapasite", "Capacity")} value={editDraft.capacity} onChange={(e) => setEditDraft({ ...editDraft, capacity: e.target.value })} />
            <input className={inputClass} placeholder={tr("واحد ظرفیت (مثلاً متر مربع)", "وحدة السعة", "Kapasite birimi", "Capacity unit")} value={editDraft.capacity_unit} onChange={(e) => setEditDraft({ ...editDraft, capacity_unit: e.target.value })} />
            <textarea className={inputClass + " md:col-span-2"} placeholder={tr("توضیحات", "الوصف", "Açıklama", "Description")} value={editDraft.description} onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })} />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={() => setEditOpen(false)} className="px-4 py-3 rounded-xl bg-[var(--erp-panel)] border border-[var(--erp-border)]">
              {tr("انصراف", "إلغاء", "İptal", "Cancel")}
            </button>
            <button type="submit" disabled={savingEdit} className={buttonClass}>
              {savingEdit ? tr("در حال ذخیره...", "جارٍ الحفظ...", "Kaydediliyor...", "Saving...") : tr("ذخیره", "حفظ", "Kaydet", "Save")}
            </button>
          </div>
        </form>
      </Modal>

      <section className={cardClass}>
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <ArrowRightLeft size={18} /> {language === "fa" ? "انتقال موجودی بین انبارها" : language === "ar" ? "نقل المخزون بين المستودعات" : language === "tr" ? "Depolar arası stok transferi" : "Transfer stock between warehouses"}
        </h2>
        <form onSubmit={handleTransfer} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Select
            className="mb-3"
            value={transferProductId}
            onChange={(value) => setTransferProductId(value)}
            options={[{ value: "", label: language === "fa" ? "انتخاب کالا..." : language === "ar" ? "اختيار المنتج..." : language === "tr" ? "Ürün seçin..." : "Select product..." }, ...products.map((p) => ({ value: p.id, label: p.name }))]}
          />
          <input
            type="text"
            inputMode="numeric"
            className={inputClass}
            placeholder={language === "fa" ? "تعداد" : language === "ar" ? "الكمية" : language === "tr" ? "Miktar" : "Quantity"}
            value={language === "fa" ? toPersianDigits(quantity) : quantity}
            onChange={(e) => setQuantity(cleanNumberInput(e.target.value))}
          />
          <Select
            className="mb-3"
            value={fromWarehouseId}
            onChange={(value) => setFromWarehouseId(value)}
            options={[{ value: "", label: language === "fa" ? "از انبار..." : language === "ar" ? "من المستودع..." : language === "tr" ? "Kaynak depo..." : "From warehouse..." }, ...warehouses.map((w) => ({ value: w.id, label: w.name }))]}
          />
          <Select
            className="mb-3"
            value={toWarehouseId}
            onChange={(value) => setToWarehouseId(value)}
            options={[{ value: "", label: language === "fa" ? "به انبار..." : language === "ar" ? "إلى المستودع..." : language === "tr" ? "Hedef depo..." : "To warehouse..." }, ...activeWarehouses.map((w) => ({ value: w.id, label: w.name }))]}
          />
          <textarea
            className={inputClass + " md:col-span-2"}
            placeholder={language === "fa" ? "یادداشت (اختیاری)" : language === "ar" ? "ملاحظة (اختياري)" : language === "tr" ? "Not (isteğe bağlı)" : "Note (optional)"}
            value={note}
            onChange={(e) => setNote(language === "fa" ? toPersianDigits(e.target.value) : e.target.value)}
          />
          <button type="submit" disabled={transferring} className={buttonClass}>
            <ArrowRightLeft size={16} />
            {transferring ? (language === "fa" ? "در حال انتقال..." : language === "ar" ? "جارٍ النقل..." : language === "tr" ? "Transfer ediliyor..." : "Transferring...") : (language === "fa" ? "انتقال" : language === "ar" ? "نقل" : language === "tr" ? "Transfer" : "Transfer")}
          </button>
        </form>
      </section>

      <section className={cardClass}>
        <h2 className="text-lg font-bold mb-4">{language === "fa" ? "موجودی هر کالا به تفکیک انبار" : language === "ar" ? "توزيع المخزون حسب المستودع لكل منتج" : language === "tr" ? "Ürün bazında depo stok dağılımı" : "Stock breakdown per product"}</h2>
        <Select
          className="mb-3"
          value={breakdownProductId}
          onChange={(value) => void loadBreakdown(value)}
          options={[{ value: "", label: language === "fa" ? "انتخاب کالا..." : language === "ar" ? "اختيار المنتج..." : language === "tr" ? "Ürün seçin..." : "Select product..." }, ...products.map((p) => ({ value: p.id, label: p.name }))]}
        />
        {breakdown && (
          <div className="space-y-2 mt-3">
            <p className="text-sm text-[var(--erp-muted)]">
              {language === "fa" ? "مجموع کل: " : language === "ar" ? "الإجمالي: " : language === "tr" ? "Toplam: " : "Total: "}{n(breakdown.total)}
            </p>
            {breakdown.by_warehouse.map((row) => (
              <div key={row.warehouse_id} className="flex items-center justify-between rounded-xl bg-[var(--erp-panel-solid)] px-4 py-3">
                <span>{row.warehouse_name}</span>
                <span className="font-black text-[var(--erp-accent)]">{n(row.quantity)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={cardClass}>
        <h2 className="text-lg font-bold mb-4">{language === "fa" ? "کالاهای هر انبار" : language === "ar" ? "منتجات كل مستودع" : language === "tr" ? "Depoya göre ürünler" : "Products by warehouse"}</h2>
        <Select
          className="mb-3"
          value={browseWarehouseId}
          onChange={(value) => void loadWarehouseItems(value)}
          options={[{ value: "", label: language === "fa" ? "انتخاب انبار..." : language === "ar" ? "اختيار المستودع..." : language === "tr" ? "Depo seçin..." : "Select warehouse..." }, ...warehouses.map((w) => ({ value: w.id, label: w.name }))]}
        />
        {warehouseItems && (
          warehouseItems.items.length === 0 ? (
            <p className="text-[var(--erp-muted)] mt-3">{language === "fa" ? "کالایی در این انبار نیست." : language === "ar" ? "لا يوجد مخزون في هذا المستودع." : language === "tr" ? "Bu depoda stok yok." : "No stock in this warehouse."}</p>
          ) : (
            <div className="space-y-2 mt-3">
              {warehouseItems.items.map((item) => (
                <div key={item.product_id} className="flex items-center justify-between rounded-xl bg-[var(--erp-panel-solid)] px-4 py-3">
                  <span>{item.product_name}</span>
                  <span className="font-black text-[var(--erp-accent)]">{n(item.quantity)}</span>
                </div>
              ))}
            </div>
          )
        )}
      </section>
    </div>
  );
}
