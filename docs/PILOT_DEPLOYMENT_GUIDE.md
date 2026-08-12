# Vetrix ERP — Pilot Deployment Guide

Pilot release: **v1.4.0-pilot.1** (Task 08). This guide covers deployment configuration, secrets, database strategy, and operational readiness for running a real, controlled pilot. It is not a general feature reference — see `RUNNING.md` and `WINDOWS_INSTALL.md` for day-to-day usage.

## 1. Environment variables

Copy `.env.example` to `.env` and edit it — **never commit a real `.env`** (already gitignored). Classification:

### Required for any real (non-localhost) deployment

| Variable | Purpose | Default if unset |
|---|---|---|
| `VETRIX_ENV` | Gates production-only enforcement (JWT secret strength, CORS regex fallback, release-preflight blockers). **Must be set to `production`** — it defaults to `development`, and nothing else forces this. | `development` |
| `VETRIX_JWT_SECRET` | Signs session tokens. Must be a real random string ≥32 characters — not empty, not the `.env.example` placeholder. Fails closed (refuses to start) in production if missing/weak. | none (dev-only random fallback, never used in production) |
| `VETRIX_ALLOWED_ORIGINS` | Comma-separated exact origins allowed to call the API with credentials. | 4 localhost/127.0.0.1 origins on ports 5173/5174 |
| `VETRIX_DATABASE_URL` | SQLAlchemy connection string. **SQLite is a hard architectural dependency** — `app/backup/auto_backup.py` only works against a SQLite file; switching engines breaks the backup feature entirely. | `sqlite:///./vetrix.db` (relative to process CWD) |
| `VETRIX_FRONTEND_URL` / `VETRIX_BACKEND_URL` | Used to build payment-provider redirect/callback URLs. Both default to `localhost` — **must be overridden** if online payments are enabled, or callbacks will silently point at the wrong host. | `http://localhost:5173` / `http://localhost:8000` |

### Optional (safe defaults)

`VETRIX_BACKUP_DIR`, `VETRIX_BACKUP_RETENTION`, `VETRIX_AUTO_BACKUP_HOURS`, `VETRIX_TOKEN_HOURS`, `VETRIX_BACKUP_DOWNLOAD_MINUTES` (15–60, default 30), `VETRIX_LOG_LEVEL` (default `INFO`), `VETRIX_UPLOAD_DIR` (change-request voice/audio only — relative to CWD by default).

### Provider-specific (only required if that integration is actually used — the app starts fine with none of these set; the specific feature 503s with a clear message until configured)

- Backup external trigger: `VETRIX_BACKUP_TRIGGER_SECRET` (≥24 chars)
- Telegram inbound webhook: `VETRIX_TELEGRAM_WEBHOOK_SECRET`
- WhatsApp inbound webhook: `VETRIX_WHATSAPP_APP_SECRET`, `VETRIX_WHATSAPP_VERIFY_TOKEN`
- Voice ingestion: `VETRIX_VOICE_ALLOWED_CHAT_IDS`, `VETRIX_VOICE_SERVICE_USER_ID`
- Storefront sync: `VETRIX_STOREFRONT_SYNC_SECRET`
- Campaign delivery: `VETRIX_CAMPAIGN_DELIVERY_SECRET`
- Payments: `VETRIX_PAYMENT_PROVIDER`, `VETRIX_ZARINPAL_MERCHANT_ID` (legacy fallback — prefer the DB-backed Settings > Payment Integrations UI)
- Email: `VETRIX_SMTP_HOST/PORT/USER/PASSWORD/FROM` (fallback — prefer per-company Settings UI)
- Iran e-invoice: `VETRIX_EINVOICE_PROVIDER`
- OCR: `VETRIX_TESSERACT_CMD` (path to the `tesseract` binary; OCR is otherwise unavailable)

Telegram bot tokens and WhatsApp phone-number-ID/access-tokens are **not env vars** — they're configured per-company in Settings, DB-stored, fail closed until set.

## 2. Database strategy

Use **four distinct SQLite files**, never share one:

