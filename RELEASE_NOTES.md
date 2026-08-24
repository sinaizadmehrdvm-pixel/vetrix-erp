# VITALIX ERP 1.4.1

VITALIX ERP 1.4.1 finalizes the production authentication experience introduced after the v1.4.0 release.

## Authentication

- Adds separate `/login`, `/register`, and `/forgot-password` flows.
- Uses first-run bootstrap registration to create exactly one system administrator.
- Adds an atomic first-admin claim to prevent concurrent duplicate administrator creation.
- Closes public registration after initialization and routes account creation through administrators.
- Handles password-recovery requests with a generic, non-enumerating response.
- Keeps recovery on the existing administrator-controlled password reset path.
- Removes public role selection from first-run registration.

## Localization and UX

- Localizes the auth experience in FA, TR, EN, and AR.
- Applies correct RTL/LTR behavior before login.
- Supports language selection before login.
- Adds friendly initialized-registration and recovery states.
- Fixes mobile auth overflow for localized messages.

## Version Consistency

- Aligns runtime metadata, browser auth UI, backend root/health responses, desktop console banner, Windows package metadata, release workflow, and release docs to 1.4.1.

## Validation

- Backend auth tests passed.
- Full backend suite was previously verified for the merged auth finalization.
- Frontend auth tests passed.
- Full frontend suite was previously verified for the merged auth finalization.
- Frontend production build passed.
- Real browser auth acceptance covered 48 cases with 0 failures.
