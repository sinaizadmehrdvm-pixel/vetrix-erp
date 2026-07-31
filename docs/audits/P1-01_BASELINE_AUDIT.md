# VETRIX ERP — P1-01 Baseline Audit

Status: completed as a repository evidence audit
Branch: `codex/priority-01-enterprise-foundation`
Baseline: `main` at `3466a5c72d150d393e656f40abca818510f0a792`

## Scope

This checkpoint establishes the current technical baseline before any enterprise-foundation migration. It records verified repository facts, critical risks, protected working behavior, and the required sequence for Priority 1.

## Verified architecture

- Frontend: React 19, Vite 8, React Router, Tailwind CSS, Axios, Recharts, Framer Motion, IndexedDB, jsPDF/html2canvas, Jalali date support and QR generation.
- Backend: FastAPI, SQLAlchemy, Pydantic, ReportLab, OpenPyXL, Pandas and JWT authentication.
- Default database: SQLite through `VETRIX_DATABASE_URL`, with PostgreSQL-compatible URL injection possible but no production migration framework yet.
- Authentication: bearer JWT, live user revalidation, role normalization, forced password-change support and request-level RBAC.
- Existing functional areas include customer, product, invoice, warehouse, receipt/payment, CRM, accounting, fiscal periods, statements, tax, aging, reconciliation, assets, budgets, currencies, approvals, treasury, audit, backup, health, commerce, imports and change requests.

## Existing verification evidence

Recent repository history reports the following checks passing before the current baseline merge:

- Frontend lint and production build.
- Frontend route audit: 42 lazy pages and 30 menu items.
- Backend unit suite: 73 tests.
- Python bytecode compilation.

These historical reports are useful evidence, but they are not a substitute for fresh CI on every new foundation change.

## Critical findings

### P0 — financial correctness

1. Authoritative financial and quantity fields still use Python/SQLAlchemy `Float` in core models and schema helpers.
2. Money must migrate to `Decimal` in Python and `NUMERIC/DECIMAL` in the database before broad feature expansion.
3. The migration must preserve existing values, define scale and rounding explicitly, and include regression tests.

### P0 — schema governance

1. Schema changes are currently performed with runtime SQLite `PRAGMA`/`ALTER TABLE` helpers and `CREATE TABLE IF NOT EXISTS` SQL.
2. There is no verified Alembic migration chain for reversible, testable production upgrades.
3. Runtime schema mutation must be retired after a safe migration baseline is introduced.

### P0 — tenancy and organizational isolation

1. Authentication and RBAC exist, but a complete tenant/legal-entity/branch data-isolation model is not yet evident across core tables.
2. Tenant and legal-entity scope must be stored and enforced server-side, not trusted from client payloads.
3. Existing single-company behavior must remain supported through an automatically provisioned default tenant and legal entity.

### P1 — database target

1. SQLite remains the default development database.
2. PostgreSQL must become the production reference database.
3. SQLite may remain temporarily for lightweight tests only if behavior differences are explicitly covered.

### P1 — application structure

1. `backend/main.py` currently combines application setup, middleware, settings model, runtime schema mutation, DTOs and broad endpoint behavior.
2. Refactoring must be incremental and behavior-preserving.
3. Foundation extraction should happen behind tests, not through a big-bang rewrite.

### P1 — frontend quality gates

1. The frontend package currently exposes build, lint and route/fetch audits.
2. A durable unit/integration/E2E test contract is required for subsequent checkpoints.
3. RTL/LTR and localized print behavior must be protected during backend migrations.

### P1 — CI

1. The latest baseline commit has no observed required GitHub status checks.
2. Priority 1 must end with automated backend and frontend checks on pull requests.

## Protected working behavior

The following must not regress during Priority 1:

- Existing login, password reset and forced password-change flows.
- Role-aware navigation and API authorization.
- Existing customer, product, invoice, payment and receipt CRUD.
- Balanced voucher posting and posted-record safeguards already covered by tests.
- Fiscal period, statements, tax, aging, reconciliation, asset, budget, currency, approval and treasury routes.
- Four-language and RTL/LTR behavior.
- Invoice print/PDF and template designer behavior.
- Audit, backup and system-health capabilities.
- Existing route contract.

## Priority 1 checkpoint order

1. **P1-02 — Testable application baseline**
   - Add one canonical backend verification command.
   - Add one canonical frontend verification command.
   - Add CI workflow without changing business behavior.

2. **P1-03 — Decimal money foundation**
   - Introduce shared decimal parsing, quantization and serialization.
   - Migrate authoritative financial calculations away from binary float.
   - Add precision regression tests.

3. **P1-04 — Alembic foundation**
   - Add migration configuration.
   - Capture the existing schema safely.
   - Add upgrade/downgrade verification.
   - Stop adding new runtime schema mutations.

4. **P1-05 — PostgreSQL compatibility**
   - Add supported PostgreSQL configuration.
   - Remove SQLite-only assumptions from production paths.
   - Run integration tests against PostgreSQL in CI.

5. **P1-06 — Tenant, legal entity and branch foundation**
   - Add canonical organization tables.
   - Provision a default organization for existing installations.
   - Introduce trusted request context.

6. **P1-07 — Scoped data isolation**
   - Add organization scope to priority business tables.
   - Enforce scope in repositories/services and APIs.
   - Add cross-tenant and cross-entity denial tests.

7. **P1-08 — Transaction and idempotency foundation**
   - Define transaction boundaries for critical writes.
   - Add idempotency records for invoice/posting/payment operations.

8. **P1-09 — Accounting integrity regression suite**
   - Expand double-entry, immutability, period, currency and reconciliation tests.

9. **P1-10 — Final foundation audit**
   - CI green.
   - Migration dry run and rollback verified.
   - Backup/restore verified.
   - No unresolved critical foundation defect.

## P1-02 exact acceptance criteria

The next checkpoint is complete only when:

- A GitHub Actions workflow runs frontend install, lint, route audit and build.
- The workflow runs backend dependency install, unit tests and compile checks.
- Commands are documented and reproducible locally.
- No application behavior is intentionally changed.
- Existing tests remain green.
- Any environment limitation is reported explicitly rather than hidden.

## Current checkpoint conclusion

P1-01 is complete as an evidence-based baseline audit. No production code was changed in this checkpoint. The next permitted work is P1-02: establish reproducible local and CI verification before financial-schema or tenancy migrations begin.
