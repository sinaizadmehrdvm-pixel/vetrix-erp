import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Plus } from "lucide-react";
import toast from "react-hot-toast";

import { useLanguage } from "../localization/useLanguage";
import { getEmployees, createEmployee, getBranches } from "../services/api";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "../components/ui/Table";
import Modal from "../components/ui/Modal";

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
  const navigate = useNavigate();

  const [items, setItems] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);

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

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await createEmployee({
        ...draft,
        branch_id: draft.branch_id ? Number(draft.branch_id) : null,
        manager_employee_id: draft.manager_employee_id ? Number(draft.manager_employee_id) : null,
      });
      toast.success(tr("کارمند ایجاد شد.", "تم إنشاء الموظف.", "Çalışan oluşturuldu.", "Employee created."));
      setModalOpen(false);
      setDraft(emptyDraft);
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div dir={dir} className="p-4 md:p-6 space-y-6 text-[var(--erp-text)]">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black flex items-center gap-2">
          <Users className="text-[var(--erp-accent)]" />
          {tr("پرسنل", "الموظفون", "Personel", "Personnel")}
        </h1>
        <button onClick={() => setModalOpen(true)} className={btnClass + " flex items-center gap-1"}>
          <Plus size={16} /> {tr("کارمند جدید", "موظف جديد", "Yeni çalışan", "New employee")}
        </button>
      </header>

      <section className={cardClass}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <input className={inputClass} placeholder={tr("جستجو (نام، کد پرسنلی)", "بحث (الاسم، الرقم الوظيفي)", "Ara (ad, personel no)", "Search (name, employee number)")} value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className={inputClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">{tr("همه وضعیت‌ها", "كل الحالات", "Tüm durumlar", "All statuses")}</option>
            {["active", "on_leave", "suspended", "terminated"].map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
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
                  <Td className="font-bold">{e.display_name || `${e.first_name} ${e.last_name}`}</Td>
                  <Td>{e.job_title || "—"}</Td>
                  <Td>{e.department || "—"}</Td>
                  <Td>{e.branch_name || "—"}</Td>
                  <Td><span className={`px-2 py-1 rounded-lg text-xs font-black ${STATUS_TONE[e.status] || ""}`}>{statusLabel(e.status)}</span></Td>
                  <Td align="end"><span className="text-sm font-bold text-[var(--erp-accent)]">{tr("مشاهده", "عرض", "Görüntüle", "View")}</span></Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </section>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} maxWidthClassName="max-w-xl">
        <form onSubmit={submit} className="p-5 space-y-3">
          <h2 className="text-lg font-black">{tr("کارمند جدید", "موظف جديد", "Yeni çalışan", "New employee")}</h2>
          <div className="grid grid-cols-2 gap-3">
            <input required className={inputClass} placeholder={tr("نام", "الاسم الأول", "Ad", "First name")} value={draft.first_name} onChange={(e) => setDraft({ ...draft, first_name: e.target.value })} />
            <input required className={inputClass} placeholder={tr("نام خانوادگی", "اسم العائلة", "Soyad", "Last name")} value={draft.last_name} onChange={(e) => setDraft({ ...draft, last_name: e.target.value })} />
            <input className={inputClass} placeholder={tr("کد پرسنلی", "الرقم الوظيفي", "Personel no", "Employee number")} value={draft.employee_number} onChange={(e) => setDraft({ ...draft, employee_number: e.target.value })} />
            <input className={inputClass} placeholder={tr("سمت شغلی", "المسمى الوظيفي", "Görev", "Job title")} value={draft.job_title} onChange={(e) => setDraft({ ...draft, job_title: e.target.value })} />
            <input className={inputClass} placeholder={tr("واحد سازمانی", "القسم", "Departman", "Department")} value={draft.department} onChange={(e) => setDraft({ ...draft, department: e.target.value })} />
            <select className={inputClass} value={draft.employment_type} onChange={(e) => setDraft({ ...draft, employment_type: e.target.value })}>
              {["full_time", "part_time", "contract", "intern", "other"].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className={inputClass} value={draft.branch_id} onChange={(e) => setDraft({ ...draft, branch_id: e.target.value })}>
              <option value="">{tr("شعبه", "الفرع", "Şube", "Branch")}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select className={inputClass} value={draft.manager_employee_id} onChange={(e) => setDraft({ ...draft, manager_employee_id: e.target.value })}>
              <option value="">{tr("مدیر مستقیم", "المدير المباشر", "Yönetici", "Manager")}</option>
              {items.map((e2) => <option key={e2.id} value={e2.id}>{e2.display_name || `${e2.first_name} ${e2.last_name}`}</option>)}
            </select>
            <input type="date" className={inputClass} value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} />
            <input className={inputClass} placeholder={tr("موبایل", "الجوال", "Cep telefonu", "Mobile")} value={draft.mobile} onChange={(e) => setDraft({ ...draft, mobile: e.target.value })} />
            <input className={inputClass} placeholder={tr("ایمیل", "البريد الإلكتروني", "E-posta", "Email")} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] text-sm font-bold">{tr("انصراف", "إلغاء", "İptal", "Cancel")}</button>
            <button type="submit" disabled={saving} className={btnClass}>{saving ? tr("در حال ذخیره...", "جارٍ الحفظ...", "Kaydediliyor...", "Saving...") : tr("ذخیره", "حفظ", "Kaydet", "Save")}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
