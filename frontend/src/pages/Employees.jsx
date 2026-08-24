import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Plus } from "lucide-react";
import toast from "react-hot-toast";

import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits, toEnglishDigits } from "../localization/helpers";
import { getEmployees, createEmployee, getBranches } from "../services/api";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "../components/ui/Table";
import Modal from "../components/ui/Modal";
import UserAvatar from "../components/ui/UserAvatar";
import JalaliDateField from "../components/forms/JalaliDateField";
import Select from "../components/ui/Select";

const cardClass = "rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-panel)] p-5";
const inputClass = "w-full p-3 rounded-xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] outline-none focus:ring-2 focus:ring-cyan-400";
const btnClass = "rounded-xl bg-[var(--erp-accent)] text-black font-black px-4 py-2 disabled:opacity-60";

const STATUS_TONE = {
  active: "bg-emerald-500/15 text-emerald-200",
  on_leave: "bg-amber-500/15 text-amber-200",
  suspended: "bg-orange-500/15 text-orange-200",
  terminated: "bg-zinc-500/15 text-zinc-300",
};

const emptyDraft = {
  first_name: "", last_name: "", employee_number: "", job_title: "", department: "",
  employment_type: "full_time", branch_id: "", manager_employee_id: "", start_date: "",
  phone: "", mobile: "", email: "",
};

