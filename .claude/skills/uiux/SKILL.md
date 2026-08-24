---
description: VITALIX design-system work — redesigning a page/component to match the VITALIX visual language, running the static UI-consistency audit, scoping a shared-component migration, or requesting the final visual QA pass. Use for any UI/UX request on this app (colors, spacing, components, sidebar, motion, branding, dark/light, RTL).
---

# VITALIX UI/UX Skill

Canonical spec: **`.claude/vitalix/DESIGN_SYSTEM.md`** — read it fully
before doing anything below. Do not restate it inline in conversation or
in other files; reference the path instead (keeps token usage low).

This skill covers four workflows. Pick the one matching the request (the
user may say the word directly - "redesign", "audit", "migrate",
"review" - or just describe the task; infer from that).

## A) Redesign

A page/component needs to look VITALIX-consistent (new UI, or bringing
an existing page in line).

1. Read `.claude/vitalix/DESIGN_SYSTEM.md` §§1-7.
2. Read only the target file(s) - do not scan the repo broadly.
3. Reuse shared components/tokens (§2-3). Never hand-roll a color,
   radius, shadow, or a component that already exists.
4. Follow the CLAUDE.md core principles: smallest possible diff, don't
   touch unrelated pages, don't rewrite working logic.
5. `npm run lint && npm run build` on the touched files/whole project
   before reporting done.

## B) Visual audit

"Does this page/the app look right" - a QA pass, not a code change.

1. Run the static scan first (cheap, deterministic):
   `cd frontend && npm run audit:ui` (whole app) or
   `node scripts/vitalix-ui-audit.mjs <path>` (one file/dir).
2. For an actual rendering-level judgment (symmetry, spacing, contrast,
   dark/light, RTL, motion) - not just grep-able smells - dispatch the
   `vitalix-ui-reviewer` agent (see `.claude/agents/vitalix-ui-reviewer.md`)
   with the target page(s)/diff.
3. Report BLOCKER / MAJOR / POLISH, merging both sources.

## C) Shared-component migration audit

Scoping *which* pages are worth migrating to shared primitives, per
DESIGN_SYSTEM.md §8 / the migration principle in CLAUDE.md: never
blindly rewrite 80+ pages.

1. `node scripts/vitalix-ui-audit.mjs` (no arg = whole app).
2. Rank by BLOCKER count first (real UX bugs: `alert()`/`confirm()`,
   raw `<select>`), then MAJOR density per file.
3. Propose a short, ordered list of genuine outliers - not a full
   rewrite plan. Wait for confirmation before touching more than a
   couple of files.

## D) Final UI reviewer

Explicit request for a review pass after implementation work (this
session's or someone else's). Dispatch the `vitalix-ui-reviewer` agent
(`.claude/agents/vitalix-ui-reviewer.md`) with the diff or page list;
relay its BLOCKER/MAJOR/POLISH report back verbatim - don't re-summarize
away specifics.

## Guardrails (all four workflows)

- Never touch accounting/business logic, API contracts, DB schema, RBAC,
  or calculations - this is UI-only.
- Never fabricate dashboard/chart data.
- CSS variable references (`var(--erp-*)`) work fine in inline styles
  *and* SVG presentation attributes in this codebase (recharts usage
  already relies on it) - don't reach for hardcoded hex "to be safe."
