# VITALIX ERP 1.4.0

VITALIX ERP 1.4.0 is the recommended Windows release of the multilingual, country-aware accounting and controlled commerce platform.

## Highlights

- Full VITALIX design-system rollout with responsive shared components, unified search controls, popup calendars, and adaptive sidebar navigation
- Full fa/ar/tr/en localization coverage across calendars, charts, forms, portals, reports, CRM, and Field Sales workflows
- Self-service user avatar/profile support with client-side image compression and localized employee/profile interactions
- CRM and Field Sales workflow improvements, including shared customer heuristics, embedded visit actions, localized numeric input, and customer deep links
- Stronger tenant isolation and RBAC enforcement across customer/supplier portals, accounting, notifications, exports, backups, inventory, attachments, and administration
- Database-persisted login throttling, JWT session revocation, WebSocket tenant scoping and token revalidation, safer upload limits, and hardened payment-session handling
- HMAC-protected storefront synchronization, formula-injection protection for spreadsheet exports, safer exception handling, restricted CORS behavior, and expanded audit coverage
- Responsive form/table fixes for branches, warehouses, pricing tiers, employees, transactions, reporting, and accounting workflows

## Supported operating profiles

Iran, Germany, Finland, United Arab Emirates, United Kingdom, and United States. Country selection configures formatting defaults; statutory and tax values still require verification by a qualified local accountant.

## Upgrade safety

Application data remains in `%LOCALAPPDATA%\VetrixERP`. Create and verify a backup before replacing the executable. Version 1.4.0 uses additive, idempotent database migrations and does not rewrite historical accounting documents. The structural table rebuild used by one migration verifies row counts before replacement and aborts on mismatch.

For server/client mode, keep the database only on the server computer. Do not copy or share a live SQLite database between running computers.

## Installation

1. Download `VetrixERP-Windows-x64.zip`.
2. Download `VetrixERP-Windows-x64.sha256`.
3. Verify the ZIP SHA-256 checksum.
4. Extract the ZIP into a permanent folder.
5. Run `VetrixERP.exe`.
6. On a fresh installation, create the initial administrator with a strong password.
7. Open Settings and verify the operating country.
8. Open Verified Financial Policy and activate only accountant-approved values.

Python and Node.js are not required. See the included README for secure LAN server/client configuration.

## Validation

- 249 backend authentication, RBAC, audit, accounting, localization, network, integration, migration, tenant-isolation, and security regression tests
- 73 frontend tests plus production frontend build validation
- `pip-audit` clean and `npm audit --audit-level=high` clean at release-candidate audit
- Frontend route, localization, shared-component, and responsive-layout validation
- Backend compilation and packaged Windows portable smoke testing in CI
- Real packaged Windows executable startup validation
- Packaged login/API and embedded frontend smoke tests
- SHA-256 protected portable archive

## Security note

This release includes five security-hardening phases covering cross-tenant access control, deny-by-default RBAC, login throttling, JWT/session handling, WebSocket tenant isolation, upload/export limits, payment safeguards, backup delivery, audit logging, CORS restrictions, credential leak prevention, spreadsheet formula-injection protection, and warehouse ownership enforcement.

The archive is SHA-256 protected but the executable is not Authenticode-signed. Verify the checksum before execution. Commercial public distribution should use a trusted Windows code-signing certificate. Do not expose the built-in LAN server directly to the internet.

## Known non-blocking follow-ups

- One RTL mirroring polish item remains in `CustomerTimeline.jsx`.
- The live-notification message body still needs verified Arabic/Turkish translations for a small hardcoded sentence set; titles are localized.
- A few lint/DRY polish items remain and do not affect runtime behavior or release readiness.
