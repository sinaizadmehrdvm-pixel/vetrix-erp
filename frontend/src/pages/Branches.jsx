import { useEffect, useMemo, useState } from "react";
import { Building2, Pencil, Plus, Search, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits, cleanNumberInput } from "../localization/helpers";
import { activateBranch, createBranch, deactivateBranch, getBranches, getWarehouses, updateBranch } from "../services/api";
import Modal from "../components/ui/Modal";
import { Table, Thead, Th, Tbody, Tr, Td } from "../components/ui/Table";
import Select from "../components/ui/Select";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Badge from "../components/ui/Badge";
import Tooltip from "../components/ui/Tooltip";
import { Input } from "../components/ui/Field";
import Skeleton from "../components/ui/Skeleton";
import { confirmAction } from "../components/ui/confirmService";

// Compact cell padding for this page's table only (Table.jsx's Th/Td
// accept a `style` prop that merges over their own default padding, so
// this doesn't need any !important override or a shared-component
// change) - shrinks the per-column horizontal footprint enough that the
// 8-column layout fits typical desktop/laptop widths without falling
// back to the table wrapper's overflow-x-auto scroll.
const cellPad = { padding: "10px 10px" };
// `table-layout` defaults to `auto`, under which a `width:100%` table is
// only a MINIMUM, not a cap - the browser sizes every column from its
// widest cell content (and Th forces `white-space:nowrap`), so once that
// content sum exceeds the available width the table simply grows past
// its container regardless of `w-full`, which is what was still forcing
// the wrapper's horizontal scrollbar even after compacting padding and
// hiding two columns. `table-layout:fixed` makes the browser respect the
// table's own width as a hard cap instead - column widths are then taken
// ONLY from the first row's cells (Thead's `Th`s, since Thead is first
// in DOM), so every `Th` below is given an explicit width except Name,
// left unset so it's the one column that absorbs whatever space remains.
const thFixed = { ...cellPad, overflow: "hidden", textOverflow: "ellipsis" };
// Manager/phone are secondary metadata (still one click away via Edit) -
// hidden below xl so the remaining 6 columns' fixed-width budget (510px)
// comfortably fits laptop/tablet widths down to 1024px. `lg` (1024px)
// was tried first, but at exactly that width - with the sidebar in its
// default expanded state - the full 8-column budget (740px) doesn't
// reliably fit the available content area, reintroducing the very
// scrollbar this column-hiding exists to prevent right at the
// breakpoint where the extra columns turn on. `xl` (1280px) is safely
// above that crossover.
const secondaryColClass = "hidden xl:table-cell";

const BRANCH_TYPES = ["headquarters", "retail_store", "warehouse_only", "office", "other"];
// Every free-text field gets its digits Persianized on entry except email/website,
// which must stay ASCII to remain valid addresses/URLs.
const LATIN_ONLY_TEXT_FIELDS = new Set(["email", "website"]);

const emptyDraft = {
  name: "", code: "", branch_type: "retail_store", address: "", province: "", city: "", district: "",
  postal_code: "", country: "", phone: "", mobile: "", email: "", website: "", manager_name: "",
  tax_id: "", business_registration_number: "", working_hours: "", notes: "",
  latitude: "", longitude: "", default_warehouse_id: "",
};

