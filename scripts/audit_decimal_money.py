#!/usr/bin/env python3
"""Generate the P1-03 decimal-money migration audit from repository source.

This scanner is intentionally read-only with respect to runtime code and data. It
creates deterministic evidence files under docs/audits/ for review before any
schema or behavior migration is attempted.
"""

from __future__ import annotations

import ast
import csv
import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend" / "src"
OUT = ROOT / "docs" / "audits"

MONEY_TERMS = {
    "amount", "balance", "price", "cost", "total", "subtotal", "discount",
    "tax", "vat", "debit", "credit", "rate", "limit", "budget", "value",
    "revenue", "expense", "income", "profit", "loss", "payment", "receipt",
    "salary", "wage", "fee", "freight", "insurance", "commission", "opening",
    "closing", "outstanding", "paid", "payable", "receivable", "valuation",
    "depreciation", "residual", "acquisition", "book_value", "exchange",
    "rounding", "withholding", "shipping", "unit_price", "sell_price",
    "buy_price", "credit_limit", "opening_balance",
}

QUANTITY_TERMS = {
    "qty", "quantity", "stock", "reserved", "available", "units", "weight",
    "volume", "capacity", "count", "hours", "duration", "percentage", "percent",
}

TEXT_SUFFIXES = {".py", ".js", ".jsx", ".ts", ".tsx", ".sql"}
IGNORE_PARTS = {"node_modules", "dist", "build", ".git", "__pycache__", ".venv", "venv"}


@dataclass(frozen=True)
class Finding:
    domain: str
    file: str
    line: int
    symbol: str
    current_type: str
    target_type: str
    classification: str
    evidence: str
    migration_required: str
    risk: str


def iter_files(base: Path) -> Iterable[Path]:
    if not base.exists():
        return
    for path in sorted(base.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        if any(part in IGNORE_PARTS for part in path.parts):
            continue
        yield path


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def classify_name(name: str) -> str:
    lowered = name.lower()
    if any(term in lowered for term in MONEY_TERMS):
        return "money-or-rate"
    if any(term in lowered for term in QUANTITY_TERMS):
        return "quantity-or-measurement"
    return "numeric-review"


def risk_for(classification: str, current_type: str) -> str:
    if classification == "money-or-rate" and current_type.lower() in {"float", "real", "double", "number/float"}:
        return "critical"
    if classification == "money-or-rate":
        return "high"
    if classification == "quantity-or-measurement":
        return "medium"
    return "review"


def target_for(classification: str) -> str:
    if classification == "money-or-rate":
        return "Decimal / NUMERIC(precision, scale)"
    if classification == "quantity-or-measurement":
        return "Decimal / NUMERIC when fractional; Integer when indivisible"
    return "Explicit numeric policy required"


def scan_python(path: Path) -> list[Finding]:
    text = path.read_text(encoding="utf-8", errors="replace")
    findings: list[Finding] = []
    try:
        tree = ast.parse(text)
    except SyntaxError:
        tree = None

    if tree is not None:
        for node in ast.walk(tree):
            # Pydantic/function annotations such as amount: float
            if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
                annotation = ast.unparse(node.annotation) if hasattr(ast, "unparse") else ""
                if annotation in {"float", "Optional[float]", "list[float]", "List[float]"} or "float" in annotation:
                    name = node.target.id
                    classification = classify_name(name)
                    findings.append(Finding(
                        "backend-python", relative(path), node.lineno, name,
                        annotation, target_for(classification), classification,
                        (ast.get_source_segment(text, node) or "").strip()[:300],
                        "yes", risk_for(classification, "float"),
                    ))

            # SQLAlchemy Column(Float, ...)
            if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call):
                call = node.value
                if isinstance(call.func, ast.Name) and call.func.id == "Column" and call.args:
                    first = ast.unparse(call.args[0]) if hasattr(ast, "unparse") else ""
                    if first in {"Float", "REAL", "DOUBLE"} or "Float" in first:
                        names = [target.id for target in node.targets if isinstance(target, ast.Name)]
                        for name in names or ["<column>"]:
                            classification = classify_name(name)
                            findings.append(Finding(
                                "sqlalchemy-model", relative(path), node.lineno, name,
                                first, target_for(classification), classification,
                                (ast.get_source_segment(text, node) or "").strip()[:300],
                                "yes", risk_for(classification, "float"),
                            ))

            # Explicit float(...) conversion in backend business logic
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "float":
                source = (ast.get_source_segment(text, node) or "float(...)").strip()[:300]
                classification = classify_name(source)
                findings.append(Finding(
                    "backend-conversion", relative(path), node.lineno, "float()",
                    "binary float conversion", target_for(classification), classification,
                    source, "code-change", risk_for(classification, "float"),
                ))

            # Decimal constructed from float literal is unsafe.
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "Decimal" and node.args:
                if isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, float):
                    findings.append(Finding(
                        "backend-conversion", relative(path), node.lineno, "Decimal(float-literal)",
                        "float-derived Decimal", "Decimal(string) or integer scaling", "money-or-rate",
                        (ast.get_source_segment(text, node) or "").strip()[:300],
                        "code-change", "high",
                    ))

    # Raw SQL FLOAT/REAL/DOUBLE declarations and ALTER helpers.
    sql_pattern = re.compile(r"\b([A-Za-z_][A-Za-z0-9_]*)\s+(FLOAT|REAL|DOUBLE(?:\s+PRECISION)?)\b", re.I)
    for number, line in enumerate(text.splitlines(), 1):
        for match in sql_pattern.finditer(line):
            name, current = match.groups()
            classification = classify_name(name)
            findings.append(Finding(
                "raw-sql", relative(path), number, name, current.upper(),
                target_for(classification), classification, line.strip()[:300],
                "yes", risk_for(classification, current),
            ))

    return findings


