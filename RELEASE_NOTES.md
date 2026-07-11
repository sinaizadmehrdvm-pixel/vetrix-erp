# Vetrix ERP 1.0.1

Vetrix ERP 1.0.1 is the recommended Windows release of the bilingual accounting platform.

## Patch highlight

- Detects a completely fresh installation through a public, read-only setup status contract
- Shows a bilingual first-run wizard instead of an unusable login screen
- Creates the initial administrator securely and signs in automatically
- Requires administrator passwords of at least 10 characters
- Hides the setup wizard permanently after the first user is created
- Keeps the existing login flow unchanged for initialized databases

## Core capabilities

- Persian and English interface with RTL/LTR support
- Secure login, granular RBAC, maker-checker approvals, and tamper-evident audit history
- Double-entry ledger, fiscal periods, closing, financial statements, VAT, aging, banking, treasury, fixed assets, budgets, and multi-currency
- Verified backup/restore, system health, and production release preflight
- Self-contained Windows x64 executable with embedded frontend

## Windows installation

1. Download `VetrixERP-Windows-x64.zip`.
2. Verify it with the accompanying `.sha256` file.
3. Extract the ZIP into a permanent folder.
4. Run `VetrixERP.exe`.
5. On first run, complete the administrator wizard.
6. Keep the console window open while using Vetrix.

Python and Node.js are not required. Application data is stored in `%LOCALAPPDATA%\VetrixERP`.

## Validation

- 35 backend regression tests plus first-run bootstrap assertions
- dependency, compile, route, sidebar, and translation audits
- production frontend build
- real packaged executable startup test on Windows
- packaged API and embedded frontend smoke tests

## Security note

The build is checksum-protected but not Authenticode-signed. Verify SHA-256 before execution. Commercial public distribution should use a trusted Windows code-signing certificate.
