// Primitive table pieces shared across list pages. Pages keep their own
// data-fetching/columns; only the markup layer changes. Sticky header,
// tabular-nums, consistent cell padding, hover-row state and an
// empty-state slot are handled once here instead of per page.
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
