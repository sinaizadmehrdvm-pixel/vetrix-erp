import { useLanguage } from "../../localization/useLanguage";

// Central, reusable money renderer - the single place responsible for
// making large amounts never overflow their container. Always computes the
// full-precision value; `compact` only swaps what's *visible* (million/
// billion-style shorthand) once the value crosses `compactThreshold`, while
// the full amount stays available via the native tooltip and aria-label so
// nothing is ever actually lost, only summarized in tight card UI.
const DEFAULT_COMPACT_THRESHOLD = 1_000_000_000;

export default function MoneyDisplay({
  value,
  compact = false,
  compactThreshold = DEFAULT_COMPACT_THRESHOLD,
  tone,
  fontSize = "clamp(13px, 1.55vw, 20px)",
  className = "",
  style,
  as: As = "span",
  ...rest
}) {
  const { money } = useLanguage();
  const numeric = Number(value || 0);
  const full = money(numeric);
  const useCompact = compact && Math.abs(numeric) >= compactThreshold;
  const display = useCompact
    ? money(numeric, undefined, { notation: "compact", maximumFractionDigits: 1, minimumFractionDigits: 0 })
    : full;

  return (
    <As
      className={["erp-money", className].join(" ")}
      style={{
        fontVariantNumeric: "tabular-nums",
        fontSize,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        display: "inline-block",
        maxWidth: "100%",
        minWidth: 0,
        lineHeight: 1.25,
        color: tone,
        ...style,
      }}
      title={full}
      aria-label={full}
      {...rest}
    >
      {display}
    </As>
  );
}
