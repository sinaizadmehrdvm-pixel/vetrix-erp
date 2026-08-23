// Standardizes the tab-button-row pattern repeated ad hoc in Reports.jsx
// and Customer360.jsx. `tabs` is [{ id, label, icon? }]; caller owns the
// active-id state and content switching.
export default function Tabs({ tabs, activeId, onChange, className = "" }) {
  return (
    <div
      role="tablist"
      // `flex-wrap`, not `overflow-x-auto` - a row of 5+ tabs (some with
      // long labels) at laptop/tablet widths didn't have room to sit on
      // one line; scrolling hides tabs off-screen with no visual hint
      // they exist, wrapping keeps every label fully visible instead.
      className={["flex items-center flex-wrap gap-1", className].join(" ")}
      style={{
        borderBottom: "1px solid var(--erp-border)",
        padding: "0 4px",
      }}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className="inline-flex items-center gap-2 shrink-0 whitespace-nowrap"
            style={{
              padding: "12px 16px",
              fontSize: 14,
              fontWeight: 700,
              background: "transparent",
              color: active ? "var(--erp-accent)" : "var(--erp-muted)",
              borderBottom: active
                ? "2px solid var(--erp-accent)"
                : "2px solid transparent",
              marginBottom: -1,
              transition: "color 120ms ease, border-color 120ms ease",
            }}
          >
            {Icon ? <Icon size={15} className="shrink-0" /> : null}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
