import { spawnSync } from 'node:child_process';

const allowedAdvisories = new Map([
  [
    'GHSA-qwww-vcr4-c8h2',
    {
      packages: new Set(['react-router']),
      expires: '2026-09-30',
      reason:
        'VETRIX ERP uses React Router as a client-only BrowserRouter application and does not enable React Server Components, server actions, SSR action processing, or framework-mode action endpoints affected by this advisory.',
    },
  ],
]);

const result = spawnSync('npm', ['audit', '--json'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  shell: process.platform === 'win32',
});

const raw = result.stdout?.trim();
if (!raw) {
  console.error('Security audit did not return JSON output.');
  if (result.stderr) console.error(result.stderr.trim());
  process.exit(1);
}

let report;
try {
  report = JSON.parse(raw);
} catch (error) {
  console.error('Security audit returned invalid JSON.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const vulnerabilities = report.vulnerabilities ?? {};
const decisions = new Map();

function evaluate(packageName, stack = new Set()) {
  if (decisions.has(packageName)) return decisions.get(packageName);
  if (stack.has(packageName)) return { accepted: false, details: [`dependency cycle at ${packageName}`] };

  const vulnerability = vulnerabilities[packageName];
  if (!vulnerability || !['high', 'critical'].includes(vulnerability.severity)) {
    return { accepted: true, details: [] };
  }

  const nextStack = new Set(stack).add(packageName);
  const via = Array.isArray(vulnerability.via) ? vulnerability.via : [];
  const details = [];
  let accepted = via.length > 0;

  for (const entry of via) {
    if (typeof entry === 'string') {
      const dependencyDecision = evaluate(entry, nextStack);
      if (!dependencyDecision.accepted) accepted = false;
      details.push(...dependencyDecision.details);
      continue;
    }

    if (typeof entry !== 'object' || entry === null) {
      accepted = false;
      details.push(`${packageName}: unknown advisory`);
      continue;
    }

    const id = entry.url?.split('/').pop() ?? String(entry.source ?? 'unknown');
    const exception = allowedAdvisories.get(id);
    const validException =
      exception && exception.packages.has(packageName) && today <= exception.expires;

    if (validException) {
      details.push(`${packageName}: ${id} accepted until ${exception.expires} — ${exception.reason}`);
    } else {
      accepted = false;
      details.push(`${packageName}: ${id} — ${entry.title ?? 'High-severity vulnerability'}`);
    }
  }

  const decision = { accepted, details: [...new Set(details)] };
  decisions.set(packageName, decision);
  return decision;
}

const blocked = [];
const accepted = [];
for (const [packageName, vulnerability] of Object.entries(vulnerabilities)) {
  if (!['high', 'critical'].includes(vulnerability.severity)) continue;
  const decision = evaluate(packageName);
  const target = decision.accepted ? accepted : blocked;
  target.push(...decision.details);
}

if (accepted.length > 0) {
  console.log('Time-bounded security exceptions:');
  for (const detail of [...new Set(accepted)]) console.log(`- ${detail}`);
}

if (blocked.length > 0) {
  console.error('Unaccepted high or critical dependency vulnerabilities:');
  for (const detail of [...new Set(blocked)]) console.error(`- ${detail}`);
  process.exit(1);
}

console.log('Frontend dependency security gate passed.');
