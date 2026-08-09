import { useEffect, useState } from "react";
import { Paperclip, Upload, Download, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { useLanguage } from "../localization/useLanguage";
import { useStableCallback } from "../hooks/useStableCallback";
import { getAccountingAttachments, uploadAccountingAttachment, deleteAccountingAttachment, accountingAttachmentDownloadUrl } from "../services/api";

/**
 * Drop-in file-attachment list for any accounting record (voucher / expense
 * / cheque / fixed_asset) - reuses the single shared backend attachment
 * store in app/accounting/attachments.py, so this same component works for
 * all four record types without any per-page backend wiring.
 */
export default function AttachmentsPanel({ entityType, entityId, compact = false }) {
  const { language } = useLanguage();
  const fa = language === "fa";
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const label = {
    title: fa ? "پیوست‌ها" : language === "ar" ? "المرفقات" : language === "tr" ? "Ekler" : "Attachments",
    upload: fa ? "افزودن فایل" : language === "ar" ? "إضافة ملف" : language === "tr" ? "Dosya Ekle" : "Add file",
    none: fa ? "فایلی پیوست نشده است." : language === "ar" ? "لا توجد ملفات مرفقة." : language === "tr" ? "Ek dosya yok." : "No files attached.",
  };

  async function load() {
    if (!entityId) return;
    setLoading(true);
    try {
      const rows = await getAccountingAttachments(entityType, entityId);
      setItems(Array.isArray(rows) ? rows : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  const stableLoad = useStableCallback(load);
  useEffect(() => {
    const timer = setTimeout(() => { void stableLoad(); }, 0);
    return () => clearTimeout(timer);
  }, [entityType, entityId, stableLoad]);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !entityId) return;
    setUploading(true);
    try {
      await uploadAccountingAttachment(entityType, entityId, file);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id) {
    try {
      await deleteAccountingAttachment(id);
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (!entityId) return null;

  return (
    <div className={compact ? "" : "bg-[var(--erp-panel-solid)] rounded-2xl p-4 border border-[var(--erp-border)]"}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--erp-accent)]">
          <Paperclip size={16} />{label.title} {items.length > 0 && `(${items.length})`}
        </div>
        <label className="text-xs px-2.5 py-1.5 rounded-lg bg-[var(--erp-glow)] text-[var(--erp-accent)] cursor-pointer inline-flex items-center gap-1">
          <Upload size={13} />{label.upload}
          <input type="file" onChange={handleUpload} disabled={uploading} style={{ display: "none" }} />
        </label>
      </div>

      {!loading && items.length === 0 && <div className="text-xs text-[var(--erp-muted)]">{label.none}</div>}

      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-2 text-xs bg-[var(--erp-panel)] rounded-lg px-2.5 py-1.5">
            <span className="truncate">{item.title || item.file_name}</span>
            <div className="flex items-center gap-1 shrink-0">
              <a href={accountingAttachmentDownloadUrl(item.id)} target="_blank" rel="noreferrer" className="p-1 rounded text-[var(--erp-accent)]">
                <Download size={13} />
              </a>
              <button onClick={() => handleDelete(item.id)} className="p-1 rounded text-rose-300">
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
