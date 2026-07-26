import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { ScanLine, Upload, X } from "lucide-react";

import { useLanguage } from "../localization/useLanguage";
import { extractDocumentOcr } from "../services/documentOcrApi";

/**
 * Scans a photo of a receipt/invoice and hands back a human-reviewable
 * draft. It never creates or edits any record itself - onApply only fires
 * once the user has looked at (and can still edit) every extracted line,
 * matching the review-before-commit pattern used for voice change
 * requests elsewhere in this app. OCR output is a starting point, not a
 * source of truth.
 */
export default function ReceiptScanner({ onApply }) {
  const { dir, language } = useLanguage();
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;
  const fileInputRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rawText, setRawText] = useState("");
  const [items, setItems] = useState([]);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setLoading(true);
    try {
      const result = await extractDocumentOcr(file);
      setRawText(result.raw_text || "");
      setItems(
        (result.suggested_items || []).map((item) => ({
          description: item.description || "",
          quantity: item.quantity || "",
          unit_price: item.unit_price || "",
          total: item.total || "",
        }))
      );
      setOpen(true);
      if (!result.suggested_items?.length) {
        toast(tr(
          "متنی استخراج شد ولی ردیف کالایی تشخیص داده نشد؛ می‌توانید دستی وارد کنید.",
          "تم استخراج نص ولكن لم يتم التعرف على أي بنود؛ يمكنك إدخالها يدوياً.",
          "Metin çıkarıldı ancak kalem satırı algılanamadı; manuel olarak ekleyebilirsiniz.",
          "Text was extracted but no line items were detected; you can add them manually."
        ));
      }
    } catch (error) {
      toast.error(error.message || tr("استخراج اطلاعات ناموفق بود", "فشل استخراج البيانات", "Veri çıkarma başarısız oldu", "Extraction failed"));
    } finally {
      setLoading(false);
    }
  }

  function updateItem(index, field, value) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  }

  function removeItem(index) {
    setItems((current) => current.filter((_, i) => i !== index));
  }

  function addBlankItem() {
    setItems((current) => [...current, { description: "", quantity: "", unit_price: "", total: "" }]);
  }

  function apply() {
    onApply?.(items, rawText);
    setOpen(false);
    setItems([]);
    setRawText("");
  }

  return (
    <div dir={dir}>
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={loading}
        className="px-4 py-2 rounded-2xl bg-[var(--erp-panel-solid)] text-[var(--erp-accent)] font-bold flex items-center gap-2 border border-[var(--erp-border)] disabled:opacity-60"
      >
        <ScanLine size={18} className={loading ? "animate-pulse" : ""} />
        {loading ? tr("در حال خواندن تصویر...", "جارٍ قراءة الصورة...", "Görüntü okunuyor...", "Reading image...") : tr("اسکن رسید/فاکتور", "مسح الإيصال/الفاتورة", "Fiş/fatura tara", "Scan receipt/invoice")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[var(--erp-accent)] font-black text-lg flex items-center gap-2">
                <Upload size={20} />
                {tr("بررسی موارد استخراج‌شده", "مراجعة العناصر المستخرجة", "Çıkarılan öğeleri incele", "Review extracted items")}
              </h2>
              <button type="button" onClick={() => setOpen(false)} className="p-1 text-[var(--erp-muted)]">
                <X size={20} />
              </button>
            </div>

            <p className="text-xs text-[var(--erp-muted)] mb-4">
              {tr(
                "این اطلاعات به‌صورت خودکار از تصویر خوانده شده و ممکن است اشتباه باشد. لطفاً قبل از ثبت، هر ردیف را بررسی و در صورت نیاز اصلاح کنید.",
                "تم قراءة هذه البيانات تلقائياً من الصورة وقد تحتوي على أخطاء. يرجى مراجعة كل بند وتصحيحه عند الحاجة قبل الإرسال.",
                "Bu bilgiler görüntüden otomatik olarak okundu ve hatalı olabilir. Göndermeden önce lütfen her satırı inceleyip gerekirse düzeltin.",
                "This was read automatically from the image and may contain mistakes. Review and correct every line before submitting."
              )}
            </p>

            <div className="space-y-2 mb-4">
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-[1fr_70px_90px_90px_28px] gap-2 items-center">
                  <input
                    value={item.description}
                    onChange={(event) => updateItem(index, "description", event.target.value)}
                    placeholder={tr("شرح", "الوصف", "Açıklama", "Description")}
                    className="rounded-xl bg-[var(--erp-panel-solid)] text-[var(--erp-text)] px-2 py-2 text-sm"
                  />
                  <input
                    value={item.quantity}
                    onChange={(event) => updateItem(index, "quantity", event.target.value)}
                    placeholder={tr("تعداد", "الكمية", "Miktar", "Qty")}
                    className="rounded-xl bg-[var(--erp-panel-solid)] text-[var(--erp-text)] px-2 py-2 text-sm"
                  />
                  <input
                    value={item.unit_price}
                    onChange={(event) => updateItem(index, "unit_price", event.target.value)}
                    placeholder={tr("قیمت واحد", "سعر الوحدة", "Birim fiyat", "Unit price")}
                    className="rounded-xl bg-[var(--erp-panel-solid)] text-[var(--erp-text)] px-2 py-2 text-sm"
                  />
                  <input
                    value={item.total}
                    onChange={(event) => updateItem(index, "total", event.target.value)}
                    placeholder={tr("جمع", "الإجمالي", "Toplam", "Total")}
                    className="rounded-xl bg-[var(--erp-panel-solid)] text-[var(--erp-text)] px-2 py-2 text-sm"
                  />
                  <button type="button" onClick={() => removeItem(index)} className="text-rose-300">
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>

            <button type="button" onClick={addBlankItem} className="text-sm text-[var(--erp-accent)] font-bold mb-4">
              + {tr("افزودن ردیف دستی", "إضافة صف يدوي", "Manuel satır ekle", "Add a manual row")}
            </button>

            {rawText && (
              <details className="mb-4">
                <summary className="cursor-pointer text-xs text-[var(--erp-muted)]">
                  {tr("نمایش متن کامل خوانده‌شده", "عرض النص الكامل المستخرج", "Okunan tam metni göster", "Show full raw extracted text")}
                </summary>
                <pre className="mt-2 text-xs text-[var(--erp-muted)] whitespace-pre-wrap bg-[var(--erp-panel-solid)] rounded-xl p-3">{rawText}</pre>
              </details>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={apply}
                disabled={items.length === 0}
                className="rounded-xl px-4 py-2 font-black bg-[var(--erp-accent)] text-black disabled:opacity-60"
              >
                {tr("اعمال به فرم", "تطبيق على النموذج", "Forma uygula", "Apply to form")}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2 font-bold bg-[var(--erp-panel-solid)] text-[var(--erp-text)]">
                {tr("انصراف", "إلغاء", "İptal", "Cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
