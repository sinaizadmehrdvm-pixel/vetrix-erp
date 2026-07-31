# P1-03 — Decimal Compatibility Report

## Backend

- SQLAlchemy and Pydantic currently contain Float/float financial boundaries.
- Raw SQLite schema helpers contain FLOAT declarations.
- Existing accounting integrity utilities provide a starting point but must be audited
  for Decimal construction, quantization and serialization.
- ReportLab, OpenPyXL and Pandas export paths need explicit Decimal compatibility tests.

## Database

- Current SQLite schema cannot safely rely on direct type alteration.
- Alembic is a prerequisite for production-grade conversion and downgrade metadata.
- PostgreSQL target compatibility requires explicit Numeric precision, constraints and
  dialect-neutral migrations.

## API

- JSON numeric compatibility must be versioned or coordinated because Decimal should
  be serialized as canonical strings at financial boundaries.
- Existing clients that expect JSON numbers require contract tests and a controlled
  transition.

## Frontend

- JavaScript Number-based parsing, formatting and arithmetic findings are inventoried.
- Display formatting may continue to use locale formatters only after canonical values
  remain strings/Decimal-safe representations through business calculations.
- `toFixed` is display-only and must not become authoritative rounding.

## Reporting and packaging

- Invoice PDF/Excel, localized money formatting, dashboards, reports and Windows
  portable packaging must be regression-tested after implementation.
- The P1-02 CI and Windows package gates remain mandatory.

## Inventory summary

```json
{
  "domain:backend-conversion": 189,
  "domain:backend-python": 48,
  "domain:frontend-numeric": 144,
  "domain:raw-sql": 79,
  "domain:sqlalchemy-model": 27,
  "money-or-rate": 339,
  "numeric-review": 111,
  "quantity-or-measurement": 37,
  "risk:critical": 260,
  "risk:high": 79,
  "risk:medium": 95,
  "risk:review": 53
}
```

## Compatibility decision

The migration is feasible without rebuilding the product, but it must be staged.
A simultaneous untested replacement of every numeric field is prohibited. Money,
rates, percentages and quantities require separate policies and test matrices.
