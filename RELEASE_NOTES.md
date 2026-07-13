# Vetrix ERP 1.2.0

Vetrix ERP 1.2.0 is the recommended Windows release of the bilingual, country-aware accounting platform.

## Highlights

- International operating profiles for Iran, the United States, the United Kingdom, Germany, the United Arab Emirates, and Turkey
- Company-wide formatting for currency, decimal precision, calendars, time zones, week starts, fiscal years, and measurement systems
- Verified Financial Policy center for administrators
- Versioned country, currency, precision, rounding, effective-date, verification, and audit metadata
- Deterministic rounding with 0–4 decimal places and half-up, half-even, down, or up modes
- Consistent calculations across invoice lines, discounts, taxes, shipping, totals, receipts, payments, settlement status, and general-ledger posting
- Safe two-decimal half-up compatibility mode until a company policy is verified
- New policies never rewrite historical documents

## Upgrade safety

Existing application data remains in `%LOCALAPPDATA%\VetrixERP`. Back up your data before replacing the executable. A newly selected country profile does not automatically certify statutory or tax settings. A qualified local accountant must verify the company policy before activation.

## Installation

1. Download `VetrixERP-Windows-x64.zip`.
2. Verify it with `VetrixERP-Windows-x64.sha256`.
3. Extract the ZIP into a permanent folder.
4. Run `VetrixERP.exe`.
5. On a fresh installation, create the initial administrator.
6. Open Settings to confirm the operating country and formatting.
7. Open Verified Financial Policy and activate only accountant-approved values.

Python and Node.js are not required.

## Validation

- Backend accounting, access-control, internationalization, and financial-policy regression tests
- Dependency, direct-fetch, route, sidebar, and bilingual translation audits
- Backend compilation and production frontend build
- Real packaged Windows executable startup test
- Packaged API and embedded frontend smoke tests

## Security note

The build is checksum-protected but not Authenticode-signed. Verify SHA-256 before execution. Commercial public distribution should use a trusted Windows code-signing certificate.
