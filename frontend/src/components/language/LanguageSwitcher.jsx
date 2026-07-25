import { Globe2 } from "lucide-react";
import { useLanguage } from "../../localization/useLanguage";

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

      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        style={{
          background: "transparent",
          color: "var(--erp-text)",
          border: "none",
          outline: "none",
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        {languages.map((item) => (
          <option key={item.code} value={item.code} style={{ color: "black" }}>
            {item.label}
          </option>
        ))}
      </select>
    </div>
  );
}