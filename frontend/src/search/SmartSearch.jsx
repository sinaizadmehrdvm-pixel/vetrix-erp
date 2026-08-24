import { Search } from "lucide-react";
import { useLanguage } from "../localization/useLanguage";

// .vitalix-input-group (index.css) owns the rounded pill's border/
// background/focus-within ring on the outer container - the bare <input>
// gives up its own outline/border/box-shadow via that same class's
// `> input` rule, so it never shows a rectangular focus box inside the
// pill (the previous `outline:"none"` here had no replacement focus
// state at all). Dropped the old manual `language === "fa" ? ... : ...`
// left/right icon positioning and `direction`/`textAlign` overrides - a
// plain flex row inherits the app's `dir` (set on <html> by App.jsx per
// the design system) and mirrors itself automatically, same as every
// other search field fixed this session.
export default function SmartSearch({ value, onChange, placeholder }) {
  const { t } = useLanguage();

  return (
    <div className="vitalix-input-group !rounded-2xl flex items-center gap-2" style={{ padding: "0 16px", width: "100%" }}>
      <Search size={18} className="text-[var(--erp-accent)] shrink-0" aria-hidden="true" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || t.smartSearch}
        aria-label={placeholder || t.smartSearch}
        className="min-w-0 flex-1"
        style={{ color: "var(--erp-text)", padding: "14px 0", fontSize: 15, fontWeight: 600 }}
      />
    </div>
  );
}