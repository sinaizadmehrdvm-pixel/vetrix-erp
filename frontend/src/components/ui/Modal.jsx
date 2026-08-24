import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

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
  const reduceMotion = useReducedMotion();

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

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18 }}
          onMouseDown={(event) => {
            if (closeOnBackdrop && event.target === event.currentTarget) onClose?.();
          }}
        >
          <motion.div
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
              boxShadow: "var(--erp-elevation-3)",
              maxHeight: "90vh",
              // `overflow-y:auto` alone makes the UA force `overflow-x`
              // to `auto` too (CSS spec: a "visible" axis paired with a
              // non-visible one on the same box gets promoted to `auto`),
              // so any content that happened to run wide - an un-portaled
              // popup, a form grid without min-width:0 - silently grew a
              // horizontal scrollbar on the whole modal. Modal content is
              // expected to always fit its own width; only vertical
              // overflow (a tall form) is an intentional fallback.
              overflowX: "hidden",
            }}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 8 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.4, 0, 0.2, 1] }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
