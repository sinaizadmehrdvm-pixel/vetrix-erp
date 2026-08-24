import { createContext, useContext } from "react";

// Split out from FieldSalesContext.jsx: that file's default export is a
// component (FieldSalesProvider) and react-refresh's only-export-components
// rule doesn't allow a component file to also export a plain hook/context.
export const FieldSalesCtx = createContext(null);

export function useFieldSales() {
  const ctx = useContext(FieldSalesCtx);
  if (!ctx) throw new Error("useFieldSales must be used within FieldSalesProvider");
  return ctx;
}