export default function Employees() {
  const { dir, language, n } = useLanguage();
  const tr = (fa, ar, trText, en) => (language === "fa" ? fa : language === "ar" ? ar : language === "tr" ? trText : en);
  const pd = (value) => (language === "fa" ? toPersianDigits(value) : value);
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  async function load() {
    setLoading(true);
    try {
      const [employeesData, branchesData] = await Promise.all([
        getEmployees({ search, status: statusFilter }),
        getBranches().catch(() => ({ items: [] })),
      ]);
      setItems(employeesData.items || []);
      setBranches(branchesData.items || (Array.isArray(branchesData) ? branchesData : []));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

  const statusLabel = (s) => ({
    active: tr("فعال", "نشط", "Aktif", "Active"),
    on_leave: tr("در مرخصی", "في إجازة", "İzinde", "On leave"),
    suspended: tr("تعلیق", "موقوف", "Askıya alındı", "Suspended"),
    terminated: tr("خاتمه‌یافته", "منتهي", "Sonlandırıldı", "Terminated"),
  }[s] || s);

  async function saveEmployee(draft) {
    await createEmployee({
      ...draft,
      branch_id: draft.branch_id ? Number(draft.branch_id) : null,
      manager_employee_id: draft.manager_employee_id ? Number(draft.manager_employee_id) : null,
    });
    toast.success(tr("کارمند ایجاد شد.", "تم إنشاء الموظف.", "Çalışan oluşturuldu.", "Employee created."));
    setModalOpen(false);
    await load();
  }

  return (
    <div dir={dir} className="p-4 md:p-6 space-y-6 text-[var(--erp-text)]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black flex items-center gap-2">
          <Users className="text-[var(--erp-accent)]" />
          {tr("پرسنل", "الموظفون", "Personel", "Personnel")}
        </h1>
        <button onClick={() => { setFormKey((k) => k + 1); setModalOpen(true); }} className={btnClass + " flex items-center gap-1"}>
          <Plus size={16} /> {tr("کارمند جدید", "موظف جديد", "Yeni çalışan", "New employee")}
        </button>
      </header>

      <section className={cardClass}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <input className={inputClass} placeholder={tr("جستجو (نام، کد پرسنلی)", "بحث (الاسم، الرقم الوظيفي)", "Ara (ad, personel no)", "Search (name, employee number)")} value={pd(search)} onChange={(e) => setSearch(toEnglishDigits(e.target.value))} />
          <Select
            value={statusFilter}
            onChange={(value) => setStatusFilter(value)}
            options={[
              { value: "", label: tr("همه وضعیت‌ها", "كل الحالات", "Tüm durumlar", "All statuses") },
              ...["active", "on_leave", "suspended", "terminated"].map((s) => ({ value: s, label: statusLabel(s) })),
            ]}
          />
        </div>

        {loading ? (
          <p className="text-[var(--erp-muted)]">{tr("در حال بارگذاری...", "جارٍ التحميل...", "Yükleniyor...", "Loading...")}</p>
        ) : (
          <Table>
            <Thead>
              <Th>#</Th>
              <Th>{tr("نام", "الاسم", "Ad", "Name")}</Th>
              <Th>{tr("سمت", "المنصب", "Görev", "Job title")}</Th>
              <Th>{tr("واحد", "القسم", "Departman", "Department")}</Th>
              <Th>{tr("شعبه", "الفرع", "Şube", "Branch")}</Th>
              <Th>{tr("وضعیت", "الحالة", "Durum", "Status")}</Th>
              <Th align="end">{tr("عملیات", "إجراء", "İşlem", "Action")}</Th>
            </Thead>
            <Tbody>
              {items.length === 0 ? (
                <EmptyRow colSpan={7}>{tr("کارمندی یافت نشد.", "لا يوجد موظفون.", "Çalışan bulunamadı.", "No employees found.")}</EmptyRow>
              ) : items.map((e, i) => (
                <Tr key={e.id} className="cursor-pointer" onClick={() => navigate(`/hr/employees/${e.id}`)}>
                  <Td className="text-[var(--erp-muted)] font-bold">{n(i + 1)}</Td>
                  <Td className="font-bold">
                    <span className="flex items-center gap-2">
                      <UserAvatar name={e.display_name || `${e.first_name} ${e.last_name}`} avatarData={e.photo_data} size={28} />
                      {pd(e.display_name || `${e.first_name} ${e.last_name}`)}
                    </span>
                  </Td>
                  <Td>{pd(e.job_title) || "—"}</Td>
                  <Td>{pd(e.department) || "—"}</Td>
                  <Td>{e.branch_name || "—"}</Td>
                  <Td><span className={`px-2 py-1 rounded-lg text-xs font-black ${STATUS_TONE[e.status] || ""}`}>{statusLabel(e.status)}</span></Td>
                  <Td align="end"><span className="text-sm font-bold text-[var(--erp-accent)]">{tr("مشاهده", "عرض", "Görüntüle", "View")}</span></Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </section>

      <EmployeeFormModal
        key={formKey}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        branches={branches}
        managerOptions={items}
        language={language}
        tr={tr}
        pd={pd}
        onSave={saveEmployee}
      />
    </div>
  );
}

// Local draft/saving state, not lifted to the parent - typing here
// previously re-rendered the whole Employees page on every keystroke
// (the employee table below, plus the "مدیر مستقیم" Select's options
// derived from the full employee list), which is what caused the modal
// to feel like it was freezing while typing. `key={formKey}` on the
// parent's usage forces a fresh mount (and thus a reset draft) each time
// the modal is opened, matching the BranchFormModal/PricingRuleModal
// pattern used elsewhere in this app.
function EmployeeFormModal({ open, onClose, branches, managerOptions, language, tr, pd, onSave }) {
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave(draft);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} maxWidthClassName="max-w-xl">
      <form onSubmit={submit} className="p-5 space-y-3">
        <h2 className="text-lg font-black">{tr("کارمند جدید", "موظف جديد", "Yeni çalışan", "New employee")}</h2>
        <div className="grid grid-cols-2 gap-3">
          <input required className={inputClass} placeholder={tr("نام", "الاسم الأول", "Ad", "First name")} value={draft.first_name} onChange={(e) => setDraft({ ...draft, first_name: toEnglishDigits(e.target.value) })} />
          <input required className={inputClass} placeholder={tr("نام خانوادگی", "اسم العائلة", "Soyad", "Last name")} value={draft.last_name} onChange={(e) => setDraft({ ...draft, last_name: toEnglishDigits(e.target.value) })} />
          <input className={inputClass} placeholder={tr("کد پرسنلی", "الرقم الوظيفي", "Personel no", "Employee number")} value={pd(draft.employee_number)} onChange={(e) => setDraft({ ...draft, employee_number: toEnglishDigits(e.target.value) })} />
          <input className={inputClass} placeholder={tr("سمت شغلی", "المسمى الوظيفي", "Görev", "Job title")} value={draft.job_title} onChange={(e) => setDraft({ ...draft, job_title: toEnglishDigits(e.target.value) })} />
          <input className={inputClass} placeholder={tr("واحد سازمانی", "القسم", "Departman", "Department")} value={draft.department} onChange={(e) => setDraft({ ...draft, department: toEnglishDigits(e.target.value) })} />
          <Select
            value={draft.employment_type}
            onChange={(value) => setDraft({ ...draft, employment_type: value })}
            options={["full_time", "part_time", "contract", "intern", "other"].map((t) => ({
              value: t,
              label: {
                full_time: tr("تمام‌وقت", "دوام كامل", "Tam zamanlı", "Full-time"),
                part_time: tr("پاره‌وقت", "دوام جزئي", "Yarı zamanlı", "Part-time"),
                contract: tr("قراردادی", "بعقد", "Sözleşmeli", "Contract"),
                intern: tr("کارآموز", "متدرب", "Stajyer", "Intern"),
                other: tr("سایر", "أخرى", "Diğer", "Other"),
              }[t],
            }))}
          />
          <Select
            value={draft.branch_id}
            onChange={(value) => setDraft({ ...draft, branch_id: value })}
            options={[
              { value: "", label: tr("شعبه", "الفرع", "Şube", "Branch") },
              ...branches.map((b) => ({ value: b.id, label: b.name })),
            ]}
          />
          <Select
            value={draft.manager_employee_id}
            onChange={(value) => setDraft({ ...draft, manager_employee_id: value })}
            options={[
              { value: "", label: tr("مدیر مستقیم", "المدير المباشر", "Yönetici", "Manager") },
              ...managerOptions.map((e2) => ({ value: e2.id, label: pd(e2.display_name || `${e2.first_name} ${e2.last_name}`) })),
            ]}
          />
          <JalaliDateField className={inputClass} value={draft.start_date} onChange={(iso) => setDraft({ ...draft, start_date: iso })} language={language} />
          <input className={inputClass} placeholder={tr("موبایل", "الجوال", "Cep telefonu", "Mobile")} value={pd(draft.mobile)} onChange={(e) => setDraft({ ...draft, mobile: toEnglishDigits(e.target.value) })} />
          <input className={inputClass} placeholder={tr("ایمیل", "البريد الإلكتروني", "E-posta", "Email")} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] text-sm font-bold">{tr("انصراف", "إلغاء", "İptal", "Cancel")}</button>
          <button type="submit" disabled={saving} className={btnClass}>{saving ? tr("در حال ذخیره...", "جارٍ الحفظ...", "Kaydediliyor...", "Saving...") : tr("ذخیره", "حفظ", "Kaydet", "Save")}</button>
        </div>
      </form>
    </Modal>
  );
}
