# Vetrix ERP — Pilot Release Checklist

Pilot release: **v1.4.0-pilot.1**. Use this alongside `PILOT_DEPLOYMENT_GUIDE.md`.

## Before deployment

- [ ] Confirm `git status` clean, on the intended commit (`git log -1`)
- [ ] `.env` created from `.env.example` — never committed
- [ ] `VETRIX_ENV=production` set
- [ ] `VETRIX_JWT_SECRET` set to a real, random ≥32-character value (not the `.env.example` placeholder)
- [ ] `VETRIX_ALLOWED_ORIGINS` set to the pilot's exact frontend origin(s)
- [ ] `VETRIX_DATABASE_URL` points at a dedicated pilot DB path, not the dev default
- [ ] `VETRIX_BACKUP_DIR` points at a real, persistent, backed-up location
- [ ] `VETRIX_FRONTEND_URL` / `VETRIX_BACKEND_URL` set if online payments are enabled
- [ ] Provider secrets set for whichever integrations you're actually enabling (Telegram/WhatsApp/email/backup-trigger/payments) — see `PILOT_DEPLOYMENT_GUIDE.md` §1
- [ ] `npm run build` (frontend) and confirm it's the build being served
- [ ] Reverse proxy in front if internet-facing, with its own rate limiting (see deployment guide §8)

## First boot

- [ ] `GET /health` returns `{"status":"ok","database":"reachable"}`
- [ ] `GET /setup/status` shows `requires_admin: true` on a genuinely fresh instance
- [ ] Create the first admin account **immediately**, before exposing the port beyond your own network
- [ ] Log in, set a strong password, enable MFA if required by your policy
- [ ] Follow the first-run order in the deployment guide (Company Profile → Branches → Warehouses → Users → Financial settings → Products → Customers/Suppliers → Opening balances)
- [ ] Optionally run `scripts/seed_pilot_demo_data.py` for a training/demo instance only — never against real pilot data

## Roles & access (role-acceptance matrix)

Real roles in this codebase: `admin`, `accountant`, `sales`, `warehouse`, `viewer`, `user` (legacy read-only). Custom roles may be created but always inherit one base role's route rules (never grant more). There is no separate "Manager" or "Employee self-service" *login* role — HR self-service is a same-login boundary keyed to `linked_user_id` on the employee record, and external party self-service (customers/suppliers) is a **separate portal token mechanism**, not a user role.

| Role | Can | Cannot | Verified by |
|---|---|---|---|
| **admin** | Full company administration: users, RBAC, all accounting/inventory/CRM/reports, company profile, HR (including compensation) | Cannot invoke shared-database backup extraction unless also flagged `is_super_admin` (see below) | `test_...task06_p0_security_and_accounting_fixes`, HR lifecycle test |
| **accountant** | Customers, invoices, transactions, expenses, accounting entries, reports | HR compensation for others (self-service only), backup management, RBAC/user management | `ROLE_CAPABILITIES` in `app/rbac.py`; HR lifecycle test's manager/compensation-boundary assertions |
| **sales** | Customers, invoices, transactions, reports, sales pipeline, visitor module | HR compensation, backup management, accounting-entry posting | RBAC capability table; executive-agent test's role-denial assertions |
| **warehouse** | Products, inventory/stock, purchase orders, warehouse transfers, reports | Full accounting entries, HR, backup, user management | Multi-warehouse inventory test; PO receiving lifecycle test |
| **viewer** / **user** | Read-only across permitted modules | Any write action anywhere | Warehouse-management test's explicit viewer-403 assertion |
| **Employee self-service** (any logged-in user linked to an employee record via `linked_user_id`) | View/edit their own permitted HR fields, submit their own leave requests | Cannot view compensation unless also a manager/admin per `_can_view_compensation`; cannot see other employees' records | HR lifecycle test |
| **Customer/Supplier portal** (separate token, not a user role) | View their own invoices/ledger/balance only, via a revocable signed link | No access to any authenticated `/api/*` route at all | `app/customer_portal.py`, `app/supplier_portal.py` |

## Super-admin vs. tenant admin

Task 06 closed a real shared-database backup exfiltration by requiring `is_super_admin` (a flag independent of the per-company `admin` role) for both `app/backup/router.py` and `app/backup/delivery.py`. Verified in this task:

- [ ] A regular tenant `admin` (not super-admin) receives `403 Super-administrator access required` on `POST /api/backups`, `GET /api/backups`, and all backup-delivery endpoints — covered by `test_...task06_p0_security_and_accounting_fixes`.
- [ ] A tenant admin cannot list or access another company's data anywhere — covered by the multi-company isolation tests (`test_...cross_company_user_creation_and_isolation` and others).
- [ ] The frontend does not surface backup-management controls to a non-super-admin session (verify manually — no automated frontend test covers UI visibility, only the backend 403).
- [ ] Only the bootstrap (first-ever) user and users a super-admin explicitly promotes are super-admins — `POST /users` normalizes `is_super_admin` to `false` for a regular admin's own user-creation calls (see `app/users_routes.py`).

