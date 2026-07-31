# P1-06 — Tenant, Legal Entity and Branch Foundation

## Purpose

This checkpoint introduces explicit organization scope without breaking the current single-company runtime. It establishes the data model required for later tenant isolation, legal-entity accounting, branch operations, and scope-aware authorization.

## Added records

- `tenants`: commercial or operational customer boundary.
- `legal_entities`: statutory accounting entity inside a tenant.
- `branches`: operational branch inside a legal entity.
- `user_organization_memberships`: explicit user authorization membership for one tenant/entity/branch scope.

## Compatibility strategy

The migration creates one default hierarchy for all existing installations:

- Tenant: `VETRIX`
- Legal entity: `DEFAULT`
- Branch: `HQ`

Every user that exists when migration `0002_organization_foundation` runs receives one active default membership. Existing business tables are not modified in this checkpoint, so current invoices, customers, products, reports, authentication, and Windows portable behavior remain unchanged.

## Security invariants

- Organization scope is resolved from server-side membership data, never trusted directly from an API payload.
- A membership must match user, tenant, legal entity, branch, active state, and membership identifier.
- Legal entity must belong to the selected tenant.
- Branch must belong to both the selected tenant and legal entity.
- Missing or inactive membership fails closed.

## Scope API primitives

`app.organization.scope` provides:

- `resolve_default_scope(db, user_id)`
- `validate_scope(db, user_id, scope)`
- `ensure_scope_hierarchy(db, scope)`
- immutable `OrganizationScope`
- `OrganizationScopeError`

These primitives are groundwork only. Route-level enforcement and tenant columns on business records are intentionally deferred to P1-07, after controlled backfill and isolation tests are ready.

## Migration behavior

Upgrade:

1. Create organization tables and indexes.
2. Seed the default tenant/entity/branch hierarchy.
3. Backfill memberships for existing users while preserving their current role as `organization_role`.

Downgrade:

- Removes organization membership and hierarchy tables only.
- Does not alter or delete legacy business tables.
- Production rollback must still use the approved backup/restore policy when later scope columns become mandatory.

## Verification requirements

- Empty SQLite migration lifecycle: upgrade → downgrade → upgrade.
- Existing-user membership backfill.
- Scope resolution and fail-closed behavior.
- Hierarchy validation.
- PostgreSQL portability job.
- Full backend, frontend, security, and Windows portable validation.

## Deferred to P1-07

- Add `tenant_id`, `legal_entity_id`, and `branch_id` to scoped business tables.
- Backfill all existing business rows.
- Introduce request scope middleware/dependency.
- Enforce scope in repository queries and writes.
- Add cross-tenant and cross-entity isolation tests.
- Prevent client-controlled scope escalation.
