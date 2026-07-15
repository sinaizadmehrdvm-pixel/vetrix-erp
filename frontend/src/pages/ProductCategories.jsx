import { useState } from "react";
import { Plus, Trash2, Search } from "lucide-react";
import { useLanguage } from "../localization/useLanguage";

export default function ProductCategories() {
  const { language, n } = useLanguage();

  const [categories, setCategories] = useState([
    {
      id: 1,
      main: language === "fa" ? "کالاهای عمومی" : "General Products",
      sub: language === "fa" ? "مصرفی" : "Consumables",
      code: "GEN-001",
    },
  ]);

  const [form, setForm] = useState({
    main: "",
    sub: "",
    code: "",
  });

  function addCategory() {
    if (!form.main) return;

    setCategories([
      {
        id: Date.now(),
        main: form.main,
        sub: form.sub,
        code: form.code,
      },
      ...categories,
    ]);

    setForm({
      main: "",
      sub: "",
      code: "",
    });
  }

  function removeCategory(id) {
    setCategories(categories.filter((item) => item.id !== id));
  }

  return (
    <div dir={language === "fa" ? "rtl" : "ltr"} className="space-y-6">
      <div>
        <h1 className="text-4xl font-black text-cyan-400">
          {language === "fa" ? "دسته‌بندی کالا" : "Product Categories"}
        </h1>

        <p className="text-slate-400 mt-2">
          {language === "fa"
            ? "تعریف گروه اصلی، گروه فرعی و کد دسته‌بندی کالاها"
            : "Define main groups, sub groups and category codes"}
        </p>
      </div>

      <div className="bg-slate-900/60 border border-cyan-500/20 rounded-3xl p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input
            placeholder={language === "fa" ? "گروه اصلی" : "Main category"}
            value={form.main}
            onChange={(e) => setForm({ ...form, main: e.target.value })}
            className="bg-slate-800 rounded-2xl p-4 outline-none"
          />

          <input
            placeholder={language === "fa" ? "گروه فرعی" : "Sub category"}
            value={form.sub}
            onChange={(e) => setForm({ ...form, sub: e.target.value })}
            className="bg-slate-800 rounded-2xl p-4 outline-none"
          />

          <input
            placeholder={language === "fa" ? "کد دسته‌بندی" : "Category code"}
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            className="bg-slate-800 rounded-2xl p-4 outline-none"
          />
        </div>

        <button
          onClick={addCategory}
          className="mt-5 px-5 py-3 rounded-2xl bg-cyan-400 text-slate-950 font-black flex items-center gap-2"
        >
          <Plus size={18} />
          {language === "fa" ? "افزودن دسته‌بندی" : "Add Category"}
        </button>
      </div>

      <div className="bg-slate-900/60 border border-cyan-500/20 rounded-3xl p-5">
        <div className="flex items-center gap-2 bg-slate-800 rounded-2xl px-4 py-3 mb-5">
          <Search size={18} />
          <input
            placeholder={language === "fa" ? "جستجوی دسته‌بندی..." : "Search category..."}
            className="bg-transparent outline-none w-full"
          />
        </div>

        <table className="w-full">
          <thead>
            <tr className="text-cyan-300 border-b border-cyan-500/20">
              <th className="p-4 text-start">ID</th>
              <th className="p-4 text-start">
                {language === "fa" ? "گروه اصلی" : "Main"}
              </th>
              <th className="p-4 text-start">
                {language === "fa" ? "گروه فرعی" : "Sub"}
              </th>
              <th className="p-4 text-start">
                {language === "fa" ? "کد" : "Code"}
              </th>
              <th className="p-4 text-start">
                {language === "fa" ? "عملیات" : "Action"}
              </th>
            </tr>
          </thead>

          <tbody>
            {categories.map((item) => (
              <tr
                key={item.id}
                className="border-b border-white/5 hover:bg-cyan-500/5"
              >
                <td className="p-4">#{n(item.id)}</td>
                <td className="p-4 font-bold">{item.main}</td>
                <td className="p-4">{item.sub || "-"}</td>
                <td className="p-4">{item.code || "-"}</td>
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
      </div>
    </div>
  );
}