def scan_frontend(path: Path) -> list[Finding]:
    text = path.read_text(encoding="utf-8", errors="replace")
    findings: list[Finding] = []
    patterns = [
        ("parseFloat", re.compile(r"\bparseFloat\s*\(")),
        ("Number", re.compile(r"\bNumber\s*\(")),
        ("unary-plus", re.compile(r"(?<![+\w])\+[A-Za-z_$][\w$.[\]]*")),
        ("toFixed", re.compile(r"\.toFixed\s*\(")),
        ("Math.round", re.compile(r"\bMath\.round\s*\(")),
        ("Math.ceil", re.compile(r"\bMath\.ceil\s*\(")),
        ("Math.floor", re.compile(r"\bMath\.floor\s*\(")),
    ]
    for number, line in enumerate(text.splitlines(), 1):
        lowered = line.lower()
        classification = classify_name(lowered)
        for label, pattern in patterns:
            if pattern.search(line):
                findings.append(Finding(
                    "frontend-numeric", relative(path), number, label,
                    "JavaScript Number", "Decimal-safe string/minor-unit boundary",
                    classification, line.strip()[:300], "code-review",
                    "high" if classification == "money-or-rate" else "medium",
                ))
    return findings


def deduplicate(findings: list[Finding]) -> list[Finding]:
    seen: set[tuple[str, int, str, str]] = set()
    result: list[Finding] = []
    for item in findings:
        key = (item.file, item.line, item.symbol, item.domain)
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return sorted(result, key=lambda item: (item.file, item.line, item.symbol, item.domain))


def write_csv(findings: list[Finding]) -> None:
    path = OUT / "P1-03_MONEY_FIELD_INVENTORY.csv"
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(asdict(findings[0]).keys()) if findings else [
            "domain", "file", "line", "symbol", "current_type", "target_type",
            "classification", "evidence", "migration_required", "risk",
        ])
        writer.writeheader()
        for item in findings:
            writer.writerow(asdict(item))


def summary_counts(findings: list[Finding]) -> dict[str, int]:
    result: dict[str, int] = {}
    for item in findings:
        result[item.classification] = result.get(item.classification, 0) + 1
        result[f"risk:{item.risk}"] = result.get(f"risk:{item.risk}", 0) + 1
        result[f"domain:{item.domain}"] = result.get(f"domain:{item.domain}", 0) + 1
    return dict(sorted(result.items()))


def write_json(findings: list[Finding]) -> None:
    payload = {
        "checkpoint": "P1-03",
        "mode": "inventory-only",
        "runtime_or_schema_changed": False,
        "summary": summary_counts(findings),
        "findings": [asdict(item) for item in findings],
    }
    (OUT / "P1-03_MONEY_FIELD_INVENTORY.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def write_plan(findings: list[Finding]) -> None:
    money = [item for item in findings if item.classification == "money-or-rate"]
    quantity = [item for item in findings if item.classification == "quantity-or-measurement"]
    files = sorted({item.file for item in findings})
    content = f"""# P1-03 — Decimal Money Migration Plan

## Scope and result

This checkpoint is an inventory and design checkpoint only. No production model,
API contract, database column, stored value, or financial calculation was changed.

Automated repository scan found:

- **{len(findings)}** total numeric-risk findings
- **{len(money)}** money/rate findings
- **{len(quantity)}** quantity/measurement findings
- **{len(files)}** affected source files

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
"""
    (OUT / "P1-03_DECIMAL_MIGRATION_PLAN.md").write_text(content, encoding="utf-8")


def write_risk(findings: list[Finding]) -> None:
    critical = [item for item in findings if item.risk == "critical"]
    high = [item for item in findings if item.risk == "high"]
    content = f"""# P1-03 — Decimal Migration Risk Analysis

## Current exposure

The automated scan identified **{len(critical)} critical** and **{len(high)} high-risk**
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
"""
    (OUT / "P1-03_RISK_ANALYSIS.md").write_text(content, encoding="utf-8")


def write_rollback() -> None:
    content = """# P1-03 — Decimal Migration Rollback Plan

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
"""
    (OUT / "P1-03_ROLLBACK_PLAN.md").write_text(content, encoding="utf-8")


def write_compatibility(findings: list[Finding]) -> None:
    domains = summary_counts(findings)
    content = f"""# P1-03 — Decimal Compatibility Report

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
{json.dumps(domains, ensure_ascii=False, indent=2)}
```

## Compatibility decision

The migration is feasible without rebuilding the product, but it must be staged.
A simultaneous untested replacement of every numeric field is prohibited. Money,
rates, percentages and quantities require separate policies and test matrices.
"""
    (OUT / "P1-03_COMPATIBILITY_REPORT.md").write_text(content, encoding="utf-8")


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    findings: list[Finding] = []
    for path in iter_files(BACKEND):
        findings.extend(scan_python(path) if path.suffix == ".py" else [])
    for path in iter_files(FRONTEND):
        findings.extend(scan_frontend(path))
    findings = deduplicate(findings)

    write_csv(findings)
    write_json(findings)
    write_plan(findings)
    write_risk(findings)
    write_rollback()
    write_compatibility(findings)

    print(f"P1-03 audit complete: {len(findings)} findings across {len({f.file for f in findings})} files.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
