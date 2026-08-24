import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Plus, Upload, User } from "lucide-react";
import toast from "react-hot-toast";

import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits, toEnglishDigits } from "../localization/helpers";
import {
  getEmployee, getEmployeeSummary, getEmployeeHistory, getEmployeeCompensation, createEmployeeCompensation,
  getEmployeeLeaveBalances, setEmployeeLeaveBalance, getEmployeeLeaveRequests, createEmployeeLeaveRequest, cancelEmployeeLeaveRequest,
  getEmployeeAttendance, recordEmployeeAttendance, getEmployeeDocuments, uploadEmployeeDocument, deleteEmployeeDocument,
  getEmployeePerformanceReviews, createEmployeePerformanceReview, fetchAuthenticatedResource, updateEmployee,
} from "../services/api";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "../components/ui/Table";
import JalaliDateField from "../components/forms/JalaliDateField";
import Select from "../components/ui/Select";
import AvatarUploadButton from "../components/AvatarUploadButton";

const cardClass = "rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-panel)] p-5";
const inputClass = "w-full p-3 rounded-xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] outline-none focus:ring-2 focus:ring-cyan-400";
const btnClass = "rounded-xl bg-[var(--erp-accent)] text-black font-black px-4 py-2 disabled:opacity-60";
const ghostBtnClass = "rounded-xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] px-3 py-2 text-sm font-bold";

const TABS = ["overview", "history", "compensation", "leave", "attendance", "documents", "performance"];

// Mirrors backend/app/hr.py's own enum sets exactly (HISTORY_EVENT_TYPES,
// COMPENSATION_TYPES, LEAVE_TYPES, LEAVE_STATUSES, ATTENDANCE_STATUSES,
// DOCUMENT_TYPES) - every Select on this page fed one of these lists as
// raw option values with no label, so both the dropdown and every table
// cell rendering the saved value showed the untranslated English code
// regardless of app language. `enumLabel` falls back to the raw code for
// any value not in a map (never silently hides real, if unexpected, data).
const EVENT_TYPE_LABELS = {
  hired: { fa: "استخدام", ar: "التعيين", tr: "İşe alım", en: "Hired" },
  position_change: { fa: "تغییر سمت", ar: "تغيير المنصب", tr: "Pozisyon değişikliği", en: "Position change" },
  branch_transfer: { fa: "انتقال شعبه", ar: "نقل الفرع", tr: "Şube transferi", en: "Branch transfer" },
  department_transfer: { fa: "انتقال بخش", ar: "نقل القسم", tr: "Departman transferi", en: "Department transfer" },
  status_change: { fa: "تغییر وضعیت", ar: "تغيير الحالة", tr: "Durum değişikliği", en: "Status change" },
  contract_change: { fa: "تغییر قرارداد", ar: "تغيير العقد", tr: "Sözleşme değişikliği", en: "Contract change" },
  compensation_change: { fa: "تغییر پرداخت", ar: "تغيير التعويض", tr: "Ücret değişikliği", en: "Compensation change" },
  profile_change: { fa: "تغییر پروفایل", ar: "تغيير الملف الشخصي", tr: "Profil değişikliği", en: "Profile change" },
};
const COMPENSATION_TYPE_LABELS = {
  base_salary: { fa: "حقوق پایه", ar: "الراتب الأساسي", tr: "Temel maaş", en: "Base salary" },
  allowance: { fa: "مزایا", ar: "البدل", tr: "Ödenek", en: "Allowance" },
  bonus: { fa: "پاداش", ar: "المكافأة", tr: "İkramiye", en: "Bonus" },
  commission: { fa: "کمیسیون", ar: "العمولة", tr: "Komisyon", en: "Commission" },
  deduction: { fa: "کسورات", ar: "الخصم", tr: "Kesinti", en: "Deduction" },
  advance: { fa: "پیش‌پرداخت", ar: "السلفة", tr: "Avans", en: "Advance" },
  reimbursement: { fa: "بازپرداخت هزینه", ar: "استرداد المصاريف", tr: "Masraf iadesi", en: "Reimbursement" },
  payment: { fa: "پرداخت", ar: "الدفعة", tr: "Ödeme", en: "Payment" },
};
const LEAVE_TYPE_LABELS = {
  annual: { fa: "سالانه", ar: "سنوية", tr: "Yıllık", en: "Annual" },
  sick: { fa: "استعلاجی", ar: "مرضية", tr: "Hastalık", en: "Sick" },
  unpaid: { fa: "بدون حقوق", ar: "بدون أجر", tr: "Ücretsiz", en: "Unpaid" },
  other: { fa: "سایر", ar: "أخرى", tr: "Diğer", en: "Other" },
};
const LEAVE_STATUS_LABELS = {
  pending: { fa: "در انتظار", ar: "قيد الانتظار", tr: "Beklemede", en: "Pending" },
  approved: { fa: "تأیید شده", ar: "موافق عليها", tr: "Onaylandı", en: "Approved" },
  rejected: { fa: "رد شده", ar: "مرفوضة", tr: "Reddedildi", en: "Rejected" },
  cancelled: { fa: "لغو شده", ar: "ملغاة", tr: "İptal edildi", en: "Cancelled" },
};
const ATTENDANCE_STATUS_LABELS = {
  present: { fa: "حاضر", ar: "حاضر", tr: "Mevcut", en: "Present" },
  absent: { fa: "غایب", ar: "غائب", tr: "Devamsız", en: "Absent" },
  late: { fa: "تأخیر", ar: "متأخر", tr: "Geç", en: "Late" },
  overtime: { fa: "اضافه‌کاری", ar: "عمل إضافي", tr: "Fazla mesai", en: "Overtime" },
  half_day: { fa: "نیم‌روز", ar: "نصف يوم", tr: "Yarım gün", en: "Half day" },
};
const DOCUMENT_TYPE_LABELS = {
  id_document: { fa: "مدرک شناسایی", ar: "وثيقة الهوية", tr: "Kimlik belgesi", en: "ID document" },
  contract: { fa: "قرارداد", ar: "العقد", tr: "Sözleşme", en: "Contract" },
  certificate: { fa: "گواهی", ar: "الشهادة", tr: "Sertifika", en: "Certificate" },
  diploma: { fa: "مدرک تحصیلی", ar: "الشهادة الدراسية", tr: "Diploma", en: "Diploma" },
  training_certificate: { fa: "گواهی دوره آموزشی", ar: "شهادة تدريبية", tr: "Eğitim sertifikası", en: "Training certificate" },
  cv: { fa: "رزومه", ar: "السيرة الذاتية", tr: "Özgeçmiş", en: "CV" },
  license: { fa: "مجوز", ar: "الترخيص", tr: "Lisans", en: "License" },
  other: { fa: "سایر", ar: "أخرى", tr: "Diğer", en: "Other" },
};