## Manual browser / visual / print acceptance

**No browser-automation tool was available in this task's environment** — the checks below were NOT executed; this is a checklist for a human tester, not a completed verification. Automated coverage stops at the HTTP/API layer (213 backend tests, all real end-to-end HTTP calls against the real app, but never rendering a page). Do not treat frontend `eslint`/`npm run build` success as UI verification — they check that the code compiles, not that it looks or behaves correctly.

### Screen sizes
- [ ] Desktop ~1366×768
- [ ] Large desktop 1920×1080
- [ ] Tablet ~768px
- [ ] Mobile ~360–390px

### Per-page checks (repeat for each size above)

Login, Dashboard, Products, Customers, Invoices, Purchase Orders, Warehouses, Smart Inventory, Executive Alerts, Budget Control, Reports, Catalog Manager, Online Commerce, Company Profile, Employees, Backup Recovery, Data Import, Improvement Center, Executive Agent, Settings:

- [ ] Navigation/sidebar usable, no clipped items
- [ ] Dropdowns/modals open, position correctly, close on Escape/backdrop click
- [ ] Forms submit, validation messages visible
- [ ] Tables scroll horizontally on narrow screens without breaking page layout; row numbers present
- [ ] No overlapping text/fields, no duplicate scrollbars
- [ ] No untranslated strings when switching language

### Language × direction × theme

- [ ] Persian (fa) — RTL, light and dark theme
- [ ] Arabic (ar) — RTL, light and dark theme
- [ ] Turkish (tr) — LTR, light and dark theme
- [ ] English (en) — LTR, light and dark theme

### Print acceptance

For each of: Invoice, Aging Report, Financial Statements, a Reports.jsx report, Budget report, Catalog PDF — in both fa/RTL and en/LTR, from at least one dark-theme source page:

- [ ] No blank extra page
- [ ] Company logo/title present
- [ ] Totals, headers, footer, page numbers, row numbers all present
- [ ] Print output stays light/professional even when printed from a dark-theme screen
- [ ] Date/currency formatting matches the active locale

## Known limitations for this pilot

Verified against the current code, not assumed:

- **STT/TTS/LLM providers**: not configured — the voice-ingestion pipeline accepts real audio uploads and stores/reviews them, but no speech-to-text or text-to-speech provider is wired in.
- **WhatsApp inbound**: webhook signature verification exists, but there is no conversational inbound handling beyond what's already built for Telegram-parity change requests.
- **POS/card-terminal execution**: a `pos_terminal_generic` provider key exists as a storable-but-not-yet-wired entry; initiating a transaction through it fails closed with a clear "not yet supported" message, never fakes success.
- **OCR**: requires `VETRIX_TESSERACT_CMD` pointing at a real Tesseract install; unavailable otherwise.
- **`budget_plans.py`'s versioning/approval workflow**: real, tested backend endpoints with no frontend page anywhere in the app (Task 07 finding) — `BudgetControl.jsx` is the sole reachable budget UI. Executive Alerts/BI/Executive Agent budget answers were repointed at the reachable data in Task 07 so this doesn't produce wrong numbers, but a dedicated versioned-budget UI does not exist.
- **Branch reorder-quantity math**: Smart Inventory's suggested-reorder-quantity and sales-velocity calculations still use company-wide sales history, not that branch's sales alone (disclosed in-app via the `scope.note` field, not hidden).
- **No background scheduler process**: scheduled backups/reports/reminders fire opportunistically on real authenticated traffic, or via an external HMAC-signed trigger endpoint you must wire to Windows Task Scheduler/cron yourself — there is no in-process cron.
- **Upload/document storage paths** are not independently configurable for a multi-instance or containerized deployment (see deployment guide §7) — fine for a single-machine pilot.
- **No log file/rotation** — stdout/stderr only; redirect it yourself (see deployment guide §5).
- **First-admin bootstrap race**: the very first `POST /users` call after deployment claims the admin account with no additional secret — create it immediately after deploy, before exposing the port.

## Monitoring plan (recommended for the pilot period)

- Poll `GET /health` every 1–5 minutes from your existing uptime tooling (or a simple cron+curl) — 200 = alive and DB reachable, 503 = DB unreachable.
- Redirect backend stdout/stderr to a rotated log file; grep for `ERROR`/`Unhandled exception` periodically until real log aggregation is set up.
- Check `GET /api/system/readiness` (admin login required) weekly for JWT config drift, table integrity, and backup-verification status.
- Verify at least one real backup + restore-test cycle (`POST /api/backups`, then `POST /api/backups/{filename}/restore-test`) weekly during the pilot — this task's own restore drill (see completion report) confirmed the mechanism works end-to-end and takes well under a second for a small database; re-verify at pilot-scale data volume periodically.
- Watch disk usage in the OS temp directory (report/export temp files are not auto-cleaned — see deployment guide §7).
