import { useEffect, useState } from "react";
import { Plus, Trash2, Search } from "lucide-react";
import toast from "react-hot-toast";
import { useLanguage } from "../localization/useLanguage";
import { createProductCategory, deleteProductCategory, getProductCategories } from "../services/api";

export default function ProductCategories() {
  const { language, n } = useLanguage();
  const fa = language === "fa";

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const [form, setForm] = useState({
    main_category: "",
    sub_category: "",
    code: "",
  });

  async function load() {
    try {
      setLoading(true);
      const data = await getProductCategories();
      setCategories(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(error.message || (fa ? "خطا در دریافت دسته‌بندی‌ها" : "Failed to load categories"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addCategory() {
    if (!form.main_category.trim()) return;

    try {
      const result = await createProductCategory({
        main_category: form.main_category.trim(),
        sub_category: form.sub_category.trim(),
        code: form.code.trim(),
      });
      if (result?.status === "error") throw new Error(result.message);

      setForm({ main_category: "", sub_category: "", code: "" });
      await load();
    } catch (error) {
      toast.error(error.message || (fa ? "خطا در ثبت دسته‌بندی" : "Failed to create category"));
    }
  }

  async function removeCategory(id) {
    try {
      await deleteProductCategory(id);
      setCategories((prev) => prev.filter((item) => item.id !== id));
    } catch (error) {
      toast.error(error.message || (fa ? "خطا در حذف دسته‌بندی" : "Failed to delete category"));
    }
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? categories.filter((item) =>
        [item.main_category, item.sub_category, item.code].join(" ").toLowerCase().includes(q)
      )
    : categories;

  return (
    <div dir={fa ? "rtl" : "ltr"} className="space-y-6">
      <div>
        <h1 className="text-4xl font-black text-[var(--erp-accent)]">
          {fa ? "دسته‌بندی کالا" : "Product Categories"}
        </h1>

        <p className="text-[var(--erp-muted)] mt-2">
          {fa
            ? "تعریف گروه اصلی، گروه فرعی و کد دسته‌بندی کالاها - این دسته‌بندی‌ها در فرم کالاها هم قابل انتخاب هستند"
            : "Define main groups, sub groups and category codes - these become selectable in the product form"}
        </p>
      </div>

      <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            placeholder={fa ? "گروه اصلی" : "Main category"}
            value={form.main_category}
            onChange={(e) => setForm({ ...form, main_category: e.target.value })}
            className="bg-[var(--erp-panel-solid)] text-[var(--erp-text)] rounded-2xl p-4 outline-none"
          />

          <input
            placeholder={fa ? "گروه فرعی" : "Sub category"}
            value={form.sub_category}
            onChange={(e) => setForm({ ...form, sub_category: e.target.value })}
            className="bg-[var(--erp-panel-solid)] text-[var(--erp-text)] rounded-2xl p-4 outline-none"
          />

          <input
            placeholder={fa ? "کد دسته‌بندی" : "Category code"}
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            className="bg-[var(--erp-panel-solid)] text-[var(--erp-text)] rounded-2xl p-4 outline-none"
          />
        </div>

        <button
          onClick={addCategory}
          className="mt-5 px-5 py-3 rounded-2xl bg-[var(--erp-accent)] text-slate-950 font-black flex items-center gap-2"
        >
          <Plus size={18} />
          {fa ? "افزودن دسته‌بندی" : "Add Category"}
        </button>
      </div>

      <div className="bg-[var(--erp-bg-soft)] border border-[var(--erp-border)] rounded-3xl p-5">
        <div className="flex items-center gap-2 bg-[var(--erp-panel-solid)] rounded-2xl px-4 py-3 mb-5">
          <Search size={18} className="text-[var(--erp-accent)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={fa ? "جستجوی دسته‌بندی..." : "Search category..."}
            className="bg-transparent outline-none text-[var(--erp-text)] w-full"
          />
        </div>

        {loading ? (
          <p className="text-[var(--erp-muted)] text-center py-6">{fa ? "در حال بارگذاری..." : "Loading..."}</p>
        ) : filtered.length === 0 ? (
          <p className="text-[var(--erp-muted)] text-center py-6">
            {fa ? "دسته‌بندی‌ای ثبت نشده است." : "No categories yet."}
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-[var(--erp-accent)] border-b border-[var(--erp-border)]">
                <th className="p-4 text-start">ID</th>
                <th className="p-4 text-start">{fa ? "گروه اصلی" : "Main"}</th>
                <th className="p-4 text-start">{fa ? "گروه فرعی" : "Sub"}</th>
                <th className="p-4 text-start">{fa ? "کد" : "Code"}</th>
                <th className="p-4 text-start">{fa ? "عملیات" : "Action"}</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-[var(--erp-border)] hover:bg-cyan-500/5"
                >
                  <td className="p-4 text-[var(--erp-text)]">#{n(item.id)}</td>
                  <td className="p-4 font-bold text-[var(--erp-text)]">{item.main_category}</td>
                  <td className="p-4 text-[var(--erp-text)]">{item.sub_category || "-"}</td>
                  <td className="p-4 text-[var(--erp-text)]">{item.code || "-"}</td>
                  <td className="p-4">
                    <button
                      onClick={() => removeCategory(item.id)}
                      className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center"
                    >
                      <Trash2 className="text-red-400" size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
