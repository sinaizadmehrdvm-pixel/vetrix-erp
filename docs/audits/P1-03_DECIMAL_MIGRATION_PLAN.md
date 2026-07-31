# P1-03 — Decimal Money Migration Plan

## Scope and result

This checkpoint is an inventory and design checkpoint only. No production model,
API contract, database column, stored value, or financial calculation was changed.

Automated repository scan found:

- **487** total numeric-risk findings
- **339** money/rate findings
- **37** quantity/measurement findings
- **89** affected source files

The machine-readable evidence is stored in:

- `docs/audits/P1-03_MONEY_FIELD_INVENTORY.csv`
- `docs/audits/P1-03_MONEY_FIELD_INVENTORY.json`

## Target policy

1. Monetary values use Python `Decimal` end-to-end and SQL `NUMERIC(p, s)`.
2. API monetary values are accepted and emitted as canonical decimal strings.
3. Frontend inputs preserve decimal strings; formatting is presentation-only.
4. Currency precision is configuration-driven; storage precision must not equal display precision by assumption.
5. Exchange rates use a wider scale than transaction money.
6. Percentages and tax rates use explicit Decimal scale and rounding policy.
7. Quantities use Decimal only when fractional quantities are valid; indivisible counts remain Integer.
8. Posted accounting evidence is immutable and conversions are migration-audited.

## Proposed precision classes

| Class | Proposed SQL type | Notes |
|---|---|---|
| Transaction money | `NUMERIC(24, 6)` | Supports large totals and currencies with subunits; final scale remains policy-driven. |
| Unit price and cost | `NUMERIC(24, 8)` | Avoids multiplication drift for fractional unit prices. |
| Exchange rate | `NUMERIC(28, 12)` | Required for cross-rate and reporting conversions. |
| Tax/discount percent | `NUMERIC(12, 6)` | Store percent as explicit percent or ratio consistently, never both. |
| Fractional quantity | `NUMERIC(24, 8)` | Product/UOM policy determines whether fractions are legal. |
| Integer quantity | `BIGINT` | For serialised or indivisible units. |

These are proposed defaults and must be confirmed against maximum values, country
packs, currency precision, and current production data before migrations are written.

## Execution sequence

### P1-03A — Domain and contract layer

- Introduce a shared money utility based on `Decimal`.
- Define strict parsing from strings and integers; reject binary-float input at protected boundaries.
- Centralize quantization and rounding through the existing financial-policy configuration.
- Add JSON serialization policy for Decimal values.
- Add regression tests for invoice totals, payment status, posting, reports, tax, FX and aging.

### P1-03B — ORM and Pydantic conversion

- Replace financial `Column(Float)` definitions with `Numeric` declarations.
- Replace financial `float` annotations with `Decimal`.
- Review quantity fields separately; do not blindly convert all numeric values.
- Prevent defaults such as `0.1` from entering Decimal calculations as binary floats.

### P1-03C — Database migration design

- Implement only after Alembic foundation exists.
- Add shadow NUMERIC columns or table-rebuild migrations where SQLite compatibility requires it.
- Backfill using decimal text conversion, not binary arithmetic.
- Compare source and target values before cutover.
- Add check constraints for scale, non-negativity where applicable and debit/credit integrity.

### P1-03D — API and frontend conversion

- API sends money as strings with explicit currency context.
- Frontend state retains user-entered decimal text until validation.
- Replace money-related `parseFloat`, `Number`, unary plus, `toFixed` and `Math.*` calculations.
- Keep locale formatting separate from canonical values.
- Update exports, PDFs and Excel generation to consume canonical Decimal values.

### P1-03E — Cutover and verification

- Run backup and restore rehearsal.
- Run row counts, null counts, min/max, sums and hash/control-total comparisons.
- Recalculate trial balance, invoice totals, customer balances and tax totals.
- Block deployment if debit != credit or source/target control totals differ.
- Retain a signed migration evidence report.

## Exit criteria for implementation checkpoint

- No financial ORM/Pydantic field uses Float.
- No raw financial SQL column uses FLOAT/REAL/DOUBLE.
- No protected API accepts binary float for money.
- No frontend business calculation uses JavaScript Number for money.
- Existing and new accounting integrity tests pass.
- Data-control totals match before and after migration.
- CI and Windows package checks remain green.
