import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, FileAudio, FileText, Mic, MicOff, PencilLine, Plus, RefreshCw, Send, ShieldCheck, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import { API_URL, getAuthHeaders, getSettings } from "../services/api";
import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits, toEnglishDigits, cleanNumberInput } from "../localization/helpers";

async function api(path, options = {}) {
  const response = await fetch(`${API_URL}/api/change-requests${path}`, {
    ...options,
    headers: { ...getAuthHeaders(), ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Request failed");
  return data;
}

const emptyInvoiceItem = { product_id: "", quantity: "1" };

const REPORT_TYPES = [
  { value: "sales", fa: "فاکتورهای فروش", ar: "فواتير المبيعات", tr: "Satış faturaları", en: "Sales invoices" },
  { value: "purchases", fa: "فاکتورهای خرید", ar: "فواتير المشتريات", tr: "Alış faturaları", en: "Purchase invoices" },
  { value: "inventory", fa: "موجودی انبار", ar: "المخزون", tr: "Envanter", en: "Inventory" },
  { value: "customer_balances", fa: "مانده حساب مشتریان", ar: "أرصدة العملاء", tr: "Müşteri bakiyeleri", en: "Customer balances" },
  { value: "product_profit", fa: "سودآوری کالاها", ar: "ربحية المنتجات", tr: "Ürün kârlılığı", en: "Product profitability" },
  { value: "open_invoices", fa: "فاکتورهای تسویه‌نشده", ar: "الفواتير غير المسواة", tr: "Ödenmemiş faturalar", en: "Open invoices" },
  { value: "inventory_movements", fa: "گردش انبار", ar: "حركة المخزون", tr: "Stok hareketleri", en: "Stock movements" },
];

export default function ChangeRequestCenter() {
  const { language, dir } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;
  const [requests, setRequests] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [reminderChannels, setReminderChannels] = useState([]);
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [audioName, setAudioName] = useState("");
  const [audioFile, setAudioFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const [form, setForm] = useState({
    source: "in_app", source_reference: "", transcript: "",
    action_type: "note_only", target_id: "", field: "online_price", value: "",
    invoice_customer_id: "", invoice_items: [{ ...emptyInvoiceItem }],
    report_type: "sales", report_format: "pdf", destination_email: "",
    reminder_operation: "add", reminder_name: "", reminder_link_template: "", reminder_channel_id: "",
  });

  async function load() {
    setLoading(true);
    try {
      const [requestData, productResponse, customerResponse, settingsData] = await Promise.all([
        api(""),
        fetch(`${API_URL}/products`, { headers: getAuthHeaders() }).then((res) => res.ok ? res.json() : []),
        fetch(`${API_URL}/customers`, { headers: getAuthHeaders() }).then((res) => res.ok ? res.json() : []),
        getSettings().catch(() => null),
      ]);
      setRequests(requestData);
      setProducts(Array.isArray(productResponse) ? productResponse : []);
      setCustomers(Array.isArray(customerResponse) ? customerResponse : []);
      setReminderChannels(Array.isArray(settingsData?.reminder_channels) ? settingsData.reminder_channels : []);
    } catch (error) { toast.error(error.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, []);
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(blob));
        const filename = `voice-${Date.now()}.webm`;
        setAudioName(filename);
        setAudioFile(new File([blob], filename, { type: blob.type }));
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      toast.error(tr("دسترسی میکروفن فعال نیست.", "تعذّر الوصول إلى الميكروفون.", "Mikrofon erişimi kullanılamıyor.", "Microphone access is unavailable."));
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    setRecording(false);
  }

  function chooseAudio(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(URL.createObjectURL(file));
    setAudioName(file.name);
    setAudioFile(file);
  }

  function proposedChanges() {
    if (form.action_type === "note_only") return {};
    if (form.action_type === "campaign_draft") {
      return { title: form.value || tr("کمپین پیشنهادی", "حملة مقترحة", "Önerilen kampanya", "Proposed campaign"), channel: "instagram", body: form.transcript };
    }
    if (form.action_type === "sale_invoice_draft") {
      return {
        customer_id: Number(form.invoice_customer_id),
        items: form.invoice_items
          .filter((item) => item.product_id && Number(item.quantity) > 0)
          .map((item) => ({ product_id: Number(item.product_id), quantity: Number(item.quantity) })),
      };
    }
    if (form.action_type === "report_delivery") {
      return {
        report_type: form.report_type,
        format: form.report_format,
        destination_email: form.destination_email.trim(),
      };
    }
    if (form.action_type === "reminder_channel_manage") {
      return form.reminder_operation === "add"
        ? { operation: "add", name: form.reminder_name.trim(), link_template: form.reminder_link_template.trim() }
        : { operation: "remove", channel_id: form.reminder_channel_id };
    }
    let value = form.value;
    if (["online_price", "discount_percent"].includes(form.field)) value = Number(value);
    if (["is_published", "sync_stock"].includes(form.field)) value = value === "true";
    return { [form.field]: value };
  }

  async function submit(event) {
    event.preventDefault();
    try {
      let audioReference = "";
      if (audioFile) {
        const upload = new FormData();
        upload.append("audio", audioFile, audioName || audioFile.name);
        const stored = await api("/audio", { method: "POST", body: upload });
        audioReference = stored.reference;
      }
      const created = await api("", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: form.source,
          source_reference: form.source_reference,
          audio_reference: audioReference,
          transcript: form.transcript,
          action_type: form.action_type,
          target_id: form.action_type === "online_product_update" ? Number(form.target_id) : null,
          proposed_changes: proposedChanges(),
        }),
      });
      await api(`/${created.request_id}/submit`, { method: "POST" });
      toast.success(tr("درخواست برای تأیید مدیر ارسال شد.", "تم إرسال الطلب لموافقة المدير.", "Talep, yönetici onayına gönderildi.", "Request submitted for administrator approval."));
      setForm({
        source: "in_app", source_reference: "", transcript: "", action_type: "note_only", target_id: "", field: "online_price", value: "",
        invoice_customer_id: "", invoice_items: [{ ...emptyInvoiceItem }],
        report_type: "sales", report_format: "pdf", destination_email: "",
        reminder_operation: "add", reminder_name: "", reminder_link_template: "", reminder_channel_id: "",
      });
      setAudioName("");
      setAudioFile(null);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl("");
      load();
    } catch (error) { toast.error(error.message); }
  }

  async function downloadStoredAudio(item) {
    try {
      const response = await fetch(
        `${API_URL}/api/change-requests/audio/${encodeURIComponent(item.audio_reference)}`,
        { headers: getAuthHeaders() },
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Audio download failed");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `voice-request-${item.id}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(error.message);
    }
  }

  async function reviewTranscript(id, payload) {
    try {
      await api(`/${id}/review-transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      toast.success(tr("متن بازبینی و برای تأیید نهایی آماده شد.", "تمت مراجعة النص وإدراجه في قائمة الانتظار للموافقة النهائية.", "Metin incelendi ve nihai onay için sıraya alındı.", "Transcript reviewed and queued for final approval."));
      await load();
    } catch (error) {
      toast.error(error.message);
      throw error;
    }
  }

  async function decide(id, action) {
    const note = window.prompt(action === "reject" ? tr("دلیل رد را وارد کنید:", "أدخل سبب الرفض:", "Reddetme nedenini girin:", "Enter rejection reason:") : tr("یادداشت تأیید (اختیاری):", "ملاحظة الموافقة (اختياري):", "Onay notu (isteğe bağlı):", "Approval note (optional):"), "");
    if (note === null || (action === "reject" && !note.trim())) return;
    try {
      await api(`/${id}/${action}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }),
      });
      toast.success(action === "approve" ? tr("تأیید و اعمال شد.", "تمت الموافقة والتطبيق.", "Onaylandı ve uygulandı.", "Approved and applied.") : tr("درخواست رد شد.", "تم رفض الطلب.", "Talep reddedildi.", "Request rejected."));
      load();
    } catch (error) { toast.error(error.message); }
  }

  return (
    <div dir={dir} className="space-y-5">
      <header className="erp-surface rounded-3xl p-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3"><Mic className="erp-accent" size={34} /><h1 className="text-3xl font-black erp-accent">{tr("مرکز درخواست تغییر با ویس", "مركز طلبات التغيير الصوتية", "Sesli Değişiklik Talebi Merkezi", "Voice Change Request Center")}</h1></div>
          <p className="mt-2" style={{ color: "var(--erp-muted)" }}>{tr("هیچ تغییری بدون بازبینی و تأیید مدیر اجرا نمی‌شود.", "لا يتم تنفيذ أي تغيير دون مراجعة المدير والموافقة عليه.", "Hiçbir değişiklik, yönetici incelemesi ve onayı olmadan uygulanmaz.", "No change is executed without administrator review and approval.")}</p>
        </div>
        <button onClick={load} className="erp-surface rounded-2xl px-4 py-3 font-black erp-accent flex gap-2"><RefreshCw size={18} className={loading ? "animate-spin" : ""} />{tr("به‌روزرسانی", "تحديث", "Yenile", "Refresh")}</button>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[430px_1fr] gap-5">
        <form onSubmit={submit} className="erp-surface rounded-3xl p-5 space-y-4">
          <h2 className="text-xl font-black">{tr("درخواست جدید", "طلب جديد", "Yeni talep", "New request")}</h2>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={recording ? stopRecording : startRecording} className="rounded-2xl p-4 font-black flex items-center justify-center gap-2" style={{ background: recording ? "#ef4444" : "var(--erp-accent)", color: recording ? "white" : "#071028" }}>
              {recording ? <MicOff /> : <Mic />}{recording ? tr("توقف ضبط", "إيقاف", "Durdur", "Stop") : tr("ضبط ویس", "تسجيل صوتي", "Ses kaydet", "Record")}
            </button>
            <label className="erp-surface rounded-2xl p-4 font-black flex items-center justify-center gap-2 cursor-pointer"><FileAudio />{tr("انتخاب فایل", "ملف صوتي", "Ses dosyası", "Audio file")}<input type="file" accept="audio/*" hidden onChange={chooseAudio} /></label>
          </div>
          {audioUrl && <audio controls src={audioUrl} className="w-full" />}
          {audioName && <p className="text-xs" style={{ color: "var(--erp-muted)" }}>{audioName}</p>}

          <Field label={tr("منبع ویس", "مصدر الصوت", "Ses kaynağı", "Voice source")}>
            <select style={inputStyle} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>{["in_app", "telegram", "whatsapp", "other"].map((item) => <option key={item} value={item}>{{ in_app: tr("درون‌برنامه‌ای", "داخل التطبيق", "Uygulama içi", "In-app"), telegram: "Telegram", whatsapp: "WhatsApp", other: tr("سایر", "أخرى", "Diğer", "Other") }[item]}</option>)}</select>
          </Field>
          {form.source !== "in_app" && <Field label={tr("شناسه پیام یا لینک", "معرّف الرسالة أو الرابط", "Mesaj kimliği veya bağlantı", "Message ID or link")}><input style={inputStyle} value={language === "fa" ? toPersianDigits(form.source_reference) : form.source_reference} onChange={(e) => setForm({ ...form, source_reference: toEnglishDigits(e.target.value) })} /></Field>}
          <Field label={tr("متن ویس پس از بررسی", "نص الرسالة الصوتية بعد المراجعة", "İncelenmiş ses dökümü", "Reviewed voice transcript")}>
            <textarea required minLength={2} rows={5} style={inputStyle} value={form.transcript} onChange={(e) => setForm({ ...form, transcript: language === "fa" ? toPersianDigits(e.target.value) : e.target.value })} placeholder={tr("متن دقیق درخواست را وارد یا پس از تبدیل صدا اصلاح کنید…", "أدخل نص الطلب الدقيق أو راجعه بعد تحويل الصوت إلى نص…", "Talebin tam metnini girin veya sesten metne dönüştürüldükten sonra düzenleyin…", "Enter or review the exact voice instruction…")} />
          </Field>
          <Field label={tr("نوع درخواست", "نوع الطلب", "Talep türü", "Request type")}>
            <select style={inputStyle} value={form.action_type} onChange={(e) => setForm({ ...form, action_type: e.target.value })}>
              <option value="note_only">{tr("فقط یادداشت؛ بدون اجرا", "ملاحظة فقط؛ دون تنفيذ", "Sadece not; uygulama yok", "Note only; no execution")}</option>
              <option value="online_product_update">{tr("تغییر مشخصات کالای سایت", "تحديث بيانات المنتج على الموقع", "Site ürün güncellemesi", "Online product update")}</option>
              <option value="campaign_draft">{tr("ساخت پیش‌نویس تبلیغ", "إنشاء مسودة حملة", "Kampanya taslağı oluştur", "Create campaign draft")}</option>
              <option value="sale_invoice_draft">{tr("پیش‌نویس فاکتور فروش", "مسودة فاتورة بيع", "Satış faturası taslağı", "Sale invoice draft")}</option>
              <option value="report_delivery">{tr("ارسال گزارش", "إرسال تقرير", "Rapor gönder", "Send a report")}</option>
              <option value="reminder_channel_manage">{tr("افزودن/حذف کانال یادآوری پرداخت", "إضافة/حذف قناة تذكير الدفع", "Ödeme hatırlatma kanalı ekle/kaldır", "Add/remove a payment reminder channel")}</option>
            </select>
          </Field>

          {form.action_type === "reminder_channel_manage" && (
            <ReminderChannelFields
              language={language}
              existingChannels={reminderChannels}
              operation={form.reminder_operation}
              name={form.reminder_name}
              linkTemplate={form.reminder_link_template}
              channelId={form.reminder_channel_id}
              onOperationChange={(value) => setForm({ ...form, reminder_operation: value })}
              onNameChange={(value) => setForm({ ...form, reminder_name: language === "fa" ? toPersianDigits(value) : value })}
              onLinkTemplateChange={(value) => setForm({ ...form, reminder_link_template: value })}
              onChannelIdChange={(value) => setForm({ ...form, reminder_channel_id: value })}
            />
          )}

          {form.action_type === "online_product_update" && <>
            <Field label={tr("کالا", "المنتج", "Ürün", "Product")}><select required style={inputStyle} value={form.target_id} onChange={(e) => setForm({ ...form, target_id: e.target.value })}><option value="">{tr("انتخاب کالا", "اختر المنتج", "Ürün seçin", "Choose product")}</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label={tr("فیلد قابل تغییر", "الحقل القابل للتعديل", "Değiştirilebilir alan", "Allowed field")}><select style={inputStyle} value={form.field} onChange={(e) => setForm({ ...form, field: e.target.value })}><option value="online_price">{tr("قیمت سایت", "سعر الموقع", "Site fiyatı", "Online price")}</option><option value="discount_percent">{tr("درصد تخفیف", "نسبة الخصم", "İndirim yüzdesi", "Discount percent")}</option><option value="is_published">{tr("وضعیت انتشار", "حالة النشر", "Yayın durumu", "Published")}</option><option value="sync_stock">{tr("همگام‌سازی موجودی", "مزامنة المخزون", "Stok senkronizasyonu", "Stock sync")}</option></select></Field>
            <Field label={tr("مقدار جدید", "القيمة الجديدة", "Yeni değer", "New value")}>{["is_published", "sync_stock"].includes(form.field) ? <select style={inputStyle} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })}><option value="">{tr("انتخاب", "اختر", "Seçin", "Choose")}</option><option value="true">{tr("فعال", "مفعّل", "Etkin", "Enabled")}</option><option value="false">{tr("غیرفعال", "معطّل", "Devre dışı", "Disabled")}</option></select> : <input required type="text" inputMode="numeric" style={inputStyle} value={language === "fa" ? toPersianDigits(form.value) : form.value} onChange={(e) => setForm({ ...form, value: cleanNumberInput(e.target.value) })} />}</Field>
          </>}

          {form.action_type === "campaign_draft" && <Field label={tr("عنوان کمپین", "عنوان الحملة", "Kampanya başlığı", "Campaign title")}><input required style={inputStyle} value={form.value} onChange={(e) => setForm({ ...form, value: language === "fa" ? toPersianDigits(e.target.value) : e.target.value })} /></Field>}

          {form.action_type === "sale_invoice_draft" && (
            <InvoiceItemsBuilder
              language={language}
              customers={customers}
              products={products}
              customerId={form.invoice_customer_id}
              items={form.invoice_items}
              onCustomerChange={(value) => setForm({ ...form, invoice_customer_id: value })}
              onItemsChange={(items) => setForm({ ...form, invoice_items: items })}
            />
          )}

          {form.action_type === "report_delivery" && (
            <ReportDeliveryFields
              language={language}
              reportType={form.report_type}
              reportFormat={form.report_format}
              destinationEmail={form.destination_email}
              onReportTypeChange={(value) => setForm({ ...form, report_type: value })}
              onReportFormatChange={(value) => setForm({ ...form, report_format: value })}
              onDestinationEmailChange={(value) => setForm({ ...form, destination_email: value })}
            />
          )}

          <button className="w-full rounded-2xl p-4 font-black flex items-center justify-center gap-2" style={{ background: "linear-gradient(110deg,var(--erp-accent),var(--erp-accent-2))", color: "#071028" }}><Send size={18} />{tr("ارسال برای تأیید مدیر", "إرسال لموافقة المدير", "Yönetici onayına gönder", "Submit for administrator approval")}</button>
        </form>

        <section className="space-y-3">
          <div className="erp-surface rounded-2xl p-4 flex gap-3 items-center"><ShieldCheck className="erp-accent" /><p className="text-sm">{tr("امنیت: درخواست‌کننده نمی‌تواند درخواست خودش را تأیید کند و اجرای فرمان آزاد ممنوع است.", "الأمان: لا يمكن لمقدّم الطلب الموافقة على طلبه الخاص، ويُمنع تنفيذ أي أوامر حرة.", "Güvenlik: talep sahibi kendi talebini onaylayamaz ve serbest komut çalıştırma yasaktır.", "Security: requesters cannot approve their own request and arbitrary commands are forbidden.")}</p></div>
          {requests.map((item) => <RequestCard key={item.id} item={item} language={language} products={products} customers={customers} reminderChannels={reminderChannels} canReview={user?.role === "admin" && item.status === "needs_transcript_review"} canApprove={user?.role === "admin" && item.status === "pending_approval" && Number(item.requested_by) !== Number(user?.id)} onReview={(payload) => reviewTranscript(item.id, payload)} onApprove={() => decide(item.id, "approve")} onReject={() => decide(item.id, "reject")} onAudio={() => downloadStoredAudio(item)} onCreateInvoice={() => createInvoiceFromRequest(item)} />)}
          {!requests.length && !loading && <div className="erp-surface rounded-3xl p-10 text-center">{tr("درخواستی وجود ندارد.", "لا توجد طلبات حتى الآن.", "Henüz talep yok.", "No requests yet.")}</div>}
        </section>
      </div>
    </div>
  );

  function createInvoiceFromRequest(item) {
    navigate("/invoices", {
      state: {
        prefillCustomerId: item.proposed_changes?.customer_id,
        prefillItems: (item.proposed_changes?.items || []).map((entry) => ({
          product_id: entry.product_id,
          quantity: entry.quantity,
        })),
      },
    });
  }
}

