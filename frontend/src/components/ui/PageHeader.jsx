// Shared premium page header - replaces the hand-rolled `<h1>+<p>+buttons`
// block each large page redefines for itself. Gives every touched page the
// same immediate hierarchy: icon, title, description, a small accent
// underline, then primary/secondary actions and an optional status/context
// slot, all built from existing tokens (no new colors/radii).
export default function PageHeader({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryActions,
  status,
  className = "",
}) {
  return (
    <div className={["flex items-start justify-between gap-4 flex-wrap mb-6", className].join(" ")}>
      <div className="min-w-0">
        <div className="flex items-center gap-3 mb-1">
          {Icon ? (
            <span
              className="inline-flex items-center justify-center shrink-0"
              style={{
                width: 42,
                height: 42,
                borderRadius: "var(--erp-radius-md)",
                background: "var(--erp-glow)",
                border: "1px solid var(--erp-border)",
                color: "var(--erp-accent)",
              }}
            >
              <Icon size={21} />
            </span>
          ) : null}
          <h1 className="text-3xl font-black text-[var(--erp-text)] truncate">{title}</h1>
          {status}
        </div>
        <div
          aria-hidden="true"
          style={{
            width: 56,
            height: 3,
            borderRadius: 2,
            marginBlock: "8px 10px",
            marginInlineStart: Icon ? 54 : 0,
            background: "linear-gradient(90deg, var(--erp-accent), var(--erp-accent-2))",
          }}
        />
        {description ? (
          <p className="text-[var(--erp-muted)] text-sm" style={{ marginInlineStart: Icon ? 54 : 0 }}>
            {description}
          </p>
        ) : null}
      </div>

      {(primaryAction || secondaryActions) && (
        <div className="flex items-center gap-2 flex-wrap">
          {secondaryActions}
          {primaryAction}
        </div>
      )}
    </div>
  );
}
