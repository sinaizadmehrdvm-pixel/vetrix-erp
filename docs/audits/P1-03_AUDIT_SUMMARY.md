# P1-03 — Decimal Money Audit Summary

## Status

Inventory and migration design completed. No runtime model, API contract, database
column, stored value, or financial calculation was changed in this checkpoint.

## Automated evidence

The repository scanner recorded 487 candidate numeric-risk locations across backend,
raw SQL declarations, API annotations and frontend number coercion/formatting paths.

Breakdown:

- 339 money or rate candidates
- 37 quantity or measurement candidates
- 111 generic numeric-review candidates
- 260 critical candidates
- 79 high-risk candidates
- 95 medium-risk candidates
- 53 manual-review candidates

These are deliberately conservative candidate counts, not a claim that every hit must
be converted. In particular, generic `numeric-review` and raw-SQL matches require
human classification before implementation. The exact source line and evidence for
every candidate are available in CSV and JSON.

## Confirmed critical patterns

The scan confirmed all of the following classes exist in the current project:

- SQLAlchemy `Column(Float)` financial fields
- Pydantic `float` financial API fields
- raw SQLite `FLOAT` columns and schema helpers
- backend `float(...)` conversions around accounting, tax, bank reconciliation,
  treasury, budgets, fixed assets, aging and reporting
- frontend `Number`, `parseFloat`, `toFixed` and `Math.*` paths that can affect
  financial or quantity values
- mixed Decimal-to-float conversion patterns that discard Decimal safety at API or
  reporting boundaries

## Generated files

- `P1-03_MONEY_FIELD_INVENTORY.csv`
- `P1-03_MONEY_FIELD_INVENTORY.json`
- `P1-03_DECIMAL_MIGRATION_PLAN.md`
- `P1-03_RISK_ANALYSIS.md`
- `P1-03_ROLLBACK_PLAN.md`
- `P1-03_COMPATIBILITY_REPORT.md`
- `scripts/audit_decimal_money.py`

## Key decision

Money, rates, percentages and quantities will not be migrated as one undifferentiated
numeric group.

- Money: Python Decimal plus SQL NUMERIC
- Unit price/cost: higher-scale Decimal/NUMERIC
- Exchange rate: wider-scale Decimal/NUMERIC
- Tax and discount percentages: explicit Decimal scale
- Fractional quantity: Decimal/NUMERIC only where business rules permit
- Indivisible quantity: Integer

## Dependency order

The actual database conversion must occur only after the Alembic foundation is in
place. P1-03 therefore closes the discovery and design checkpoint; P1-04 establishes
Alembic and controlled schema migration infrastructure before any production column
is converted.

## Exit evidence

- Repository-wide scanner executed successfully in GitHub Actions.
- Five required migration documents and machine-readable inventories were committed.
- Temporary write-enabled audit workflow was removed after execution.
- Runtime and database behavior remained unchanged.
