# Vetrix ERP 1.1.0

Vetrix ERP 1.1.0 is the recommended Windows release of the bilingual accounting platform.

## Highlights

- Compact grouped navigation with an optional icon-only mode
- Seven persistent themes: Midnight, Ocean, Emerald, Violet, Rose, Gold, and Light
- Responsive, polished dashboard and workspace
- Online Sales & Advertising center
- Website publication, online price, stock synchronization, and discount controls
- Campaign drafts for website, Instagram, Telegram, WhatsApp, and LinkedIn
- Manager approval workflow for campaigns
- Voice Change Request Center with microphone recording and audio file preview
- Reviewed transcripts, allow-listed proposals, admin approval, transactional application, and event history
- Maker-checker protection: requesters cannot approve their own changes
- Raw provider tokens and arbitrary commands are rejected

## Installation

1. Download `VetrixERP-Windows-x64.zip`.
2. Verify it with `VetrixERP-Windows-x64.sha256`.
3. Extract the ZIP into a permanent folder.
4. Run `VetrixERP.exe`.
5. On a fresh installation, create the initial administrator.
6. Keep the console window open while using Vetrix.

Python and Node.js are not required. Application data is stored in `%LOCALAPPDATA%\VetrixERP`.

## External connections

The application is ready for official website, Telegram, WhatsApp, and social APIs. Raw credentials are not stored in Vetrix; configure secure secret references when official provider credentials are available. No external content is published until a connection is explicitly configured and approved.

## Validation

- 35 backend regression tests including commerce and managed-change approval flows
- dependency, compilation, route, sidebar, and translation audits
- production frontend build
- real packaged Windows executable startup
- packaged API and embedded frontend smoke tests

## Security note

The build is checksum-protected but not Authenticode-signed. Verify SHA-256 before execution. Commercial public distribution should use a trusted Windows code-signing certificate.
