import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import moment from "moment-jalaali";
import { useLanguage } from "../localization/useLanguage";
import { toHijri, HIJRI_MONTHS_AR } from "../utils/hijri";
import { JALALI_MONTHS_FA, GREGORIAN_MONTHS, WEEKDAYS_FULL } from "../localization/calendarNames";
import CalendarSection from "./CalendarSection";

export default function DateBadge() {
  const { language, dir, n } = useLanguage();
  const fa = language === "fa";
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  // Portaled to document.body (see the createPortal call below) instead
  // of being an absolutely-positioned child of the trigger - it used to
  // overflow off the viewport edge with no clamping (`insetInlineEnd:0`
  // and no measured position), and CalendarSection's month-grid + day-
  // details panel are wide enough (~620px side-by-side) that this was a
  // real, not just theoretical, overflow risk.
  const popupRef = useRef(null);
  const [popupBox, setPopupBox] = useState(null);

  useEffect(() => {
    function handleOutside(event) {
      const insideTrigger = containerRef.current?.contains(event.target);
      const insidePopup = popupRef.current?.contains(event.target);
      if (!insideTrigger && !insidePopup) setOpen(false);
    }
    function handleEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleOutside);
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;

    function updatePosition() {
      const triggerRect = containerRef.current?.getBoundingClientRect();
      if (!triggerRect) return;
      const margin = 12;
      // CalendarSection's own content (month grid + day-details panel) is
      // ~620px unwrapped; a first pass before it's mounted falls back to
      // that estimate, then a same-frame remeasure (via rAF, since the
      // panel's own `flex-wrap` means its real size depends on how much
      // width `maxWidth` below actually leaves it) corrects against its
      // real rendered size.
      const popupEl = popupRef.current;
      const popupWidth = popupEl ? popupEl.getBoundingClientRect().width : 620;
      const popupHeight = popupEl ? popupEl.getBoundingClientRect().height : 400;
      let left = dir === "rtl" ? triggerRect.left : triggerRect.right - popupWidth;
      if (left < margin) left = margin;
      if (left + popupWidth > window.innerWidth - margin) left = window.innerWidth - margin - popupWidth;
      const spaceBelow = window.innerHeight - triggerRect.bottom;
      const upward = spaceBelow < popupHeight + 20 && triggerRect.top > spaceBelow;
      const maxHeight = Math.max(220, (upward ? triggerRect.top : window.innerHeight - triggerRect.bottom) - 24);
      setPopupBox(
        upward
          ? { left, bottom: window.innerHeight - triggerRect.top + 8, maxHeight }
          : { left, top: triggerRect.bottom + 8, maxHeight }
      );
    }

    updatePosition();
    const initialRaf = requestAnimationFrame(updatePosition);
    // rAF-throttled so a fast scroll gesture triggers at most one
    // reposition per frame, not one per raw scroll event - each call also
    // re-renders CalendarSection's month grid (see CalendarWidget.jsx),
    // which is memoized but still not free to re-render that often.
    let scrollRafId = null;
    function onScrollOrResize() {
      if (scrollRafId !== null) return;
      scrollRafId = requestAnimationFrame(() => {
        scrollRafId = null;
        updatePosition();
      });
    }
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      cancelAnimationFrame(initialRaf);
      if (scrollRafId !== null) cancelAnimationFrame(scrollRafId);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, dir]);

  // Was fa-vs-everything-else: Arabic got Gregorian day/month here (while
  // its own popover below, via CalendarSection, correctly shows Hijri -
  // the two disagreed for the same language) and Turkish fell back to
  // English month/weekday names entirely. Matches CalendarSection's own
  // calendarSystemFor mapping now, so the trigger and its popover always
  // agree.
  const now = moment();
  const calendarSystem = fa ? "jalali" : language === "ar" ? "hijri" : "gregorian";
  let weekdayIndex, day, month;
  if (calendarSystem === "jalali") {
    weekdayIndex = (now.day() + 1) % 7; // Saturday-first
    day = n(now.jDate());
    month = JALALI_MONTHS_FA[now.jMonth()];
  } else if (calendarSystem === "hijri") {
    const g = now.toDate();
    const h = toHijri(g.getFullYear(), g.getMonth() + 1, g.getDate());
    weekdayIndex = now.day(); // Sunday-first
    day = n(h.day);
    month = HIJRI_MONTHS_AR[h.month - 1];
  } else {
    weekdayIndex = now.day(); // Sunday-first
    day = n(now.toDate().getDate());
    month = (GREGORIAN_MONTHS[language] || GREGORIAN_MONTHS.en)[now.toDate().getMonth()];
  }
  const weekday = (WEEKDAYS_FULL[language] || WEEKDAYS_FULL.en)[weekdayIndex];

  return (
    <div ref={containerRef} style={{ position: "relative", direction: dir }}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="erp-surface"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderRadius: 18,
          padding: "8px 14px 8px 8px",
          border: open ? "1px solid var(--erp-accent)" : undefined,
          cursor: "pointer",
        }}
      >
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "var(--erp-accent)",
            color: "var(--erp-on-accent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 900,
            flexShrink: 0,
          }}
        >
          {day}
        </span>
        <span style={{ textAlign: "start", lineHeight: 1.3 }}>
          <span style={{ display: "block", fontSize: 12, fontWeight: 800, color: "var(--erp-text)" }}>{weekday}</span>
          <span style={{ display: "block", fontSize: 11, color: "var(--erp-muted)" }}>{month}</span>
        </span>
      </button>

      {open && popupBox && createPortal(
        <div
          ref={popupRef}
          role="dialog"
          aria-label={fa ? "تقویم" : "Calendar"}
          dir={dir}
          style={{
            position: "fixed",
            left: popupBox.left,
            top: popupBox.top,
            bottom: popupBox.bottom,
            maxWidth: "calc(100vw - 24px)",
            maxHeight: popupBox.maxHeight,
            overflowY: "auto",
            zIndex: 1000,
            borderRadius: 20,
            padding: 14,
            width: "max-content",
            // Solid `--erp-panel-solid`, not `.erp-surface`'s translucent
            // `--erp-panel` (86% opacity) + blur - right for a card sitting
            // on the page background, wrong for a floating popover that
            // can land on top of arbitrary other content.
            background: "var(--erp-panel-solid)",
            border: "1px solid var(--erp-border)",
            // `var(--erp-elevation-3)`, not a hardcoded shadow - the token
            // is deliberately lighter in light theme (~0.08-0.16 alpha) vs
            // dark theme (~0.14-0.32), so a fixed heavy black shadow looks
            // disproportionately harsh in light theme, and this now matches
            // JalaliDateField's popup, which already used the token.
            boxShadow: "var(--erp-elevation-3)",
          }}
        >
          <CalendarSection />
        </div>,
        document.body
      )}
    </div>
  );
}
