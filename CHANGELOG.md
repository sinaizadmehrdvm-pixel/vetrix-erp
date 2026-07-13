# Changelog

## 1.2.0 — 2026-07-13

### Added

- International operating profiles for Iran, United States, United Kingdom, Germany, United Arab Emirates, and Turkey
- Company-wide locale synchronization for currency, precision, calendars, time zones, week starts, fiscal years, and measurement systems
- Versioned and auditable financial-policy administration with administrator verification
- Explicit financial rounding engine supporting 0–4 decimal places and half-up, half-even, down, and up modes

### Improved

- Consistent precision and rounding across invoice items, discounts, taxes, shipping, totals, settlements, payment status, and general-ledger posting
- Locale-aware dates, numbers, currencies, reports, and bilingual navigation
- Safe compatibility behavior when no verified company policy is active
- Historical accounting records remain unchanged when a new policy becomes effective

### Security and validation

- Administrator-only policy creation and activation
- Effective-date boundary checks and policy event history
- Backend regression tests, frontend audits/build, and packaged Windows smoke tests


## 1.1.0 — 2026-07-12

### Added

- Grouped compact navigation and seven persistent visual themes
- Online commerce controls for publishing, price, stock sync, and discounts
- Social campaign drafts with manager approval
- Voice-driven managed change requests with maker-checker approval
- Secure secret references and allow-listed transactional execution

### Improved

- Responsive dashboard layout, visual polish, and reduced navigation scrolling
- Bilingual labels and release validation for all new workflows

## 1.0.1 — 2026-07-11

### Fixed

- Added first-run installation discovery and bilingual administrator setup wizard
- Added automatic sign-in after secure initial administrator creation
- Added minimum password length enforcement during user creation
- Synchronized API, desktop executable, Windows metadata, and release version


## 1.0.0 — 2026-07-11

First stable Vetrix ERP release.

### Accounting

- Double-entry general ledger and standard chart of accounts
- Fiscal periods, numbering, locking, closing, and reopening
- Opening balances and inventory valuation
- Standard financial statements and reporting
- VAT, aging, bank reconciliation, fixed assets, budgets, and multi-currency
- Treasury cheque lifecycle and maker-checker voucher approvals

### Security and operations

- JWT authentication and password hashing
- Granular role-based permissions
- Tamper-evident audit chain
- Verified backup and restore
- System health and release preflight
- Production CORS and environment checks

### Distribution

- Bilingual responsive React frontend
- FastAPI/SQLAlchemy backend
- Self-contained Windows x64 portable executable
- Automated Windows build, smoke test, checksum, and GitHub Release publication