1. **Development**: default `./vetrix.db` under `backend/`.
2. **Automated tests**: each test file sets its own isolated `VETRIX_DATABASE_URL` (temp file or in-memory) — already established, never touches a real file.
3. **Pilot**: a dedicated path outside the source tree, e.g. `VETRIX_DATABASE_URL=sqlite:////var/vetrix/pilot.db` (Linux) or an absolute Windows path under `%LOCALAPPDATA%\VetrixERP\`. Set this explicitly in the pilot's `.env` — do not rely on the relative default.
4. **Backups**: `VETRIX_BACKUP_DIR`, distinct from the live DB's directory if possible (e.g. a separate mounted volume for a real deployment).

**Fresh-instance verification**: confirmed empirically in this task — `scripts/seed_pilot_demo_data.py` run against a brand-new, empty database file boots the schema deterministically (every Task 01–07 schema addition included, since the same `ensure_database_schema()` startup path that development uses runs identically), with no manual migration step. No sample/test records exist in a fresh instance; the only way demo data appears is by explicitly running the seed script (see below).

## 3. Optional demo/seed data

`scripts/seed_pilot_demo_data.py` populates a running instance with a realistic, clearly-tagged (`DEMO`) dataset: 2 branches, 3 warehouses, 5 role-representative users, 3 products with branch-split stock (one deliberately low), 2 customers (consent opt-in/opt-out) + 1 supplier, a pricing rule, a fiscal period + an intentionally over-budget voucher (so a real BI finding/alert/improvement-action-plan exist), an invoice with partial settlement, a dispatched+partially-received purchase order, a receivable cheque, a branch-scoped catalog, and an employee with a leave request.

```
python scripts/seed_pilot_demo_data.py --base-url http://127.0.0.1:8001 --yes
```

Refuses to run without `--yes`; refuses against an already-initialized database without `--i-understand-this-is-not-a-fresh-database`; refuses against a server reporting `VETRIX_ENV=production` without `--i-understand-this-is-production`. Verified end-to-end against a live server instance during this task, including the double-run safety refusal.

## 4. Health & readiness

- `GET /health` — **public, unauthenticated**, minimal liveness probe for a load balancer/uptime monitor/container orchestrator. Returns `{status, database, version, pilot_release_id}` only — no secrets, paths, or DB contents. Newly added in this task (the path was already reserved in `PUBLIC_PATHS` but nothing implemented it).
- `GET /api/system/health` and `GET /api/system/readiness` — admin-only, detailed diagnostics (JWT config status, backup verification, table counts, audit-chain integrity). Use for operator troubleshooting, not automated health checks (it's slower and requires a login).
- `GET /api/system/version` — admin-only, returns `{version, pilot_release_id, environment}`.
- `GET /api/system/release-preflight` — admin-only, lists blockers/warnings for a production cutover (JWT secret strength, CORS config, missing tables, admin count).

## 5. Logging

No file-based logging existed before this task. `main.py` now calls `logging.basicConfig()` at import time (level from `VETRIX_LOG_LEVEL`, default `INFO`, never `DEBUG` by default). This only formats whatever gets logged — there is still no file/rotation handler; **redirect stdout/stderr to a file yourself** (e.g. `python -m uvicorn main:app ... >> vetrix.log 2>&1`, or your process supervisor's own log capture). A global exception handler now logs every unhandled request-time exception server-side before returning a generic 500 to the client (previously invisible). Backup-email and scheduled-report-delivery failures (both intentionally swallowed so they never fail a client-visible request) are now also logged.

## 6. CORS

`main.py` sets `allow_origins` from `VETRIX_ALLOWED_ORIGINS` (comma-separated exact origins) plus, **only when `VETRIX_ENV != "production"`**, a permissive `localhost`/`127.0.0.1`-any-port regex for local dev convenience. This regex previously applied unconditionally, including in a production-flagged deployment — fixed in this task. Set `VETRIX_ALLOWED_ORIGINS` to your pilot's exact frontend origin(s); do not use `*`.

## 7. Sensitive storage

Uploaded documents (HR, company profile, CRM files, accounting attachments) and the SQLite DB file are **not served by any static-file mount** — confirmed no `StaticFiles` mount exists anywhere in `main.py`; every file download goes through an authenticated `FileResponse` or a one-time signed token. Storage paths themselves are not deployment-configurable except `VETRIX_BACKUP_DIR` and `VETRIX_UPLOAD_DIR` (audio only) — they resolve relative to the backend source tree. For a pilot on a single machine this is fine; for a containerized/shared-hosting deployment where you need these on a separate mounted volume, this is a known limitation (see `PILOT_CHECKLIST.md`).

Report/export temp files (`tempfile.NamedTemporaryFile(delete=False, ...)`) are not cleaned up automatically and accumulate in the OS temp directory over a long-running pilot — schedule a periodic OS-level cleanup (e.g. Windows Task Scheduler, cron `tmpwatch`) as an external operational task, consistent with how this codebase already documents that no in-app scheduler exists for backup delivery.

## 8. Rate limiting

Login/TOTP already has a real, DB-persisted throttle (5 failures / 5 minutes → 10 minute lockout, keyed by IP+username, survives restarts). Telegram/WhatsApp webhooks, the backup trigger, and secure download/catalog links are all protected by HMAC signatures or single-use signed tokens rather than rate limits (appropriate for their threat model). No general-purpose rate-limiting middleware exists; if your pilot is reachable from the open internet, put a reverse proxy (nginx, Caddy) in front with its own rate limiting — this codebase deliberately does not add a new framework for this.

## 9. First-run experience

A genuinely empty instance: `GET /setup/status` reports `{initialized: false, requires_admin: true}`, and the frontend should route to a setup flow. **The very first `POST /users` call after deployment becomes the first admin (and first super-admin) with no additional secret required** — this is a real, expected race in any such bootstrap design. Operationally: deploy the instance on a private/firewalled network first, create the admin account immediately, then expose it. Recommended first-run order (matches the app's own natural dependency order, not a new wizard):

1. Log in as the bootstrap admin, set a strong password.
2. Company Profile (name, branding, locale/timezone — defaults to Asia/Tehran).
3. Branches, then Warehouses.
4. Additional Users (Settings > User Management), assign roles.
5. Financial settings / chart of accounts review, fiscal period.
6. Products & Product Categories.
7. Customers/Suppliers.
8. Opening balances / initial inventory (via Data Import or manual entry) where applicable.

No onboarding wizard was built for this — the checklist above is the full extent of first-run guidance, matching the task's explicit preference for a checklist over new UI.