const inputStyle = { width: "100%", padding: 12, borderRadius: 12, background: "var(--erp-panel-solid)", color: "var(--erp-text)", border: "1px solid var(--erp-border)" };
function Field({ label, children }) { return <label className="block text-sm font-bold space-y-1"><span>{label}</span>{children}</label>; }

function InvoiceItemsBuilder({ language, customers, products, customerId, items, onCustomerChange, onItemsChange }) {
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  function updateRow(index, field, value) {
    const next = [...items];
    next[index] = { ...next[index], [field]: value };
    onItemsChange(next);
  }
  function addRow() {
    onItemsChange([...items, { product_id: "", quantity: "1" }]);
  }
  function removeRow(index) {
    const next = items.filter((_, i) => i !== index);
    onItemsChange(next.length ? next : [{ product_id: "", quantity: "1" }]);
  }
  return (
    <>
      <Field label={tr("طرف‌حساب", "العميل", "Cari", "Customer")}>
        <select required style={inputStyle} value={customerId} onChange={(e) => onCustomerChange(e.target.value)}>
          <option value="">{tr("انتخاب طرف‌حساب", "اختر العميل", "Cari seçin", "Choose customer")}</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      {items.map((row, index) => (
        <div key={index} className="grid grid-cols-[1fr_90px_40px] gap-2 items-end">
          <Field label={index === 0 ? tr("کالا", "المنتج", "Ürün", "Product") : ""}>
            <select required style={inputStyle} value={row.product_id} onChange={(e) => updateRow(index, "product_id", e.target.value)}>
              <option value="">{tr("انتخاب کالا", "اختر المنتج", "Ürün seçin", "Choose product")}</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label={index === 0 ? tr("تعداد", "الكمية", "Adet", "Qty") : ""}>
            <input required type="text" inputMode="numeric" style={inputStyle} value={language === "fa" ? toPersianDigits(row.quantity) : row.quantity} onChange={(e) => updateRow(index, "quantity", cleanNumberInput(e.target.value))} />
          </Field>
          <button type="button" onClick={() => removeRow(index)} className="rounded-xl p-3 bg-red-500/20 text-red-300"><Trash2 size={16} /></button>
        </div>
      ))}
      <button type="button" onClick={addRow} className="rounded-xl px-3 py-2 font-bold flex items-center gap-2 erp-surface erp-accent">
        <Plus size={16} /> {tr("افزودن ردیف", "إضافة صف", "Satır ekle", "Add row")}
      </button>
    </>
  );
}

