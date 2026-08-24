import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import moment from "moment-jalaali";
import { toJalali, todayJalali, fromJalali, toHijriText, todayHijri, fromHijriText, toPersianDigits } from "../../utils/date";
import { toHijri, hijriToGregorian, daysInHijriMonth, addHijriMonths, HIJRI_MONTHS_AR } from "../../utils/hijri";
import { holidayFor, holidayCoverage } from "../../localization/holidays";
import { JALALI_MONTHS_FA, GREGORIAN_MONTHS, WEEKDAYS_SHORT, WEEKEND_INDEXES } from "../../localization/calendarNames";
import Tooltip from "../ui/Tooltip";

function calendarSystemFor(lang, fa) {
  if (lang === "fa" || (!lang && fa)) return "jalali";
  if (lang === "ar") return "hijri";
  return "gregorian";
}

function isoOf(year, month1Based, day) {
  return `${year}-${String(month1Based).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Builds a lightweight month grid - not the dashboard calendar widget's
// heavier occasion feed, just this picker's own day cells, each tagged
// with the shared holiday lookup (see localization/holidays.js) - for
// whichever calendar system the active language uses.
function buildGrid(calendarSystem, cursor, language, country) {
  if (calendarSystem === "jalali") {
    const year = cursor.jYear();
    const month = cursor.jMonth();
    const daysInMonth = moment.jDaysInMonth(year, month);
    const offset = (cursor.clone().jDate(1).day() + 1) % 7;
    const today = moment();
    const cells = Array(offset).fill(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const g = cursor.clone().jDate(day).toDate();
      // Friday (column index 6, see WEEKDAYS_SHORT.fa) is Iran's weekly
      // holiday and is conventionally shown in the holiday color in every
      // Persian calendar, independent of `holidayFor`'s curated *named*
      // holidays - without this, only a handful of days a year read as
      // "off" at a glance and every Friday looks like an ordinary weekday.
      cells.push({ day, label: toPersianDigits(day), iso: isoOf(g.getFullYear(), g.getMonth() + 1, g.getDate()), isToday: today.jYear() === year && today.jMonth() === month && today.jDate() === day, holiday: holidayFor("jalali", month + 1, day, language, country), isWeekend: WEEKEND_INDEXES.jalali.includes((offset + day - 1) % 7) });
    }
    return { title: `${JALALI_MONTHS_FA[month]} ${toPersianDigits(year)}`, weekdays: WEEKDAYS_SHORT.fa, cells };
  }

  if (calendarSystem === "hijri") {
    const gCursor = cursor.toDate();
    const { year, month } = toHijri(gCursor.getFullYear(), gCursor.getMonth() + 1, gCursor.getDate());
    const daysInMonth = daysInHijriMonth(year, month);
    const firstG = hijriToGregorian(year, month, 1);
    const offset = new Date(firstG.year, firstG.month - 1, firstG.day).getDay();
    const todayG = new Date();
    const todayHijriYmd = toHijri(todayG.getFullYear(), todayG.getMonth() + 1, todayG.getDate());
    const cells = Array(offset).fill(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const g = hijriToGregorian(year, month, day);
      cells.push({ day, label: day, iso: isoOf(g.year, g.month, g.day), isToday: todayHijriYmd.year === year && todayHijriYmd.month === month && todayHijriYmd.day === day, holiday: holidayFor("hijri", month, day, language, country), isWeekend: WEEKEND_INDEXES.hijri.includes((offset + day - 1) % 7) });
    }
    return { title: `${HIJRI_MONTHS_AR[month - 1]} ${year}`, weekdays: WEEKDAYS_SHORT.ar, cells, hijriYearMonth: { year, month } };
  }

  const date = cursor.toDate();
  const year = date.getFullYear();
  const month = date.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const offset = new Date(year, month, 1).getDay();
  const today = new Date();
  const monthNames = GREGORIAN_MONTHS[language] || GREGORIAN_MONTHS.en;
  const cells = Array(offset).fill(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ day, label: day, iso: isoOf(year, month + 1, day), isToday: today.getFullYear() === year && today.getMonth() === month && today.getDate() === day, holiday: holidayFor("gregorian", month + 1, day, language, country), isWeekend: WEEKEND_INDEXES.gregorian.includes((offset + day - 1) % 7) });
  }
  // Was always WEEKDAYS_EN regardless of language - Turkish users got
  // English weekday abbreviations ("Su, Mo, Tu...") in the grid header.
  return { title: `${monthNames[month]} ${year}`, weekdays: WEEKDAYS_SHORT[language] || WEEKDAYS_SHORT.en, cells };
}

function cursorFromIso(iso) {
  const parsed = iso ? moment(iso) : null;
  return parsed && parsed.isValid() ? parsed : moment();
}

// A text date field that stores/emits a Gregorian ISO ("YYYY-MM-DD") value
// but displays, accepts typed text in, and offers a clickable popup
// calendar for whichever calendar system the active language uses:
// Jalali for Persian, Hijri for Arabic, and plain Gregorian for Turkish/
// English - the app stores every business date as ISO, but several pages
// were showing a Jalali-format placeholder ("۱۴۰۵/۰۳/۰۹") while actually
// reading/writing the raw ISO string with only its digits swapped to
// Persian numerals, which isn't a real calendar conversion and made the
// "Today" button fill a value that contradicted the field's own
// placeholder. There was also no way to *pick* a day visually - only
// type one - so this adds a small popup grid matching the same calendar.
// `country` (optional) is the active company's configured country
// (LanguageProvider's `country`, from Settings) - the authoritative
// holiday-jurisdiction signal when the caller passes it;
// localization/holidays.js falls back to a calendar-system-only table
// when it's omitted. Kept as a plain prop (like `language`/`fa`) rather
// than calling useLanguage() internally, so this component stays usable
// - and testable - outside a LanguageProvider tree.
// `variant="grouped"` (default "default", unchanged from before this
// prop existed) renders the text input and the calendar-trigger button
// as ONE rounded `.vitalix-input-group` composite instead of two
// separately-boxed siblings - the accent-filled square button used to
// sit visually detached from the input, and the input's own focus ring
// (from whatever `className` the caller supplied) could show a
// rectangular box instead of following the pill shape. Opt-in and
// additive so the ~30 existing callers keep their current pixel output;
// a page adopting "grouped" passes `groupClassName` (mirrors Select.jsx's
// `triggerClassName`) to override the group's own radius/height instead
// of `className`, which in this variant targets the input alone.
export default function JalaliDateField({ value, onChange, fa, language, country, className, groupClassName = "", placeholder, style, minDate, maxDate, variant = "default" }) {
  const grouped = variant === "grouped";
  const lang = language || (fa ? "fa" : "en");
  const calendarSystem = calendarSystemFor(lang, fa);
  const tr = (faText, arText, trText, enText) =>
    lang === "fa" ? faText : lang === "ar" ? arText : lang === "tr" ? trText : enText;

  const displayFor = (v) => {
    if (calendarSystem === "jalali") return toJalali(v);
    if (calendarSystem === "hijri") return toHijriText(v);
    return v || "";
  };
  const [text, setText] = useState(() => displayFor(value));
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => cursorFromIso(value));
  const wrapperRef = useRef(null);
  // The popup portals to document.body (see the render below) instead of
  // being an absolutely-positioned child of `wrapperRef` - a Card/Modal
  // ancestor's `overflow:hidden` (Card defaults to it; ancestors with a
  // CSS transform, which framer-motion's Modal sets during its open/close
  // animation, create a new containing block for `position:fixed`
  // descendants too) would otherwise clip or misposition it depending on
  // which page/modal this field happens to be used in. Portaled + `fixed`,
  // its position only ever depends on the trigger's own viewport
  // coordinates, never on what happens to wrap it.
  const popupContainerRef = useRef(null);
  // Physical viewport px (from getBoundingClientRect()), not CSS logical
  // properties (insetInlineStart/End) or values relative to the trigger -
  // those depend on the RTL `dir` inherited context lining up exactly
  // with intent, which is easy to get backwards, and once portaled the
  // popup's positioning ancestor is the viewport itself. Recomputed
  // whenever the popup opens (see the layout effect below); `null` before
  // the first computation, in which case nothing renders yet.
  const [popupBox, setPopupBox] = useState(null);

  function openPopup() {
    setOpen(true);
  }

  useLayoutEffect(() => {
    if (!open) return;

    function updatePopupBox() {
      const wrapperEl = wrapperRef.current;
      if (!wrapperEl) return;
      const wrapperRect = wrapperEl.getBoundingClientRect();
      const margin = 12;
      const width = Math.min(260, window.innerWidth - margin * 2);
      // Anchor edge follows reading direction (RTL: flush with the
      // trigger's left/start edge, growing right; LTR: flush with its
      // right/end edge, growing left) - matches DateBadge's popover, which
      // already branches the same way. This used to always anchor flush-
      // right regardless of language, so the two "shared" calendar popups
      // in the app anchored to opposite edges for RTL users.
      const isRtl = lang === "fa" || lang === "ar";
      let left = isRtl ? wrapperRect.left : wrapperRect.right - width;
      if (left < margin) left = margin;
      if (left + width > window.innerWidth - margin) left = window.innerWidth - margin - width;
      // Popup is ~320px tall at most; flip above the trigger when there
      // isn't room below (e.g. a date field near the bottom of a modal)
      // so it never forces the page/modal to scroll just to show the grid.
      const spaceBelow = window.innerHeight - wrapperRect.bottom;
      const upward = spaceBelow < 340 && wrapperRect.top > spaceBelow;
      const maxHeight = Math.max(200, (upward ? wrapperRect.top : window.innerHeight - wrapperRect.bottom) - 18);
      setPopupBox(
        upward
          ? { left, width, bottom: window.innerHeight - wrapperRect.top + 6, maxHeight }
          : { left, width, top: wrapperRect.bottom + 6, maxHeight }
      );
    }

    updatePopupBox();
    // A portaled `position:fixed` popup no longer moves with the page the
    // way an absolutely-positioned one (nested in normal document flow)
    // used to - scrolling the trigger out from under it would otherwise
    // leave the popup frozen in place while the trigger moves away
    // underneath, visually detaching the two. `capture:true` also catches
    // scrolling inside a nested scrollable ancestor (a modal body, a
    // table wrapper), not just the window itself. rAF-throttled so a fast
    // scroll gesture (which can fire far more raw scroll events than the
    // display's refresh rate) triggers at most one reposition - and one
    // grid rebuild, since `grid` isn't memoized - per frame, not one per
    // raw event.
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
  }, [open, lang]);

  // Resync the local draft text when the value/language changes from
  // outside (e.g. picking a day, the Today shortcut, or the parent
  // resetting the form) - done during render (React's documented pattern
  // for this) rather than in an effect, which would cause an extra
  // render pass.
  const [syncedKey, setSyncedKey] = useState(`${calendarSystem}:${value}`);
  const nextKey = `${calendarSystem}:${value}`;
  if (nextKey !== syncedKey) {
    setSyncedKey(nextKey);
    setText(displayFor(value));
    setCursor(cursorFromIso(value));
  }

  useEffect(() => {
    if (!open) return undefined;
    function handleOutside(event) {
      const insideWrapper = wrapperRef.current?.contains(event.target);
      // The popup is portaled to document.body, so it's no longer a DOM
      // descendant of `wrapperRef` - without also checking this, a click
      // on the popup itself (a day cell, the month nav, "Today") would
      // register as "outside" and close the calendar before its own
      // onClick handler runs.
      const insidePopup = popupContainerRef.current?.contains(event.target);
      if (!insideWrapper && !insidePopup) setOpen(false);
    }
    function handleEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function commit(nextText) {
    if (calendarSystem === "jalali") {
      const iso = fromJalali(nextText);
      if (iso) onChange(iso);
    } else if (calendarSystem === "hijri") {
      const iso = fromHijriText(nextText);
      if (iso) onChange(iso);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(nextText)) {
      onChange(nextText);
    }
  }

  function setToday() {
    const isoToday = new Date().toISOString().slice(0, 10);
    if (calendarSystem === "jalali") setText(todayJalali());
    else if (calendarSystem === "hijri") setText(todayHijri());
    else setText(isoToday);
    onChange(isoToday);
    setCursor(moment());
    setOpen(false);
  }

  function pickDay(iso) {
    onChange(iso);
    setOpen(false);
  }

  function goPrevMonth() {
    if (calendarSystem === "jalali") {
      setCursor((c) => c.clone().subtract(1, "jMonth"));
    } else if (calendarSystem === "hijri") {
      const { hijriYearMonth } = grid;
      const { year, month } = addHijriMonths(hijriYearMonth, -1);
      const g = hijriToGregorian(year, month, 1);
      setCursor(moment(new Date(g.year, g.month - 1, g.day)));
    } else {
      setCursor((c) => c.clone().subtract(1, "month"));
    }
  }

  function goNextMonth() {
    if (calendarSystem === "jalali") {
      setCursor((c) => c.clone().add(1, "jMonth"));
    } else if (calendarSystem === "hijri") {
      const { hijriYearMonth } = grid;
      const { year, month } = addHijriMonths(hijriYearMonth, 1);
      const g = hijriToGregorian(year, month, 1);
      setCursor(moment(new Date(g.year, g.month - 1, g.day)));
    } else {
      setCursor((c) => c.clone().add(1, "month"));
    }
  }

  // Only build the (moment-jalaali-driven, non-trivial) month grid while
  // the popup is actually visible - this field re-renders on every
  // keystroke in forms that hold it alongside other fields in one state
  // object, and recomputing the grid unconditionally on each of those
  // renders was the source of visible typing lag. Not memoized via
  // `useMemo`/a ref cache/a derived-state effect - all three are rejected
  // here by this project's lint rules (React Compiler can't preserve a
  // manual `useMemo` in this component; ref access during render and
  // setState-in-effect for derived state are both disallowed outright).
  // The scroll/resize listener below is rAF-throttled specifically so
  // this recomputes at most once per animation frame while the popup is
  // open, rather than once per raw scroll event - keeping this cheap
  // (~30 day-cells) recompute at a rate that was never the actual cost
  // the original typing-lag fix (many simultaneous form fields, every
  // keystroke) was guarding against.
  const grid = open ? buildGrid(calendarSystem, cursor, lang, country) : null;
  const coverage = open ? holidayCoverage(country, calendarSystem) : null;

  return (
    <div
      ref={wrapperRef}
      className={grouped ? ["vitalix-input-group", groupClassName].join(" ").trim() : undefined}
      style={{ position: "relative", ...(grouped ? {} : { display: "flex", gap: 8 }), ...style }}
    >
      <input
        type="text"
        inputMode="numeric"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onFocus={openPopup}
        placeholder={
          placeholder ||
          (calendarSystem === "jalali"
            ? "۱۴۰۵/۰۳/۰۹"
            : calendarSystem === "hijri"
            ? "1448/02/11"
            : tr("", "", "2026-05-30", "2026-05-30"))
        }
        className={grouped ? "min-w-0 flex-1" : className}
        style={
          grouped
            ? { border: 0, background: "transparent", outline: "none", boxShadow: "none", paddingInlineStart: 12, minWidth: "8em", color: "var(--erp-text)" }
            : { width: "100%", minWidth: "9.5em" }
        }
      />
      <Tooltip side="top" label={tr("انتخاب تاریخ", "اختيار التاريخ", "Tarih seç", "Choose date")}>
        <button
          type="button"
          onClick={() => (open ? setOpen(false) : openPopup())}
          aria-label={tr("انتخاب تاریخ", "اختيار التاريخ", "Tarih seç", "Choose date")}
          className={grouped ? "flex items-center justify-center shrink-0" : "bg-[var(--erp-accent)] flex items-center justify-center"}
          style={
            grouped
              ? { width: 36, height: 36, margin: 4, flexShrink: 0, borderRadius: "var(--erp-radius-sm)", background: "var(--erp-glow)", color: "var(--erp-accent)" }
              : { width: 44, height: 44, flexShrink: 0, borderRadius: "var(--erp-radius-lg)", color: "var(--erp-on-accent)" }
          }
        >
          <CalendarDays size={18} />
        </button>
      </Tooltip>

      {open && grid && popupBox && createPortal(
        <div
          ref={popupContainerRef}
          role="dialog"
          aria-label={tr("انتخاب تاریخ", "اختيار التاريخ", "Tarih seç", "Choose date")}
          dir={lang === "fa" || lang === "ar" ? "rtl" : "ltr"}
          className="border border-[var(--erp-border)] bg-[var(--erp-panel-solid)] p-3"
          style={{
            position: "fixed",
            left: popupBox.left,
            width: popupBox.width,
            top: popupBox.top,
            bottom: popupBox.bottom,
            maxHeight: popupBox.maxHeight,
            overflowY: "auto",
            // Portaled straight to document.body (see the createPortal
            // call above) instead of being an absolutely-positioned child
            // of the trigger - a Card's default overflow:hidden, or a
            // Modal's transform during its open/close animation (which
            // creates a new containing block for position:fixed
            // descendants), would otherwise clip or mis-anchor this
            // depending on which page/modal the field happens to sit in.
            // A high z-index is needed since it now competes at the root
            // stacking context level with Modal's own z-50 backdrop,
            // rather than inheriting whatever local stacking context the
            // trigger's ancestors set up.
            zIndex: 1000,
            borderRadius: "var(--erp-radius-lg)", boxShadow: "var(--erp-elevation-3), inset 0 1px 0 0 var(--erp-surface-highlight)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <button type="button" onClick={goPrevMonth} aria-label={tr("ماه قبل", "الشهر السابق", "Önceki ay", "Previous month")} className="rounded-lg bg-[var(--erp-panel-solid)] text-[var(--erp-text)] flex items-center justify-center" style={{ width: 26, height: 26 }}>
              <ChevronLeft size={14} />
            </button>
            <div className="text-[var(--erp-text)]" style={{ fontSize: 13, fontWeight: 800 }}>{grid.title}</div>
            <button type="button" onClick={goNextMonth} aria-label={tr("ماه بعد", "الشهر التالي", "Sonraki ay", "Next month")} className="rounded-lg bg-[var(--erp-panel-solid)] text-[var(--erp-text)] flex items-center justify-center" style={{ width: 26, height: 26 }}>
              <ChevronRight size={14} />
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
            {grid.weekdays.map((wd, index) => (
              <div
                key={index}
                style={{
                  textAlign: "center",
                  fontSize: 10,
                  fontWeight: 800,
                  padding: "2px 0",
                  color: WEEKEND_INDEXES[calendarSystem].includes(index) ? "var(--erp-accent-2)" : "var(--erp-muted)",
                }}
              >
                {wd}
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {grid.cells.map((cell, index) => {
              const outOfRange = cell && ((minDate && cell.iso < minDate) || (maxDate && cell.iso > maxDate));
              const isDisabled = !cell || outOfRange;
              return (
                <button
                  key={index}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => cell && !outOfRange && pickDay(cell.iso)}
                  aria-label={cell?.holiday ? `${cell.day} — ${cell.holiday.name}` : undefined}
                  data-side={cell?.holiday ? "top" : undefined}
                  className={[
                    cell?.isToday ? "bg-[var(--erp-accent)]" : "bg-transparent hover:enabled:bg-[var(--erp-glow)]",
                    cell?.holiday ? "vitalix-tooltip" : "",
                  ].filter(Boolean).join(" ")}
                  style={{
                    position: "relative",
                    aspectRatio: "1 / 1",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "visible",
                    boxSizing: "border-box",
                    padding: 0,
                    borderRadius: "var(--erp-radius-sm)",
                    border: "none",
                    fontSize: 12,
                    lineHeight: 1,
                    fontFamily: "inherit",
                    fontWeight: cell?.isToday ? 900 : 600,
                    color: !cell ? "transparent" : cell.isToday ? "var(--erp-on-accent)" : outOfRange ? "var(--erp-muted)" : (cell.holiday || cell.isWeekend) ? "var(--erp-accent-2)" : "var(--erp-text)",
                    opacity: outOfRange ? 0.4 : 1,
                    cursor: cell && !outOfRange ? "pointer" : "default",
                  }}
                >
                  {cell ? cell.label : ""}
                  {cell?.holiday && (
                    <span role="tooltip" className="vitalix-tooltip-bubble">{cell.holiday.name}</span>
                  )}
                  {cell?.holiday && !cell.isToday && (
                    // Centered via inset-inline-start/end + margin-inline:auto
                    // (not translateX, which is physical and doesn't flip for
                    // RTL - see the brand-logo-shimmer fix for the same class
                    // of bug) so it stays centered in both directions.
                    <span
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        bottom: 2,
                        insetInlineStart: 0,
                        insetInlineEnd: 0,
                        marginInline: "auto",
                        width: 3,
                        height: 3,
                        borderRadius: "50%",
                        background: "var(--erp-accent-2)",
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={setToday}
            className="w-full rounded-xl bg-[var(--erp-panel-solid)] text-[var(--erp-accent)] font-black"
            style={{ marginTop: 8, padding: "8px 0", fontSize: 12 }}
          >
            {tr("امروز", "اليوم", "Bugün", "Today")}
          </button>

          {/* Honest coverage note - an absence of holiday dots here isn't
              proof this jurisdiction has none; it means this calendar
              combination has no curated official-holiday data yet (see
              localization/holidays.js). Only shown when that's actually
              the case, so it never clutters a covered calendar. */}
          {coverage && !coverage.supported && (
            <div
              className="text-[var(--erp-muted)]"
              style={{ marginTop: 6, fontSize: 10, textAlign: "center", lineHeight: 1.4 }}
            >
              {tr(
                "تعطیلات رسمی این تقویم هنوز پوشش داده نشده است.",
                "تغطية العطلات الرسمية لهذا التقويم غير متوفرة بعد.",
                "Bu takvim için resmi tatil verisi henüz mevcut değil.",
                "Official holiday coverage isn't available for this calendar yet."
              )}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
