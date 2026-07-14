import { useEffect, useRef, useState } from "react";
import { Check, FileAudio, Mic, MicOff, RefreshCw, Send, ShieldCheck, X } from "lucide-react";
import toast from "react-hot-toast";
import { API_URL, getAuthHeaders } from "../services/api";
import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "../localization/LanguageContext";

async function api(path, options = {}) {
  const response = await fetch(`${API_URL}/api/change-requests${path}`, {
    ...options,
    headers: { ...getAuthHeaders(), ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Request failed");
  return data;
}

export default function ChangeRequestCenter() {
  const { language, dir } = useLanguage();
  const { user } = useAuth();
  const fa = language === "fa";
  const [requests, setRequests] = useState([]);
  const [products, setProducts] = useState([]);
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
  });

  async function load() {
    setLoading(true);
    try {
      const [requestData, productResponse] = await Promise.all([
        api(""),
        fetch(`${API_URL}/products`, { headers: getAuthHeaders() }).then((res) => res.ok ? res.json() : []),
      ]);
      setRequests(requestData);
      setProducts(Array.isArray(productResponse) ? productResponse : []);
    } catch (error) { toast.error(error.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); return () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }; }, []);

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
      setForm({ source: "in_app", source_reference: "", transcript: "", action_type: "note_only", target_id: "", field: "online_price", value: "" });
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
            </select>
          </Field>

          {form.action_type === "online_product_update" && <>
            <Field label={fa ? "کالا" : "Product"}><select required style={inputStyle} value={form.target_id} onChange={(e) => setForm({ ...form, target_id: e.target.value })}><option value="">{fa ? "انتخاب کالا" : "Choose product"}</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label={fa ? "فیلد قابل تغییر" : "Allowed field"}><select style={inputStyle} value={form.field} onChange={(e) => setForm({ ...form, field: e.target.value })}><option value="online_price">{fa ? "قیمت سایت" : "Online price"}</option><option value="discount_percent">{fa ? "درصد تخفیف" : "Discount percent"}</option><option value="is_published">{fa ? "وضعیت انتشار" : "Published"}</option><option value="sync_stock">{fa ? "همگام‌سازی موجودی" : "Stock sync"}</option></select></Field>
            <Field label={fa ? "مقدار جدید" : "New value"}>{["is_published", "sync_stock"].includes(form.field) ? <select style={inputStyle} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })}><option value="">{fa ? "انتخاب" : "Choose"}</option><option value="true">{fa ? "فعال" : "Enabled"}</option><option value="false">{fa ? "غیرفعال" : "Disabled"}</option></select> : <input required type="number" min="0" style={inputStyle} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />}</Field>
          </>}

          {form.action_type === "campaign_draft" && <Field label={fa ? "عنوان کمپین" : "Campaign title"}><input required style={inputStyle} value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></Field>}

          <button className="w-full rounded-2xl p-4 font-black flex items-center justify-center gap-2" style={{ background: "linear-gradient(110deg,var(--erp-accent),var(--erp-accent-2))", color: "#071028" }}><Send size={18} />{fa ? "ارسال برای تأیید مدیر" : "Submit for administrator approval"}</button>
        </form>

        <section className="space-y-3">
          <div className="erp-surface rounded-2xl p-4 flex gap-3 items-center"><ShieldCheck className="erp-accent" /><p className="text-sm">{fa ? "امنیت: درخواست‌کننده نمی‌تواند درخواست خودش را تأیید کند و اجرای فرمان آزاد ممنوع است." : "Security: requesters cannot approve their own request and arbitrary commands are forbidden."}</p></div>
          {requests.map((item) => <RequestCard key={item.id} item={item} fa={fa} canApprove={user?.role === "admin" && item.status === "pending_approval" && Number(item.requested_by) !== Number(user?.id)} onApprove={() => decide(item.id, "approve")} onReject={() => decide(item.id, "reject")} onAudio={() => downloadStoredAudio(item)} />)}
          {!requests.length && !loading && <div className="erp-surface rounded-3xl p-10 text-center">{fa ? "درخواستی وجود ندارد." : "No requests yet."}</div>}
        </section>
      </div>
    </div>
  );
}

const inputStyle = { width: "100%", padding: 12, borderRadius: 12, background: "var(--erp-panel-solid)", color: "var(--erp-text)", border: "1px solid var(--erp-border)" };
function Field({ label, children }) { return <label className="block text-sm font-bold space-y-1"><span>{label}</span>{children}</label>; }

function RequestCard({ item, fa, canApprove, onApprove, onReject, onAudio }) {
  const status = { draft: fa ? "پیش‌نویس" : "Draft", pending_approval: fa ? "در انتظار تأیید" : "Pending approval", applied: fa ? "اعمال‌شده" : "Applied", rejected: fa ? "ردشده" : "Rejected", failed: fa ? "ناموفق" : "Failed" }[item.status] || item.status;
  return <article className="erp-surface rounded-2xl p-5"><div className="flex justify-between gap-3"><div><strong>#{item.id} · {status}</strong><p className="text-xs mt-1" style={{ color: "var(--erp-muted)" }}>{item.source} · {item.requested_by_name || item.requested_by}</p></div><span className="rounded-full px-3 py-1 text-sm h-fit" style={{ background: "var(--erp-glow)", color: "var(--erp-accent)" }}>{item.action_type}</span></div><p className="mt-4 whitespace-pre-wrap">{item.transcript}</p>{item.audio_reference && <button type="button" onClick={onAudio} className="mt-3 rounded-xl px-3 py-2 font-bold flex items-center gap-2 erp-surface erp-accent"><FileAudio size={17} />{fa ? "دریافت فایل صوتی امن" : "Download secured audio"}</button>}<pre className="mt-3 rounded-xl p-3 text-xs overflow-x-auto" style={{ background: "var(--erp-panel-solid)" }}>{JSON.stringify(item.proposed_changes, null, 2)}</pre>{item.apply_result && <p className="mt-3 text-sm erp-accent">{item.apply_result}</p>}{canApprove && <div className="flex gap-2 mt-4"><button onClick={onApprove} className="rounded-xl px-4 py-2 font-black flex gap-2" style={{ background: "#22c55e", color: "#052e16" }}><Check size={17} />{fa ? "تأیید و اعمال" : "Approve & apply"}</button><button onClick={onReject} className="rounded-xl px-4 py-2 font-black flex gap-2 bg-red-500 text-white"><X size={17} />{fa ? "رد" : "Reject"}</button></div>}</article>;
}
