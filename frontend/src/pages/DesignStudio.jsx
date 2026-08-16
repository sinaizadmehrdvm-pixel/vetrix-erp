import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutTemplate, IdCard, FileSignature, Image as ImageIcon, Search, Eye, Pencil, Copy, Trash2, Plus, X } from "lucide-react";
import toast from "react-hot-toast";
import { useLanguage } from "../localization/useLanguage";
import { getPdfTemplates, savePdfTemplate, deletePdfTemplate, renamePdfTemplate, downloadAuthenticatedFile } from "../services/api";
import { translateApiError } from "../localization/apiErrors";
import Select from "../components/ui/Select";

// Design Studio is a hub, not a merged editor: each kind still has its own
// working canvas (InvoiceDesigner.jsx / DocumentDesigner.jsx), untouched.
// This page only centralizes discovery/gallery/search across them - see
// the session's own risk decision to avoid refactoring the presumably-live
// invoice designer.
const KIND_META = {
  invoice: { icon: LayoutTemplate, route: "/invoice-designer", exportable: false, label: { fa: "فاکتور", ar: "فاتورة", tr: "Fatura", en: "Invoice" } },
  business_card: { icon: IdCard, route: "/business-card-designer", exportable: true, label: { fa: "کارت ویزیت", ar: "بطاقة عمل", tr: "Kartvizit", en: "Business card" } },
  letterhead: { icon: FileSignature, route: "/letterhead-designer", exportable: true, label: { fa: "سربرگ", ar: "ترويسة", tr: "Antetli kağıt", en: "Letterhead" } },
  banner: { icon: ImageIcon, route: "/banner-designer", exportable: true, label: { fa: "بنر تبلیغاتی", ar: "لافتة إعلانية", tr: "Reklam banner'ı", en: "Promotional banner" } },
};
const KIND_ORDER = ["invoice", "business_card", "letterhead", "banner"];

