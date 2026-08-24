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
        padding: "8px 12px",
        color: "var(--erp-text)",
      }}
    >
      <Globe2 size={16} color="var(--erp-accent)" style={{ flexShrink: 0 }} />

      <Select
        variant="flush"
        value={language}
        onChange={setLanguage}
        options={languages.map((item) => ({ value: item.code, label: item.label }))}
      />
    </div>
  );
}