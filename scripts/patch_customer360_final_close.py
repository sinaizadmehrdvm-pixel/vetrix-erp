from pathlib import Path

ROOT = Path.cwd()
path = ROOT / "frontend" / "src" / "pages" / "crm" / "Customer360.jsx"

if not path.exists():
    print("Customer360.jsx not found:", path)
    raise SystemExit(1)

text = path.read_text(encoding="utf-8")
original = text

if "API_URL," not in text and 'from "../../services/api";' in text:
    text = text.replace("import {\n", "import {\n  API_URL,\n", 1)

helper = """
const API_BASE = API_URL || "http://127.0.0.1:8001";

function cleanPhone(value) {
  let phone = String(value || "").replace(/[^\\\\d+]/g, "");
  if (!phone) return "";
  if (phone.startsWith("00")) phone = phone.slice(2);
  if (phone.startsWith("0")) phone = `98${phone.slice(1)}`;
  if (phone.startsWith("+")) phone = phone.slice(1);
  return phone;
}

function openWhatsApp(phone, text = "") {
  const cleaned = cleanPhone(phone);
  if (!cleaned) return false;
  const url = `https://wa.me/${cleaned}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
  window.open(url, "_blank", "noreferrer");
  return true;
}

"""
if "function cleanPhone(value)" not in text and "function toNumber(value)" in text:
    text = text.replace("function toNumber(value)", helper + "function toNumber(value)", 1)

old_upload = """
async function uploadFilePlaceholder(payload) {
    const tempFile = {
      id: `local-${Date.now()}`,
      title: payload.title || payload.file?.name || "File",
      description: payload.description || "",
      category: payload.category || "document",
      type: payload.file?.type || "",
      size: payload.file?.size ? `${Math.round(payload.file.size / 1024)} KB` : "",
      created_at: new Date().toISOString(),
      url: "",
    };
    setFiles((prev) => [tempFile, ...prev]);
    setMessage(fa ? "فایل فعلاً به صورت محلی در صفحه اضافه شد. اتصال آپلود بک‌اند در مرحله بعد فعال می‌شود." : "File added locally. Backend upload will be connected in the next step.");
  }

  function deleteFilePlaceholder(fileId) {
    setFiles((prev) => prev.filter((x) => String(x.id) !== String(fileId)));
  }
""".strip()

new_upload = """
async function uploadCustomerFile(payload) {
    if (!payload?.file) return;

    const form = new FormData();
    form.append("file", payload.file);
    form.append("title", payload.title || payload.file.name);
    form.append("description", payload.description || "");
    form.append("category", payload.category || "document");

    const res = await fetch(`${API_BASE}/api/crm/customers/${id}/files`, {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || "Upload failed");
    }

    setMessage(fa ? "فایل با موفقیت آپلود شد." : "File uploaded.");
    await loadCustomer360();
  }

  async function deleteCustomerFile(fileId) {
    if (!window.confirm(fa ? "فایل حذف شود؟" : "Delete file?")) return;

    const res = await fetch(`${API_BASE}/api/crm/files/${fileId}`, {
      method: "DELETE",
    });

    if (!res.ok) throw new Error("Delete failed");

    setMessage(fa ? "فایل حذف شد." : "File deleted.");
    await loadCustomer360();
  }
""".strip()

if old_upload in text:
    text = text.replace(old_upload, new_upload)

if "async function fetchCustomerFiles" not in text and "async function loadCustomer360()" in text:
    fetcher = """
async function fetchCustomerFiles(customerId) {
    try {
      const res = await fetch(`${API_BASE}/api/crm/customers/${customerId}/files`);
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : [];
    } catch {
      return [];
    }
  }

  """
    text = text.replace("async function loadCustomer360()", fetcher + "async function loadCustomer360()", 1)

if "fetchCustomerFiles(id)" not in text:
    text = text.replace("getCrmTasks(id),\n      ]);", "getCrmTasks(id),\n        fetchCustomerFiles(id),\n      ]);")
    text = text.replace("const [customerData, timelineData, notesData, tasksData]", "const [customerData, timelineData, notesData, tasksData, filesData]")

if "filesData?.length" not in text:
    text = text.replace(
        "const maybeFiles = customerData?.files || customerData?.documents || customerData?.attachments || [];",
        "const maybeFiles = filesData?.length ? filesData : customerData?.files || customerData?.documents || customerData?.attachments || [];"
    )

text = text.replace("onUploadFile={uploadFilePlaceholder}", "onUploadFile={uploadCustomerFile}")
text = text.replace("onDeleteFile={deleteFilePlaceholder}", "onDeleteFile={deleteCustomerFile}")

if "function handleWhatsApp()" not in text:
    handler = """
function handleWhatsApp() {
    const text = fa
      ? `سلام ${data?.customer?.name || ""} عزیز، از طرف Vetrix ERP برای پیگیری با شما در ارتباط هستیم.`
      : `Hello ${data?.customer?.name || ""}, we are contacting you from Vetrix ERP for follow-up.`;
    const ok = openWhatsApp(data?.customer?.mobile || data?.customer?.phone, text);
    if (!ok) setMessage(fa ? "شماره موبایل معتبر برای واتساپ ثبت نشده است." : "No valid WhatsApp number.");
  }

  """
    text = text.replace("const customer = data?.customer;", handler + "const customer = data?.customer;", 1)

if "{fa ? \"واتساپ\"" not in text and "onClick={loadCustomer360}" in text:
    text = text.replace(
        '<button\n          onClick={loadCustomer360}',
        '<button onClick={handleWhatsApp} className="px-4 py-3 rounded-2xl bg-emerald-500 text-slate-950 font-black flex items-center gap-2">\n            <MessageCircle size={18} />\n            {fa ? "واتساپ" : "WhatsApp"}\n          </button>\n\n          <button\n          onClick={loadCustomer360}',
        1
    )

if text != original:
    path.write_text(text, encoding="utf-8")
    print("PATCHED:", path)
else:
    print("OK:", path)

print("CRM final close frontend patch done.")