function ReportDeliveryFields({ language, reportType, reportFormat, destinationEmail, onReportTypeChange, onReportFormatChange, onDestinationEmailChange }) {
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;
  const reportTypeLabel = (rt) => tr(rt.fa, rt.ar || rt.en, rt.tr || rt.en, rt.en);

  return (
    <>
      <Field label={tr("نوع گزارش", "نوع التقرير", "Rapor türü", "Report type")}>
        <select style={inputStyle} value={reportType} onChange={(e) => onReportTypeChange(e.target.value)}>
          {REPORT_TYPES.map((rt) => <option key={rt.value} value={rt.value}>{reportTypeLabel(rt)}</option>)}
        </select>
      </Field>
      <Field label={tr("فرمت", "الصيغة", "Biçim", "Format")}>
        <select style={inputStyle} value={reportFormat} onChange={(e) => onReportFormatChange(e.target.value)}>
          <option value="pdf">PDF</option>
          <option value="csv">CSV / Excel</option>
        </select>
      </Field>
      <Field label={tr("ارسال به ایمیل", "الإرسال إلى البريد الإلكتروني", "E-postaya gönder", "Send to email")}>
        <input
          required
          type="email"
          style={inputStyle}
          value={destinationEmail}
          onChange={(e) => onDestinationEmailChange(e.target.value)}
          placeholder="name@example.com"
        />
      </Field>
    </>
  );
}

