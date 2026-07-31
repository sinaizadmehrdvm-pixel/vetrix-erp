# P1-04 — Alembic Migration Foundation

## Purpose

Establish one versioned, testable migration entry point before Decimal, PostgreSQL, tenancy, or financial-schema changes.

## Commands

Run from `backend/`:

```bash
python scripts/migrate.py upgrade head
python scripts/migrate.py current
python scripts/migrate.py history
python scripts/migrate.py downgrade -1
```

Set `VETRIX_DATABASE_URL` for every non-default environment.

## Baseline strategy

Revision `0001_schema_baseline` is non-destructive. It validates that the current legacy schema exists and then records Alembic ownership in `alembic_version`.

For a truly empty database, `scripts/migrate.py upgrade head` first invokes the current compatibility bootstrap and then applies the baseline. This temporary bridge is required because the historical project created tables through SQLAlchemy `create_all`, SQLite `ALTER TABLE` helpers, and raw DDL. Later checkpoints will move those definitions into explicit Alembic revisions and remove the compatibility bootstrap.

The baseline does not alter, drop, rename, or convert any business column.

## Migration policy

1. All new schema changes must be implemented as reviewed files under `backend/alembic/versions/`.
2. Runtime code must not introduce new `CREATE TABLE`, `ALTER TABLE`, or `DROP TABLE` statements.
3. Every revision must define `upgrade()` and a safe `downgrade()` or explicitly document why restore-from-backup is required.
4. Data migrations must be idempotent, bounded, observable, and tested against representative copies.
5. Financial type conversions require pre/post reconciliation and verified backup before execution.
6. Production migrations run as a separate deployment step, never implicitly during web-request handling.
7. `VETRIX_DATABASE_URL` is the source of truth; credentials must not be committed.

## Rollback policy

The baseline downgrade removes only Alembic revision ownership. It deliberately preserves all business tables and user data.

For future destructive or precision-changing migrations:

- stop writes,
- create and verify a full backup,
- run preflight reconciliation,
- execute the migration,
- run postflight reconciliation,
- restore the verified backup if correctness cannot be proven.

Converting `NUMERIC` values back to binary floating point is not considered an acceptable financial rollback.

## Automated verification

`backend/tests/test_migrations.py` creates an isolated SQLite database and verifies:

1. empty database bootstrap,
2. upgrade to head,
3. `alembic_version` creation,
4. insertion of a sentinel business record,
5. downgrade to base without deleting business data,
6. upgrade to head again,
7. preservation of the sentinel and expected revision.

GitHub Actions runs this lifecycle in the dedicated **Alembic migration lifecycle** job in addition to the normal backend test suite.

## Known transitional debt

The existing application still contains legacy schema bootstrap helpers. They are intentionally retained during P1-04 to avoid breaking current installations. Their removal is a later controlled checkpoint after the complete current schema has been represented by Alembic migrations.

## Exit criteria

P1-04 is complete when:

- Alembic configuration and baseline revision exist,
- empty and existing SQLite paths are supported safely,
- upgrade/downgrade/upgrade preserves business data,
- migration validation is green in CI,
- Windows packaging remains green,
- no financial type or runtime behavior has changed.
