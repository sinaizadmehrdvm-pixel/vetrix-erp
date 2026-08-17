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
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import Tooltip from "../components/ui/Tooltip";
import { Input, Textarea } from "../components/ui/Field";
import Skeleton from "../components/ui/Skeleton";

const WAREHOUSE_TYPES = ["main", "branch_stockroom", "distribution_center", "retail_backroom", "other"];

const emptyEditDraft = {
  name: "", code: "", address: "", branch_id: "", postal_code: "", phone: "",
  responsible_person: "", warehouse_type: "main", description: "", capacity: "", capacity_unit: "",
};

// `section` lets this component serve two distinct tabs of the unified
// Branches & Warehouses page without duplicating its data-fetching/CRUD
// logic: "list" (create + list + edit + breakdown/browse - the former
// standalone /warehouses page) or "transfers" (just the inter-warehouse
// transfer form). All state/effects stay unconditional regardless of
// which section is asked for, since `products`/`warehouses`/`branches`
// are shared inputs to both; only the returned Cards are gated.
export default function Warehouses({ section = "list" }) {
  const { dir, language, n } = useLanguage();
  const tr = (fa, ar, trText, en) => (language === "fa" ? fa : language === "ar" ? ar : language === "tr" ? trText : en);
  const pd = (value) => (language === "fa" ? toPersianDigits(value) : value);

  const warehouseTypeLabel = (type) => ({
    main: tr("انبار اصلی", "المستودع الرئيسي", "Ana depo", "Main"),
    branch_stockroom: tr("انبار شعبه", "مخزن الفرع", "Şube deposu", "Branch stockroom"),
    distribution_center: tr("مرکز توزیع", "مركز التوزيع", "Dağıtım merkezi", "Distribution center"),
    retail_backroom: tr("انبار پشت فروشگاه", "مخزن خلفي للمتجر", "Mağaza arka deposu", "Retail backroom"),
    other: tr("سایر", "أخرى", "Diğer", "Other"),
  }[type] || type);

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
    <div dir={dir} className="space-y-5 text-[var(--erp-text)]">
      {section === "list" && (
      <>
      {/* clip={false} + relative z-40: same stacking-context trap as
          Branches.jsx's filter card - .erp-surface's backdrop-filter gives
          every Card its own paint layer, so this card's Select popups
          (createBranchId/createType) would otherwise be painted over by
          the "Warehouses list" Card right below once opened. Elevated
          higher than the later cards in this section (z-30/z-20 below)
          since only one Select popup is ever open at a time but an
          earlier card's popup can extend down into a later card's space -
          never the reverse - so earlier cards need to outrank later ones. */}
      <Card icon={Plus} clip={false} className="relative z-40" title={language === "fa" ? "ساخت انبار/شعبه جدید" : language === "ar" ? "إنشاء مستودع/فرع جديد" : language === "tr" ? "Yeni depo/şube oluştur" : "Create a new warehouse/branch"}>
        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Input
            placeholder={language === "fa" ? "نام انبار (مثلاً «شعبه شمال»)" : language === "ar" ? "اسم المستودع (مثال: «الفرع الشمالي»)" : language === "tr" ? "Depo adı (örn. \"Kuzey şubesi\")" : "Warehouse name (e.g. \"North branch\")"}
            value={name}
            onChange={(e) => setName(language === "fa" ? toPersianDigits(e.target.value) : e.target.value)}
          />
          <Input
            placeholder={language === "fa" ? "کد (اختیاری)" : language === "ar" ? "الرمز (اختياري)" : language === "tr" ? "Kod (isteğe bağlı)" : "Code (optional)"}
            value={code}
            onChange={(e) => setCode(language === "fa" ? toPersianDigits(e.target.value) : e.target.value)}
          />
          <Select
            value={createBranchId}
            onChange={(value) => setCreateBranchId(value)}
            options={[{ value: "", label: tr("بدون شعبه", "بدون فرع", "Şubesiz", "No branch") }, ...branches.map((b) => ({ value: b.id, label: pd(b.name) }))]}
          />
          <Select
            value={createType}
            onChange={(value) => setCreateType(value)}
            options={WAREHOUSE_TYPES.map((t) => ({ value: t, label: warehouseTypeLabel(t) }))}
          />
          <Button type="submit" loading={creating} icon={Plus} className="md:col-span-4 justify-self-start">
            {creating ? (language === "fa" ? "در حال ساخت..." : language === "ar" ? "جارٍ الإنشاء..." : language === "tr" ? "Oluşturuluyor..." : "Creating...") : (language === "fa" ? "ساخت" : language === "ar" ? "إنشاء" : language === "tr" ? "Oluştur" : "Create")}
          </Button>
        </form>
      </Card>

      <Card title={language === "fa" ? "لیست انبارها" : language === "ar" ? "المستودعات" : language === "tr" ? "Depolar" : "Warehouses"}>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} height={64} radius="var(--erp-radius-md)" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {warehouses.map((w) => (
              <div
                key={w.id}
                className="erp-level-1 erp-table-row flex flex-wrap items-center justify-between gap-3 rounded-[var(--erp-radius-md)] px-4 py-2.5 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="inline-flex items-center justify-center shrink-0"
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: "var(--erp-radius-sm)",
                      background: "var(--erp-glow)",
                      color: "var(--erp-accent)",
                    }}
                  >
                    <WarehouseIcon size={18} />
                  </span>
                  <div className="min-w-0">
                    <div className="font-bold flex items-center gap-2 flex-wrap">
                      {pd(w.name)}
                      {w.is_default && (
                        <Badge tone="info">
                          {language === "fa" ? "پیش‌فرض" : language === "ar" ? "افتراضي" : language === "tr" ? "Varsayılan" : "Default"}
                        </Badge>
                      )}
                      {!w.active && (
                        <Badge tone="danger">
                          {language === "fa" ? "غیرفعال" : language === "ar" ? "غير نشط" : language === "tr" ? "Pasif" : "Inactive"}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-[var(--erp-muted)] flex gap-2">
                      {w.code && <span>{pd(w.code)}</span>}
                      {w.branch_id && <span>{pd(branchName(w.branch_id))}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Tooltip side="top" label={tr("ویرایش", "تعديل", "Düzenle", "Edit")}>
                    <Button variant="secondary" size="sm" icon={Pencil} aria-label={tr("ویرایش", "تعديل", "Düzenle", "Edit")} onClick={() => openEdit(w)} />
                  </Tooltip>
                  {!w.is_default && (w.active ? (
                    <Button variant="danger" size="sm" icon={ShieldOff} onClick={() => handleDeactivate(w.id)}>
                      {language === "fa" ? "غیرفعال کردن" : language === "ar" ? "إلغاء التفعيل" : language === "tr" ? "Devre Dışı Bırak" : "Deactivate"}
                    </Button>
                  ) : (
                    <Button variant="success" size="sm" icon={ShieldCheck} onClick={() => handleActivate(w.id)}>
                      {tr("فعال کردن", "تفعيل", "Etkinleştir", "Activate")}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      </>
      )}

      {/* Modal stays mounted unconditionally regardless of `section` (per
          the shared Modal's own correctness rule - open toggles visibility,
          it's never conditionally mounted) - its trigger (the Edit button
          above) only exists when section="list" is rendered, so `editOpen`
          can never become true from the "transfers" section anyway. */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} maxWidthClassName="max-w-2xl" labelledBy="warehouse-edit-title">
        <form onSubmit={handleSaveEdit} className="p-5 space-y-3">
          <h2 id="warehouse-edit-title" className="text-lg font-bold mb-2">{tr("ویرایش انبار", "تعديل المستودع", "Depoyu düzenle", "Edit warehouse")}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input placeholder={tr("نام", "الاسم", "Ad", "Name")} value={pd(editDraft.name)} onChange={(e) => setEditDraft({ ...editDraft, name: pd(e.target.value) })} />
            <Input placeholder={tr("کد", "الرمز", "Kod", "Code")} value={pd(editDraft.code)} onChange={(e) => setEditDraft({ ...editDraft, code: pd(e.target.value) })} />
            <Select
              value={editDraft.branch_id}
              onChange={(value) => setEditDraft({ ...editDraft, branch_id: value })}
              options={[{ value: "", label: tr("بدون شعبه", "بدون فرع", "Şubesiz", "No branch") }, ...branches.map((b) => ({ value: b.id, label: pd(b.name) }))]}
            />
            <Select
              value={editDraft.warehouse_type}
              onChange={(value) => setEditDraft({ ...editDraft, warehouse_type: value })}
              options={WAREHOUSE_TYPES.map((t) => ({ value: t, label: warehouseTypeLabel(t) }))}
            />
            <Input placeholder={tr("آدرس", "العنوان", "Adres", "Address")} value={pd(editDraft.address)} onChange={(e) => setEditDraft({ ...editDraft, address: pd(e.target.value) })} />
            <Input placeholder={tr("کد پستی", "الرمز البريدي", "Posta kodu", "Postal code")} value={pd(editDraft.postal_code)} onChange={(e) => setEditDraft({ ...editDraft, postal_code: pd(e.target.value) })} />
            <Input placeholder={tr("تلفن", "الهاتف", "Telefon", "Phone")} value={pd(editDraft.phone)} onChange={(e) => setEditDraft({ ...editDraft, phone: pd(e.target.value) })} />
            <Input placeholder={tr("مسئول انبار", "المسؤول", "Sorumlu kişi", "Responsible person")} value={pd(editDraft.responsible_person)} onChange={(e) => setEditDraft({ ...editDraft, responsible_person: pd(e.target.value) })} />
            <Input type="number" step="any" placeholder={tr("ظرفیت", "السعة", "Kapasite", "Capacity")} value={editDraft.capacity} onChange={(e) => setEditDraft({ ...editDraft, capacity: e.target.value })} />
            <Input placeholder={tr("واحد ظرفیت (مثلاً متر مربع)", "وحدة السعة", "Kapasite birimi", "Capacity unit")} value={pd(editDraft.capacity_unit)} onChange={(e) => setEditDraft({ ...editDraft, capacity_unit: pd(e.target.value) })} />
            <Textarea
              className="md:col-span-2"
              placeholder={tr("توضیحات", "الوصف", "Açıklama", "Description")}
              value={pd(editDraft.description)}
              onChange={(e) => setEditDraft({ ...editDraft, description: pd(e.target.value) })}
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>
              {tr("انصراف", "إلغاء", "İptal", "Cancel")}
            </Button>
            <Button type="submit" loading={savingEdit}>
              {savingEdit ? tr("در حال ذخیره...", "جارٍ الحفظ...", "Kaydediliyor...", "Saving...") : tr("ذخیره", "حفظ", "Kaydet", "Save")}
            </Button>
          </div>
        </form>
      </Modal>

      {section === "transfers" && (
      <Card icon={ArrowRightLeft} clip={false} className="relative z-40" title={language === "fa" ? "انتقال موجودی بین انبارها" : language === "ar" ? "نقل المخزون بين المستودعات" : language === "tr" ? "Depolar arası stok transferi" : "Transfer stock between warehouses"}>
        <form onSubmit={handleTransfer} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Select
            value={transferProductId}
            onChange={(value) => setTransferProductId(value)}
            options={[{ value: "", label: language === "fa" ? "انتخاب کالا..." : language === "ar" ? "اختيار المنتج..." : language === "tr" ? "Ürün seçin..." : "Select product..." }, ...products.map((p) => ({ value: p.id, label: pd(p.name) }))]}
          />
          <Input
            type="text"
            inputMode="numeric"
            placeholder={language === "fa" ? "تعداد" : language === "ar" ? "الكمية" : language === "tr" ? "Miktar" : "Quantity"}
            value={language === "fa" ? toPersianDigits(quantity) : quantity}
            onChange={(e) => setQuantity(cleanNumberInput(e.target.value))}
          />
          <Select
            value={fromWarehouseId}
            onChange={(value) => setFromWarehouseId(value)}
            options={[{ value: "", label: language === "fa" ? "از انبار..." : language === "ar" ? "من المستودع..." : language === "tr" ? "Kaynak depo..." : "From warehouse..." }, ...warehouses.map((w) => ({ value: w.id, label: pd(w.name) }))]}
          />
          <Select
            value={toWarehouseId}
            onChange={(value) => setToWarehouseId(value)}
            options={[{ value: "", label: language === "fa" ? "به انبار..." : language === "ar" ? "إلى المستودع..." : language === "tr" ? "Hedef depo..." : "To warehouse..." }, ...activeWarehouses.map((w) => ({ value: w.id, label: pd(w.name) }))]}
          />
          <Textarea
            className="md:col-span-2"
            placeholder={language === "fa" ? "یادداشت (اختیاری)" : language === "ar" ? "ملاحظة (اختياري)" : language === "tr" ? "Not (isteğe bağlı)" : "Note (optional)"}
            value={note}
            onChange={(e) => setNote(language === "fa" ? toPersianDigits(e.target.value) : e.target.value)}
          />
          <Button type="submit" loading={transferring} icon={ArrowRightLeft} className="md:col-span-2 justify-self-start">
            {transferring ? (language === "fa" ? "در حال انتقال..." : language === "ar" ? "جارٍ النقل..." : language === "tr" ? "Transfer ediliyor..." : "Transferring...") : (language === "fa" ? "انتقال" : language === "ar" ? "نقل" : language === "tr" ? "Transfer" : "Transfer")}
          </Button>
        </form>
      </Card>
      )}

      {section === "list" && (
      <>
      <Card clip={false} className="relative z-30" title={language === "fa" ? "موجودی هر کالا به تفکیک انبار" : language === "ar" ? "توزيع المخزون حسب المستودع لكل منتج" : language === "tr" ? "Ürün bazında depo stok dağılımı" : "Stock breakdown per product"}>
        <Select
          className="mb-3"
          value={breakdownProductId}
          onChange={(value) => void loadBreakdown(value)}
          options={[{ value: "", label: language === "fa" ? "انتخاب کالا..." : language === "ar" ? "اختيار المنتج..." : language === "tr" ? "Ürün seçin..." : "Select product..." }, ...products.map((p) => ({ value: p.id, label: pd(p.name) }))]}
        />
        {breakdown && (
          <div className="space-y-2 mt-3">
            <p className="text-sm text-[var(--erp-muted)]">
              {language === "fa" ? "مجموع کل: " : language === "ar" ? "الإجمالي: " : language === "tr" ? "Toplam: " : "Total: "}{n(breakdown.total)}
            </p>
            {breakdown.by_warehouse.map((row) => (
              <div key={row.warehouse_id} className="erp-level-1 erp-table-row flex items-center justify-between rounded-[var(--erp-radius-md)] px-4 py-2.5 transition-colors">
                <span>{pd(row.warehouse_name)}</span>
                <span className="font-black text-[var(--erp-accent)]">{n(row.quantity)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card clip={false} className="relative z-20" title={language === "fa" ? "کالاهای هر انبار" : language === "ar" ? "منتجات كل مستودع" : language === "tr" ? "Depoya göre ürünler" : "Products by warehouse"}>
        <Select
          className="mb-3"
          value={browseWarehouseId}
          onChange={(value) => void loadWarehouseItems(value)}
          options={[{ value: "", label: language === "fa" ? "انتخاب انبار..." : language === "ar" ? "اختيار المستودع..." : language === "tr" ? "Depo seçin..." : "Select warehouse..." }, ...warehouses.map((w) => ({ value: w.id, label: pd(w.name) }))]}
        />
        {warehouseItems && (
          warehouseItems.items.length === 0 ? (
            <p className="text-[var(--erp-muted)] mt-3">{language === "fa" ? "کالایی در این انبار نیست." : language === "ar" ? "لا يوجد مخزون في هذا المستودع." : language === "tr" ? "Bu depoda stok yok." : "No stock in this warehouse."}</p>
          ) : (
            <div className="space-y-2 mt-3">
              {warehouseItems.items.map((item) => (
                <div key={item.product_id} className="erp-level-1 erp-table-row flex items-center justify-between rounded-[var(--erp-radius-md)] px-4 py-2.5 transition-colors">
                  <span>{pd(item.product_name)}</span>
                  <span className="font-black text-[var(--erp-accent)]">{n(item.quantity)}</span>
                </div>
              ))}
            </div>
          )
        )}
      </Card>
      </>
      )}
    </div>
  );
}
