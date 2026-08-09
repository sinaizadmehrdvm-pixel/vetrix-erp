// Primitive table pieces shared across list pages. Pages keep their own
// data-fetching/columns; only the markup layer changes. Sticky header,
// tabular-nums, consistent cell padding, hover-row state and an
// empty-state slot are handled once here instead of per page.
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
export function Table({ className = "", children, ...rest }) {
  return (
    <div className="overflow-x-auto" style={{ borderRadius: "var(--erp-radius-lg)" }}>
      <table
        className={["w-full", className].join(" ")}
        style={{
          borderCollapse: "separate",
          borderSpacing: 0,
          fontVariantNumeric: "tabular-nums",
        }}
        {...rest}
      >
        {children}
      </table>
    </div>
  );
}

export function Thead({ children, ...rest }) {
  return (
    <thead {...rest}>
      <tr
        style={{
          position: "sticky",
          top: 0,
          zIndex: 1,
          background: "var(--erp-panel-solid)",
        }}
      >
        {children}
      </tr>
    </thead>
  );
}

export function Th({ align = "start", className = "", style, children, ...rest }) {
  return (
    <th
      className={className}
      style={{
        padding: "12px 14px",
        textAlign: align,
        fontSize: 12,
        fontWeight: 700,
        color: "var(--erp-muted)",
        textTransform: "uppercase",
        letterSpacing: 0.4,
        borderBottom: "1px solid var(--erp-border)",
        whiteSpace: "nowrap",
        ...style,
      }}
      {...rest}
    >
      {children}
    </th>
  );
}

// Three-state sortable header: click cycles asc -> desc -> none (calling
// `onSort(field, null)` to clear). Keyboard-operable via a real <button> so
// focus/Enter/Space work without extra handlers, and aria-sort is set on
// the <th> itself per the WAI-ARIA table sort pattern.
export function SortableTh({ field, sortField, sortDir, onSort, align = "start", className = "", style, children }) {
  const active = sortField === field;
  const ariaSort = active ? (sortDir === "asc" ? "ascending" : "descending") : "none";

  function cycle() {
    if (!active) return onSort(field, "asc");
    if (sortDir === "asc") return onSort(field, "desc");
    return onSort(null, null);
  }

  const Icon = active ? (sortDir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;

  return (
    <Th align={align} className={className} style={style} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={cycle}
        className="inline-flex items-center gap-1 bg-transparent border-0 p-0 cursor-pointer erp-focus"
        style={{ font: "inherit", color: active ? "var(--erp-accent)" : "inherit", textTransform: "inherit", letterSpacing: "inherit" }}
      >
        {children}
        <Icon size={13} className="shrink-0" />
      </button>
    </Th>
  );
}

export function Tbody({ children, ...rest }) {
  return <tbody {...rest}>{children}</tbody>;
}

export function Tr({ className = "", children, ...rest }) {
  return (
    <tr
      className={["erp-table-row", className].join(" ")}
      style={{ borderBottom: "1px solid var(--erp-border)" }}
      {...rest}
    >
      {children}
    </tr>
  );
}

export function Td({ align = "start", className = "", style, children, ...rest }) {
  return (
    <td
      className={className}
      style={{
        padding: "12px 14px",
        textAlign: align,
        fontSize: 14,
        color: "var(--erp-text)",
        verticalAlign: "middle",
        ...style,
      }}
      {...rest}
    >
      {children}
    </td>
  );
}

export function EmptyRow({ colSpan, children }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        style={{
          padding: "40px 14px",
          textAlign: "center",
          fontSize: 14,
          color: "var(--erp-muted)",
        }}
      >
        {children}
      </td>
    </tr>
  );
}
