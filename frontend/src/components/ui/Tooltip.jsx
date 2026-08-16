// Lightweight, CSS-driven tooltip for icon-only controls (spec: every
// icon-only control needs one, especially collapsed-Sidebar/theme/
// language/collapse/refresh/export). No JS positioning - `side` picks a
// fixed logical-property placement so it stays correct in RTL and LTR.
export default function Tooltip({ label, children, side = "top" }) {
  if (!label) return children;
  return (
    <span className="vitalix-tooltip" data-side={side}>
      {children}
      <span role="tooltip" className="vitalix-tooltip-bubble">
        {label}
      </span>
    </span>
  );
}
