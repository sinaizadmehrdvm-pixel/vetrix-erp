import { Globe2 } from "lucide-react";
import { useLanguage } from "../../localization/LanguageContext";

export default function LanguageSwitcher() {
  const { language, setLanguage, languages } = useLanguage();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "rgba(15,23,42,0.85)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 18,
        padding: "10px 14px",
        color: "white",
      }}
    >
      <Globe2 size={18} color="#22d3ee" />

      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value)}
        style={{
          background: "transparent",
          color: "white",
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