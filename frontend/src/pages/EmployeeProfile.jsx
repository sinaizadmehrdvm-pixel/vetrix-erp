import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Plus, User } from "lucide-react";
import toast from "react-hot-toast";

import { useLanguage } from "../localization/useLanguage";
import {
  getEmployee, getEmployeeSummary, getEmployeeHistory, getEmployeeCompensation, createEmployeeCompensation,
  getEmployeeLeaveBalances, setEmployeeLeaveBalance, getEmployeeLeaveRequests, createEmployeeLeaveRequest, cancelEmployeeLeaveRequest,
  getEmployeeAttendance, recordEmployeeAttendance, getEmployeeDocuments, uploadEmployeeDocument, deleteEmployeeDocument,
  getEmployeePerformanceReviews, createEmployeePerformanceReview, fetchAuthenticatedResource,
} from "../services/api";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "../components/ui/Table";

const cardClass = "rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-panel)] p-5";
const inputClass = "w-full p-3 rounded-xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] outline-none focus:ring-2 focus:ring-cyan-400";
const btnClass = "rounded-xl bg-[var(--erp-accent)] text-black font-black px-4 py-2 disabled:opacity-60";
const ghostBtnClass = "rounded-xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] px-3 py-2 text-sm font-bold";

const TABS = ["overview", "history", "compensation", "leave", "attendance", "documents", "performance"];