function enumLabel(map, value, language) {
  return map[value]?.[language] || map[value]?.en || value;
}

function enumOptions(map, language) {
  return Object.keys(map).map((value) => ({ value, label: enumLabel(map, value, language) }));
}

// old_value/new_value (history), review_period/kpi/target/actual
// (performance) are free-text/mixed content (sometimes a plain number like
// a branch id, sometimes a name/title) - never run through n() (which
// coerces to Number() and would corrupt non-numeric text), only through
// toPersianDigits(), which just Persianizes any digit characters found
// inside an otherwise-untouched string. Matches the same pattern already
// used for phone numbers/employee codes elsewhere in the app.
function faText(value, fa) {
  if (value === null || value === undefined || value === "") return value;
  return fa ? toPersianDigits(value) : value;
}

export default function EmployeeProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { dir, language, n, date } = useLanguage();
  const tr = (fa, ar, trText, en) => (language === "fa" ? fa : language === "ar" ? ar : language === "tr" ? trText : en);
  const fa = language === "fa";

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

  async function handlePhotoChange(dataUrl) {
    try {
      await updateEmployee(id, { photo_data: dataUrl });
      setEmployee((current) => ({ ...current, photo_data: dataUrl }));
    } catch (err) {
      toast.error(err.message);
    }
  }

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
          <AvatarUploadButton
            name={employee.display_name || `${employee.first_name} ${employee.last_name}`}
            avatarData={employee.photo_data}
            size={48}
            onChange={handlePhotoChange}
            tr={tr}
          />
          <h1 className="text-2xl font-black flex items-center gap-2">
            <User className="text-[var(--erp-accent)]" />
            {employee.display_name || `${employee.first_name} ${employee.last_name}`}
          </h1>
        </div>
        <div className="text-sm text-[var(--erp-muted)]">{faText(employee.job_title, fa)} {employee.department ? `· ${faText(employee.department, fa)}` : ""}</div>
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
              <div key={b.leave_type} className="flex justify-between text-sm py-1"><span>{enumLabel(LEAVE_TYPE_LABELS, b.leave_type, language)}</span><span className="font-bold">{n(b.remaining)} / {n(b.entitlement)}</span></div>
            ))}
            <div className="text-xs text-[var(--erp-muted)] mt-2">{tr("درخواست‌های در انتظار", "طلبات معلقة", "Bekleyen istekler", "Pending requests")}: {n(summary.pending_leave_requests)}</div>
          </div>
          <div className={cardClass}>
            <h3 className="font-black mb-3">{tr("آخرین ارزیابی عملکرد", "آخر تقييم أداء", "Son performans değerlendirmesi", "Latest performance review")}</h3>
            {summary.latest_performance_review ? (
              <div className="text-sm space-y-1">
                <div>{faText(summary.latest_performance_review.review_period, fa)}</div>
                <div>{tr("امتیاز", "التقييم", "Puan", "Rating")}: {n(summary.latest_performance_review.rating)}/{n(5)}</div>
              </div>
            ) : <div className="text-sm text-[var(--erp-muted)]">{tr("ارزیابی ثبت نشده.", "لا يوجد تقييم.", "Değerlendirme yok.", "No review yet.")}</div>}
          </div>
          {summary.compensation_visible && (
            <div className={cardClass}>
              <h3 className="font-black mb-3">{tr("پرداخت‌های اخیر", "أحدث التعويضات", "Son ödemeler", "Recent compensation")}</h3>
              {summary.recent_compensation.length === 0 ? <div className="text-sm text-[var(--erp-muted)]">—</div> : summary.recent_compensation.map((c) => (
                <div key={c.id} className="flex justify-between text-sm py-1"><span>{enumLabel(COMPENSATION_TYPE_LABELS, c.entry_type, language)}</span><span className="font-bold">{n(c.amount)}</span></div>
              ))}
            </div>
          )}
          <div className={cardClass}>
            <h3 className="font-black mb-3">{tr("مدارک نزدیک به انقضا", "مستندات قاربت الانتهاء", "Süresi yaklaşan belgeler", "Upcoming document expiry")}</h3>
            {summary.upcoming_document_expiry.length === 0 ? <div className="text-sm text-[var(--erp-muted)]">—</div> : summary.upcoming_document_expiry.map((d) => (
              <div key={d.id} className="flex justify-between text-sm py-1"><span>{faText(d.title, fa)}</span><span className="font-bold">{date(d.expiry_date)}</span></div>
            ))}
          </div>
        </div>
      )}

      {tab === "history" && <HistoryTab employeeId={id} tr={tr} n={n} date={date} language={language} fa={fa} />}
      {tab === "compensation" && summary?.compensation_visible && <CompensationTab employeeId={id} tr={tr} n={n} date={date} language={language} fa={fa} />}
      {tab === "compensation" && !summary?.compensation_visible && <div className={cardClass}>{tr("دسترسی ندارید.", "لا تملك صلاحية الوصول.", "Erişiminiz yok.", "You do not have access.")}</div>}
      {tab === "leave" && <LeaveTab employeeId={id} tr={tr} n={n} date={date} language={language} fa={fa} onChange={load} />}
      {tab === "attendance" && <AttendanceTab employeeId={id} tr={tr} n={n} date={date} language={language} fa={fa} />}
      {tab === "documents" && <DocumentsTab employeeId={id} tr={tr} n={n} date={date} language={language} fa={fa} onChange={load} />}
      {tab === "performance" && <PerformanceTab employeeId={id} tr={tr} n={n} fa={fa} />}
    </div>
  );
}

