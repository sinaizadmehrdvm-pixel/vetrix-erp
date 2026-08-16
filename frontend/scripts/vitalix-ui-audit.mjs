// Static-analysis audit for VITALIX design-system consistency. Grep-based
// on purpose (no visual/rendering checks - that's the vitalix-ui-reviewer
// agent's job, see .claude/agents/vitalix-ui-reviewer.md and
// .claude/vitalix/DESIGN_SYSTEM.md §8 for the smell list this implements).
//
// Usage:
//   node scripts/vitalix-ui-audit.mjs                 # scan src/{pages,components,widgets,charts,invoice,designer}
//   node scripts/vitalix-ui-audit.mjs src/pages/Foo.jsx   # scan one file (or a directory)
//
// Exit code: 1 if any BLOCKER finding exists, else 0 (MAJOR/POLISH never
// fail the run - this is a report, not a merge gate).

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const SCAN_EXTENSIONS = new Set([".jsx", ".js"]);
const DEFAULT_ROOTS = ["src/pages", "src/components", "src/widgets", "src/charts", "src/invoice", "src/designer", "src/analytics", "src/smart", "src/timeline", "src/search", "src/export"];

// Files that legitimately define or special-case the tokens themselves -
// never flagged for hardcoded colors.
const COLOR_ALLOWLIST = [
  path.normalize("src/components/ui/tones.js"),
  path.normalize("src/theme/themes.js"),
];

async function walk(root) {
  const files = [];
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
      files.push(...(await walk(full)));
    } else if (SCAN_EXTENSIONS.has(path.extname(entry.name)) && !entry.name.endsWith(".test.jsx") && !entry.name.endsWith(".test.js")) {
      files.push(full);
    }
  }
  return files;
}

async function resolveTargets(arg) {
  if (!arg) {
    const lists = await Promise.all(DEFAULT_ROOTS.map((root) => walk(root)));
    return lists.flat();
  }
  const info = await stat(arg).catch(() => null);
  if (!info) return [];
  if (info.isDirectory()) return walk(arg);
  return [arg];
}

function lineOf(source, index) {
  return source.slice(0, index).split("\n").length;
}

function findAll(source, regex) {
  const matches = [];
  for (const match of source.matchAll(regex)) {
    matches.push({ index: match.index, text: match[0], groups: match });
  }
  return matches;
}

const findings = { BLOCKER: [], MAJOR: [], POLISH: [] };

function report(severity, file, line, message) {
  findings[severity].push({ file, line, message });
}

function auditFile(file, source) {
  const rel = path.normalize(file);

  // BLOCKER - browser dialogs instead of toast/Modal. confirmService.js is
  // the shared replacement's own implementation (window.confirm/prompt as
  // its last-resort fallback if the host isn't mounted) - not a bypass.
  if (!rel.endsWith(path.normalize("components/ui/confirmService.js"))) {
    for (const m of findAll(source, /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/g)) {
      report("BLOCKER", rel, lineOf(source, m.index), `Browser dialog ${m.text.trim()} - use toast/Notice or shared Modal instead`);
    }
  }

  // BLOCKER - raw <select>, bypassing the shared Select popup component.
  if (!rel.endsWith(path.normalize("components/ui/Select.jsx")) && !rel.endsWith(path.normalize("components/ui/Field.jsx"))) {
    for (const m of findAll(source, /<select[\s>]/g)) {
      report("BLOCKER", rel, lineOf(source, m.index), "Raw <select> - use components/ui/Select.jsx (native listbox can't be corner-rounded)");
    }
  }

  const colorAllowed = COLOR_ALLOWLIST.some((allowed) => rel.endsWith(allowed));
  if (!colorAllowed) {
    // MAJOR - hardcoded hex colors outside the token system.
    for (const m of findAll(source, /#[0-9a-fA-F]{3}\b|#[0-9a-fA-F]{6}\b/g)) {
      report("MAJOR", rel, lineOf(source, m.index), `Hardcoded hex color ${m.text} - use a var(--erp-*) token`);
    }
    // MAJOR - hardcoded rgb()/rgba() literals.
    for (const m of findAll(source, /\brgba?\([^)]*\)/g)) {
      report("MAJOR", rel, lineOf(source, m.index), `Hardcoded ${m.text.split("(")[0]}(...) - use a var(--erp-*) token`);
    }
  }

  // MAJOR - native title tooltip on an icon-only button (proxy: <button
  // with a title= prop; shared Tooltip should wrap it instead).
  for (const m of findAll(source, /<button[^>]*\btitle=/g)) {
    report("MAJOR", rel, lineOf(source, m.index), "Icon-only <button title=...> - wrap with components/ui/Tooltip instead of relying on the native title tooltip");
  }

  // MAJOR - bare loading text instead of Skeleton/VitalixLoader.
  for (const m of findAll(source, />(?:\s*)(?:Loading\.\.\.|در حال بارگذاری)(?:\s*)</g)) {
    report("MAJOR", rel, lineOf(source, m.index), "Bare loading text - use components/ui/Skeleton or components/brand/VitalixLoader");
  }

  // POLISH - arbitrary numeric border-radius outside the 3-step scale.
  for (const m of findAll(source, /border[Rr]adius:\s*["']?(\d+)(?:px)?["']?/g)) {
    const value = Number(m.groups[1]);
    if (![8, 12, 16, 24].includes(value)) {
      report("POLISH", rel, lineOf(source, m.index), `Arbitrary border-radius ${value}px - use var(--erp-radius-sm|md|lg)`);
    }
  }

  // POLISH - fixed pixel widths that risk mobile overflow.
  for (const m of findAll(source, /\bwidth:\s*["']?(\d{3,})px["']?/g)) {
    if (Number(m.groups[1]) >= 400) {
      report("POLISH", rel, lineOf(source, m.index), `Fixed width ${m.groups[1]}px - verify it doesn't overflow at 360-390px viewports`);
    }
  }

  // POLISH - raw <button> not using the shared component (informational
  // count only; the global .erp-main button CSS rule already keeps these
  // visually consistent, so this is a migration backlog, not a bug).
  const rawButtons = findAll(source, /<button[\s>]/g).length;
  if (rawButtons > 0 && !rel.includes(path.normalize("components/ui/"))) {
    report("POLISH", rel, 1, `${rawButtons} raw <button> element(s) - candidates for components/ui/Button.jsx migration (variant/loading-state consistency)`);
  }
}

async function main() {
  const arg = process.argv[2];
  const targets = await resolveTargets(arg);
  if (!targets.length) {
    console.error(`No files found to scan (arg: ${arg || "<default roots>"}). Run from the frontend/ directory.`);
    process.exit(1);
  }

  for (const file of targets) {
    const source = await readFile(file, "utf8").catch(() => null);
    if (source == null) continue;
    auditFile(file, source);
  }

  const total = findings.BLOCKER.length + findings.MAJOR.length + findings.POLISH.length;
  console.log(`VITALIX UI audit - ${targets.length} file(s) scanned, ${total} finding(s)\n`);

  for (const severity of ["BLOCKER", "MAJOR", "POLISH"]) {
    const items = findings[severity];
    if (!items.length) continue;
    console.log(`${severity} (${items.length})`);
    for (const item of items) {
      console.log(`  ${item.file}:${item.line}  ${item.message}`);
    }
    console.log("");
  }

  if (!total) console.log("No findings.");
  if (findings.BLOCKER.length) process.exit(1);
}

main();