export default function DesignStudio() {
  const { language, dir } = useLanguage();
  const navigate = useNavigate();
  const fa = language === "fa";
  const tr = (faText, arText, trText, enText) => (fa ? faText : language === "ar" ? arText : language === "tr" ? trText : enText);

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [busyId, setBusyId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const data = await getPdfTemplates("all");
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(translateApiError(err.message, language) || tr("خطا در دریافت قالب‌ها", "خطأ في تحميل القوالب", "Şablonlar yüklenemedi", "Failed to load templates"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Newest-first is already "recently edited": every save in this app
  // creates a new template row rather than mutating one in place, so id
  // desc (the backend's own default order) is exactly that ordering -
  // no extra updated_at column needed.
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase(language);
    return templates.filter((item) => {
      const matchesKind = kindFilter === "all" || item.kind === kindFilter;
      const matchesSearch = !needle || (item.name || "").toLocaleLowerCase(language).includes(needle);
      return matchesKind && matchesSearch;
    });
  }, [templates, search, kindFilter, language]);

  function kindLabel(kind) {
    const meta = KIND_META[kind];
    return meta ? meta.label[language] || meta.label.en : kind;
  }

  async function handleDuplicate(item) {
    setBusyId(item.id);
    try {
      await savePdfTemplate({
        name: `${item.name} (${tr("کپی", "نسخة", "kopya", "copy")})`,
        page_size: item.page_size,
        kind: item.kind,
        config: item.config,
      });
      toast.success(tr("کپی ایجاد شد", "تم إنشاء نسخة", "Kopya oluşturuldu", "Duplicate created"));
      await load();
    } catch (err) {
      toast.error(translateApiError(err.message, language) || tr("کپی ناموفق بود", "فشل النسخ", "Kopyalama başarısız", "Duplicate failed"));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item) {
    if (!window.confirm(tr("این قالب حذف شود؟", "هل تريد حذف هذا القالب؟", "Bu şablon silinsin mi?", "Delete this template?"))) return;
    setBusyId(item.id);
    try {
      await deletePdfTemplate(item.id);
      toast.success(tr("حذف شد", "تم الحذف", "Silindi", "Deleted"));
      await load();
    } catch (err) {
      toast.error(translateApiError(err.message, language) || tr("حذف ناموفق بود", "فشل الحذف", "Silme başarısız", "Delete failed"));
    } finally {
      setBusyId(null);
    }
  }

  function startRename(item) {
    setRenamingId(item.id);
    setRenameDraft(item.name || "");
  }

  async function confirmRename(item) {
    if (!renameDraft.trim()) return;
    setBusyId(item.id);
    try {
      await renamePdfTemplate(item.id, renameDraft.trim());
      setRenamingId(null);
      await load();
    } catch (err) {
      toast.error(translateApiError(err.message, language) || tr("تغییر نام ناموفق بود", "فشل تغيير الاسم", "Yeniden adlandırma başarısız", "Rename failed"));
    } finally {
      setBusyId(null);
    }
  }

  async function handlePreview(item) {
    const meta = KIND_META[item.kind];
    if (!meta?.exportable) return;
    try {
      await downloadAuthenticatedFile(`/designer/template/${item.id}/pdf`, `${item.kind}-${item.id}.pdf`);
    } catch (err) {
      toast.error(translateApiError(err.message, language) || tr("پیش‌نمایش ناموفق بود", "فشلت المعاينة", "Önizleme başarısız", "Preview failed"));
    }
  }

  return (
    <div dir={dir} className="p-4 md:p-6 space-y-6 text-[var(--erp-text)]">
      <div>
        <h1 className="text-2xl font-black flex items-center gap-2">
          <LayoutTemplate className="text-[var(--erp-accent)]" />
          {tr("استودیوی طراحی", "استوديو التصميم", "Tasarım Stüdyosu", "Design Studio")}
        </h1>
        <p className="text-[var(--erp-muted)] mt-2">
          {tr(
            "همه‌ی قالب‌های فاکتور، کارت‌ویزیت، سربرگ و بنر تبلیغاتی را از همین‌جا مدیریت کنید؛ برای طراحی هرکدام همان صفحه‌ی تخصصی خودش باز می‌شود.",
            "أدر جميع قوالب الفاتورة وبطاقة العمل والترويسة واللافتة الإعلانية من هنا؛ يفتح كل نوع محرره المخصص.",
            "Fatura, kartvizit, antetli kağıt ve reklam banner'ı şablonlarının tümünü buradan yönetin; her tür kendi editöründe açılır.",
            "Manage every invoice, business card, letterhead, and promotional banner template from here - each kind opens its own dedicated editor."
          )}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {KIND_ORDER.map((kind) => {
          const meta = KIND_META[kind];
          const Icon = meta.icon;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => navigate(meta.route)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--erp-accent)] text-black font-bold text-sm"
            >
              <Plus size={14} /> <Icon size={14} /> {kindLabel(kind)}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute top-1/2 -translate-y-1/2 start-3 w-4 h-4 text-[var(--erp-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr("جست‌وجوی قالب...", "بحث عن قالب...", "Şablon ara...", "Search templates...")}
            className="w-full ps-9 pe-3 py-2 rounded-xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--erp-accent)]"
          />
        </div>
        <Select
          value={kindFilter}
          onChange={(value) => setKindFilter(value)}
          options={[
            { value: "all", label: tr("همه انواع", "كل الأنواع", "Tüm türler", "All kinds") },
            ...KIND_ORDER.map((kind) => ({ value: kind, label: kindLabel(kind) })),
          ]}
          className="min-w-[160px]"
        />
      </div>

      {loading ? (
        <p className="text-[var(--erp-muted)]">{tr("در حال بارگذاری...", "جارٍ التحميل...", "Yükleniyor...", "Loading...")}</p>
      ) : filtered.length === 0 ? (
        <p className="text-[var(--erp-muted)]">
          {templates.length === 0
            ? tr("هنوز قالبی ساخته نشده است. با دکمه‌های بالا اولین قالب را بسازید.", "لم يتم إنشاء أي قالب بعد. أنشئ أول قالب من الأزرار أعلاه.", "Henüz şablon oluşturulmadı. Yukarıdaki düğmelerle ilk şablonu oluşturun.", "No templates yet - create your first one with the buttons above.")
            : tr("قالبی با این مشخصات پیدا نشد.", "لم يتم العثور على قالب مطابق.", "Eşleşen şablon bulunamadı.", "No templates match this search.")}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => {
            const meta = KIND_META[item.kind] || KIND_META.invoice;
            const Icon = meta.icon;
            const isBusy = busyId === item.id;
            return (
              <div key={item.id} className="rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-panel)] p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg bg-[var(--erp-panel-solid)] text-[var(--erp-accent)]">
                    <Icon size={12} /> {kindLabel(item.kind)}
                  </span>
                  <span className="text-xs text-[var(--erp-muted)]">{item.page_size}</span>
                </div>

                {renamingId === item.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] text-sm"
                    />
                    <button type="button" onClick={() => confirmRename(item)} disabled={isBusy} className="text-[var(--erp-accent)] shrink-0">
                      {tr("ذخیره", "حفظ", "Kaydet", "Save")}
                    </button>
                    <button type="button" onClick={() => setRenamingId(null)} className="text-[var(--erp-muted)] shrink-0">
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="font-black truncate" title={item.name}>{item.name}</div>
                )}

                <div className="flex items-center gap-2 flex-wrap mt-auto pt-2 border-t border-[var(--erp-border)]">
                  <button
                    type="button"
                    onClick={() => navigate(`${meta.route}?templateId=${item.id}`)}
                    className="flex items-center gap-1 text-xs font-bold px-2 py-1.5 rounded-lg bg-[var(--erp-accent)] text-black"
                  >
                    <Pencil size={12} /> {tr("ویرایش", "تعديل", "Düzenle", "Edit")}
                  </button>
                  {meta.exportable && (
                    <button type="button" onClick={() => handlePreview(item)} className="flex items-center gap-1 text-xs font-bold px-2 py-1.5 rounded-lg bg-[var(--erp-panel-solid)] text-[var(--erp-text)]">
                      <Eye size={12} /> {tr("پیش‌نمایش", "معاينة", "Önizleme", "Preview")}
                    </button>
                  )}
                  <button type="button" onClick={() => startRename(item)} disabled={isBusy} className="flex items-center gap-1 text-xs font-bold px-2 py-1.5 rounded-lg bg-[var(--erp-panel-solid)] text-[var(--erp-text)]">
                    {tr("تغییر نام", "إعادة تسمية", "Yeniden adlandır", "Rename")}
                  </button>
                  <button type="button" onClick={() => handleDuplicate(item)} disabled={isBusy} className="flex items-center gap-1 text-xs font-bold px-2 py-1.5 rounded-lg bg-[var(--erp-panel-solid)] text-[var(--erp-text)]">
                    <Copy size={12} /> {tr("کپی", "نسخ", "Kopyala", "Duplicate")}
                  </button>
                  <button type="button" onClick={() => handleDelete(item)} disabled={isBusy} className="flex items-center gap-1 text-xs font-bold px-2 py-1.5 rounded-lg bg-red-500/15 text-red-300">
                    <Trash2 size={12} /> {tr("حذف", "حذف", "Sil", "Delete")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
