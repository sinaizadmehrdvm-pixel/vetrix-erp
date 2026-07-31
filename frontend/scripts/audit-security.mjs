import { spawnSync } from 'node:child_process';

const allowedAdvisories = new Map([
  [
    'GHSA-qwww-vcr4-c8h2',
    {
      packages: new Set(['react-router', 'react-router-dom']),
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
const blocked = [];
const accepted = [];
const vulnerabilities = report.vulnerabilities ?? {};

for (const [packageName, vulnerability] of Object.entries(vulnerabilities)) {
  if (!['high', 'critical'].includes(vulnerability.severity)) continue;

  const advisoryEntries = Array.isArray(vulnerability.via)
    ? vulnerability.via.filter((entry) => typeof entry === 'object' && entry !== null)
    : [];

  if (advisoryEntries.length === 0) {
    blocked.push({ packageName, advisory: 'unknown', title: vulnerability.title ?? 'High-severity vulnerability' });
    continue;
  }

  for (const advisory of advisoryEntries) {
    const id = advisory.url?.split('/').pop() ?? String(advisory.source ?? 'unknown');
    const exception = allowedAdvisories.get(id);
    const validException =
      exception && exception.packages.has(packageName) && today <= exception.expires;

    if (validException) {
      accepted.push({ packageName, id, expires: exception.expires, reason: exception.reason });
    } else {
      blocked.push({ packageName, advisory: id, title: advisory.title ?? 'High-severity vulnerability' });
    }
  }
}

if (accepted.length > 0) {
  console.log('Time-bounded security exceptions:');
  for (const item of accepted) {
    console.log(`- ${item.packageName}: ${item.id} (expires ${item.expires})`);
    console.log(`  ${item.reason}`);
  }
}

if (blocked.length > 0) {
  console.error('Unaccepted high or critical dependency vulnerabilities:');
  for (const item of blocked) {
    console.error(`- ${item.packageName}: ${item.advisory} — ${item.title}`);
  }
  process.exit(1);
}

console.log('Frontend dependency security gate passed.');
