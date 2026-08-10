import { useEffect, useRef } from "react";

// Shared floating-dialog shell: token-driven radius/border/shadow (matches
// Card/`.erp-surface`), Escape-to-close, backdrop-click-to-close, and a
// simple focus trap (focus moves into the panel on open, returns to the
// trigger on close). Consumers keep their own header/body/footer markup -
// only the outer backdrop+panel wrapper is shared, so migrating an
// existing hand-rolled modal is a swap of the outer two <div>s only.
export default function Modal({
  open,
  onClose,
  children,
  maxWidthClassName = "max-w-lg",
  className = "",
  closeOnBackdrop = true,
  labelledBy,
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    panelRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={["w-full overflow-y-auto erp-focus", maxWidthClassName, className].join(" ")}
        style={{
          background: "var(--erp-panel-solid)",
          border: "1px solid var(--erp-border)",
          borderRadius: "var(--erp-radius-lg)",
          boxShadow: "var(--erp-shadow)",
          maxHeight: "90vh",
        }}
      >
        {children}
      </div>
    </div>
  );
}
