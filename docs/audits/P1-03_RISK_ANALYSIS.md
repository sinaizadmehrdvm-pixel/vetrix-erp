# P1-03 — Decimal Migration Risk Analysis

## Current exposure

The automated scan identified **260 critical** and **79 high-risk**
findings. Exact locations are in the inventory CSV/JSON.

## Critical risks

1. **Binary rounding drift** — Float cannot exactly represent many decimal fractions.
2. **Unbalanced journals** — independent rounding can produce debit/credit differences.
3. **Tax and discount divergence** — line-level and document-level calculations may disagree.
4. **Historical evidence changes** — naive recalculation can alter issued documents.
5. **SQLite table-rebuild risk** — type alteration requires controlled copy/rebuild patterns.
6. **API compatibility** — changing JSON numbers to decimal strings affects consumers.
7. **Frontend coercion** — JavaScript Number reintroduces binary rounding after backend migration.
8. **Report mismatch** — PDF, Excel, dashboard and accounting reports may quantize differently.
9. **FX scale loss** — insufficient rate scale compounds errors across conversions.
10. **Rollback complexity** — converting NUMERIC back to Float is inherently lossy.

## Controls

- No in-place production conversion without verified backup.
- No use of `float(value)` during backfill.
- Shadow-column/table-copy strategy with row-level validation.
- Immutable snapshots for issued and posted documents.
- Control totals by currency, period, account, invoice and customer.
- Dual-read comparison during a controlled compatibility window where feasible.
- Explicit Decimal serialization tests for every protected API.
- Country/currency-specific rounding test matrix.
- Deployment stop on any unexplained variance.

## Severity rule

Any variance in posted debit/credit totals, tax obligations, customer balances,
supplier balances or bank balances is a release blocker regardless of nominal size.
