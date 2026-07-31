# P1-03 — Decimal Migration Rollback Plan

## Principle

Rollback is based on restoring the pre-migration database and application release,
not on casting NUMERIC values back to Float.

## Required preconditions

1. Application write freeze or maintenance window.
2. Verified database backup with checksum.
3. Tested restore into an isolated environment.
4. Exported control totals and row counts.
5. Tagged application release and pinned dependencies.
6. Migration identifier and operator audit record.

## Rollback triggers

- Migration failure or partial completion.
- Row-count or null-count mismatch.
- Any unexplained financial control-total variance.
- Unbalanced journal or trial balance.
- API incompatibility that blocks core workflows.
- Report totals differ from approved baseline.
- Performance or locking exceeds the approved window.

## Procedure

1. Stop application writes.
2. Capture failed-state logs and migration evidence.
3. Restore the complete pre-migration backup to a clean database.
4. Deploy the pre-migration application revision.
5. Run health, login, invoice, payment, posting and report smoke tests.
6. Compare restored control totals to the signed baseline.
7. Reopen writes only after finance and technical approval.
8. Record incident, root cause and revised migration plan.

## Forward recovery alternative

If schema cutover completed and only application compatibility failed, a forward fix
may be safer than restoring data. This decision requires explicit technical and
finance approval and must not permit mixed Float/Decimal writes.

## Data retention

Keep the pre-migration backup, migration logs, reconciliation report and rollback
record under the accounting retention policy. Never delete migration evidence after
a successful deployment.