function HistoryTab({ employeeId, tr, n, date, language, fa }) {
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
              <Tr key={h.id}><Td className="text-[var(--erp-muted)] font-bold">{n(i + 1)}</Td><Td>{enumLabel(EVENT_TYPE_LABELS, h.event_type, language)}</Td><Td>{h.old_value ? faText(h.old_value, fa) : "—"}</Td><Td>{h.new_value ? faText(h.new_value, fa) : "—"}</Td><Td>{h.effective_date ? date(h.effective_date) : "—"}</Td></Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}

function CompensationTab({ employeeId, tr, n, date, language, fa }) {
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
        <Select
          className="w-40"
          value={draft.entry_type}
          onChange={(value) => setDraft({ ...draft, entry_type: value })}
          options={enumOptions(COMPENSATION_TYPE_LABELS, language)}
        />
        <input type="text" inputMode="decimal" className={inputClass + " w-40"} placeholder={tr("مبلغ", "المبلغ", "Tutar", "Amount")} value={faText(draft.amount, fa)} onChange={(e) => setDraft({ ...draft, amount: toEnglishDigits(e.target.value).replace(/[^0-9.]/g, "") })} />
        <JalaliDateField className={inputClass + " w-40"} value={draft.effective_date} onChange={(iso) => setDraft({ ...draft, effective_date: iso })} language={language} />
        <input className={inputClass + " flex-1 min-w-[160px]"} placeholder={tr("یادداشت", "ملاحظة", "Not", "Note")} value={faText(draft.note, fa)} onChange={(e) => setDraft({ ...draft, note: toEnglishDigits(e.target.value) })} />
        <button type="submit" disabled={saving} className={btnClass}><Plus size={16} /></button>
      </form>
      {loading ? <p className="text-[var(--erp-muted)]">{tr("در حال بارگذاری...", "جارٍ التحميل...", "Yükleniyor...", "Loading...")}</p> : (
        <Table>
          <Thead><Th>#</Th><Th>{tr("نوع", "النوع", "Tür", "Type")}</Th><Th>{tr("مبلغ", "المبلغ", "Tutar", "Amount")}</Th><Th>{tr("تاریخ", "التاريخ", "Tarih", "Date")}</Th><Th>{tr("یادداشت", "ملاحظة", "Not", "Note")}</Th></Thead>
          <Tbody>
            {items.length === 0 ? <EmptyRow colSpan={5}>{tr("موردی ثبت نشده.", "لا توجد سجلات.", "Kayıt yok.", "No entries yet.")}</EmptyRow> : items.map((c, i) => (
              <Tr key={c.id}><Td className="text-[var(--erp-muted)] font-bold">{n(i + 1)}</Td><Td>{enumLabel(COMPENSATION_TYPE_LABELS, c.entry_type, language)}</Td><Td className="font-bold">{n(c.amount)}</Td><Td>{date(c.effective_date)}</Td><Td>{c.note ? faText(c.note, fa) : "—"}</Td></Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}

function LeaveTab({ employeeId, tr, n, date, language, fa, onChange }) {
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
            <div key={b.leave_type} className="text-sm"><span className="text-[var(--erp-muted)]">{enumLabel(LEAVE_TYPE_LABELS, b.leave_type, language)}: </span><span className="font-bold">{n(b.remaining)}/{n(b.entitlement)}</span></div>
          ))}
        </div>
        <form onSubmit={saveEntitlement} className="flex flex-wrap gap-2">
          <Select
            className="w-40"
            value={entitlementDraft.leave_type}
            onChange={(value) => setEntitlementDraft({ ...entitlementDraft, leave_type: value })}
            options={enumOptions(LEAVE_TYPE_LABELS, language)}
          />
          <input type="text" inputMode="decimal" className={inputClass + " w-32"} placeholder={tr("سهمیه", "الاستحقاق", "Hak ediş", "Entitlement")} value={faText(entitlementDraft.entitlement, fa)} onChange={(e) => setEntitlementDraft({ ...entitlementDraft, entitlement: toEnglishDigits(e.target.value).replace(/[^0-9.]/g, "") })} />
          <button type="submit" className={ghostBtnClass}>{tr("تنظیم سهمیه", "تعيين الاستحقاق", "Hak edişi ayarla", "Set entitlement")}</button>
        </form>
      </div>
      <div className={cardClass}>
        <h3 className="font-black mb-3">{tr("درخواست مرخصی جدید", "طلب إجازة جديد", "Yeni izin isteği", "New leave request")}</h3>
        <form onSubmit={submitRequest} className="flex flex-wrap gap-2">
          <Select
            className="w-32"
            value={requestDraft.leave_type}
            onChange={(value) => setRequestDraft({ ...requestDraft, leave_type: value })}
            options={enumOptions(LEAVE_TYPE_LABELS, language)}
          />
          <JalaliDateField className={inputClass + " w-40"} value={requestDraft.start_date} onChange={(iso) => setRequestDraft({ ...requestDraft, start_date: iso })} language={language} />
          <JalaliDateField className={inputClass + " w-40"} value={requestDraft.end_date} onChange={(iso) => setRequestDraft({ ...requestDraft, end_date: iso })} language={language} />
          <input className={inputClass + " flex-1 min-w-[160px]"} placeholder={tr("دلیل", "السبب", "Neden", "Reason")} value={faText(requestDraft.reason, fa)} onChange={(e) => setRequestDraft({ ...requestDraft, reason: toEnglishDigits(e.target.value) })} />
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
                  <Td className="text-[var(--erp-muted)] font-bold">{n(i + 1)}</Td><Td>{enumLabel(LEAVE_TYPE_LABELS, r.leave_type, language)}</Td>
                  <Td>{date(r.start_date)} – {date(r.end_date)}</Td><Td>{n(r.days)}</Td><Td>{enumLabel(LEAVE_STATUS_LABELS, r.status, language)}</Td>
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

function AttendanceTab({ employeeId, tr, n, date, language, fa }) {
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
        <JalaliDateField className={inputClass + " w-40"} value={draft.work_date} onChange={(iso) => setDraft({ ...draft, work_date: iso })} language={language} />
        <Select
          className="w-32"
          value={draft.status}
          onChange={(value) => setDraft({ ...draft, status: value })}
          options={enumOptions(ATTENDANCE_STATUS_LABELS, language)}
        />
        <input type="text" inputMode="decimal" className={inputClass + " w-28"} placeholder={tr("ساعت", "ساعات", "Saat", "Hours")} value={faText(draft.hours, fa)} onChange={(e) => setDraft({ ...draft, hours: toEnglishDigits(e.target.value).replace(/[^0-9.]/g, "") })} />
        <button type="submit" className={btnClass}><Plus size={16} /></button>
      </form>
      {loading ? <p className="text-[var(--erp-muted)]">{tr("در حال بارگذاری...", "جارٍ التحميل...", "Yükleniyor...", "Loading...")}</p> : (
        <Table>
          <Thead><Th>#</Th><Th>{tr("تاریخ", "التاريخ", "Tarih", "Date")}</Th><Th>{tr("وضعیت", "الحالة", "Durum", "Status")}</Th><Th>{tr("ساعت", "ساعات", "Saat", "Hours")}</Th></Thead>
          <Tbody>
            {items.length === 0 ? <EmptyRow colSpan={4}>{tr("موردی ثبت نشده.", "لا توجد سجلات.", "Kayıt yok.", "No entries yet.")}</EmptyRow> : items.map((a, i) => (
              <Tr key={a.id}><Td className="text-[var(--erp-muted)] font-bold">{n(i + 1)}</Td><Td>{date(a.work_date)}</Td><Td>{enumLabel(ATTENDANCE_STATUS_LABELS, a.status, language)}</Td><Td>{a.hours != null ? n(a.hours) : "—"}</Td></Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}

function DocumentsTab({ employeeId, tr, n, date, language, fa, onChange }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [file, setFile] = useState(null);
  const [documentType, setDocumentType] = useState("id_document");
  const [title, setTitle] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

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
      if (fileInputRef.current) fileInputRef.current.value = "";
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
        <Select
          className="w-40"
          value={documentType}
          onChange={(value) => setDocumentType(value)}
          options={enumOptions(DOCUMENT_TYPE_LABELS, language)}
        />
        <input className={inputClass + " flex-1 min-w-[160px]"} placeholder={tr("عنوان", "العنوان", "Başlık", "Title")} value={faText(title, fa)} onChange={(e) => setTitle(toEnglishDigits(e.target.value))} />
        <JalaliDateField className={inputClass + " w-40"} value={expiryDate} onChange={(iso) => setExpiryDate(iso)} language={language} />
        {/* Native <input type="file"> renders its own browser/OS-locale
            button text ("Choose File"/"No file chosen") that JS cannot
            translate - hidden and triggered from a normal translated
            button instead, the same pattern crm/components/CustomerFiles.jsx
            already uses for the same reason. */}
        <input ref={fileInputRef} type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
        <button type="button" onClick={() => fileInputRef.current?.click()} className={ghostBtnClass + " flex items-center gap-1.5"}>
          <Upload size={14} />
          {file ? file.name : tr("انتخاب فایل", "اختيار ملف", "Dosya seç", "Choose file")}
        </button>
        <button type="submit" disabled={uploading || !file} className={btnClass}>{tr("بارگذاری", "رفع", "Yükle", "Upload")}</button>
      </form>
      {loading ? <p className="text-[var(--erp-muted)]">{tr("در حال بارگذاری...", "جارٍ التحميل...", "Yükleniyor...", "Loading...")}</p> : (
        <Table>
          <Thead><Th>#</Th><Th>{tr("نوع", "النوع", "Tür", "Type")}</Th><Th>{tr("عنوان", "العنوان", "Başlık", "Title")}</Th><Th>{tr("انقضا", "الانتهاء", "Son geçerlilik", "Expiry")}</Th><Th align="end">{tr("عملیات", "إجراء", "İşlem", "Action")}</Th></Thead>
          <Tbody>
            {items.length === 0 ? <EmptyRow colSpan={5}>{tr("مدرکی نیست.", "لا توجد مستندات.", "Belge yok.", "No documents yet.")}</EmptyRow> : items.map((d, i) => (
              <Tr key={d.id}>
                <Td className="text-[var(--erp-muted)] font-bold">{n(i + 1)}</Td><Td>{enumLabel(DOCUMENT_TYPE_LABELS, d.document_type, language)}</Td><Td className="font-bold">{faText(d.title, fa)}</Td><Td>{d.expiry_date ? date(d.expiry_date) : "—"}</Td>
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

function PerformanceTab({ employeeId, tr, n, fa }) {
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
        <input className={inputClass} placeholder={tr("دوره ارزیابی", "فترة التقييم", "Değerlendirme dönemi", "Review period")} value={faText(draft.review_period, fa)} onChange={(e) => setDraft({ ...draft, review_period: toEnglishDigits(e.target.value) })} />
        <input className={inputClass} placeholder="KPI" value={faText(draft.kpi, fa)} onChange={(e) => setDraft({ ...draft, kpi: toEnglishDigits(e.target.value) })} />
        <input className={inputClass} placeholder={tr("هدف", "الهدف", "Hedef", "Target")} value={faText(draft.target, fa)} onChange={(e) => setDraft({ ...draft, target: toEnglishDigits(e.target.value) })} />
        <input className={inputClass} placeholder={tr("واقعی", "الفعلي", "Gerçekleşen", "Actual")} value={faText(draft.actual, fa)} onChange={(e) => setDraft({ ...draft, actual: toEnglishDigits(e.target.value) })} />
        <input type="text" inputMode="numeric" className={inputClass} placeholder={tr("امتیاز (۱-۵)", "التقييم (١-٥)", "Puan (1-5)", "Rating (1-5)")} value={faText(draft.rating, fa)} onChange={(e) => {
          const digits = toEnglishDigits(e.target.value).replace(/[^0-9]/g, "");
          setDraft({ ...draft, rating: digits === "" ? "" : String(Math.min(5, Math.max(1, Number(digits)))) });
        }} />
        <input className={inputClass} placeholder={tr("نظرات", "ملاحظات", "Yorumlar", "Comments")} value={faText(draft.comments, fa)} onChange={(e) => setDraft({ ...draft, comments: toEnglishDigits(e.target.value) })} />
        <button type="submit" disabled={saving} className={btnClass + " md:col-span-3"}>{tr("ثبت ارزیابی", "حفظ التقييم", "Değerlendirmeyi kaydet", "Save review")}</button>
      </form>
      {loading ? <p className="text-[var(--erp-muted)]">{tr("در حال بارگذاری...", "جارٍ التحميل...", "Yükleniyor...", "Loading...")}</p> : (
        <Table>
          <Thead><Th>#</Th><Th>{tr("دوره", "الفترة", "Dönem", "Period")}</Th><Th>KPI</Th><Th>{tr("هدف/واقعی", "الهدف/الفعلي", "Hedef/Gerçekleşen", "Target/Actual")}</Th><Th>{tr("امتیاز", "التقييم", "Puan", "Rating")}</Th></Thead>
          <Tbody>
            {items.length === 0 ? <EmptyRow colSpan={5}>{tr("ارزیابی‌ای نیست.", "لا توجد تقييمات.", "Değerlendirme yok.", "No reviews yet.")}</EmptyRow> : items.map((r, i) => (
              <Tr key={r.id}><Td className="text-[var(--erp-muted)] font-bold">{n(i + 1)}</Td><Td>{faText(r.review_period, fa)}</Td><Td>{faText(r.kpi, fa)}</Td><Td>{faText(r.target, fa)} / {faText(r.actual, fa)}</Td><Td>{r.rating ? `${n(r.rating)}/${n(5)}` : "—"}</Td></Tr>
            ))}
          </Tbody>
        </Table>
      )}
    </div>
  );
}
