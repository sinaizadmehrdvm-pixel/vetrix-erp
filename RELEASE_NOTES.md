# Vetrix ERP 1.3.0

Vetrix ERP 1.3.0 is the recommended Windows release of the bilingual, country-aware accounting and controlled commerce platform.

## Highlights

- Secure Telegram and WhatsApp voice intake with verified webhooks, audio upload, manager review, and controlled application changes
- Accounting-controlled website feed for signed price, stock, discount, and incremental product synchronization
- Manager-approved, idempotent social campaign delivery queue
- Secure server/client operation on a trusted Windows LAN while local-only mode remains the default
- Streamlined responsive dashboard with searchable grouped navigation and reduced scrolling
- Unified responsive forms and tables for mobile, tablet, desktop, RTL/LTR, and print
- Verified country financial policy covering currency, precision, rounding, calendar, IANA time zone, first weekday, fiscal year, measurement system, and tax rate
- Live role revalidation, deleted-user rejection, failed-login throttling, and expanded tamper-evident auditing

## Supported operating profiles

Iran, Germany, Finland, United Arab Emirates, United Kingdom, and United States. Country selection configures formatting defaults; statutory and tax values still require verification by a qualified local accountant.

## Upgrade safety

Application data remains in `%LOCALAPPDATA%\VetrixERP`. Create and verify a backup before replacing the executable. Version 1.3.0 uses additive database migrations and does not rewrite historical accounting documents.

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

- 72 backend authentication, RBAC, audit, accounting, localization, network, integration, and security regression tests
- Frontend dependency, direct-fetch, route, sidebar, and bilingual translation audits
- Backend compilation and production frontend build
- Real packaged Windows executable startup
- Packaged login/API and embedded frontend smoke tests
- SHA-256 protected portable archive

## Security note

The archive is SHA-256 protected but the executable is not Authenticode-signed. Verify the checksum before execution. Commercial public distribution should use a trusted Windows code-signing certificate. Do not expose the built-in LAN server directly to the internet.