export default function EmployeeProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { dir, language, n, date } = useLanguage();
  const tr = (fa, ar, trText, en) => (language === "fa" ? fa : language === "ar" ? ar : language === "tr" ? trText : en);

  const [employee, setEmployee] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");

  async function load() {
    setLoading(true);
    try {
      const [empData, summaryData] = await Promise.all([getEmployee(id), getEmployeeSummary(id)]);
      setEmployee(empData);
      setSummary(summaryData);
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
  }, [id]);

  const tabLabel = (t) => ({
    overview: tr("نمای کلی", "نظرة عامة", "Genel bakış", "Overview"),
    history: tr("تاریخچه شغلی", "السجل الوظيفي", "İstihdam geçmişi", "Employment history"),
    compensation: tr("پرداخت‌ها", "التعويضات", "Ücretlendirme", "Compensation"),
    leave: tr("مرخصی", "الإجازات", "İzin", "Leave"),
    attendance: tr("حضور و غیاب", "الحضور", "Devam", "Attendance"),
    documents: tr("مدارک", "المستندات", "Belgeler", "Documents"),
    performance: tr("عملکرد", "الأداء", "Performans", "Performance"),
  }[t] || t);

  if (loading || !employee) {
    return <div dir={dir} className="p-6 text-[var(--erp-muted)]">{tr("در حال بارگذاری...", "جارٍ التحميل...", "Yükleniyor...", "Loading...")}</div>;
  }

  return (
    <div dir={dir} className="p-4 md:p-6 space-y-6 text-[var(--erp-text)]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/hr/employees")} className={ghostBtnClass}><ArrowLeft size={16} /></button>
          <h1 className="text-2xl font-black flex items-center gap-2">
            <User className="text-[var(--erp-accent)]" />
            {employee.display_name || `${employee.first_name} ${employee.last_name}`}
          </h1>
        </div>
        <div className="text-sm text-[var(--erp-muted)]">{employee.job_title} {employee.department ? `· ${employee.department}` : ""}</div>
      </header>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 rounded-xl text-sm font-bold border ${tab === t ? "bg-[var(--erp-accent)] text-black border-transparent" : "bg-[var(--erp-panel-solid)] border-[var(--erp-border)]"}`}>
            {tabLabel(t)}
          </button>
        ))}
      </div>

      {tab === "overview" && summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className={cardClass}>
            <h3 className="font-black mb-3">{tr("موجودی مرخصی", "رصيد الإجازات", "İzin bakiyesi", "Leave balances")}</h3>
            {summary.leave_balances.map((b) => (
              <div key={b.leave_type} className="flex justify-between text-sm py-1"><span>{b.leave_type}</span><span className="font-bold">{n(b.remaining)} / {n(b.entitlement)}</span></div>
            ))}
            <div className="text-xs text-[var(--erp-muted)] mt-2">{tr("درخواست‌های در انتظار", "طلبات معلقة", "Bekleyen istekler", "Pending requests")}: {n(summary.pending_leave_requests)}</div>
          </div>
          <div className={cardClass}>
            <h3 className="font-black mb-3">{tr("آخرین ارزیابی عملکرد", "آخر تقييم أداء", "Son performans değerlendirmesi", "Latest performance review")}</h3>
            {summary.latest_performance_review ? (
              <div className="text-sm space-y-1">
                <div>{summary.latest_performance_review.review_period}</div>
                <div>{tr("امتیاز", "التقييم", "Puan", "Rating")}: {n(summary.latest_performance_review.rating)}/5</div>
              </div>
            ) : <div className="text-sm text-[var(--erp-muted)]">{tr("ارزیابی ثبت نشده.", "لا يوجد تقييم.", "Değerlendirme yok.", "No review yet.")}</div>}
          </div>
          {summary.compensation_visible && (
            <div className={cardClass}>
              <h3 className="font-black mb-3">{tr("پرداخت‌های اخیر", "أحدث التعويضات", "Son ödemeler", "Recent compensation")}</h3>
              {summary.recent_compensation.length === 0 ? <div className="text-sm text-[var(--erp-muted)]">—</div> : summary.recent_compensation.map((c) => (
                <div key={c.id} className="flex justify-between text-sm py-1"><span>{c.entry_type}</span><span className="font-bold">{n(c.amount)}</span></div>
              ))}
            </div>
          )}
          <div className={cardClass}>
            <h3 className="font-black mb-3">{tr("مدارک نزدیک به انقضا", "مستندات قاربت الانتهاء", "Süresi yaklaşan belgeler", "Upcoming document expiry")}</h3>
            {summary.upcoming_document_expiry.length === 0 ? <div className="text-sm text-[var(--erp-muted)]">—</div> : summary.upcoming_document_expiry.map((d) => (
              <div key={d.id} className="flex justify-between text-sm py-1"><span>{d.title}</span><span className="font-bold">{date(d.expiry_date)}</span></div>
            ))}
          </div>
        </div>
      )}

      {tab === "history" && <HistoryTab employeeId={id} tr={tr} n={n} date={date} />}
      {tab === "compensation" && summary?.compensation_visible && <CompensationTab employeeId={id} tr={tr} n={n} date={date} />}
      {tab === "compensation" && !summary?.compensation_visible && <div className={cardClass}>{tr("دسترسی ندارید.", "لا تملك صلاحية الوصول.", "Erişiminiz yok.", "You do not have access.")}</div>}
      {tab === "leave" && <LeaveTab employeeId={id} tr={tr} n={n} date={date} onChange={load} />}
      {tab === "attendance" && <AttendanceTab employeeId={id} tr={tr} n={n} date={date} />}
      {tab === "documents" && <DocumentsTab employeeId={id} tr={tr} n={n} date={date} onChange={load} />}
      {tab === "performance" && <PerformanceTab employeeId={id} tr={tr} n={n} />}
    </div>
  );
}

function HistoryTab({ employeeId, tr, n, date }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => {
      getEmployeeHistory(employeeId).then((d) => setItems(d.items || [])).catch((err) => toast.error(err.message)).finally(() => setLoading(false));
    }, 0);
    return () => clearTimeout(timer);
  }, [employeeId]);
  return (
    <div className={cardClass}>
      {loading ? <p className="text-[var(--erp-muted)]">{tr("در حال بارگذاری...", "جارٍ التحميل...", "Yükleniyor...", "Loading...")}</p> : (
        <Table>
          <Thead><Th>#</Th><Th>{tr("رویداد", "الحدث", "Olay", "Event")}</Th><Th>{tr("از", "من", "Eski", "Old")}</Th><Th>{tr("به", "إلى", "Yeni", "New")}</Th><Th>{tr("تاریخ", "التاريخ", "Tarih", "Date")}</Th></Thead>
          <Tbody>
            {items.length === 0 ? <EmptyRow colSpan={5}>{tr("تاریخچه‌ای نیست.", "لا يوجد سجل.", "Geçmiş yok.", "No history yet.")}</EmptyRow> : items.map((h, i) => (
              <Tr key={h.id}><Td className="text-[var(--erp-muted)] font-bold">{n(i + 1)}</Td><Td>{h.event_type}</Td><Td>{h.old_value || "—"}</Td><Td>{h.new_value || "—"}</Td><Td>{h.effective_date ? date(h.effective_date) : "—"}</Td></Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}

function CompensationTab({ employeeId, tr, n, date }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ entry_type: "base_salary", amount: "", effective_date: "", note: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try { setItems((await getEmployeeCompensation(employeeId)).items || []); } catch (err) { toast.error(err.message); } finally { setLoading(false); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => { void load(); }, 0); return () => clearTimeout(t); }, [employeeId]);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await createEmployeeCompensation(employeeId, { ...draft, amount: Number(draft.amount) });
      setDraft({ entry_type: "base_salary", amount: "", effective_date: "", note: "" });
      await load();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  return (
    <div className={cardClass + " space-y-4"}>
      <p className="text-xs text-[var(--erp-muted)]">{tr("این یک دفتر پرداخت پرسنلی است، نه سیستم حقوق و دستمزد قانونی کامل.", "هذا سجل تعويضات للموظفين، وليس نظام رواتب قانونيًا كاملاً.", "Bu bir personel ücret defteridir, tam yasal bordro sistemi değildir.", "This is a personnel compensation ledger, not a full statutory payroll system.")}</p>
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <select className={inputClass + " w-40"} value={draft.entry_type} onChange={(e) => setDraft({ ...draft, entry_type: e.target.value })}>
          {["base_salary", "allowance", "bonus", "commission", "deduction", "advance", "reimbursement", "payment"].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input type="number" step="any" className={inputClass + " w-40"} placeholder={tr("مبلغ", "المبلغ", "Tutar", "Amount")} value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
        <input type="date" className={inputClass + " w-40"} value={draft.effective_date} onChange={(e) => setDraft({ ...draft, effective_date: e.target.value })} />
        <input className={inputClass + " flex-1 min-w-[160px]"} placeholder={tr("یادداشت", "ملاحظة", "Not", "Note")} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
        <button type="submit" disabled={saving} className={btnClass}><Plus size={16} /></button>
      </form>
      {loading ? <p className="text-[var(--erp-muted)]">{tr("در حال بارگذاری...", "جارٍ التحميل...", "Yükleniyor...", "Loading...")}</p> : (
        <Table>
          <Thead><Th>#</Th><Th>{tr("نوع", "النوع", "Tür", "Type")}</Th><Th>{tr("مبلغ", "المبلغ", "Tutar", "Amount")}</Th><Th>{tr("تاریخ", "التاريخ", "Tarih", "Date")}</Th><Th>{tr("یادداشت", "ملاحظة", "Not", "Note")}</Th></Thead>
          <Tbody>
            {items.length === 0 ? <EmptyRow colSpan={5}>{tr("موردی ثبت نشده.", "لا توجد سجلات.", "Kayıt yok.", "No entries yet.")}</EmptyRow> : items.map((c, i) => (
              <Tr key={c.id}><Td className="text-[var(--erp-muted)] font-bold">{n(i + 1)}</Td><Td>{c.entry_type}</Td><Td className="font-bold">{n(c.amount)}</Td><Td>{date(c.effective_date)}</Td><Td>{c.note || "—"}</Td></Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}

function LeaveTab({ employeeId, tr, n, date, onChange }) {
  const [balances, setBalances] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [entitlementDraft, setEntitlementDraft] = useState({ leave_type: "annual", entitlement: "" });
  const [requestDraft, setRequestDraft] = useState({ leave_type: "annual", start_date: "", end_date: "", reason: "" });

  async function load() {
    setLoading(true);
    try {
      const [b, r] = await Promise.all([getEmployeeLeaveBalances(employeeId), getEmployeeLeaveRequests(employeeId)]);
      setBalances(b.items || []);
      setRequests(r.items || []);
    } catch (err) { toast.error(err.message); } finally { setLoading(false); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => { void load(); }, 0); return () => clearTimeout(t); }, [employeeId]);

  async function saveEntitlement(event) {
    event.preventDefault();
    try {
      await setEmployeeLeaveBalance(employeeId, { ...entitlementDraft, entitlement: Number(entitlementDraft.entitlement) });
      await load();
    } catch (err) { toast.error(err.message); }
  }

  async function submitRequest(event) {
    event.preventDefault();
    try {
      await createEmployeeLeaveRequest(employeeId, requestDraft);
      toast.success(tr("درخواست ثبت شد.", "تم إرسال الطلب.", "İstek gönderildi.", "Request submitted."));
      setRequestDraft({ leave_type: "annual", start_date: "", end_date: "", reason: "" });
      await load();
      onChange?.();
    } catch (err) { toast.error(err.message); }
  }

  async function cancel(id) {
    try { await cancelEmployeeLeaveRequest(id); await load(); onChange?.(); } catch (err) { toast.error(err.message); }
  }

  return (
    <div className="space-y-4">
      <div className={cardClass}>
        <h3 className="font-black mb-3">{tr("موجودی مرخصی", "رصيد الإجازات", "İzin bakiyesi", "Leave balances")}</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          {balances.map((b) => (
            <div key={b.leave_type} className="text-sm"><span className="text-[var(--erp-muted)]">{b.leave_type}: </span><span className="font-bold">{n(b.remaining)}/{n(b.entitlement)}</span></div>
          ))}
        </div>
        <form onSubmit={saveEntitlement} className="flex flex-wrap gap-2">
          <select className={inputClass + " w-40"} value={entitlementDraft.leave_type} onChange={(e) => setEntitlementDraft({ ...entitlementDraft, leave_type: e.target.value })}>
            {["annual", "sick", "unpaid", "other"].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="number" className={inputClass + " w-32"} placeholder={tr("سهمیه", "الاستحقاق", "Hak ediş", "Entitlement")} value={entitlementDraft.entitlement} onChange={(e) => setEntitlementDraft({ ...entitlementDraft, entitlement: e.target.value })} />
          <button type="submit" className={ghostBtnClass}>{tr("تنظیم سهمیه", "تعيين الاستحقاق", "Hak edişi ayarla", "Set entitlement")}</button>
        </form>
      </div>
      <div className={cardClass}>
        <h3 className="font-black mb-3">{tr("درخواست مرخصی جدید", "طلب إجازة جديد", "Yeni izin isteği", "New leave request")}</h3>
        <form onSubmit={submitRequest} className="flex flex-wrap gap-2">
          <select className={inputClass + " w-32"} value={requestDraft.leave_type} onChange={(e) => setRequestDraft({ ...requestDraft, leave_type: e.target.value })}>
            {["annual", "sick", "unpaid", "other"].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input type="date" className={inputClass + " w-40"} value={requestDraft.start_date} onChange={(e) => setRequestDraft({ ...requestDraft, start_date: e.target.value })} />
          <input type="date" className={inputClass + " w-40"} value={requestDraft.end_date} onChange={(e) => setRequestDraft({ ...requestDraft, end_date: e.target.value })} />
          <input className={inputClass + " flex-1 min-w-[160px]"} placeholder={tr("دلیل", "السبب", "Neden", "Reason")} value={requestDraft.reason} onChange={(e) => setRequestDraft({ ...requestDraft, reason: e.target.value })} />
          <button type="submit" className={btnClass}>{tr("ارسال", "إرسال", "Gönder", "Submit")}</button>
        </form>
      </div>
      <div className={cardClass}>
        {loading ? <p className="text-[var(--erp-muted)]">{tr("در حال بارگذاری...", "جارٍ التحميل...", "Yükleniyor...", "Loading...")}</p> : (
          <Table>
            <Thead><Th>#</Th><Th>{tr("نوع", "النوع", "Tür", "Type")}</Th><Th>{tr("بازه", "الفترة", "Aralık", "Range")}</Th><Th>{tr("روز", "أيام", "Gün", "Days")}</Th><Th>{tr("وضعیت", "الحالة", "Durum", "Status")}</Th><Th align="end">{tr("عملیات", "إجراء", "İşlem", "Action")}</Th></Thead>
            <Tbody>
              {requests.length === 0 ? <EmptyRow colSpan={6}>{tr("درخواستی نیست.", "لا توجد طلبات.", "İstek yok.", "No requests yet.")}</EmptyRow> : requests.map((r, i) => (
                <Tr key={r.id}>
                  <Td className="text-[var(--erp-muted)] font-bold">{n(i + 1)}</Td><Td>{r.leave_type}</Td>
                  <Td>{date(r.start_date)} – {date(r.end_date)}</Td><Td>{n(r.days)}</Td><Td>{r.status}</Td>
                  <Td align="end">{r.status === "pending" && <button onClick={() => cancel(r.id)} className={ghostBtnClass}>{tr("لغو", "إلغاء", "İptal", "Cancel")}</button>}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </div>
    </div>
  );
}

function AttendanceTab({ employeeId, tr, n, date }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ work_date: "", status: "present", hours: "" });

  async function load() {
    setLoading(true);
    try { setItems((await getEmployeeAttendance(employeeId)).items || []); } catch (err) { toast.error(err.message); } finally { setLoading(false); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => { void load(); }, 0); return () => clearTimeout(t); }, [employeeId]);

  async function submit(event) {
    event.preventDefault();
    try {
      await recordEmployeeAttendance(employeeId, { ...draft, hours: draft.hours ? Number(draft.hours) : null });
      await load();
    } catch (err) { toast.error(err.message); }
  }

  return (
    <div className={cardClass + " space-y-4"}>
      <p className="text-xs text-[var(--erp-muted)]">{tr("ثبت دستی است؛ اتصال به دستگاه حضور و غیاب پیاده‌سازی نشده.", "إدخال يدوي فقط؛ لا يوجد تكامل مع جهاز حضور.", "Yalnızca manuel giriş; bir zaman damgası cihazıyla entegrasyon yoktur.", "Manual entry only — no time-clock device integration exists.")}</p>
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <input type="date" className={inputClass + " w-40"} value={draft.work_date} onChange={(e) => setDraft({ ...draft, work_date: e.target.value })} />
        <select className={inputClass + " w-32"} value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
          {["present", "absent", "late", "overtime", "half_day"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="number" step="any" className={inputClass + " w-28"} placeholder={tr("ساعت", "ساعات", "Saat", "Hours")} value={draft.hours} onChange={(e) => setDraft({ ...draft, hours: e.target.value })} />
        <button type="submit" className={btnClass}><Plus size={16} /></button>
      </form>
      {loading ? <p className="text-[var(--erp-muted)]">{tr("در حال بارگذاری...", "جارٍ التحميل...", "Yükleniyor...", "Loading...")}</p> : (
        <Table>
          <Thead><Th>#</Th><Th>{tr("تاریخ", "التاريخ", "Tarih", "Date")}</Th><Th>{tr("وضعیت", "الحالة", "Durum", "Status")}</Th><Th>{tr("ساعت", "ساعات", "Saat", "Hours")}</Th></Thead>
          <Tbody>
            {items.length === 0 ? <EmptyRow colSpan={4}>{tr("موردی ثبت نشده.", "لا توجد سجلات.", "Kayıt yok.", "No entries yet.")}</EmptyRow> : items.map((a, i) => (
              <Tr key={a.id}><Td className="text-[var(--erp-muted)] font-bold">{n(i + 1)}</Td><Td>{date(a.work_date)}</Td><Td>{a.status}</Td><Td>{a.hours != null ? n(a.hours) : "—"}</Td></Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}

function DocumentsTab({ employeeId, tr, n, date, onChange }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [documentType, setDocumentType] = useState("id_document");
  const [title, setTitle] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [uploading, setUploading] = useState(false);

  async function load() {
    setLoading(true);
    try { setItems((await getEmployeeDocuments(employeeId)).items || []); } catch (err) { toast.error(err.message); } finally { setLoading(false); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => { void load(); }, 0); return () => clearTimeout(t); }, [employeeId]);

  async function upload(event) {
    event.preventDefault();
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("document_type", documentType);
      formData.append("title", title);
      formData.append("expiry_date", expiryDate);
      await uploadEmployeeDocument(employeeId, formData);
      setFile(null); setTitle(""); setExpiryDate("");
      await load();
      onChange?.();
    } catch (err) { toast.error(err.message); } finally { setUploading(false); }
  }

  async function download(doc) {
    try {
      const response = await fetchAuthenticatedResource(`/api/hr/${employeeId}/documents/${doc.id}/download`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = doc.file_name || "document";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) { toast.error(err.message); }
  }

  async function remove(docId) {
    try { await deleteEmployeeDocument(employeeId, docId); await load(); onChange?.(); } catch (err) { toast.error(err.message); }
  }

  return (
    <div className={cardClass + " space-y-4"}>
      <form onSubmit={upload} className="flex flex-wrap gap-2 items-center">
        <select className={inputClass + " w-40"} value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
          {["id_document", "contract", "certificate", "diploma", "training_certificate", "cv", "license", "other"].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input className={inputClass + " flex-1 min-w-[160px]"} placeholder={tr("عنوان", "العنوان", "Başlık", "Title")} value={title} onChange={(e) => setTitle(e.target.value)} />
        <input type="date" className={inputClass + " w-40"} value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
        <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="text-sm" />
        <button type="submit" disabled={uploading || !file} className={btnClass}>{tr("بارگذاری", "رفع", "Yükle", "Upload")}</button>
      </form>
      {loading ? <p className="text-[var(--erp-muted)]">{tr("در حال بارگذاری...", "جارٍ التحميل...", "Yükleniyor...", "Loading...")}</p> : (
        <Table>
          <Thead><Th>#</Th><Th>{tr("نوع", "النوع", "Tür", "Type")}</Th><Th>{tr("عنوان", "العنوان", "Başlık", "Title")}</Th><Th>{tr("انقضا", "الانتهاء", "Son geçerlilik", "Expiry")}</Th><Th align="end">{tr("عملیات", "إجراء", "İşlem", "Action")}</Th></Thead>
          <Tbody>
            {items.length === 0 ? <EmptyRow colSpan={5}>{tr("مدرکی نیست.", "لا توجد مستندات.", "Belge yok.", "No documents yet.")}</EmptyRow> : items.map((d, i) => (
              <Tr key={d.id}>
                <Td className="text-[var(--erp-muted)] font-bold">{n(i + 1)}</Td><Td>{d.document_type}</Td><Td className="font-bold">{d.title}</Td><Td>{d.expiry_date ? date(d.expiry_date) : "—"}</Td>
                <Td align="end" className="flex gap-2 justify-end">
                  <button onClick={() => download(d)} className="text-[var(--erp-accent)]"><Download size={16} /></button>
                  <button onClick={() => remove(d.id)} className="text-red-300 text-xs">{tr("حذف", "حذف", "Sil", "Delete")}</button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}

function PerformanceTab({ employeeId, tr, n }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ review_period: "", kpi: "", target: "", actual: "", rating: "", comments: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try { setItems((await getEmployeePerformanceReviews(employeeId)).items || []); } catch (err) { toast.error(err.message); } finally { setLoading(false); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => { void load(); }, 0); return () => clearTimeout(t); }, [employeeId]);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await createEmployeePerformanceReview(employeeId, { ...draft, rating: draft.rating ? Number(draft.rating) : null });
      setDraft({ review_period: "", kpi: "", target: "", actual: "", rating: "", comments: "" });
      await load();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  return (
    <div className={cardClass + " space-y-4"}>
      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input className={inputClass} placeholder={tr("دوره ارزیابی", "فترة التقييم", "Değerlendirme dönemi", "Review period")} value={draft.review_period} onChange={(e) => setDraft({ ...draft, review_period: e.target.value })} />
        <input className={inputClass} placeholder="KPI" value={draft.kpi} onChange={(e) => setDraft({ ...draft, kpi: e.target.value })} />
        <input className={inputClass} placeholder={tr("هدف", "الهدف", "Hedef", "Target")} value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} />
        <input className={inputClass} placeholder={tr("واقعی", "الفعلي", "Gerçekleşen", "Actual")} value={draft.actual} onChange={(e) => setDraft({ ...draft, actual: e.target.value })} />
        <input type="number" min="1" max="5" className={inputClass} placeholder={tr("امتیاز (۱-۵)", "التقييم (١-٥)", "Puan (1-5)", "Rating (1-5)")} value={draft.rating} onChange={(e) => setDraft({ ...draft, rating: e.target.value })} />
        <input className={inputClass} placeholder={tr("نظرات", "ملاحظات", "Yorumlar", "Comments")} value={draft.comments} onChange={(e) => setDraft({ ...draft, comments: e.target.value })} />
        <button type="submit" disabled={saving} className={btnClass + " md:col-span-3"}>{tr("ثبت ارزیابی", "حفظ التقييم", "Değerlendirmeyi kaydet", "Save review")}</button>
      </form>
      {loading ? <p className="text-[var(--erp-muted)]">{tr("در حال بارگذاری...", "جارٍ التحميل...", "Yükleniyor...", "Loading...")}</p> : (
        <Table>
          <Thead><Th>#</Th><Th>{tr("دوره", "الفترة", "Dönem", "Period")}</Th><Th>KPI</Th><Th>{tr("هدف/واقعی", "الهدف/الفعلي", "Hedef/Gerçekleşen", "Target/Actual")}</Th><Th>{tr("امتیاز", "التقييم", "Puan", "Rating")}</Th></Thead>
          <Tbody>
            {items.length === 0 ? <EmptyRow colSpan={5}>{tr("ارزیابی‌ای نیست.", "لا توجد تقييمات.", "Değerlendirme yok.", "No reviews yet.")}</EmptyRow> : items.map((r, i) => (
              <Tr key={r.id}><Td className="text-[var(--erp-muted)] font-bold">{n(i + 1)}</Td><Td>{r.review_period}</Td><Td>{r.kpi}</Td><Td>{r.target} / {r.actual}</Td><Td>{r.rating ? `${n(r.rating)}/5` : "—"}</Td></Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
