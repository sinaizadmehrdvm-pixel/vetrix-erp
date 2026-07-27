// Status pill mapped to the semantic --erp-* tokens - replaces the inline
// pale-color spans used ad hoc for paid/unpaid, pass/warn/fail, valid/
// invalid states across pages (the same pattern that caused this app's
// recurring light-theme low-contrast bugs, since inline hex can't be
// remapped per-theme the way a token-driven class can).
const TONE_STYLES = {
  success: { color: "var(--erp-success)", background: "var(--erp-success-soft)" },
  warning: { color: "var(--erp-warning)", background: "var(--erp-warning-soft)" },
  danger: { color: "var(--erp-danger)", background: "var(--erp-danger-soft)" },
  info: { color: "var(--erp-accent)", background: "var(--erp-glow)" },
  neutral: { color: "var(--erp-muted)", background: "var(--erp-panel-solid)" },
};

export default function Badge({
  tone = "neutral",
  icon: Icon,
  className = "",
  children,
  ...rest
}) {
  const style = TONE_STYLES[tone] || TONE_STYLES.neutral;

  return (
    <span
      className={["inline-flex items-center gap-1.5 shrink-0", className].join(" ")}
      style={{
        ...style,
        borderRadius: "var(--erp-radius-sm)",
        padding: "3px 10px",
        fontSize: 12,
        fontWeight: 700,
        lineHeight: 1.6,
        whiteSpace: "nowrap",
      }}
      {...rest}
    >
      {Icon ? <Icon size={13} className="shrink-0" /> : null}
      {children}
    </span>
  );
}
