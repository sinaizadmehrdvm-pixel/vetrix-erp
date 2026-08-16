import { Globe2 } from "lucide-react";
import { useLanguage } from "../../localization/useLanguage";
import Select from "../ui/Select";

export default function LanguageSwitcher() {
  const { language, setLanguage, languages } = useLanguage();

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
    >
      <Globe2 size={18} color="var(--erp-accent)" />

      <Select
        value={language}
        onChange={setLanguage}
        options={languages.map((item) => ({ value: item.code, label: item.label }))}
      />
    </div>
  );
}