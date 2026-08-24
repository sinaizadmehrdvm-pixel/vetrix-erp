import { useEffect, useMemo, useState } from "react";
import { Building2, Pencil, Plus, Search, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits, toEnglishDigits, cleanNumberInput } from "../localization/helpers";
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
// change).
const cellPad = { padding: "10px 10px" };
// `table-layout` defaults to `auto`, under which a `width:100%` table is
// only a MINIMUM, not a cap - the browser sizes every column from its
// widest cell content, so once that content sum exceeds the available
// width the table grows past its container regardless of `w-full`.
// `table-layout:fixed` makes the browser respect the table's own width as
// a hard cap - BUT ONLY if every `Th` width below is a PERCENTAGE, not a
// large unbounded pixel value: fixed-layout pixel widths are a hard floor
// the table can't shrink below, so a pixel-width BUDGET spread across every
// column (what this table used before) can force the scrollbar back on at
// any narrower-than-assumed effective viewport (a laptop at 125-150%
// OS/browser scaling, a smaller external monitor, a collapsed-vs-expanded
// sidebar). Percentages are always relative to the actual table width, so
// columns compress together and the table can never exceed 100% of its
// container, at any zoom or viewport. The Actions column is the one
// exception - it's a `clamp()` with a small, deliberate px floor (see its
// own comment below), not an open-ended pixel budget, so it doesn't
// reintroduce that same risk. Manager/Phone are additionally hidden below `xl` - since
// they're unset-nowhere-else columns, `table-layout:fixed` simply lets
// Name (the one column with no explicit width) absorb whatever width they
// free up, at every breakpoint, with no separate per-breakpoint percentage
// set needed. Below `md` the table itself isn't rendered at all (see the
// card list further down) - a 1024-1279 range with 6 columns crammed in is
// what earlier attempts at "just hide two columns" kept fighting, so this
// drops straight to a compact card row instead of shrinking the table
// further.
const thFixed = { ...cellPad, overflow: "hidden", textOverflow: "ellipsis" };
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
  const [editingBranch, setEditingBranch] = useState(null);
  // Bumped on every open so BranchFormModal remounts (and its local
  // `draft` state re-initializes from scratch) each time - including
  // reopening the same branch twice in a row - without needing an effect.
  const [formKey, setFormKey] = useState(0);

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
    setEditingBranch(null);
    setFormKey((k) => k + 1);
    setModalOpen(true);
  }

  function openEdit(branch) {
    setEditingBranch(branch);
    setFormKey((k) => k + 1);
    setModalOpen(true);
  }

  // Lives here (not in the modal) because it needs `load()`/`branches`
  // state - the modal only owns its own field-editing state and calls this
  // once, on submit, so keystroke-by-keystroke typing never touches this
  // component's state and can't force the branches table below to re-render.
  async function handleSaveBranch(editingId, payload) {
    try {
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
          <label className="vitalix-input-group flex items-center gap-2 w-full" style={{ padding: "0 12px" }}>
            <Search size={16} className="text-[var(--erp-muted)] shrink-0" />
            <input
              placeholder={tr("جستجوی نام، کد یا شهر...", "بحث بالاسم أو الرمز أو المدينة...", "Ad, kod veya şehre göre ara...", "Search name, code, or city...")}
              value={search}
              onChange={(e) => setSearch(toEnglishDigits(e.target.value))}
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
          <>
            {/* Desktop/tablet (>=768px): the full table. `scrollable={false}`
                drops Table.jsx's default overflow-x-auto wrapper - safe
                here because every column below is percentage-width under
                table-layout:fixed, so the table can never exceed 100% of
                its container regardless of viewport/zoom; there's nothing
                left for that wrapper to ever need to scroll. */}
            <div className="hidden md:block">
              <Table className="table-fixed" scrollable={false}>
                <Thead>
                  <Th style={{ ...thFixed, width: "4%" }}>#</Th>
                  <Th style={cellPad}>{tr("نام", "الاسم", "Ad", "Name")}</Th>
                  <Th style={{ ...thFixed, width: "10%" }}>{tr("نوع", "النوع", "Tür", "Type")}</Th>
                  <Th style={{ ...thFixed, width: "10%" }}>{tr("شهر", "المدينة", "Şehir", "City")}</Th>
                  <Th className={secondaryColClass} style={{ ...thFixed, width: "12%" }}>{tr("مدیر", "المدير", "Müdür", "Manager")}</Th>
                  <Th className={secondaryColClass} style={{ ...thFixed, width: "11%" }}>{tr("تلفن", "الهاتف", "Telefon", "Phone")}</Th>
                  <Th style={{ ...thFixed, width: "10%" }}>{tr("وضعیت", "الحالة", "Durum", "Status")}</Th>
                  {/* clamp(), not a flat percentage - up to 3 icon buttons
                      (~40-42px each) + gaps + cellPad need ~152px of real
                      content room, and table-layout:fixed's percentage only
                      prevents the TABLE from overflowing, not a cell's own
                      content from being clipped by the Card's
                      overflow:hidden. A single flat % can't be safe at both
                      ends of the app's supported width range: sized to
                      survive the sidebar's own persistent-vs-off-canvas
                      breakpoint (900px, which doesn't line up with this
                      table's own 768/1280 breakpoints - content width
                      actually *shrinks* just above 900px when the sidebar
                      snaps back to persistent), a percentage large enough
                      to be safe there wastes 100px+ of dead space before
                      the buttons at 1440-1920px instead. The 168px floor
                      protects every width below the crossover uniformly
                      (not just one tuned checkpoint); the 190px ceiling
                      stops it from over-growing at wide viewports; 20% is
                      just the transition in between. */}
                  <Th align="end" style={{ ...thFixed, width: "clamp(168px, 20%, 190px)" }}>{tr("عملیات", "الإجراءات", "İşlemler", "Actions")}</Th>
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
                              identifier, not a continuation of the name
                              above - matters most when the two happen to
                              share a value (e.g. placeholder/test data). */}
                          {b.code && <Badge tone="neutral" className="shrink-0">{`#${pd(b.code)}`}</Badge>}
                        </div>
                      </Td>
                      <Td style={cellPad}><span className="truncate block">{branchTypeLabel(b.branch_type)}</span></Td>
                      <Td style={cellPad}>
                        {b.city ? (
                          <Tooltip side="top" label={pd(b.city)}>
                            <span className="truncate block min-w-0">{pd(b.city)}</span>
                          </Tooltip>
                        ) : "—"}
                      </Td>
                      <Td className={secondaryColClass} style={cellPad}>
                        {b.manager_name ? (
                          <Tooltip side="top" label={pd(b.manager_name)}>
                            <span className="truncate block">{pd(b.manager_name)}</span>
                          </Tooltip>
                        ) : "—"}
                      </Td>
                      <Td className={secondaryColClass} style={cellPad}>
                        {b.phone || b.mobile ? (
                          <Tooltip side="top" label={pd(b.phone || b.mobile)}>
                            <span className="truncate block">{pd(b.phone || b.mobile)}</span>
                          </Tooltip>
                        ) : "—"}
                      </Td>
                      <Td style={cellPad}>
                        <Badge tone={b.active ? "success" : "neutral"}>
                          {b.active ? tr("فعال", "نشط", "Aktif", "Active") : tr("غیرفعال", "غير نشط", "Pasif", "Inactive")}
                        </Badge>
                      </Td>
                      <Td align="end" style={cellPad}>
                        <BranchRowActions b={b} tr={tr} openEdit={openEdit} handleToggleActive={handleToggleActive} handleDeleteBranch={handleDeleteBranch} />
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>

            {/* Mobile (<768px): a stacked card per branch instead of the
                wide table - the earlier approach of hiding more table
                columns at narrow widths kept reintroducing horizontal
                scroll one breakpoint down; a genuinely different,
                single-column layout removes that risk instead of chasing
                it further. */}
            <div className="block md:hidden divide-y divide-[var(--erp-border)]">
              {branches.map((b, index) => (
                <div key={b.id} style={{ padding: 14 }} className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[var(--erp-muted)] font-bold text-xs shrink-0">{n(index + 1)}</span>
                      <span className="font-bold truncate">{pd(b.name)}</span>
                      {b.code && <Badge tone="neutral" className="shrink-0">{`#${pd(b.code)}`}</Badge>}
                    </div>
                    <Badge tone={b.active ? "success" : "neutral"} className="shrink-0">
                      {b.active ? tr("فعال", "نشط", "Aktif", "Active") : tr("غیرفعال", "غير نشط", "Pasif", "Inactive")}
                    </Badge>
                  </div>
                  <p className="text-sm text-[var(--erp-muted)] m-0 truncate">
                    {branchTypeLabel(b.branch_type)}
                    {b.city ? ` · ${pd(b.city)}` : ""}
                  </p>
                  <div className="flex items-center justify-end gap-1">
                    <BranchRowActions b={b} tr={tr} openEdit={openEdit} handleToggleActive={handleToggleActive} handleDeleteBranch={handleDeleteBranch} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <BranchFormModal
        key={formKey}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editingBranch={editingBranch}
        warehouses={warehouses}
        onSave={handleSaveBranch}
      />
    </div>
  );
}

// Shared by both the desktop table row's Actions cell and the mobile card
// footer, so the two layouts can't quietly drift out of sync on which
// actions exist or how they're labeled.
function BranchRowActions({ b, tr, openEdit, handleToggleActive, handleDeleteBranch }) {
  return (
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
  );
}

// Split out from Branches() so that every keystroke while typing only
// re-renders this small form, not the whole page (branches table +
// Tooltips + filter card) - that full-tree re-render on each keypress is
// what made typing in "New branch" feel laggy when this lived inline.
// Owns its own `draft` field-editing state; the parent only tracks which
// branch (if any) is being edited and performs the actual save.
function BranchFormModal({ open, onClose, editingBranch, warehouses, onSave }) {
  const { language } = useLanguage();
  const tr = (fa, ar, trText, en) => (language === "fa" ? fa : language === "ar" ? ar : language === "tr" ? trText : en);
  const pd = (value) => (language === "fa" ? toPersianDigits(value) : value);
  const branchTypeLabel = (type) => ({
    headquarters: tr("مرکز اصلی", "المقر الرئيسي", "Genel merkez", "Headquarters"),
    retail_store: tr("فروشگاه", "متجر", "Mağaza", "Retail store"),
    warehouse_only: tr("فقط انبار", "مستودع فقط", "Sadece depo", "Warehouse only"),
    office: tr("دفتر", "مكتب", "Ofis", "Office"),
    other: tr("سایر", "أخرى", "Diğer", "Other"),
  }[type] || type);

  // Lazy initializer runs once per mount - this component remounts (fresh
  // `key` from the parent) every time the modal opens, so this alone keeps
  // the form correctly seeded without an effect.
  const [draft, setDraft] = useState(() => (editingBranch ? {
    ...emptyDraft,
    ...editingBranch,
    latitude: editingBranch.latitude ?? "",
    longitude: editingBranch.longitude ?? "",
    default_warehouse_id: editingBranch.default_warehouse_id ?? "",
  } : emptyDraft));
  const [saving, setSaving] = useState(false);

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
      await onSave(editingBranch?.id ?? null, payload);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidthClassName="max-w-3xl" labelledBy="branch-modal-title">
      <form onSubmit={handleSave} className="p-5 space-y-5">
        <h2 id="branch-modal-title" className="text-lg font-bold">
          {editingBranch ? tr("ویرایش شعبه", "تعديل الفرع", "Şubeyi düzenle", "Edit branch") : tr("شعبه جدید", "فرع جديد", "Yeni şube", "New branch")}
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
                      onChange={(e) => setDraft({ ...draft, [key]: !LATIN_ONLY_TEXT_FIELDS.has(key) ? toEnglishDigits(e.target.value) : e.target.value })}
                    />
                  )}
                </label>
              ))}
            </div>
          </div>
        ))}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {tr("انصراف", "إلغاء", "İptal", "Cancel")}
          </Button>
          <Button type="submit" loading={saving}>
            {saving ? tr("در حال ذخیره...", "جارٍ الحفظ...", "Kaydediliyor...", "Saving...") : tr("ذخیره", "حفظ", "Kaydet", "Save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
