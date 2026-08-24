import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const wrapperRef = useRef(null);
  // The popup portals to document.body (see the render below) instead of
  // being an absolutely-positioned child of `wrapperRef` - a Card/Modal
  // ancestor's `overflow:hidden` (Card defaults to it), or a Modal's
  // `overflow-y-auto` (which per spec forces `overflow-x:auto` too when
  // only one axis is set to a non-visible value), would otherwise clip
  // the popup or force the WHOLE modal to grow a horizontal scrollbar
  // whenever an open dropdown's option list is wider than the modal -
  // exactly the "Select popup enlarges/scrolls the modal" defect this
  // fixes. Portaled + `fixed`, its position only ever depends on the
  // trigger's own viewport coordinates, never on what wraps it.
  const popupContainerRef = useRef(null);
  const listRef = useRef(null);
  const [popupBox, setPopupBox] = useState(null);

  const selected = options.find((o) => String(o.value) === String(value));

  useEffect(() => {
    if (!open) return undefined;
    function handleOutside(event) {
      const insideWrapper = wrapperRef.current?.contains(event.target);
      const insidePopup = popupContainerRef.current?.contains(event.target);
      if (!insideWrapper && !insidePopup) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;

    function updatePopupBox() {
      const wrapperEl = wrapperRef.current;
      if (!wrapperEl) return;
      const rect = wrapperEl.getBoundingClientRect();
      const margin = 12;
      // Resolved per-element via getComputedStyle rather than a `dir`/
      // `language` prop - Select doesn't receive either (it's used all
      // over the app and just inherits whatever direction its page sets),
      // and the computed style always reflects the real inherited value.
      const isRtl = getComputedStyle(wrapperEl).direction === "rtl";
      const minWidth = rect.width;

      // Two candidate anchors - "left" pins the popup's physical left
      // edge to the trigger's left edge and grows rightward; "right"
      // pins the physical right edge and grows leftward. Matches the
      // old insetInlineStart:0 (LTR: left-anchor, RTL: right-anchor) as
      // the default, but picks whichever side actually has more room
      // instead of only flipping on outright overflow, since the popup's
      // width is fluid (max-content up to a cap), not fixed.
      const spaceIfLeftAnchor = window.innerWidth - rect.left - margin;
      const spaceIfRightAnchor = rect.right - margin;
      let useLeftAnchor = !isRtl;
      const preferredSpace = useLeftAnchor ? spaceIfLeftAnchor : spaceIfRightAnchor;
      const otherSpace = useLeftAnchor ? spaceIfRightAnchor : spaceIfLeftAnchor;
      // Flip when the default side can't even fit the trigger's own
      // width (the popup's hard floor, via `minWidth` below) and the
      // other side has more room - comparing against the real `minWidth`
      // here, not a fixed guess, matters for any trigger wider than that
      // guess would have been: a partial-but-insufficient "preferredSpace"
      // could clear a flat threshold while still being less than
      // `minWidth`, and since the popup's CSS `minWidth` forces it to the
      // trigger's width regardless, it would render wider than the space
      // actually available on that side.
      if (preferredSpace < minWidth && otherSpace > preferredSpace) {
        useLeftAnchor = !useLeftAnchor;
      }
      const space = useLeftAnchor ? spaceIfLeftAnchor : spaceIfRightAnchor;
      // `width: max-content` (set as static CSS below, not computed here)
      // is what actually makes the popup grow to fit its content, same as
      // before this rewrite - `maxWidth` only caps how far it's ALLOWED
      // to grow: the usual 480px ceiling, or the room genuinely available
      // on the chosen anchor side, whichever is smaller - but never less
      // than `minWidth` (the trigger's own width, which the popup's CSS
      // `minWidth` always forces regardless). The outer `Math.max` matters
      // for the rare trigger wider than 480px itself: `Math.min(480,
      // space)` alone could clip the cap below `minWidth`, reintroducing
      // the exact min>max contradiction this is meant to prevent - the
      // trigger's own width must win over the 480px ceiling when the two
      // conflict, since `minWidth` isn't optional.
      const maxWidth = Math.max(minWidth, Math.min(480, space));

      // Opens downward by default; flips above the trigger when there
      // isn't reasonable room below (e.g. the last field before a
      // modal's footer) so it never forces the modal/page to scroll just
      // to reveal the option list.
      const spaceBelow = window.innerHeight - rect.bottom;
      const upward = spaceBelow < 220 && rect.top > spaceBelow;
      const maxHeight = Math.max(160, (upward ? rect.top : window.innerHeight - rect.bottom) - 18);

      setPopupBox({
        left: useLeftAnchor ? rect.left : undefined,
        right: useLeftAnchor ? undefined : window.innerWidth - rect.right,
        minWidth,
        maxWidth,
        top: upward ? undefined : rect.bottom + 6,
        bottom: upward ? window.innerHeight - rect.top + 6 : undefined,
        maxHeight,
      });
    }

    updatePopupBox();
    // rAF-throttled so a fast scroll gesture triggers at most one
    // reposition per frame, matching JalaliDateField's popup - a fixed-
    // position popup no longer moves with the page the way the old
    // absolutely-positioned one did, so without this it would visually
    // detach from the trigger on scroll.
    let rafId = null;
    function onScrollOrResize() {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        updatePopupBox();
      });
    }
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  function openList() {
    const index = options.findIndex((o) => String(o.value) === String(value));
    setActiveIndex(index >= 0 ? index : 0);
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

      {open && popupBox && createPortal(
        <ul
          ref={(node) => { listRef.current = node; popupContainerRef.current = node; }}
          role="listbox"
          style={{
            position: "fixed",
            left: popupBox.left,
            right: popupBox.right,
            top: popupBox.top,
            bottom: popupBox.bottom,
            minWidth: popupBox.minWidth,
            width: "max-content",
            maxWidth: popupBox.maxWidth,
            maxHeight: popupBox.maxHeight,
            overflowY: "auto",
            zIndex: 1000,
            borderRadius: "var(--erp-radius-md)",
            // Solid `--erp-panel-solid`, NOT `.erp-surface`'s translucent
            // `--erp-panel` (86% opacity) + blur - that combination is
            // right for a Card sitting on the page background, but a
            // floating popup can land on top of arbitrary other content
            // (another card, a table row), and the 14% see-through +
            // blur let that content visibly bleed into the option list
            // instead of the popup reading as a fully opaque surface.
            background: "var(--erp-panel-solid)",
            border: "1px solid var(--erp-border)",
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
        </ul>,
        document.body
      )}
    </div>
  );
}
