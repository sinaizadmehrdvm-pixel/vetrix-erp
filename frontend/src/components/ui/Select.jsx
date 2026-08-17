import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

// Native <select> popups are rendered by the OS/browser itself (Windows
// Chrome/Edge draw a plain, unrounded rectangle) and cannot be corner-
// rounded via CSS - there is no stylable pseudo-element for the open
// listbox in the browsers this app has to support. This is a real,
// app-styled replacement: the trigger button and popup both use the same
// `erp-surface`/radius tokens as every other card, so a dropdown "opening
// from a collapsed state" looks like the rest of the app instead of a
// flat OS rectangle. Keyboard-operable (arrow keys, Enter, Escape) and
// exposes the standard ARIA listbox pattern.
// `variant="flush"` strips the trigger's own border/background/radius so
// it can be embedded as a bare row inside a parent that already supplies
// that chrome (Sidebar's context zone) - the floating popup keeps its own
// full "erp-surface" treatment either way, since it's absolutely
// positioned and needs to read as its own elevated surface regardless.
// `className` sizes/positions the outer wrapper (width, shrink, grid
// placement); it does NOT reach the trigger `<button>`, which owns its
// own radius/padding/height as inline styles for `variant="default"`.
// A caller that needs to override the trigger's own chrome (matching a
// page-local control convention) should use `triggerClassName` with
// Tailwind's `!important` modifier instead - passing radius/padding
// utilities via `className` would land on the wrapper only and do
// nothing to the button while silently adding unwanted wrapper padding.
export default function Select({ value, onChange, options, placeholder, className = "", triggerClassName = "", disabled = false, variant = "default", error = false }) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Popup normally hugs the trigger's inline-start edge (matches text
  // direction). A trigger sitting near the viewport's inline-end edge
  // (e.g. the last item in a wrapped filter row) can push a wide popup
  // (long option labels grow it via width:max-content) past the screen
  // edge - this flips it to anchor from the opposite edge instead, so it
  // grows back on-screen rather than being clipped by the viewport.
  const [popupFlip, setPopupFlip] = useState(false);
  const wrapperRef = useRef(null);
  const listRef = useRef(null);

  const selected = options.find((o) => String(o.value) === String(value));

  useEffect(() => {
    if (!open) return undefined;
    function handleOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = listRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth || rect.left < 0) setPopupFlip(true);
  }, [open]);

  function openList() {
    const index = options.findIndex((o) => String(o.value) === String(value));
    setActiveIndex(index >= 0 ? index : 0);
    setPopupFlip(false);
    setOpen(true);
  }

  useEffect(() => {
    if (open && activeIndex >= 0) {
      listRef.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [open, activeIndex]);

  function commit(option) {
    onChange(option.value);
    setOpen(false);
  }

  function handleKeyDown(event) {
    if (!open) {
      if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        openList();
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (options[activeIndex]) commit(options[activeIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={wrapperRef} className={["relative", className].join(" ")}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={error || undefined}
        className={`w-full flex items-center justify-between gap-2 ${variant === "flush" ? "" : "vitalix-control-inset"} ${error ? "vitalix-control-error" : ""} ${triggerClassName}`}
        style={
          variant === "flush"
            ? { background: "transparent", color: "var(--erp-text)", border: "1px solid transparent", padding: 0, opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer" }
            : {
                background: "var(--erp-panel-solid)",
                color: "var(--erp-text)",
                border: "1px solid var(--erp-border)",
                borderRadius: "var(--erp-radius-md)",
                padding: "10px 12px",
                minHeight: 44,
                opacity: disabled ? 0.5 : 1,
                cursor: disabled ? "not-allowed" : "pointer",
              }
        }
      >
        <span className="truncate">{selected ? selected.label : (placeholder || "")}</span>
        <ChevronDown size={16} style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>

      {open && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute z-30 erp-surface"
          style={{
            top: "calc(100% + 6px)",
            insetInlineStart: popupFlip ? undefined : 0,
            insetInlineEnd: popupFlip ? 0 : undefined,
            minWidth: "100%",
            width: "max-content",
            maxWidth: "min(480px, 90vw)",
            maxHeight: 260,
            overflowY: "auto",
            borderRadius: "var(--erp-radius-md)",
            boxShadow: "var(--erp-elevation-3), inset 0 1px 0 0 var(--erp-surface-highlight)",
            padding: 6,
            margin: 0,
            listStyle: "none",
          }}
        >
          {options.map((option, index) => {
            const isSelected = String(option.value) === String(value);
            return (
              <li
                key={option.value}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(option)}
                className="flex items-center justify-between gap-2 cursor-pointer"
                style={{
                  padding: "9px 10px",
                  borderRadius: "var(--erp-radius-sm)",
                  background: index === activeIndex ? "var(--erp-glow)" : "transparent",
                  color: isSelected ? "var(--erp-accent)" : "var(--erp-text)",
                  fontWeight: isSelected ? 800 : 500,
                }}
              >
                <span className="truncate">{option.label}</span>
                {isSelected && <Check size={15} className="shrink-0" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
