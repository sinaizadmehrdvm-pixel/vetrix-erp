// Promotes the `const card = {...}` / local "Section" object redefined in
// nearly every page (Settings.jsx, SystemHealth.jsx, etc.) into one real,
// token-driven component so radius/shadow/border/padding stay consistent
// app-wide instead of being reinvented per page.
export default function Card({
  icon: Icon,
  title,
  action,
  padding = true,
  hover = false,
  accent = false,
  className = "",
  children,
  ...rest
}) {
  const hasHeader = Boolean(Icon || title || action);

  return (
    <div
      className={["erp-surface", hover ? "erp-surface-hover" : "", className].join(" ").trim()}
      style={{
        borderRadius: "var(--erp-radius-lg)",
        boxShadow: "var(--erp-elevation-1)",
        borderImage: accent ? "linear-gradient(120deg, var(--erp-accent), var(--erp-accent-2)) 1" : undefined,
        overflow: "hidden",
      }}
      {...rest}
    >
      {hasHeader ? (
        <div
          className="flex items-center gap-3"
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--erp-border)",
          }}
        >
          {Icon ? (
            <span
              className="inline-flex items-center justify-center shrink-0"
              style={{
                width: 34,
                height: 34,
                borderRadius: "var(--erp-radius-sm)",
                background: "var(--erp-glow)",
                color: "var(--erp-accent)",
              }}
            >
              <Icon size={17} />
            </span>
          ) : null}
          {title ? (
            <h3
              className="truncate"
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "var(--erp-text)",
                flex: 1,
                margin: 0,
              }}
            >
              {title}
            </h3>
          ) : (
            <span style={{ flex: 1 }} />
          )}
          {action}
        </div>
      ) : null}
      <div style={padding ? { padding: 20 } : undefined}>{children}</div>
    </div>
  );
}