export default function Branches() {
  const { dir, language, n } = useLanguage();
  const tr = (fa, ar, trText, en) => (language === "fa" ? fa : language === "ar" ? ar : language === "tr" ? trText : en);
  const pd = (value) => (language === "fa" ? toPersianDigits(value) : value);

  const [branches, setBranches] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (typeFilter) params.branch_type = typeFilter;
      if (activeFilter) params.active = activeFilter;
      const [branchesData, warehousesData] = await Promise.all([getBranches(params), getWarehouses()]);
      setBranches(branchesData.items || []);
      setWarehouses(warehousesData.items || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, activeFilter]);

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const branchTypeLabel = (type) => ({
    headquarters: tr("مرکز اصلی", "المقر الرئيسي", "Genel merkez", "Headquarters"),
    retail_store: tr("فروشگاه", "متجر", "Mağaza", "Retail store"),
    warehouse_only: tr("فقط انبار", "مستودع فقط", "Sadece depo", "Warehouse only"),
    office: tr("دفتر", "مكتب", "Ofis", "Office"),
    other: tr("سایر", "أخرى", "Diğer", "Other"),
  }[type] || type);

  function openCreate() {
    setEditingId(null);
    setDraft(emptyDraft);
    setModalOpen(true);
  }

  function openEdit(branch) {
    setEditingId(branch.id);
    setDraft({
      ...emptyDraft,
      ...branch,
      latitude: branch.latitude ?? "",
      longitude: branch.longitude ?? "",
      default_warehouse_id: branch.default_warehouse_id ?? "",
    });
    setModalOpen(true);
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!draft.name.trim()) {
      toast.error(tr("نام شعبه را وارد کنید.", "أدخل اسم الفرع.", "Şube adını girin.", "Enter a branch name."));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...draft,
        latitude: draft.latitude === "" ? null : Number(draft.latitude),
        longitude: draft.longitude === "" ? null : Number(draft.longitude),
        default_warehouse_id: draft.default_warehouse_id === "" ? null : Number(draft.default_warehouse_id),
      };
      if (editingId) {
        await updateBranch(editingId, payload);
        toast.success(tr("شعبه ویرایش شد.", "تم تعديل الفرع.", "Şube güncellendi.", "Branch updated."));
      } else {
        await createBranch(payload);
        toast.success(tr("شعبه ساخته شد.", "تم إنشاء الفرع.", "Şube oluşturuldu.", "Branch created."));
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(branch) {
    try {
      if (branch.active) {
        await deactivateBranch(branch.id);
        toast.success(tr("شعبه غیرفعال شد.", "تم إلغاء تفعيل الفرع.", "Şube devre dışı bırakıldı.", "Branch deactivated."));
      } else {
        await activateBranch(branch.id);
        toast.success(tr("شعبه فعال شد.", "تم تفعيل الفرع.", "Şube etkinleştirildi.", "Branch activated."));
      }
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  // Branches are never hard-deleted on the backend (app/branches.py has no
  // DELETE route by design - warehouses/stock/accounting history may
  // reference a branch through its warehouses) - the safe, real system
  // behavior is deactivation. This "delete" action is a clearly-labeled,
  // explicitly-confirmed entry point onto that same safe path, instead of
  // silently reusing the quick status toggle for what a user thinks of as
  // "removing" a branch.
  async function handleDeleteBranch(branch) {
    const confirmed = await confirmAction(
      tr(
        `شعبه‌ها هرگز به‌طور کامل حذف نمی‌شوند، چون ممکن است انبارها، موجودی یا سوابق حسابداری به آن‌ها ارجاع داده باشند. با تأیید، شعبه «${branch.name}» غیرفعال (بایگانی) می‌شود و سوابق آن حفظ خواهد شد.`,
        `لا تُحذف الفروع نهائيًا أبدًا لأنها قد تكون مرتبطة بمستودعات أو مخزون أو سجلات محاسبية. عند التأكيد، سيتم إلغاء تفعيل (أرشفة) الفرع «${branch.name}» مع الحفاظ على سجلاته.`,
        `Şubeler; depolar, stok veya muhasebe kayıtları tarafından referans alınabileceğinden asla kalıcı olarak silinmez. Onaylarsanız «${branch.name}» şubesi devre dışı bırakılır (arşivlenir) ve geçmişi korunur.`,
        `Branches are never permanently deleted, since warehouses, stock, or accounting records may reference them. Confirming will deactivate (archive) "${branch.name}" and preserve its history.`
      ),
      { danger: true }
    );
    if (!confirmed) return;
    try {
      await deactivateBranch(branch.id);
      toast.success(tr("شعبه بایگانی شد.", "تمت أرشفة الفرع.", "Şube arşivlendi.", "Branch archived."));
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const fieldGroups = useMemo(() => ([
    {
      title: tr("اطلاعات پایه", "المعلومات الأساسية", "Temel bilgiler", "Basic info"),
      fields: [
        ["name", tr("نام شعبه", "اسم الفرع", "Şube adı", "Branch name"), "text"],
        ["code", tr("کد شعبه", "رمز الفرع", "Şube kodu", "Branch code"), "text"],
        ["branch_type", tr("نوع شعبه", "نوع الفرع", "Şube türü", "Branch type"), "select"],
        ["manager_name", tr("مدیر شعبه", "مدير الفرع", "Şube müdürü", "Branch manager"), "text"],
        ["default_warehouse_id", tr("انبار پیش‌فرض", "المستودع الافتراضي", "Varsayılan depo", "Default warehouse"), "warehouse"],
      ],
    },
    {
      title: tr("آدرس", "العنوان", "Adres", "Address"),
      fields: [
        ["country", tr("کشور", "الدولة", "Ülke", "Country"), "text"],
        ["province", tr("استان", "المحافظة", "İl", "Province/state"), "text"],
        ["city", tr("شهر", "المدينة", "Şehir", "City"), "text"],
        ["district", tr("منطقه", "الحي", "İlçe", "District"), "text"],
        ["postal_code", tr("کد پستی", "الرمز البريدي", "Posta kodu", "Postal code"), "text"],
        ["address", tr("آدرس کامل", "العنوان الكامل", "Tam adres", "Full address"), "text"],
        ["latitude", tr("عرض جغرافیایی", "خط العرض", "Enlem", "Latitude"), "number"],
        ["longitude", tr("طول جغرافیایی", "خط الطول", "Boylam", "Longitude"), "number"],
      ],
    },
    {
      title: tr("ارتباطات", "الاتصال", "İletişim", "Contact"),
      fields: [
        ["phone", tr("تلفن", "الهاتف", "Telefon", "Phone"), "text"],
        ["mobile", tr("موبایل", "الجوال", "Cep telefonu", "Mobile"), "text"],
        ["email", tr("ایمیل", "البريد الإلكتروني", "E-posta", "Email"), "text"],
        ["website", tr("وب‌سایت", "الموقع الإلكتروني", "Web sitesi", "Website"), "text"],
        ["working_hours", tr("ساعات کاری", "ساعات العمل", "Çalışma saatleri", "Working hours"), "text"],
      ],
    },
    {
      title: tr("اطلاعات ثبتی و مالیاتی", "معلومات ضريبية وتسجيلية", "Vergi ve tescil bilgileri", "Tax & registration"),
      fields: [
        ["tax_id", tr("شناسه مالیاتی", "الرقم الضريبي", "Vergi kimlik no", "Tax ID"), "text"],
        ["business_registration_number", tr("شماره ثبت شرکت", "رقم السجل التجاري", "Ticaret sicil no", "Business registration no."), "text"],
        ["notes", tr("یادداشت", "ملاحظات", "Notlar", "Notes"), "text"],
      ],
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]), [language]);

  return (
    <div dir={dir} className="space-y-5 text-[var(--erp-text)]">
      {/* No own PageHeader here - this component is now only ever embedded
          as the "Branches" tab of the unified Branches & Warehouses page,
          which owns the single shared PageHeader for all its tabs. The
          create action stays local to this tab, same handler as before. */}
      <div className="flex items-center justify-end">
        <Button icon={Plus} onClick={openCreate}>
          {tr("شعبه جدید", "فرع جديد", "Yeni şube", "New branch")}
        </Button>
      </div>

      {/* clip={false} lets the Select popups escape this card's box instead
          of being cropped - but `.erp-surface` (Card's own class) sets
          `backdrop-filter: blur(16px)`, which creates an isolated stacking
          context on EVERY Card. Without an explicit z-index, that context
          sits at the same implicit stacking level as the table Card below
          it, and the later-in-DOM table Card (also `.erp-surface`) then
          paints its own layer over whatever the popup renders outside the
          filter card's box - clip=false alone stops the crop but not this
          layering, which is what made the open dropdown look like it was
          rendering "into"/behind the table. `relative z-20` lifts this
          card's whole stacking context above that implicit level so the
          popup - and anything else that overflows this card - correctly
          paints on top of the table Card, not behind it. */}
      <Card padding={false} clip={false} className="relative z-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3" style={{ padding: 20 }}>
          <label className="vitalix-input-group flex items-center gap-2" style={{ padding: "0 12px" }}>
            <Search size={16} className="text-[var(--erp-muted)] shrink-0" />
            <input
              placeholder={tr("جستجوی نام، کد یا شهر...", "بحث بالاسم أو الرمز أو المدينة...", "Ad, kod veya şehre göre ara...", "Search name, code, or city...")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={tr("جستجوی شعبه", "بحث الفروع", "Şube ara", "Search branches")}
              className="min-w-0 flex-1"
              style={{ color: "var(--erp-text)", padding: "10px 0" }}
            />
          </label>
          <Select
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: "", label: tr("همه انواع", "كل الأنواع", "Tüm türler", "All types") },
              ...BRANCH_TYPES.map((t) => ({ value: t, label: branchTypeLabel(t) })),
            ]}
          />
          <Select
            value={activeFilter}
            onChange={setActiveFilter}
            options={[
              { value: "", label: tr("همه وضعیت‌ها", "كل الحالات", "Tüm durumlar", "All statuses") },
              { value: "true", label: tr("فعال", "نشط", "Aktif", "Active") },
              { value: "false", label: tr("غیرفعال", "غير نشط", "Pasif", "Inactive") },
            ]}
          />
        </div>
      </Card>

      <Card padding={false}>
        {loading ? (
          <div className="space-y-2" style={{ padding: 20 }}>
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} height={44} radius="var(--erp-radius-md)" />
            ))}
          </div>
        ) : branches.length === 0 ? (
          <div className="text-center text-[var(--erp-muted)]" style={{ padding: "48px 20px" }}>
            <Building2 size={28} className="mx-auto mb-3 opacity-60" />
            <p className="text-sm">{tr("هنوز شعبه‌ای ثبت نشده است.", "لم يتم تسجيل أي فرع بعد.", "Henüz şube kaydedilmedi.", "No branches registered yet.")}</p>
            <Button className="mt-4" size="sm" icon={Plus} onClick={openCreate}>
              {tr("ساخت اولین شعبه", "إنشاء أول فرع", "İlk şubeyi oluştur", "Create your first branch")}
            </Button>
          </div>
        ) : (
          <Table className="table-fixed">
            <Thead>
              <Th style={{ ...thFixed, width: 40 }}>#</Th>
              <Th style={cellPad}>{tr("نام", "الاسم", "Ad", "Name")}</Th>
              <Th style={{ ...thFixed, width: 100 }}>{tr("نوع", "النوع", "Tür", "Type")}</Th>
              <Th style={{ ...thFixed, width: 100 }}>{tr("شهر", "المدينة", "Şehir", "City")}</Th>
              <Th className={secondaryColClass} style={{ ...thFixed, width: 120 }}>{tr("مدیر", "المدير", "Müdür", "Manager")}</Th>
              <Th className={secondaryColClass} style={{ ...thFixed, width: 110 }}>{tr("تلفن", "الهاتف", "Telefon", "Phone")}</Th>
              <Th style={{ ...thFixed, width: 110 }}>{tr("وضعیت", "الحالة", "Durum", "Status")}</Th>
              <Th align="end" style={{ ...thFixed, width: 160 }}>{tr("عملیات", "الإجراءات", "İşlemler", "Actions")}</Th>
            </Thead>
            <Tbody>
              {branches.map((b, index) => (
                <Tr key={b.id}>
                  <Td className="text-[var(--erp-muted)] font-bold" style={cellPad}>{n(index + 1)}</Td>
                  <Td className="font-bold" style={cellPad}>
                    <div className="flex items-center gap-2 min-w-0">
                      <Tooltip side="top" label={pd(b.name)}>
                        <span className="truncate block min-w-0" style={{ maxWidth: 200 }}>{pd(b.name)}</span>
                      </Tooltip>
                      {/* "#" prefix makes this unmistakably a separate
                          identifier, not a continuation of the name above -
                          matters most when the two happen to share a value
                          (e.g. placeholder/test data), which is exactly what
                          previously read as a duplicated "name name". */}
                      {b.code && <Badge tone="neutral" className="shrink-0">{`#${pd(b.code)}`}</Badge>}
                    </div>
                  </Td>
                  <Td style={cellPad}>{branchTypeLabel(b.branch_type)}</Td>
                  <Td style={cellPad}>
                    {b.city ? (
                      <Tooltip side="top" label={pd(b.city)}>
                        <span className="truncate block min-w-0" style={{ maxWidth: 76 }}>{pd(b.city)}</span>
                      </Tooltip>
                    ) : "—"}
                  </Td>
                  <Td className={secondaryColClass} style={cellPad}>{b.manager_name ? pd(b.manager_name) : "—"}</Td>
                  <Td className={secondaryColClass} style={cellPad}>{b.phone || b.mobile ? pd(b.phone || b.mobile) : "—"}</Td>
                  <Td style={cellPad}>
                    <Badge tone={b.active ? "success" : "neutral"}>
                      {b.active ? tr("فعال", "نشط", "Aktif", "Active") : tr("غیرفعال", "غير نشط", "Pasif", "Inactive")}
                    </Badge>
                  </Td>
                  <Td align="end" style={cellPad}>
                    <div className="flex items-center justify-end gap-1">
                      <Tooltip side="top" label={tr("ویرایش", "تعديل", "Düzenle", "Edit")}>
                        <Button variant="secondary" size="sm" icon={Pencil} aria-label={tr("ویرایش", "تعديل", "Düzenle", "Edit")} onClick={() => openEdit(b)} />
                      </Tooltip>
                      <Tooltip side="top" label={b.active ? tr("غیرفعال کردن", "إلغاء التفعيل", "Devre dışı bırak", "Deactivate") : tr("فعال کردن", "تفعيل", "Etkinleştir", "Activate")}>
                        <Button
                          variant={b.active ? "secondary" : "success"}
                          size="sm"
                          icon={b.active ? ShieldOff : ShieldCheck}
                          aria-label={b.active ? tr("غیرفعال کردن", "إلغاء التفعيل", "Devre dışı bırak", "Deactivate") : tr("فعال کردن", "تفعيل", "Etkinleştir", "Activate")}
                          onClick={() => handleToggleActive(b)}
                        />
                      </Tooltip>
                      {b.active && (
                        <Tooltip side="top" label={tr("حذف (بایگانی)", "حذف (أرشفة)", "Sil (arşivle)", "Delete (archive)")}>
                          <Button
                            variant="danger"
                            size="sm"
                            icon={Trash2}
                            aria-label={tr("حذف (بایگانی)", "حذف (أرشفة)", "Sil (arşivle)", "Delete (archive)")}
                            onClick={() => handleDeleteBranch(b)}
                          />
                        </Tooltip>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} maxWidthClassName="max-w-3xl" labelledBy="branch-modal-title">
        <form onSubmit={handleSave} className="p-5 space-y-5">
          <h2 id="branch-modal-title" className="text-lg font-bold">
            {editingId ? tr("ویرایش شعبه", "تعديل الفرع", "Şubeyi düzenle", "Edit branch") : tr("شعبه جدید", "فرع جديد", "Yeni şube", "New branch")}
          </h2>
          {fieldGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-bold text-[var(--erp-muted)] mb-2">{group.title}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {group.fields.map(([key, label, type]) => (
                  <label key={key} className="text-sm">
                    <span className="block mb-1 text-[var(--erp-muted)]">{label}</span>
                    {type === "select" ? (
                      <Select
                        value={draft[key]}
                        onChange={(value) => setDraft({ ...draft, [key]: value })}
                        options={BRANCH_TYPES.map((t) => ({ value: t, label: branchTypeLabel(t) }))}
                      />
                    ) : type === "warehouse" ? (
                      <Select
                        value={draft[key]}
                        onChange={(value) => setDraft({ ...draft, [key]: value })}
                        options={[
                          { value: "", label: tr("بدون انبار پیش‌فرض", "بدون مستودع افتراضي", "Varsayılan depo yok", "No default warehouse") },
                          ...warehouses.map((w) => ({ value: w.id, label: pd(w.name) })),
                        ]}
                      />
                    ) : type === "number" ? (
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={pd(draft[key])}
                        onChange={(e) => setDraft({ ...draft, [key]: cleanNumberInput(e.target.value) })}
                      />
                    ) : (
                      <Input
                        type="text"
                        value={!LATIN_ONLY_TEXT_FIELDS.has(key) ? pd(draft[key]) : draft[key]}
                        onChange={(e) => setDraft({ ...draft, [key]: !LATIN_ONLY_TEXT_FIELDS.has(key) ? pd(e.target.value) : e.target.value })}
                      />
                    )}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              {tr("انصراف", "إلغاء", "İptal", "Cancel")}
            </Button>
            <Button type="submit" loading={saving}>
              {saving ? tr("در حال ذخیره...", "جارٍ الحفظ...", "Kaydediliyor...", "Saving...") : tr("ذخیره", "حفظ", "Kaydet", "Save")}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
