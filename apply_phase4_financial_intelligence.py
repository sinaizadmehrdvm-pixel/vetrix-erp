from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parent


def copy_file(src_rel, dst_rel):
    src = ROOT / src_rel
    dst = ROOT / dst_rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    print(f"+ {dst_rel}")


def patch_text(path_rel, marker, insert_text, mode="after"):
    path = ROOT / path_rel
    text = path.read_text(encoding="utf-8")
    if insert_text.strip() in text:
        print(f"= already patched: {path_rel}")
        return
    if marker not in text:
        raise RuntimeError(f"Marker not found in {path_rel}: {marker}")
    if mode == "after":
        text = text.replace(marker, marker + insert_text, 1)
    elif mode == "before":
        text = text.replace(marker, insert_text + marker, 1)
    else:
        raise ValueError(mode)
    path.write_text(text, encoding="utf-8")
    print(f"* patched: {path_rel}")


def main():
    copy_file("backend/app/financial_intelligence/__init__.py", "backend/app/financial_intelligence/__init__.py")
    copy_file("backend/app/financial_intelligence/routes.py", "backend/app/financial_intelligence/routes.py")
    copy_file("frontend/src/pages/FinancialIntelligence.jsx", "frontend/src/pages/FinancialIntelligence.jsx")

    patch_text(
        "backend/main.py",
        "from app.crm.sales_pipeline_routes import router as pipeline_router\n",
        "from app.financial_intelligence.routes import router as financial_intelligence_router\n",
        "after",
    )
    patch_text(
        "backend/main.py",
        "app.include_router(pipeline_router)\n",
        "app.include_router(financial_intelligence_router, prefix=\"/api/financial-intelligence\")\n",
        "after",
    )

    patch_text(
        "frontend/src/App.jsx",
        "import CrmDashboard from \"./pages/CrmDashboard\";\n",
        "import FinancialIntelligence from \"./pages/FinancialIntelligence\";\n",
        "after",
    )
    patch_text(
        "frontend/src/App.jsx",
        "    <Route path=\"finance\" element={<FinanceCenter />} />\n",
        "    <Route path=\"financial-intelligence\" element={<FinancialIntelligence />} />\n",
        "after",
    )

    api_append = '''\n\n// Vetrix Phase 4 - Financial Intelligence API\nexport async function getFinancialIntelligenceOverview() {\n  return await request(`/api/financial-intelligence/overview`);\n}\n\nexport async function simulateFinancialScenario(data) {\n  return await request(`/api/financial-intelligence/simulate`, { method: "POST", body: JSON.stringify(data) });\n}\n'''
    api_path = ROOT / "frontend/src/services/api.js"
    api_text = api_path.read_text(encoding="utf-8")
    if "getFinancialIntelligenceOverview" not in api_text:
        api_path.write_text(api_text + api_append, encoding="utf-8")
        print("* patched: frontend/src/services/api.js")
    else:
        print("= already patched: frontend/src/services/api.js")

    print("\nPhase 4 Financial Intelligence installed successfully.")


if __name__ == "__main__":
    main()
