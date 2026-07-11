# Vetrix ERP 1.0.0

Vetrix ERP 1.0.0 is the first production-ready Windows release of the bilingual accounting platform.

## Highlights

- Persian and English interface with RTL/LTR support
- Secure login, granular RBAC, maker-checker approvals, and tamper-evident audit history
- Double-entry general ledger with fiscal periods, locking, formal closing, and reopening
- Sales, purchases, proformas, returns, payments, receipts, inventory, and COGS
- Standard balance sheet, income statement, cash flow, journal, ledger, and trial balance
- VAT accounting, receivables/payables aging, and credit-limit controls
- Bank reconciliation and treasury cheque lifecycle
- Fixed assets and straight-line depreciation
- Budgets, cost centers, projects, and variance reporting
- Multi-currency voucher lines, dated rates, and revaluation reporting
- Verified backup/restore, system health, and production release preflight
- Self-contained Windows x64 executable with embedded frontend

## Windows installation

1. Download `VetrixERP-Windows-x64.zip`.
2. Verify it with the accompanying `.sha256` file.
3. Extract the ZIP into a permanent folder.
4. Run `VetrixERP.exe`.
5. Keep the console window open while using Vetrix.
6. Create the first administrator account and enable verified automatic backups.

Python and Node.js are not required on the destination computer.

Application data is stored under:

`%LOCALAPPDATA%\VetrixERP`

Back up this folder and create verified backups from inside Vetrix before transferring to another computer.

## Validation

- 35 backend regression tests
- dependency and compile validation
- route/sidebar/translation contract audit
- production frontend build
- real Windows executable startup smoke test
- packaged API version check
- embedded frontend HTTP check

## Security note

This community build is checksum-protected but not Authenticode-signed. Verify SHA-256 before execution. A commercial public distribution should use a trusted Windows code-signing certificate.
