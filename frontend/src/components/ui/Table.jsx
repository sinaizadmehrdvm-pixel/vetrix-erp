// Primitive table pieces shared across list pages. Pages keep their own
// data-fetching/columns; only the markup layer changes. Sticky header,
// tabular-nums, consistent cell padding, hover-row state and an
// empty-state slot are handled once here instead of per page.
import { Children, cloneElement } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import Skeleton from "./Skeleton";
// `scrollable=false` opts a caller out of the wrapper's `overflow-x-auto` -
// default stays `true` so every existing caller's rendered output is
// unchanged. A page that has genuinely eliminated horizontal overflow
// (percentage column widths under `table-layout:fixed`, so the table can
// never exceed 100% of its container) can pass `scrollable={false}` to
// drop the wrapper entirely, rather than keep a scroll affordance that
// would only ever fire on this table's own layout bugs going forward.
export function Table({ className = "", children, scrollable = true, ...rest }) {
  return (
    <div className={scrollable ? "overflow-x-auto" : undefined} style={{ borderRadius: "var(--erp-radius-lg)" }}>
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
  // border-radius on a <tr> (display: table-row) is unreliably painted
  // across browsers, so the rounded top corners are applied to the actual
  // first/last <th> cells instead - table-cell elements support
  // background+radius consistently. Logical properties keep this correct
  // in both RTL and LTR without knowing which side is visually which.
  const items = Children.toArray(children);
  const withRadius = items.map((child, index) => {
    const corner = {
      ...(index === 0 ? { borderStartStartRadius: "var(--erp-radius-lg)" } : null),
      ...(index === items.length - 1 ? { borderStartEndRadius: "var(--erp-radius-lg)" } : null),
    };
    if (!Object.keys(corner).length) return child;
    return cloneElement(child, { style: { ...child.props.style, ...corner } });
  });

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
        {withRadius}
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
        background: "var(--erp-panel-solid)",
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

// Row-numbering convention (no dedicated component - it's one line at the
// call site): render `{n(startIndex + index + 1)}` in a leading
// <Td className="text-[var(--erp-muted)] font-bold">, where startIndex is
// 0 for an unpaginated table or (page-1)*pageSize for a paginated one -
// see Customers.jsx/Products.jsx for existing call sites.

// Drop-in replacement for the "Loading..." text row a page's Tbody
// otherwise renders while data is in flight - same cell chrome as a real
// row, so the table doesn't jump size once data arrives.
export function SkeletonRows({ colSpan, rows = 4 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, index) => (
        <tr key={index}>
          <td colSpan={colSpan} style={{ padding: "10px 14px" }}>
            <Skeleton height={16} width={index % 2 ? "70%" : "92%"} />
          </td>
        </tr>
      ))}
    </>
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
