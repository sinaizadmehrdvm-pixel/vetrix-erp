from pathlib import Path

ROOT = Path.cwd()


def read(path):
    p = ROOT / path
    return p.read_text(encoding="utf-8")


def write(path, text):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")


def ensure_contains(path, needle, inserter):
    text = read(path)
    if needle in text:
        return False
    new_text = inserter(text)
    if new_text != text:
        write(path, new_text)
        return True
    return False


def patch_main():
    path = "backend/main.py"
    text = read(path)
    changed = False
    if "from app.smart_inventory.routes import router as smart_inventory_router" not in text:
        anchor = "from app.crm.sales_pipeline_routes import router as pipeline_router\n"
        if anchor in text:
            text = text.replace(anchor, anchor + "from app.smart_inventory.routes import router as smart_inventory_router\n")
        else:
            text = "from app.smart_inventory.routes import router as smart_inventory_router\n" + text
        changed = True

    if "app.include_router(smart_inventory_router)" not in text:
        anchor = "app.include_router(pipeline_router)\n"
        if anchor in text:
            text = text.replace(anchor, anchor + "app.include_router(smart_inventory_router)\n")
        else:
            marker = "app.add_middleware("
            text = text.replace(marker, "app.include_router(smart_inventory_router)\n\n" + marker)
        changed = True

    if changed:
        write(path, text)
    return changed


def patch_app():
    path = "frontend/src/App.jsx"
    text = read(path)
    changed = False
    if 'import SmartInventory from "./pages/SmartInventory";' not in text:
        anchor = 'import CrmDashboard from "./pages/CrmDashboard";\n'
        if anchor in text:
            text = text.replace(anchor, anchor + 'import SmartInventory from "./pages/SmartInventory";\n')
        else:
            text = text.replace('import Settings from "./pages/Settings";\n', 'import Settings from "./pages/Settings";\nimport SmartInventory from "./pages/SmartInventory";\n')
        changed = True

    if 'path="smart-inventory"' not in text:
        anchor = '<Route path="warehouse" element={<Warehouse />} />'
        if anchor in text:
            text = text.replace(anchor, anchor + '\n    <Route path="smart-inventory" element={<SmartInventory />} />')
        else:
            text = text.replace('<Route path="reports" element={<Reports />} />', '<Route path="reports" element={<Reports />} />\n    <Route path="smart-inventory" element={<SmartInventory />} />')
        changed = True

    if changed:
        write(path, text)
    return changed


def patch_api():
    path = "frontend/src/services/api.js"
    text = read(path)
    changed = False
    addition = '''\n// Vetrix Smart Inventory API - Enterprise Phase 2\nexport async function getSmartInventoryOverview(params = {}) {\n  const q = new URLSearchParams(params).toString();\n  return await request(`/api/smart-inventory/overview${q ? `?${q}` : ""}`);\n}\n\nexport async function getSmartInventoryReorderPlan(params = {}) {\n  const q = new URLSearchParams(params).toString();\n  return await request(`/api/smart-inventory/reorder-plan${q ? `?${q}` : ""}`);\n}\n\nexport async function getSmartInventoryProductInsight(productId, params = {}) {\n  const q = new URLSearchParams(params).toString();\n  return await request(`/api/smart-inventory/product/${productId}/insight${q ? `?${q}` : ""}`);\n}\n'''
    if "getSmartInventoryOverview" not in text:
        marker = "export { API_URL };"
        if marker in text:
            text = text.replace(marker, addition + "\n" + marker)
        else:
            text += addition
        changed = True
    if changed:
        write(path, text)
    return changed


if __name__ == "__main__":
    changed = []
    for name, fn in [("backend/main.py", patch_main), ("frontend/src/App.jsx", patch_app), ("frontend/src/services/api.js", patch_api)]:
        try:
            if fn():
                changed.append(name)
        except FileNotFoundError:
            print(f"NOT FOUND: {name}")
    print("Phase 2 Smart Inventory patch completed.")
    if changed:
        print("Updated:")
        for item in changed:
            print("-", item)
    else:
        print("No changes needed; files were already patched.")
