import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, FileAudio, FileText, Mic, MicOff, PencilLine, Plus, RefreshCw, Send, ShieldCheck, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import { API_URL, getAuthHeaders } from "../services/api";
import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "../localization/useLanguage";

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
  { value: "sales", fa: "فاکتورهای فروش", en: "Sales invoices" },
  { value: "purchases", fa: "فاکتورهای خرید", en: "Purchase invoices" },
  { value: "inventory", fa: "موجودی انبار", en: "Inventory" },
  { value: "customer_balances", fa: "مانده حساب مشتریان", en: "Customer balances" },
  { value: "product_profit", fa: "سودآوری کالاها", en: "Product profitability" },
  { value: "open_invoices", fa: "فاکتورهای تسویه‌نشده", en: "Open invoices" },
  { value: "inventory_movements", fa: "گردش انبار", en: "Stock movements" },
];

export default function ChangeRequestCenter() {
  const { language, dir } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const fa = language === "fa";
  const [requests, setRequests] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
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
  });

  async function load() {
    setLoading(true);
    try {
      const [requestData, productResponse, customerResponse] = await Promise.all([
        api(""),
        fetch(`${API_URL}/products`, { headers: getAuthHeaders() }).then((res) => res.ok ? res.json() : []),
        fetch(`${API_URL}/customers`, { headers: getAuthHeaders() }).then((res) => res.ok ? res.json() : []),
      ]);
      setRequests(requestData);
      setProducts(Array.isArray(productResponse) ? productResponse : []);
      setCustomers(Array.isArray(customerResponse) ? customerResponse : []);
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
      toast.error(fa ? "دسترسی میکروفن فعال نیست." : "Microphone access is unavailable.");
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
      return { title: form.value || (fa ? "کمپین پیشنهادی" : "Proposed campaign"), channel: "instagram", body: form.transcript };
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
      toast.success(fa ? "درخواست برای تأیید مدیر ارسال شد." : "Request submitted for administrator approval.");
      setForm({
        source: "in_app", source_reference: "", transcript: "", action_type: "note_only", target_id: "", field: "online_price", value: "",
        invoice_customer_id: "", invoice_items: [{ ...emptyInvoiceItem }],
        report_type: "sales", report_format: "pdf", destination_email: "",
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
      toast.success(fa ? "متن بازبینی و برای تأیید نهایی آماده شد." : "Transcript reviewed and queued for final approval.");
      await load();
    } catch (error) {
      toast.error(error.message);
      throw error;
    }
  }

  async function decide(id, action) {
    const note = window.prompt(action === "reject" ? (fa ? "دلیل رد را وارد کنید:" : "Enter rejection reason:") : (fa ? "یادداشت تأیید (اختیاری):" : "Approval note (optional):"), "");
    if (note === null || (action === "reject" && !note.trim())) return;
    try {
      await api(`/${id}/${action}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }),
      });
      toast.success(action === "approve" ? (fa ? "تأیید و اعمال شد." : "Approved and applied.") : (fa ? "درخواست رد شد." : "Request rejected."));
      load();
    } catch (error) { toast.error(error.message); }
  }

  return (
    <div dir={dir} className="space-y-5">
      <header className="erp-surface rounded-3xl p-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3"><Mic className="erp-accent" size={34} /><h1 className="text-3xl font-black erp-accent">{fa ? "مرکز درخواست تغییر با ویس" : "Voice Change Request Center"}</h1></div>
          <p className="mt-2" style={{ color: "var(--erp-muted)" }}>{fa ? "هیچ تغییری بدون بازبینی و تأیید مدیر اجرا نمی‌شود." : "No change is executed without administrator review and approval."}</p>
        </div>
        <button onClick={load} className="erp-surface rounded-2xl px-4 py-3 font-black erp-accent flex gap-2"><RefreshCw size={18} className={loading ? "animate-spin" : ""} />{fa ? "به‌روزرسانی" : "Refresh"}</button>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[430px_1fr] gap-5">
        <form onSubmit={submit} className="erp-surface rounded-3xl p-5 space-y-4">
          <h2 className="text-xl font-black">{fa ? "درخواست جدید" : "New request"}</h2>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={recording ? stopRecording : startRecording} className="rounded-2xl p-4 font-black flex items-center justify-center gap-2" style={{ background: recording ? "#ef4444" : "var(--erp-accent)", color: recording ? "white" : "#071028" }}>
              {recording ? <MicOff /> : <Mic />}{recording ? (fa ? "توقف ضبط" : "Stop") : (fa ? "ضبط ویس" : "Record")}
            </button>
            <label className="erp-surface rounded-2xl p-4 font-black flex items-center justify-center gap-2 cursor-pointer"><FileAudio />{fa ? "انتخاب فایل" : "Audio file"}<input type="file" accept="audio/*" hidden onChange={chooseAudio} /></label>
          </div>
          {audioUrl && <audio controls src={audioUrl} className="w-full" />}
          {audioName && <p className="text-xs" style={{ color: "var(--erp-muted)" }}>{audioName}</p>}

          <Field label={fa ? "منبع ویس" : "Voice source"}>
            <select style={inputStyle} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>{["in_app", "telegram", "whatsapp", "other"].map((item) => <option key={item} value={item}>{item}</option>)}</select>
          </Field>
          {form.source !== "in_app" && <Field label={fa ? "شناسه پیام یا لینک" : "Message ID or link"}><input style={inputStyle} value={form.source_reference} onChange={(e) => setForm({ ...form, source_reference: e.target.value })} /></Field>}
          <Field label={fa ? "متن ویس پس از بررسی" : "Reviewed voice transcript"}>
            <textarea required minLength={2} rows={5} style={inputStyle} value={form.transcript} onChange={(e) => setForm({ ...form, transcript: e.target.value })} placeholder={fa ? "متن دقیق درخواست را وارد یا پس از تبدیل صدا اصلاح کنید…" : "Enter or review the exact voice instruction…"} />
          </Field>
          <Field label={fa ? "نوع درخواست" : "Request type"}>
            <select style={inputStyle} value={form.action_type} onChange={(e) => setForm({ ...form, action_type: e.target.value })}>
              <option value="note_only">{fa ? "فقط یادداشت؛ بدون اجرا" : "Note only; no execution"}</option>
              <option value="online_product_update">{fa ? "تغییر مشخصات کالای سایت" : "Online product update"}</option>
              <option value="campaign_draft">{fa ? "ساخت پیش‌نویس تبلیغ" : "Create campaign draft"}</option>
              <option value="sale_invoice_draft">{fa ? "پیش‌نویس فاکتور فروش" : "Sale invoice draft"}</option>
              <option value="report_delivery">{fa ? "ارسال گزارش" : "Send a report"}</option>
            </select>
          </Field>

          {form.action_type === "online_product_update" && <>
            <Field label={fa ? "کالا" : "Product"}><select required style={inputStyle} value={form.target_id} onChange={(e) => setForm({ ...form, target_id: e.target.value })}><option value="">{fa ? "انتخاب کالا" : "Choose product"}</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label={fa ? "فیلد قابل تغییر" : "Allowed field"}><select style={inputStyle} value={form.field} onChange={(e) => setForm({ ...form, field: e.target.value })}><option value="online_price">{fa ? "قیمت سایت" : "Online price"}</option><option value="discount_percent">{fa ? "درصد تخفیف" : "Discount percent"}</option><option value="is_published">{fa ? "وضعیت انتشار" : "Published"}</option><option value="sync_stock">{fa ? "همگام‌سازی موجودی" : "Stock sync"}</option></select></Field>
            <Field label={fa ? "مقدار جدید" : "New value"}>{["is_published", "sync_stock"].includes(form.field) ? <select style={inputStyle} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })}><option value="">{fa ? "انتخاب" : "Choose"}</option><option value="true">{fa ? "فعال" : "Enabled"}</option><option value="false">{fa ? "غیرفعال" : "Disabled"}</option></select> : <input required type="number" min="0" style={inputStyle} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />}</Field>
          </>}

          {form.action_type === "campaign_draft" && <Field label={fa ? "عنوان کمپین" : "Campaign title"}><input required style={inputStyle} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></Field>}

          {form.action_type === "sale_invoice_draft" && (
            <InvoiceItemsBuilder
              fa={fa}
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
              fa={fa}
              reportType={form.report_type}
              reportFormat={form.report_format}
              destinationEmail={form.destination_email}
              onReportTypeChange={(value) => setForm({ ...form, report_type: value })}
              onReportFormatChange={(value) => setForm({ ...form, report_format: value })}
              onDestinationEmailChange={(value) => setForm({ ...form, destination_email: value })}
            />
          )}

          <button className="w-full rounded-2xl p-4 font-black flex items-center justify-center gap-2" style={{ background: "linear-gradient(110deg,var(--erp-accent),var(--erp-accent-2))", color: "#071028" }}><Send size={18} />{fa ? "ارسال برای تأیید مدیر" : "Submit for administrator approval"}</button>
        </form>

        <section className="space-y-3">
          <div className="erp-surface rounded-2xl p-4 flex gap-3 items-center"><ShieldCheck className="erp-accent" /><p className="text-sm">{fa ? "امنیت: درخواست‌کننده نمی‌تواند درخواست خودش را تأیید کند و اجرای فرمان آزاد ممنوع است." : "Security: requesters cannot approve their own request and arbitrary commands are forbidden."}</p></div>
          {requests.map((item) => <RequestCard key={item.id} item={item} fa={fa} products={products} customers={customers} canReview={user?.role === "admin" && item.status === "needs_transcript_review"} canApprove={user?.role === "admin" && item.status === "pending_approval" && Number(item.requested_by) !== Number(user?.id)} onReview={(payload) => reviewTranscript(item.id, payload)} onApprove={() => decide(item.id, "approve")} onReject={() => decide(item.id, "reject")} onAudio={() => downloadStoredAudio(item)} onCreateInvoice={() => createInvoiceFromRequest(item)} />)}
          {!requests.length && !loading && <div className="erp-surface rounded-3xl p-10 text-center">{fa ? "درخواستی وجود ندارد." : "No requests yet."}</div>}
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

function InvoiceItemsBuilder({ fa, customers, products, customerId, items, onCustomerChange, onItemsChange }) {
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
      <Field label={fa ? "طرف‌حساب" : "Customer"}>
        <select required style={inputStyle} value={customerId} onChange={(e) => onCustomerChange(e.target.value)}>
          <option value="">{fa ? "انتخاب طرف‌حساب" : "Choose customer"}</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      {items.map((row, index) => (
        <div key={index} className="grid grid-cols-[1fr_90px_40px] gap-2 items-end">
          <Field label={index === 0 ? (fa ? "کالا" : "Product") : ""}>
            <select required style={inputStyle} value={row.product_id} onChange={(e) => updateRow(index, "product_id", e.target.value)}>
              <option value="">{fa ? "انتخاب کالا" : "Choose product"}</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label={index === 0 ? (fa ? "تعداد" : "Qty") : ""}>
            <input required type="number" min="0.01" step="any" style={inputStyle} value={row.quantity} onChange={(e) => updateRow(index, "quantity", e.target.value)} />
          </Field>
          <button type="button" onClick={() => removeRow(index)} className="rounded-xl p-3 bg-red-500/20 text-red-300"><Trash2 size={16} /></button>
        </div>
      ))}
      <button type="button" onClick={addRow} className="rounded-xl px-3 py-2 font-bold flex items-center gap-2 erp-surface erp-accent">
        <Plus size={16} /> {fa ? "افزودن ردیف" : "Add row"}
      </button>
    </>
  );
}

function ReportDeliveryFields({ fa, reportType, reportFormat, destinationEmail, onReportTypeChange, onReportFormatChange, onDestinationEmailChange }) {
  return (
    <>
      <Field label={fa ? "نوع گزارش" : "Report type"}>
        <select style={inputStyle} value={reportType} onChange={(e) => onReportTypeChange(e.target.value)}>
          {REPORT_TYPES.map((rt) => <option key={rt.value} value={rt.value}>{fa ? rt.fa : rt.en}</option>)}
        </select>
      </Field>
      <Field label={fa ? "فرمت" : "Format"}>
        <select style={inputStyle} value={reportFormat} onChange={(e) => onReportFormatChange(e.target.value)}>
          <option value="pdf">PDF</option>
          <option value="csv">CSV / Excel</option>
        </select>
      </Field>
      <Field label={fa ? "ارسال به ایمیل" : "Send to email"}>
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

function RequestCard({ item, fa, products, customers, canReview, canApprove, onReview, onApprove, onReject, onAudio, onCreateInvoice }) {
  const status = {
    draft: fa ? "پیش‌نویس" : "Draft",
    needs_transcript_review: fa ? "نیازمند بازبینی متن" : "Transcript review required",
    pending_approval: fa ? "در انتظار تأیید" : "Pending approval",
    applied: fa ? "اعمال‌شده" : "Applied",
    rejected: fa ? "ردشده" : "Rejected",
    failed: fa ? "ناموفق" : "Failed",
  }[item.status] || item.status;
  return <article className="erp-surface rounded-2xl p-5">
    <div className="flex justify-between gap-3">
      <div><strong>#{item.id} · {status}</strong><p className="text-xs mt-1" style={{ color: "var(--erp-muted)" }}>{item.source} · {item.requested_by_name || item.requested_by}</p></div>
      <span className="rounded-full px-3 py-1 text-sm h-fit" style={{ background: "var(--erp-glow)", color: "var(--erp-accent)" }}>{item.action_type}</span>
    </div>
    <p className="mt-4 whitespace-pre-wrap">{item.transcript}</p>
    {item.audio_reference && <button type="button" onClick={onAudio} className="mt-3 rounded-xl px-3 py-2 font-bold flex items-center gap-2 erp-surface erp-accent"><FileAudio size={17} />{fa ? "دریافت فایل صوتی امن" : "Download secured audio"}</button>}
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
        {fa ? "ساخت فاکتور از این درخواست" : "Create invoice from this"}
      </button>
    )}
    {canReview && <TranscriptReviewer item={item} products={products} customers={customers} fa={fa} onReview={onReview} />}
    {canApprove && <div className="flex gap-2 mt-4"><button onClick={onApprove} className="rounded-xl px-4 py-2 font-black flex gap-2" style={{ background: "#22c55e", color: "#052e16" }}><Check size={17} />{fa ? "تأیید و اعمال" : "Approve & apply"}</button><button onClick={onReject} className="rounded-xl px-4 py-2 font-black flex gap-2 bg-red-500 text-white"><X size={17} />{fa ? "رد" : "Reject"}</button></div>}
  </article>;
}

function TranscriptReviewer({ item, products, customers, fa, onReview }) {
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

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-4 rounded-xl px-4 py-2 font-black flex gap-2" style={{ background: "#f59e0b", color: "#451a03" }}><PencilLine size={17} />{fa ? "بازبینی متن و نوع تغییر" : "Review transcript & action"}</button>;

  return <div className="mt-4 rounded-2xl p-4 space-y-3" style={{ background: "var(--erp-panel-solid)", border: "1px solid #f59e0b" }}>
    <Field label={fa ? "متن نهایی تأییدشده توسط مدیر" : "Manager-reviewed final transcript"}><textarea rows={5} minLength={2} style={inputStyle} value={review.transcript} onChange={(e) => setReview({ ...review, transcript: e.target.value })} /></Field>
    <Field label={fa ? "تبدیل متن به" : "Convert transcript to"}><select style={inputStyle} value={review.action_type} onChange={(e) => setReview({ ...review, action_type: e.target.value })}><option value="note_only">{fa ? "یادداشت بدون اجرا" : "Non-executable note"}</option><option value="online_product_update">{fa ? "تغییر کالای سایت" : "Online product update"}</option><option value="campaign_draft">{fa ? "پیش‌نویس کمپین" : "Campaign draft"}</option><option value="sale_invoice_draft">{fa ? "پیش‌نویس فاکتور فروش" : "Sale invoice draft"}</option><option value="report_delivery">{fa ? "ارسال گزارش" : "Send a report"}</option></select></Field>
    {review.action_type === "sale_invoice_draft" && (
      <InvoiceItemsBuilder
        fa={fa}
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
        fa={fa}
        reportType={review.report_type}
        reportFormat={review.report_format}
        destinationEmail={review.destination_email}
        onReportTypeChange={(value) => setReview({ ...review, report_type: value })}
        onReportFormatChange={(value) => setReview({ ...review, report_format: value })}
        onDestinationEmailChange={(value) => setReview({ ...review, destination_email: value })}
      />
    )}
    {review.action_type === "online_product_update" && <>
      <Field label={fa ? "کالا" : "Product"}><select style={inputStyle} value={review.target_id} onChange={(e) => setReview({ ...review, target_id: e.target.value })}><option value="">{fa ? "انتخاب کالا" : "Choose product"}</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></Field>
      <Field label={fa ? "فیلد مجاز" : "Allowed field"}><select style={inputStyle} value={review.field} onChange={(e) => setReview({ ...review, field: e.target.value })}><option value="online_price">{fa ? "قیمت سایت" : "Online price"}</option><option value="discount_percent">{fa ? "درصد تخفیف" : "Discount percent"}</option><option value="is_published">{fa ? "انتشار" : "Published"}</option><option value="sync_stock">{fa ? "همگام‌سازی موجودی" : "Stock sync"}</option></select></Field>
      <Field label={fa ? "مقدار جدید" : "New value"}>{["is_published", "sync_stock"].includes(review.field) ? <select style={inputStyle} value={review.value} onChange={(e) => setReview({ ...review, value: e.target.value })}><option value="">{fa ? "انتخاب" : "Choose"}</option><option value="true">{fa ? "فعال" : "Enabled"}</option><option value="false">{fa ? "غیرفعال" : "Disabled"}</option></select> : <input type="number" min="0" style={inputStyle} value={review.value} onChange={(e) => setReview({ ...review, value: e.target.value })} />}</Field>
    </>}
    {review.action_type === "campaign_draft" && <>
      <Field label={fa ? "عنوان کمپین" : "Campaign title"}><input style={inputStyle} value={review.campaign_title} onChange={(e) => setReview({ ...review, campaign_title: e.target.value })} /></Field>
      <Field label={fa ? "شبکه" : "Channel"}><select style={inputStyle} value={review.campaign_channel} onChange={(e) => setReview({ ...review, campaign_channel: e.target.value })}>{["website", "instagram", "telegram", "whatsapp", "linkedin"].map((channel) => <option key={channel}>{channel}</option>)}</select></Field>
    </>}
    <div className="flex gap-2"><button type="button" disabled={saving || review.transcript.trim().length < 2 || (review.action_type === "online_product_update" && (!review.target_id || review.value === "")) || (review.action_type === "campaign_draft" && !review.campaign_title.trim()) || (review.action_type === "sale_invoice_draft" && (!review.invoice_customer_id || !review.invoice_items.some((row) => row.product_id && Number(row.quantity) > 0))) || (review.action_type === "report_delivery" && !review.destination_email.trim())} onClick={submitReview} className="rounded-xl px-4 py-2 font-black" style={{ background: "#22c55e", color: "#052e16", opacity: saving ? .6 : 1 }}>{saving ? "..." : (fa ? "ثبت بازبینی و ارسال برای تأیید نهایی" : "Save review & queue final approval")}</button><button type="button" onClick={() => setOpen(false)} className="rounded-xl px-4 py-2 bg-slate-600 text-white">{fa ? "انصراف" : "Cancel"}</button></div>
  </div>;
}
