// Promotes the `const card = {...}` / local "Section" object redefined in
// nearly every page (Settings.jsx, SystemHealth.jsx, etc.) into one real,
// token-driven component so radius/shadow/border/padding stay consistent
// app-wide instead of being reinvented per page.
//
// `tone` gives semantic cards (kpi/info/warning/danger/success/
// interactive) a restrained 2px block-start accent edge instead of each
// page inventing its own colored-border card - no new components, just a
// color lookup on the same shared surface. `level` distinguishes a major
// page section (1, flat bg-soft) from a card/table/module (2, the default
// translucent "glass" erp-surface look) per the app's depth system.
const TONE_EDGE = {
  kpi: "var(--erp-accent)",
  info: "var(--erp-accent)",
  success: "var(--erp-success)",
  warning: "var(--erp-warning)",
  danger: "var(--erp-danger)",
  interactive: "var(--erp-accent-2)",
};

export default function Card({
  icon: Icon,
  title,
  action,
  padding = true,
  hover,
  accent = false,
  tone,
  level = 2,
  clip = true,
  fillHeight = false,
  className = "",
  children,
  ...rest
}) {
  const hasHeader = Boolean(Icon || title || action);
  const isHover = hover ?? tone === "interactive";
  // `accent`'s border-image needs a uniform border-width to slice cleanly,
  // so it wins outright over `tone`'s 2px block-start edge rather than the
  // two fighting over the same top border - a page asking for both gets
  // the gradient border-image (the pre-existing, more established prop).
  const toneEdge = tone && !accent ? TONE_EDGE[tone] : undefined;

  return (
    <div
      className={[
        level === 1 ? "erp-level-1" : "erp-surface",
        isHover ? "erp-surface-hover" : "",
        className,
      ].join(" ").trim()}
      style={{
        borderRadius: "var(--erp-radius-lg)",
        borderImage: accent ? "linear-gradient(120deg, var(--erp-accent), var(--erp-accent-2)) 1" : undefined,
        borderBlockStart: toneEdge ? `2px solid ${toneEdge}` : undefined,
        // Clipping to the rounded corners is the right default (matches
        // every other card), but it also clips any absolutely-positioned
        // popup a child renders (a Select's option list, in particular) -
        // a page whose card body hosts a Select needs `clip={false}` to
        // let that popup escape the card instead of being cut off.
        overflow: clip ? "hidden" : "visible",
        // Opt-in (default false, so every existing caller is unaffected -
        // `height:100%` on a card whose own height is auto just resolves
        // to "auto" per spec, but the flex column only matters once a
        // parent grid's `items-stretch` has actually given the card a
        // taller height than its content needs). Lets a card in a
        // stretched grid pair distribute that extra height inside its own
        // body (see the content wrapper below) instead of just leaving it
        // as blank space after the content.
        ...(fillHeight ? { display: "flex", flexDirection: "column", height: "100%" } : null),
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
      <div
        style={{
          ...(padding ? { padding: 20 } : null),
          ...(fillHeight ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } : null),
        }}
      >
        {children}
      </div>
    </div>
  );
}
