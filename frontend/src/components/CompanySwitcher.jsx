import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../auth/AuthContext";
import { useLanguage } from "../localization/useLanguage";
import { getCompanies, switchCompany } from "../services/companiesApi";

// Milestone 4: only a super-admin can act inside more than one company's
// context. Everyone else is permanently bound to their own company via
// their JWT, so this control simply doesn't render for them.
export default function CompanySwitcher() {
  const { user, activeCompany, switchCompanyContext } = useAuth();
  const { language } = useLanguage();
  const fa = language === "fa";
  const ar = language === "ar";
  const trk = language === "tr";
  const [companies, setCompanies] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user?.is_super_admin) return;
    getCompanies().then(setCompanies).catch(() => {});
  }, [user?.is_super_admin]);

  if (!user?.is_super_admin) return null;

  async function handleChange(event) {
    const companyId = Number(event.target.value);
    if (!companyId || companyId === activeCompany?.id) return;
    setBusy(true);
    try {
      const result = await switchCompany(companyId);
      await switchCompanyContext(result);
      window.location.reload();
    } catch (error) {
      toast.error(error.message);
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "var(--erp-panel-solid)",
        border: "1px solid var(--erp-border)",
        borderRadius: 18,
        padding: "10px 14px",
        color: "var(--erp-text)",
      }}
      title={fa ? "سوپرادمین: سوییچ کانتکست شرکت" : ar ? "مسؤول عام: تبديل سياق الشركة" : trk ? "Süper yönetici: şirket bağlamını değiştir" : "Super-admin: switch company context"}
    >
      <Building2 size={18} color="var(--erp-accent)" />
      <select
        value={activeCompany?.id || ""}
        disabled={busy || !companies.length}
        onChange={handleChange}
        style={{
          background: "transparent",
          color: "var(--erp-text)",
          border: "none",
          outline: "none",
          fontWeight: 800,
          cursor: busy ? "wait" : "pointer",
          minWidth: 0,
        }}
      >
        {companies.map((company) => (
          <option key={company.id} value={company.id} style={{ color: "black" }}>
            {company.name}
          </option>
        ))}
      </select>
    </div>
  );
}
