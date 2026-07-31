# P1-02 — CI and Verification Baseline

## Scope

Establish reproducible frontend and backend verification before database, money, migration, or tenancy changes.

## Implemented

- Added `npm run verify` for frontend lint, direct-fetch inventory, route/translation contract audit, and production build.
- Added `npm run verify:security` using a policy-aware high/critical dependency gate.
- Updated GitHub Actions to run on `main`, `agent/**`, and `codex/**` changes.
- Added workflow concurrency cancellation and explicit timeouts.
- Preserved backend validation with Python 3.12, dependency checks, unit tests, and compile validation.
- Applied compatible dependency remediations to the lockfile.

## Security exception

`GHSA-qwww-vcr4-c8h2` is accepted only for `react-router` until 2026-09-30 because this application uses client-only `BrowserRouter` and does not enable React Server Components, server actions, SSR action processing, or framework-mode action endpoints covered by the advisory.

The exception is code-enforced, package-scoped, advisory-scoped, time-bounded, and fails closed for every other high or critical advisory.

## Verified evidence

- Frontend lint: passed.
- Direct-fetch inventory audit: passed; 49 known calls are reported for later consolidation.
- Route/translation contract audit: passed; 42 lazy pages and 30 menu items.
- Frontend production build: passed.
- Policy-aware dependency security gate: passed after compatible lockfile remediation.
- Backend unit tests: passed.
- Backend dependency check: passed.
- Backend compile validation: passed.
- Windows packaging workflow: passed on the checkpoint branch before the bot-authored lockfile commit.

## Remaining non-blocking debt

- Replace the temporary React Router exception before its expiry or reassess against application architecture and upstream patched releases.
- Consolidate direct fetch calls behind the shared API client in a later architecture checkpoint.
- Add broader frontend component and browser E2E coverage after the foundation migrations have stabilized.

## Exit criteria

P1-02 is complete when a final human-authored branch commit reports green Vetrix CI and Windows Package checks using the remediated lockfile.