function ReminderChannelFields({ language, existingChannels, operation, name, linkTemplate, channelId, onOperationChange, onNameChange, onLinkTemplateChange, onChannelIdChange }) {
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;

  return (
    <>
      <Field label={tr("عملیات", "العملية", "İşlem", "Operation")}>
        <select style={inputStyle} value={operation} onChange={(e) => onOperationChange(e.target.value)}>
          <option value="add">{tr("افزودن کانال جدید", "إضافة قناة جديدة", "Yeni kanal ekle", "Add a new channel")}</option>
          <option value="remove">{tr("حذف کانال موجود", "حذف قناة موجودة", "Mevcut kanalı kaldır", "Remove an existing channel")}</option>
        </select>
      </Field>
      {operation === "add" ? (
        <>
          <Field label={tr("نام برنامه", "اسم التطبيق", "Uygulama adı", "App name")}>
            <input required style={inputStyle} value={name} onChange={(e) => onNameChange(e.target.value)} placeholder={tr("مثلاً: بله", "مثال: Bale", "örn. Bale", "e.g. Bale")} />
          </Field>
          <Field label={tr("الگوی لینک اشتراک‌گذاری", "نمط رابط المشاركة", "Paylaşım bağlantısı şablonu", "Share link template")}>
            <input required style={{ ...inputStyle, direction: "ltr" }} value={linkTemplate} onChange={(e) => onLinkTemplateChange(e.target.value)} placeholder="https://ble.ir/share/{phone}?text={message}" />
          </Field>
        </>
      ) : (
        <Field label={tr("کانال مورد نظر", "القناة المطلوبة", "Hedef kanal", "Channel to remove")}>
          <select required style={inputStyle} value={channelId} onChange={(e) => onChannelIdChange(e.target.value)}>
            <option value="">{tr("انتخاب کنید", "اختر", "Seçin", "Choose")}</option>
            {existingChannels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      )}
    </>
  );
}

function RequestCard({ item, language, products, customers, reminderChannels, canReview, canApprove, onReview, onApprove, onReject, onAudio, onCreateInvoice }) {
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;
  const statusMaps = {
    fa: {
      draft: "پیش‌نویس",
      needs_transcript_review: "نیازمند بازبینی متن",
      pending_approval: "در انتظار تأیید",
      applied: "اعمال‌شده",
      rejected: "ردشده",
      failed: "ناموفق",
    },
    ar: {
      draft: "مسودة",
      needs_transcript_review: "بحاجة إلى مراجعة النص",
      pending_approval: "بانتظار الموافقة",
      applied: "تم التطبيق",
      rejected: "مرفوض",
      failed: "فشل",
    },
    tr: {
      draft: "Taslak",
      needs_transcript_review: "Metin incelemesi gerekli",
      pending_approval: "Onay bekliyor",
      applied: "Uygulandı",
      rejected: "Reddedildi",
      failed: "Başarısız",
    },
    en: {
      draft: "Draft",
      needs_transcript_review: "Transcript review required",
      pending_approval: "Pending approval",
      applied: "Applied",
      rejected: "Rejected",
      failed: "Failed",
    },
  };
  const status = (statusMaps[language] || statusMaps.en)[item.status] || item.status;
  return <article className="erp-surface rounded-2xl p-5">
    <div className="flex justify-between gap-3">
      <div><strong>#{item.id} · {status}</strong><p className="text-xs mt-1" style={{ color: "var(--erp-muted)" }}>{item.source} · {item.requested_by_name || item.requested_by}</p></div>
      <span className="rounded-full px-3 py-1 text-sm h-fit" style={{ background: "var(--erp-glow)", color: "var(--erp-accent)" }}>{item.action_type}</span>
    </div>
    <p className="mt-4 whitespace-pre-wrap">{item.transcript}</p>
    {item.audio_reference && <button type="button" onClick={onAudio} className="mt-3 rounded-xl px-3 py-2 font-bold flex items-center gap-2 erp-surface erp-accent"><FileAudio size={17} />{tr("دریافت فایل صوتی امن", "تنزيل الملف الصوتي الآمن", "Güvenli ses dosyasını indir", "Download secured audio")}</button>}
    <pre className="mt-3 rounded-xl p-3 text-xs overflow-x-auto" style={{ background: "var(--erp-panel-solid)" }}>{JSON.stringify(item.proposed_changes, null, 2)}</pre>
    {item.apply_result && <p className="mt-3 text-sm erp-accent">{item.apply_result}</p>}
    {item.action_type === "sale_invoice_draft" && item.status === "applied" && (
      <button
        type="button"
        onClick={onCreateInvoice}
        className="mt-3 rounded-xl px-4 py-2 font-black flex items-center gap-2"
        style={{ background: "#22c55e", color: "#052e16" }}
      >
        <FileText size={17} />
        {tr("ساخت فاکتور از این درخواست", "إنشاء فاتورة من هذا الطلب", "Bu talepten fatura oluştur", "Create invoice from this")}
      </button>
    )}
    {canReview && <TranscriptReviewer item={item} products={products} customers={customers} reminderChannels={reminderChannels} language={language} onReview={onReview} />}
    {canApprove && <div className="flex gap-2 mt-4"><button onClick={onApprove} className="rounded-xl px-4 py-2 font-black flex gap-2" style={{ background: "#22c55e", color: "#052e16" }}><Check size={17} />{tr("تأیید و اعمال", "الموافقة والتطبيق", "Onayla ve uygula", "Approve & apply")}</button><button onClick={onReject} className="rounded-xl px-4 py-2 font-black flex gap-2 bg-red-500 text-white"><X size={17} />{tr("رد", "رفض", "Reddet", "Reject")}</button></div>}
  </article>;
}

function TranscriptReviewer({ item, products, customers, reminderChannels, language, onReview }) {
  const tr = (faText, arText, trText, enText) =>
    language === "fa" ? faText : language === "ar" ? arText : language === "tr" ? trText : enText;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState({
    transcript: item.transcript || "",
    action_type: "note_only",
    target_id: "",
    field: "online_price",
    value: "",
    campaign_title: "",
    campaign_channel: "instagram",
    invoice_customer_id: "",
    invoice_items: [{ product_id: "", quantity: "1" }],
    report_type: "sales",
    report_format: "pdf",
    destination_email: "",
    reminder_operation: "add",
    reminder_name: "",
    reminder_link_template: "",
    reminder_channel_id: "",
  });

  async function submitReview() {
    let proposed_changes = {};
    let target_id = null;
    if (review.action_type === "online_product_update") {
      target_id = Number(review.target_id);
      let value = review.value;
      if (["online_price", "discount_percent"].includes(review.field)) value = Number(value);
      if (["is_published", "sync_stock"].includes(review.field)) value = value === "true";
      proposed_changes = { [review.field]: value };
    }
    if (review.action_type === "campaign_draft") {
      proposed_changes = {
        title: review.campaign_title,
        channel: review.campaign_channel,
        body: review.transcript,
      };
    }
    if (review.action_type === "sale_invoice_draft") {
      proposed_changes = {
        customer_id: Number(review.invoice_customer_id),
        items: review.invoice_items
          .filter((row) => row.product_id && Number(row.quantity) > 0)
          .map((row) => ({ product_id: Number(row.product_id), quantity: Number(row.quantity) })),
      };
    }
    if (review.action_type === "report_delivery") {
      proposed_changes = {
        report_type: review.report_type,
        format: review.report_format,
        destination_email: review.destination_email.trim(),
      };
    }
    if (review.action_type === "reminder_channel_manage") {
      proposed_changes = review.reminder_operation === "add"
        ? { operation: "add", name: review.reminder_name.trim(), link_template: review.reminder_link_template.trim() }
        : { operation: "remove", channel_id: review.reminder_channel_id };
    }
    setSaving(true);
    try {
      await onReview({
        transcript: review.transcript,
        action_type: review.action_type,
        target_id,
        proposed_changes,
      });
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-4 rounded-xl px-4 py-2 font-black flex gap-2" style={{ background: "#f59e0b", color: "#451a03" }}><PencilLine size={17} />{tr("بازبینی متن و نوع تغییر", "مراجعة النص ونوع التغيير", "Metni ve işlem türünü incele", "Review transcript & action")}</button>;

  return <div className="mt-4 rounded-2xl p-4 space-y-3" style={{ background: "var(--erp-panel-solid)", border: "1px solid #f59e0b" }}>
    <Field label={tr("متن نهایی تأییدشده توسط مدیر", "النص النهائي الذي راجعه المدير", "Yönetici tarafından incelenen nihai metin", "Manager-reviewed final transcript")}><textarea rows={5} minLength={2} style={inputStyle} value={review.transcript} onChange={(e) => setReview({ ...review, transcript: language === "fa" ? toPersianDigits(e.target.value) : e.target.value })} /></Field>
    <Field label={tr("تبدیل متن به", "تحويل النص إلى", "Metni şuna dönüştür", "Convert transcript to")}><select style={inputStyle} value={review.action_type} onChange={(e) => setReview({ ...review, action_type: e.target.value })}><option value="note_only">{tr("یادداشت بدون اجرا", "ملاحظة غير قابلة للتنفيذ", "Uygulanamayan not", "Non-executable note")}</option><option value="online_product_update">{tr("تغییر کالای سایت", "تحديث منتج الموقع", "Site ürün güncellemesi", "Online product update")}</option><option value="campaign_draft">{tr("پیش‌نویس کمپین", "مسودة حملة", "Kampanya taslağı", "Campaign draft")}</option><option value="sale_invoice_draft">{tr("پیش‌نویس فاکتور فروش", "مسودة فاتورة بيع", "Satış faturası taslağı", "Sale invoice draft")}</option><option value="report_delivery">{tr("ارسال گزارش", "إرسال تقرير", "Rapor gönder", "Send a report")}</option><option value="reminder_channel_manage">{tr("افزودن/حذف کانال یادآوری", "إضافة/حذف قناة تذكير", "Hatırlatma kanalı ekle/kaldır", "Add/remove reminder channel")}</option></select></Field>
    {review.action_type === "reminder_channel_manage" && (
      <ReminderChannelFields
        language={language}
        existingChannels={reminderChannels}
        operation={review.reminder_operation}
        name={review.reminder_name}
        linkTemplate={review.reminder_link_template}
        channelId={review.reminder_channel_id}
        onOperationChange={(value) => setReview({ ...review, reminder_operation: value })}
        onNameChange={(value) => setReview({ ...review, reminder_name: language === "fa" ? toPersianDigits(value) : value })}
        onLinkTemplateChange={(value) => setReview({ ...review, reminder_link_template: value })}
        onChannelIdChange={(value) => setReview({ ...review, reminder_channel_id: value })}
      />
    )}
    {review.action_type === "sale_invoice_draft" && (
      <InvoiceItemsBuilder
        language={language}
        customers={customers}
        products={products}
        customerId={review.invoice_customer_id}
        items={review.invoice_items}
        onCustomerChange={(value) => setReview({ ...review, invoice_customer_id: value })}
        onItemsChange={(items) => setReview({ ...review, invoice_items: items })}
      />
    )}
    {review.action_type === "report_delivery" && (
      <ReportDeliveryFields
        language={language}
        reportType={review.report_type}
        reportFormat={review.report_format}
        destinationEmail={review.destination_email}
        onReportTypeChange={(value) => setReview({ ...review, report_type: value })}
        onReportFormatChange={(value) => setReview({ ...review, report_format: value })}
        onDestinationEmailChange={(value) => setReview({ ...review, destination_email: value })}
      />
    )}
    {review.action_type === "online_product_update" && <>
      <Field label={tr("کالا", "المنتج", "Ürün", "Product")}><select style={inputStyle} value={review.target_id} onChange={(e) => setReview({ ...review, target_id: e.target.value })}><option value="">{tr("انتخاب کالا", "اختر المنتج", "Ürün seçin", "Choose product")}</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></Field>
      <Field label={tr("فیلد مجاز", "الحقل المسموح به", "İzin verilen alan", "Allowed field")}><select style={inputStyle} value={review.field} onChange={(e) => setReview({ ...review, field: e.target.value })}><option value="online_price">{tr("قیمت سایت", "سعر الموقع", "Site fiyatı", "Online price")}</option><option value="discount_percent">{tr("درصد تخفیف", "نسبة الخصم", "İndirim yüzdesi", "Discount percent")}</option><option value="is_published">{tr("انتشار", "النشر", "Yayın", "Published")}</option><option value="sync_stock">{tr("همگام‌سازی موجودی", "مزامنة المخزون", "Stok senkronizasyonu", "Stock sync")}</option></select></Field>
      <Field label={tr("مقدار جدید", "القيمة الجديدة", "Yeni değer", "New value")}>{["is_published", "sync_stock"].includes(review.field) ? <select style={inputStyle} value={review.value} onChange={(e) => setReview({ ...review, value: e.target.value })}><option value="">{tr("انتخاب", "اختر", "Seçin", "Choose")}</option><option value="true">{tr("فعال", "مفعّل", "Etkin", "Enabled")}</option><option value="false">{tr("غیرفعال", "معطّل", "Devre dışı", "Disabled")}</option></select> : <input type="text" inputMode="numeric" style={inputStyle} value={language === "fa" ? toPersianDigits(review.value) : review.value} onChange={(e) => setReview({ ...review, value: cleanNumberInput(e.target.value) })} />}</Field>
    </>}
    {review.action_type === "campaign_draft" && <>
      <Field label={tr("عنوان کمپین", "عنوان الحملة", "Kampanya başlığı", "Campaign title")}><input style={inputStyle} value={review.campaign_title} onChange={(e) => setReview({ ...review, campaign_title: language === "fa" ? toPersianDigits(e.target.value) : e.target.value })} /></Field>
      <Field label={tr("شبکه", "القناة", "Kanal", "Channel")}><select style={inputStyle} value={review.campaign_channel} onChange={(e) => setReview({ ...review, campaign_channel: e.target.value })}>{["website", "instagram", "telegram", "whatsapp", "linkedin"].map((channel) => <option key={channel} value={channel}>{channel === "website" ? tr("وبسایت", "الموقع الإلكتروني", "Web sitesi", "Website") : channel[0].toUpperCase() + channel.slice(1)}</option>)}</select></Field>
    </>}
    <div className="flex gap-2"><button type="button" disabled={saving || review.transcript.trim().length < 2 || (review.action_type === "online_product_update" && (!review.target_id || review.value === "")) || (review.action_type === "campaign_draft" && !review.campaign_title.trim()) || (review.action_type === "sale_invoice_draft" && (!review.invoice_customer_id || !review.invoice_items.some((row) => row.product_id && Number(row.quantity) > 0))) || (review.action_type === "report_delivery" && !review.destination_email.trim()) || (review.action_type === "reminder_channel_manage" && (review.reminder_operation === "add" ? (!review.reminder_name.trim() || !review.reminder_link_template.trim()) : !review.reminder_channel_id))} onClick={submitReview} className="rounded-xl px-4 py-2 font-black" style={{ background: "#22c55e", color: "#052e16", opacity: saving ? .6 : 1 }}>{saving ? "..." : tr("ثبت بازبینی و ارسال برای تأیید نهایی", "حفظ المراجعة وإرسالها للموافقة النهائية", "İncelemeyi kaydet ve nihai onaya gönder", "Save review & queue final approval")}</button><button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2 bg-[var(--erp-panel-solid)] text-[var(--erp-text)]">{tr("انصراف", "إلغاء", "İptal", "Cancel")}</button></div>
  </div>;
}
