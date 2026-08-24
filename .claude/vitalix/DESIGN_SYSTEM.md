# VITALIX Design System — canonical spec

Single source of truth for VITALIX ACCOUNTING's visual language. Skills/
agents/commands reference this file by path instead of repeating it —
read it fully before any redesign, audit, or review task. It documents
what the codebase actually does today; keep it in sync when the system
changes instead of letting pages drift from it.

## 1. Brand

- Name: **VITALIX** / **VITALIX ACCOUNTING** (never translated, never
  redrawn, never mirrored in RTL).
- Assets: `frontend/src/assets/brand/vitalix-logo-full.png` (master,
  square, opaque dark background) and `vitalix-logo-icon.png` (square
  icon/card composition). Real approved files — do not regenerate unless
  explicitly asked; if either is ever missing, a build-safe placeholder
  is preferable to a broken import (see git history for the generator
  script pattern used previously).
- Component: `frontend/src/components/brand/BrandLogo.jsx` —
  `variant="full|compact|icon"`, `animated`, `size`. Never copy logo
  `<img>`/shimmer markup into a page; always use this component.
  - `full`: hero placements (Login). Has the idle dual-tone ambient aura.
  - `compact`: icon + "VITALIX"/"ACCOUNTING" text lockup (expanded
    Sidebar, mobile header).
  - `icon`: mark only, cropped/zoomed for legibility at small sizes
    (collapsed Sidebar, favicon-adjacent contexts).
- Motion: a translated+skewed light-sweep band (`.brand-logo-shimmer` in
  `index.css`) — not a spinning logo, not a filter/blur animation.
  Respects `prefers-reduced-motion` (falls back to a static glow).
- `frontend/src/components/brand/VitalixLoader.jsx` is the branded
  loader (page/inline variants) — reuses BrandLogo's own shimmer, never
  a plain spinner or bare "Loading..." text for app-level loading states.

## 2. Design tokens (`frontend/src/index.css`, `:root`)

Extend these; never hardcode a hex color or ad hoc radius/shadow value in
a page. `:root[data-theme="..."]` blocks override per theme (default
"midnight" = VITALIX, plus ocean/emerald/violet/rose/gold/light presets
selectable via the theme switcher).

- Color: `--erp-bg`, `--erp-bg-soft`, `--erp-panel`, `--erp-panel-solid`,
  `--erp-text`, `--erp-muted`, `--erp-accent` (cyan), `--erp-accent-2`
  (copper/gold), `--erp-border`, `--erp-glow`, `--erp-glow-soft`,
  `--erp-glow-strong`.
