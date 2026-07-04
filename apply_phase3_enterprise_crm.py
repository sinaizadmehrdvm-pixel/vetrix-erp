from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parent


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


def copy_file(src_rel: str, dst_rel: str | None = None) -> None:
    src = ROOT / src_rel
    dst = ROOT / (dst_rel or src_rel)
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    print(f"COPIED: {dst_rel or src_rel}")


def patch_once(path: Path, marker: str, patch_func) -> None:
    text = read(path)
    if marker in text:
        print(f"SKIP already patched: {path}")
        return
    new_text = patch_func(text)
    if new_text == text:
        raise RuntimeError(f"Patch failed for {path}")
    write(path, new_text)
    print(f"PATCHED: {path}")


# 1) Ensure new files are in place. If ZIP was extracted directly over project, this is harmless.
copy_file("backend/app/enterprise_crm/__init__.py")
copy_file("backend/app/enterprise_crm/routes.py")
copy_file("frontend/src/pages/EnterpriseCRM.jsx")

# 2) Patch backend/main.py
main_path = ROOT / "backend" / "main.py"
if main_path.exists():
    def patch_main(text: str) -> str:
        import_line = "from app.enterprise_crm.routes import router as enterprise_crm_router"
        if import_line not in text:
            anchor = "from app.crm.sales_pipeline_routes import router as pipeline_router"
            if anchor in text:
                text = text.replace(anchor, anchor + "\n" + import_line)
            else:
                text = import_line + "\n" + text
        include_line = 'app.include_router(enterprise_crm_router, prefix="/api/enterprise-crm", tags=["Enterprise CRM"])'
        if include_line not in text:
            anchor = "app.include_router(crm_router, prefix=\"/api/crm\", tags=[\"CRM\"])"
            if anchor in text:
                text = text.replace(anchor, anchor + "\n" + include_line)
            else:
                marker = "app = FastAPI("
                pos = text.find("app.add_middleware")
                if pos != -1:
                    text = text[:pos] + include_line + "\n" + text[pos:]
                else:
                    text += "\n" + include_line + "\n"
        text += "\n# PHASE3_ENTERPRISE_CRM_PATCH\n"
        return text
    patch_once(main_path, "PHASE3_ENTERPRISE_CRM_PATCH", patch_main)
else:
    print("WARNING: backend/main.py not found")

# 3) Patch frontend/src/services/api.js
api_path = ROOT / "frontend" / "src" / "services" / "api.js"
if api_path.exists():
    additions = read(ROOT / "frontend" / "src" / "services" / "enterpriseCrmApi.txt")
    def patch_api(text: str) -> str:
        # Keep export { API_URL } at the very end if it exists.
        export_line = "export { API_URL };"
        if export_line in text:
            text = text.replace(export_line, "")
            text = text.rstrip() + additions + "\n" + export_line + "\n"
        else:
            text = text.rstrip() + additions + "\n"
        text += "\n// PHASE3_ENTERPRISE_CRM_PATCH\n"
        return text
    patch_once(api_path, "PHASE3_ENTERPRISE_CRM_PATCH", patch_api)
else:
    print("WARNING: frontend/src/services/api.js not found")

# 4) Patch frontend/src/App.jsx
app_path = ROOT / "frontend" / "src" / "App.jsx"
if app_path.exists():
    def patch_app(text: str) -> str:
        import_line = 'import EnterpriseCRM from "./pages/EnterpriseCRM";'
        if import_line not in text:
            anchor = 'import CrmDashboard from "./pages/CrmDashboard";'
            if anchor in text:
                text = text.replace(anchor, anchor + "\n" + import_line)
            else:
                text = import_line + "\n" + text
        route_line = '    <Route path="enterprise-crm" element={<EnterpriseCRM />} />'
        if route_line not in text:
            anchor = '    <Route path="crm" element={<CrmDashboard />} />'
            if anchor in text:
                text = text.replace(anchor, anchor + "\n" + route_line)
            else:
                anchor = '    <Route path="settings" element={<Settings />} />'
                if anchor in text:
                    text = text.replace(anchor, route_line + "\n" + anchor)
                else:
                    text = text.replace('<Route path="*" element={<Navigate to="/" replace />} />', route_line + '\n    <Route path="*" element={<Navigate to="/" replace />} />')
        text += "\n// PHASE3_ENTERPRISE_CRM_PATCH\n"
        return text
    patch_once(app_path, "PHASE3_ENTERPRISE_CRM_PATCH", patch_app)
else:
    print("WARNING: frontend/src/App.jsx not found")

# 5) Patch Sidebar, optional.
sidebar_path = ROOT / "frontend" / "src" / "components" / "Sidebar.jsx"
if sidebar_path.exists():
    def patch_sidebar(text: str) -> str:
        if "Brain," not in text:
            anchor = "Warehouse as WarehouseIcon,"
            if anchor in text:
                text = text.replace(anchor, anchor + "\n  Brain,")
        item_line = '  { key: "enterpriseCRM", fallbackKey: "crm", icon: Brain, path: "/enterprise-crm" },'
        if item_line not in text:
            anchor = '  { key: "reports", icon: BarChart3, path: "/reports" },'
            if anchor in text:
                text = text.replace(anchor, anchor + "\n" + item_line)
            else:
                anchor = '  { key: "settings", icon: Settings, path: "/settings" },'
                text = text.replace(anchor, item_line + "\n" + anchor)
        text += "\n// PHASE3_ENTERPRISE_CRM_PATCH\n"
        return text
    patch_once(sidebar_path, "PHASE3_ENTERPRISE_CRM_PATCH", patch_sidebar)
else:
    print("WARNING: frontend/src/components/Sidebar.jsx not found")

print("\nPhase 3 Enterprise CRM installed successfully.")
print("Backend test:  http://127.0.0.1:8001/api/enterprise-crm/overview")
print("Frontend page: http://localhost:5173/enterprise-crm")