- Status: `--erp-success(-soft)`, `--erp-warning(-soft)`,
  `--erp-danger(-soft)` — via `components/ui/tones.js`, used by
  Badge/Notice. "Info" reuses `--erp-accent` (no separate token, so every
  theme preset's own hue stays coherent).
- Shape: `--erp-radius-sm` (8px, inputs/badges), `--erp-radius-md` (12px,
  buttons), `--erp-radius-lg` (16px, cards) — 3 steps only, never a
  fourth ad hoc value. Login's card is the one deliberate exception at
  24px (documented inline as a hero-surface override).
- Depth: `--erp-shadow` (= `--erp-elevation-1`, resting), `--erp-elevation-2`
  (hover/raised), `--erp-elevation-3` (modal/floating).
- Motion: `--erp-duration-fast` (150ms, hover/tooltip), `-base` (220ms,
  Sidebar/card transitions), `-slow` (320ms), `--erp-ease`
  (`cubic-bezier(.4,0,.2,1)`).

## 3. Shared components — use these, never hand-roll

All in `frontend/src/components/ui/` unless noted. A page inventing its
own button/card/modal styling is an audit BLOCKER/MAJOR (see §8).

- **Button** (`Button.jsx`): `variant="primary|secondary|ghost|danger|success|accent"`,
  `size="default|sm"`, `loading`, `icon`. Primary/accent get the hover
  light-sweep automatically.
- **Card** (`Card.jsx`): `icon`, `title`, `action`, `padding`, `hover`
  (elevation lift), `accent` (gradient border). Default props keep every
  existing usage unchanged.
- **Field / Input / Select / Textarea** (`Field.jsx`): unified control
  chrome, label/hint/error slots.
- **Select** (`Select.jsx`): app-styled dropdown popup (never a raw
  `<select>` — Windows/Chrome cannot round a native listbox). Popup
  width grows to fit content (`min-width:100%; width:max-content`), so
  long option labels don't truncate.
- **Modal** (`Modal.jsx`): fade+scale open/exit via framer-motion
  `AnimatePresence`. **Must be rendered unconditionally with the `open`
  prop toggling visibility** (`<Modal open={x} onClose={...}>`) — a
  caller that conditionally mounts it (`{x && <Modal>}`) skips the exit
  animation entirely.
- **Table** (`Table.jsx`): `Table/Thead/Th/SortableTh/Tbody/Tr/Td/EmptyRow/SkeletonRows`.
  Row numbering convention: leading `<Td className="text-[var(--erp-muted)] font-bold">{n(startIndex+index+1)}</Td>`.
- **Tabs** (`Tabs.jsx`): underline-style, `tabs=[{id,label,icon?}]`.
- **Badge** (`Badge.jsx`): `tone="success|warning|danger|info|neutral"`.
- **Tooltip** (`Tooltip.jsx`): CSS-only, `side="top|end"`. Required on
  every icon-only control (no visible text label).
- **Skeleton** (`Skeleton.jsx`, `Table.jsx`'s `SkeletonRows`): use in
  place of "Loading..." text or a blank box.
- **Notice** (`Notice.jsx`): banner-style status message.

Digits: Persian-locale text must render Persian numerals. Use `n()`
(from `useLanguage()`) for real numeric formatting (Intl-backed, handles
thousands separators), or `toPersianDigits()`/`cleanNumberInput()` from
`localization/helpers.js` for free-text fields that hold digits (names,
codes, phone numbers) — never leave a Latin digit on screen when
`language === "fa"`, except inside `email`/`website`/technical-code
fields where mutating digits would break the value.

## 4. Sidebar (`frontend/src/components/Sidebar.jsx`)

- Brand zone (logo + theme/collapse toggles) is visually separated from
  nav via its own bottom border — logo must never be overlapped by any
  control.
- Expanded: `BrandLogo variant="compact"`. Collapsed: `variant="icon"`,
  centered, own row (not squeezed next to the toggle buttons).
- Active nav item: soft tinted background (`var(--erp-glow)`) +
  accent-colored icon/text + a `borderInlineStart` accent strip — never
  a full saturated gradient fill.
- Hover: `.sidebar-menu-item:hover` in index.css — RTL-aware `translateX`
  (`[dir="ltr"]`/`[dir="rtl"]` scoped, since `transform: translateX()` is
  physical, not logical) + tint. Never inline (NavLink's style-function
  can't express `:hover`).
- Labels stay mounted through collapse/expand and animate
  opacity+max-width (not conditionally unmounted) so the ~220ms width
  transition doesn't pop text.
- Every collapsed-mode nav item and icon-only toolbar button wrapped in
  `Tooltip` (`side="end"` — logical `inset-inline-start`, points toward
  main content regardless of which physical side the Sidebar sits on).

## 5. Motion rules

- GPU-friendly only: `transform`, `opacity`, `background-position` (used
  sparingly, only for slow/low-opacity ambient drift), pseudo-elements,
  `mask`. Never animate `width`/`height`/`box-shadow` continuously, and
  never animate `filter: blur()` itself (a *static* blur behind an
  opacity/transform-animated element is fine — the blur is rasterized
  once and composited, not recomputed per frame).
- Every custom `@keyframes`-driven animation in `index.css` has a
  matching `@media (prefers-reduced-motion: reduce)` block that disables
  it and substitutes a static equivalent. Copy that pattern for new ones
  — don't rely solely on the blanket `animation-duration:.01ms` rule at
  the top of `index.css` (it neutralizes CSS animations but **not**
  framer-motion's JS-driven ones; components using `motion.*` must call
  `useReducedMotion()` themselves, as Modal/MainLayout do).
- Page transitions: `MainLayout.jsx` wraps `<Outlet/>` in
  `AnimatePresence` keyed on `location.pathname` (fade + translateY,
  ~200ms, `mode="wait"`).

## 6. Dashboard & charts

- Real data only — never fabricate metrics/series.
- KPI cards: icon + label + value (+ delta/context where the data
  exists). Color logic follows the tone system (§3 Badge), not ad hoc
  colors.
- Recharts usage (`frontend/src/charts/`): pull every stroke/fill/grid/
  tooltip color from `var(--erp-*)` tokens (SVG presentation attributes
  and inline styles both resolve CSS custom properties fine in this
  codebase — see `SalesChart.jsx`). A hardcoded hex tooltip background is
  the classic bug (it looks fine in dark mode and breaks in light mode,
  or vice versa) — always check both themes.
- Empty/loading/error states required for every chart — use `Skeleton`
  while loading, a Notice/EmptyRow-style message for empty/error, never
  a blank box.

## 7. RTL / LTR

- Prefer logical CSS properties (`inset-inline-start/end`,
  `border-inline-start`, `margin-inline-*`) over physical ones
  (`left/right`) wherever the property has a logical form — they
  auto-flip with `dir`.
- `transform: translateX()` does **not** auto-flip — any hover/motion
  effect using it needs an explicit `[dir="rtl"]` override (see Sidebar
  §4).
- `dir` is set on `<html>`/`<body>` by `App.jsx` from `useLanguage()`;
  components read `dir` from the same hook, never hardcode `"ltr"`.
- The brand logo image itself must never be mirrored/flipped for RTL.

## 8. Audit smells (what `frontend/scripts/vitalix-ui-audit.mjs` checks)

See the script for the authoritative, current list and severity
mapping. Conceptually: raw `<button>`/`<select>` where the shared
component exists, hardcoded hex/`rgb(`/`rgba(` colors outside
`index.css`/`tones.js`, arbitrary `border-radius` values outside the
3-step scale, `window.alert(`/`confirm(` instead of toast/Modal, native
`title=` tooltips on icon-only controls instead of `Tooltip`, a bare
"Loading..." string instead of `Skeleton`/`VitalixLoader`, and
`transform: translateX` without an adjacent `[dir="rtl"]` rule in the
same file.
