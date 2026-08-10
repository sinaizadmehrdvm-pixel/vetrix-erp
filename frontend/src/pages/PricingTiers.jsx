import { useEffect, useMemo, useState } from "react";
import { Layers, ListTree, Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import { useLanguage } from "../localization/useLanguage";
import { toPersianDigits, cleanNumberInput } from "../localization/helpers";
import {
  createPriceTier,
  createPricingRule,
  deletePriceTier,
  deletePricingRule,
  getBranches,
  getCustomers,
  getPriceQuote,
  getPriceTiers,
  getPricingRules,
  getProducts,
  updatePricingRule,
} from "../services/api";
import Modal from "../components/ui/Modal";
import { Table, Thead, Th, Tbody, Tr, Td, EmptyRow } from "../components/ui/Table";

const cardClass = "rounded-2xl border border-[var(--erp-border)] bg-[var(--erp-panel)] p-5";
const inputClass = "w-full mb-3 p-3 rounded-xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)] outline-none focus:ring-2 focus:ring-cyan-400";

const SCOPE_TYPES = ["all", "product", "category", "brand"];
const CUSTOMER_SCOPE_TYPES = ["any", "group", "loyalty_tier", "customer"];
const PRICE_MODES = ["fixed", "percent_discount", "fixed_discount", "markup"];
const LOYALTY_LEVELS = ["Bronze", "Silver", "Gold", "Platinum", "VIP"];

const emptyRuleDraft = {
  name: "", priority: 100, scope_type: "all", scope_value: "", customer_scope_type: "any",
  customer_scope_value: "", branch_id: "", channel: "", min_quantity: 0, max_quantity: "",
  price_mode: "fixed", price_value: 0, currency: "", start_date: "", end_date: "", status: "active", notes: "",
};

export default function PricingTiers() {
  const { dir, language, money, n } = useLanguage();
  const fa = language === "fa";
  const tr = (faText, arText, trText, enText) => (fa ? faText : language === "ar" ? arText : language === "tr" ? trText : enText);

  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState("");
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [minQuantity, setMinQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [customerGroup, setCustomerGroup] = useState("");

  const [rules, setRules] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [ruleDraft, setRuleDraft] = useState(emptyRuleDraft);
  const [savingRule, setSavingRule] = useState(false);

  const [sim, setSim] = useState({ product_id: "", customer_id: "", quantity: 1, branch_id: "", channel: "", on_date: "" });
  const [simResult, setSimResult] = useState(null);
  const [simLoading, setSimLoading] = useState(false);

  async function loadRulesData() {
    try {
      const [rulesData, customersData, branchesData] = await Promise.all([getPricingRules(), getCustomers(), getBranches()]);
      setRules(rulesData.items || []);
      setCustomers(Array.isArray(customersData) ? customersData : []);
      setBranches(branchesData.items || []);
    } catch (err) {
      toast.error(err.message);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void loadRulesData(); }, 0);
    return () => clearTimeout(timer);
  }, []);

  const scopeTypeLabel = (t) => ({
    all: tr("همه محصولات", "كل المنتجات", "Tüm ürünler", "All products"),
    product: tr("محصول خاص", "منتج محدد", "Belirli ürün", "Specific product"),
    category: tr("دسته‌بندی", "الفئة", "Kategori", "Category"),
    brand: tr("برند", "العلامة التجارية", "Marka", "Brand"),
  }[t] || t);

  const customerScopeTypeLabel = (t) => ({
    any: tr("همه مشتریان", "جميع العملاء", "Tüm müşteriler", "Any customer"),
    group: tr("گروه مشتری", "مجموعة العملاء", "Müşteri grubu", "Customer group"),
    loyalty_tier: tr("سطح باشگاه مشتریان", "مستوى ولاء العميل", "Sadakat seviyesi", "Loyalty tier"),
    customer: tr("مشتری خاص", "عميل محدد", "Belirli müşteri", "Specific customer"),
  }[t] || t);

  const priceModeLabel = (m) => ({
    fixed: tr("قیمت ثابت", "سعر ثابت", "Sabit fiyat", "Fixed price"),
    percent_discount: tr("درصد تخفیف", "خصم بالنسبة المئوية", "Yüzde indirim", "Percent discount"),
    fixed_discount: tr("تخفیف مبلغ ثابت", "خصم بمبلغ ثابت", "Sabit tutar indirim", "Fixed amount discount"),
    markup: tr("افزایش قیمت (مارک‌آپ)", "هامش ربح", "Kar marjı (markup)", "Markup"),
  }[m] || m);

  function openCreateRule() {
    setEditingRuleId(null);
    setRuleDraft(emptyRuleDraft);
    setRuleModalOpen(true);
  }

  function openEditRule(rule) {
    setEditingRuleId(rule.id);
    setRuleDraft({
      ...emptyRuleDraft, ...rule,
      branch_id: rule.branch_id ?? "", max_quantity: rule.max_quantity ?? "",
      start_date: rule.start_date || "", end_date: rule.end_date || "",
    });
    setRuleModalOpen(true);
  }

  async function handleSaveRule(event) {
    event.preventDefault();
    if (ruleDraft.scope_type !== "all" && !ruleDraft.scope_value) {
      toast.error(tr("مقدار محدوده را وارد کنید.", "أدخل قيمة النطاق.", "Kapsam değerini girin.", "Enter a scope value."));
      return;
    }
    setSavingRule(true);
    try {
      const payload = {
        ...ruleDraft,
        priority: Number(ruleDraft.priority) || 100,
        branch_id: ruleDraft.branch_id === "" ? null : Number(ruleDraft.branch_id),
        min_quantity: Number(ruleDraft.min_quantity) || 0,
        max_quantity: ruleDraft.max_quantity === "" ? null : Number(ruleDraft.max_quantity),
        price_value: Number(ruleDraft.price_value) || 0,
        start_date: ruleDraft.start_date || null,
        end_date: ruleDraft.end_date || null,
      };
      if (editingRuleId) {
        await updatePricingRule(editingRuleId, payload);
        toast.success(tr("قانون قیمت‌گذاری ویرایش شد.", "تم تعديل قاعدة التسعير.", "Fiyatlandırma kuralı güncellendi.", "Pricing rule updated."));
      } else {
        await createPricingRule(payload);
        toast.success(tr("قانون قیمت‌گذاری اضافه شد.", "تمت إضافة قاعدة التسعير.", "Fiyatlandırma kuralı eklendi.", "Pricing rule created."));
      }
      setRuleModalOpen(false);
      await loadRulesData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingRule(false);
    }
  }

  async function handleDeleteRule(id) {
    try {
      await deletePricingRule(id);
      toast.success(tr("قانون قیمت‌گذاری حذف شد.", "تم حذف قاعدة التسعير.", "Fiyatlandırma kuralı silindi.", "Pricing rule deleted."));
      await loadRulesData();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function runSimulation(event) {
    event.preventDefault();
    if (!sim.product_id) {
      toast.error(tr("یک کالا انتخاب کنید.", "اختر منتجًا.", "Bir ürün seçin.", "Select a product."));
      return;
    }
    setSimLoading(true);
    try {
      const result = await getPriceQuote(sim.product_id, sim.quantity || 1, sim.customer_id || undefined, {
        branch_id: sim.branch_id || undefined, channel: sim.channel || undefined, on_date: sim.on_date || undefined,
      });
      setSimResult(result);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSimLoading(false);
    }
  }

  const selectedProduct = useMemo(
    () => products.find((p) => String(p.id) === String(productId)),
    [products, productId]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      getProducts()
        .then((data) => setProducts(Array.isArray(data) ? data : []))
        .catch((err) => toast.error(err.message))
        .finally(() => setLoading(false));
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  async function loadTiers(forProductId) {
    if (!forProductId) {
      setTiers([]);
      return;
    }
    try {
      const data = await getPriceTiers(forProductId);
      setTiers(data.items || []);
    } catch (err) {
      toast.error(err.message);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => { void loadTiers(productId); }, 0);
    return () => clearTimeout(timer);
  }, [productId]);

  async function handleCreate(event) {
    event.preventDefault();
    if (!productId) {
      toast.error(language === "fa" ? "یک کالا انتخاب کنید." : language === "ar" ? "اختر منتجًا." : language === "tr" ? "Bir ürün seçin." : "Select a product.");
      return;
    }
    if (!minQuantity || !unitPrice) {
      toast.error(language === "fa" ? "حداقل تعداد و قیمت را وارد کنید." : language === "ar" ? "أدخل الحد الأدنى للكمية وسعر الوحدة." : language === "tr" ? "Minimum miktar ve birim fiyatı girin." : "Enter a minimum quantity and unit price.");
      return;
    }
    setCreating(true);
    try {
      await createPriceTier({
        product_id: Number(productId),
        min_quantity: Number(minQuantity),
        unit_price: Number(unitPrice),
        customer_group: customerGroup || null,
      });
      toast.success(language === "fa" ? "پله قیمتی اضافه شد." : language === "ar" ? "تمت إضافة الشريحة السعرية." : language === "tr" ? "Fiyat kademesi eklendi." : "Price tier added.");
      setMinQuantity("");
      setUnitPrice("");
      setCustomerGroup("");
      await loadTiers(productId);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id) {
    try {
      await deletePriceTier(id);
      toast.success(language === "fa" ? "پله قیمتی حذف شد." : language === "ar" ? "تم حذف الشريحة السعرية." : language === "tr" ? "Fiyat kademesi silindi." : "Price tier removed.");
      await loadTiers(productId);
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div dir={dir} className="p-4 md:p-6 space-y-6 text-[var(--erp-text)]">
      <h1 className="text-2xl font-black flex items-center gap-2">
        <Layers className="text-[var(--erp-accent)]" />
        {language === "fa" ? "قیمت‌گذاری پلکانی و عمده‌فروشی" : language === "ar" ? "التسعير المتدرج والجملة" : language === "tr" ? "Kademeli ve toptan fiyatlandırma" : "Tiered & wholesale pricing"}
      </h1>

      <section className={cardClass}>
        <label className="block text-sm text-[var(--erp-muted)] mb-2">
          {language === "fa" ? "انتخاب کالا" : language === "ar" ? "اختيار المنتج" : language === "tr" ? "Ürün Seç" : "Select product"}
        </label>
        <select
          className={inputClass}
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          disabled={loading}
        >
          <option value="">{language === "fa" ? "یک کالا انتخاب کنید..." : language === "ar" ? "اختر منتجًا..." : language === "tr" ? "Bir ürün seçin..." : "Choose a product..."}</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {selectedProduct && (
          <p className="text-sm text-[var(--erp-muted)] mb-4">
            {language === "fa" ? "قیمت پایه: " : language === "ar" ? "السعر الأساسي: " : language === "tr" ? "Taban fiyat: " : "Base price: "}{money(selectedProduct.sell_price || selectedProduct.price || 0)}
          </p>
        )}

        {productId && (
          <>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
              <input
                type="text"
                inputMode="numeric"
                className={inputClass + " mb-0"}
                placeholder={fa ? "حداقل تعداد" : language === "ar" ? "الحد الأدنى للكمية" : language === "tr" ? "Asgari miktar" : "Min quantity"}
                value={language === "fa" ? toPersianDigits(minQuantity) : minQuantity}
                onChange={(e) => setMinQuantity(cleanNumberInput(e.target.value))}
              />
              <input
                type="text"
                inputMode="numeric"
                className={inputClass + " mb-0"}
                placeholder={fa ? "قیمت واحد" : language === "ar" ? "سعر الوحدة" : language === "tr" ? "Birim fiyat" : "Unit price"}
                value={language === "fa" ? toPersianDigits(unitPrice) : unitPrice}
                onChange={(e) => setUnitPrice(cleanNumberInput(e.target.value))}
              />
              <select
                className={inputClass + " mb-0"}
                value={customerGroup}
                onChange={(e) => setCustomerGroup(e.target.value)}
              >
                <option value="">{fa ? "همه مشتریان" : language === "ar" ? "جميع العملاء" : language === "tr" ? "Tüm müşteriler" : "All customers"}</option>
                <option value="retail">{fa ? "فقط خرده‌فروشی" : language === "ar" ? "بيع بالتجزئة فقط" : language === "tr" ? "Sadece perakende" : "Retail only"}</option>
                <option value="wholesale">{fa ? "فقط عمده‌فروشی" : language === "ar" ? "بيع بالجملة فقط" : language === "tr" ? "Sadece toptan" : "Wholesale only"}</option>
              </select>
              <button
                type="submit"
                disabled={creating}
                className="rounded-xl bg-[var(--erp-accent)] text-black font-black px-4 py-3 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                <Plus size={16} />
                {fa ? "افزودن پله" : language === "ar" ? "إضافة شريحة" : language === "tr" ? "Kademe ekle" : "Add tier"}
              </button>
            </form>

            <div className="space-y-2">
              {tiers.length === 0 ? (
                <p className="text-[var(--erp-muted)]">{fa ? "پله قیمتی تعریف نشده است." : language === "ar" ? "لم يتم تعريف أي شريحة سعرية بعد." : language === "tr" ? "Henüz fiyat kademesi tanımlanmadı." : "No price tiers yet."}</p>
              ) : (
                tiers.map((tier) => (
                  <div key={tier.id} className="flex items-center justify-between rounded-xl bg-[var(--erp-panel-solid)] px-4 py-3">
                    <div className="text-sm">
                      {fa ? "از " : language === "ar" ? "من " : language === "tr" ? "" : "From "} {n(tier.min_quantity)} {fa ? "عدد به بعد: " : language === "ar" ? "وحدة فأكثر: " : language === "tr" ? "birimden itibaren: " : "units: "}
                      <span className="font-black text-[var(--erp-accent)]">{money(tier.unit_price)}</span>
                      {tier.customer_group && (
                        <span className="ms-2 text-xs px-2 py-1 rounded-lg bg-[var(--erp-panel-solid)]">
                          {tier.customer_group === "wholesale" ? (fa ? "عمده" : language === "ar" ? "جملة" : language === "tr" ? "toptan" : "wholesale") : (fa ? "خرده" : language === "ar" ? "تجزئة" : language === "tr" ? "perakende" : "retail")}
                        </span>
                      )}
                    </div>
                    <button onClick={() => handleDelete(tier.id)} className="text-red-300 hover:text-red-200">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </section>

      <section className={cardClass}>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <ListTree size={18} className="text-[var(--erp-accent)]" />
            {tr("قوانین قیمت‌گذاری پیشرفته", "قواعد التسعير المتقدمة", "Gelişmiş fiyatlandırma kuralları", "Advanced pricing rules")}
          </h2>
          <button onClick={openCreateRule} className="rounded-xl bg-[var(--erp-accent)] text-black font-black px-4 py-3 flex items-center gap-2">
            <Plus size={16} /> {tr("قانون جدید", "قاعدة جديدة", "Yeni kural", "New rule")}
          </button>
        </div>
        <p className="text-sm text-[var(--erp-muted)] mb-4">
          {tr(
            "این قوانین بر اساس محصول/دسته/برند، مشتری/گروه/سطح باشگاه مشتریان، شعبه، بازه تاریخ و تعداد اعمال می‌شوند و اولویت بالاتر (مشتری خاص + محصول خاص) بر قوانین کلی‌تر برتری دارد.",
            "تُطبَّق هذه القواعد حسب المنتج/الفئة/العلامة، والعميل/المجموعة/مستوى الولاء، والفرع، والفترة الزمنية، والكمية؛ وتتقدم القواعد الأكثر تحديدًا على القواعد العامة.",
            "Bu kurallar ürün/kategori/marka, müşteri/grup/sadakat seviyesi, şube, tarih aralığı ve miktara göre uygulanır; daha spesifik kurallar genel kuralların önüne geçer.",
            "These rules apply by product/category/brand, customer/group/loyalty tier, branch, date range, and quantity — more specific rules win over broader ones."
          )}
        </p>
        <Table>
          <Thead>
            <Th>#</Th>
            <Th>{tr("نام", "الاسم", "Ad", "Name")}</Th>
            <Th>{tr("محدوده محصول", "نطاق المنتج", "Ürün kapsamı", "Product scope")}</Th>
            <Th>{tr("محدوده مشتری", "نطاق العميل", "Müşteri kapsamı", "Customer scope")}</Th>
            <Th>{tr("تعداد", "الكمية", "Miktar", "Quantity")}</Th>
            <Th>{tr("رفتار قیمت", "سلوك السعر", "Fiyat davranışı", "Price behavior")}</Th>
            <Th>{tr("وضعیت", "الحالة", "Durum", "Status")}</Th>
            <Th align="end">{tr("عملیات", "الإجراءات", "İşlemler", "Actions")}</Th>
          </Thead>
          <Tbody>
            {rules.length === 0 ? (
              <EmptyRow colSpan={8}>{tr("قانونی تعریف نشده است.", "لا توجد قواعد معرّفة.", "Tanımlı kural yok.", "No rules defined.")}</EmptyRow>
            ) : rules.map((rule, index) => (
              <Tr key={rule.id}>
                <Td className="text-[var(--erp-muted)] font-bold">{n(index + 1)}</Td>
                <Td className="font-bold">{rule.name || "—"}</Td>
                <Td>{scopeTypeLabel(rule.scope_type)}{rule.scope_value ? `: ${rule.scope_value}` : ""}</Td>
                <Td>{customerScopeTypeLabel(rule.customer_scope_type)}{rule.customer_scope_value ? `: ${rule.customer_scope_value}` : ""}</Td>
                <Td>{n(rule.min_quantity)}{rule.max_quantity != null ? ` – ${n(rule.max_quantity)}` : "+"}</Td>
                <Td>{priceModeLabel(rule.price_mode)}: {rule.price_mode === "percent_discount" || rule.price_mode === "markup" ? `${n(rule.price_value)}%` : money(rule.price_value)}</Td>
                <Td>
                  {rule.status === "active" ? (
                    <span className="text-xs px-2 py-1 rounded-lg bg-emerald-500/15 text-emerald-300">{tr("فعال", "نشط", "Aktif", "Active")}</span>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded-lg bg-red-500/15 text-red-200">{tr("غیرفعال", "غير نشط", "Pasif", "Inactive")}</span>
                  )}
                </Td>
                <Td align="end">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => openEditRule(rule)} className="p-2 rounded-lg bg-[var(--erp-panel-solid)] border border-[var(--erp-border)]" title={tr("ویرایش", "تعديل", "Düzenle", "Edit")}>
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDeleteRule(rule.id)} className="p-2 rounded-lg bg-red-500/10 text-red-300" title={tr("حذف", "حذف", "Sil", "Delete")}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </section>

      <section className={cardClass}>
        <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
          <SlidersHorizontal size={18} className="text-[var(--erp-accent)]" />
          {tr("شبیه‌سازی قیمت", "محاكاة السعر", "Fiyat simülasyonu", "Price simulation")}
        </h2>
        <form onSubmit={runSimulation} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select className={inputClass} value={sim.product_id} onChange={(e) => setSim({ ...sim, product_id: e.target.value })}>
            <option value="">{tr("انتخاب کالا...", "اختر منتجًا...", "Ürün seçin...", "Select product...")}</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className={inputClass} value={sim.customer_id} onChange={(e) => setSim({ ...sim, customer_id: e.target.value })}>
            <option value="">{tr("بدون مشتری خاص", "بدون عميل محدد", "Belirli müşteri yok", "No specific customer")}</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input
            type="text" inputMode="numeric" className={inputClass}
            placeholder={tr("تعداد", "الكمية", "Miktar", "Quantity")}
            value={fa ? toPersianDigits(String(sim.quantity)) : sim.quantity}
            onChange={(e) => setSim({ ...sim, quantity: cleanNumberInput(e.target.value) })}
          />
          <select className={inputClass} value={sim.branch_id} onChange={(e) => setSim({ ...sim, branch_id: e.target.value })}>
            <option value="">{tr("بدون شعبه خاص", "بدون فرع محدد", "Belirli şube yok", "No specific branch")}</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <input type="date" className={inputClass} value={sim.on_date} onChange={(e) => setSim({ ...sim, on_date: e.target.value })} />
          <button type="submit" disabled={simLoading} className="rounded-xl bg-[var(--erp-accent)] text-black font-black px-4 py-3 disabled:opacity-60">
            {simLoading ? "…" : tr("محاسبه", "احتساب", "Hesapla", "Calculate")}
          </button>
        </form>

        {simResult && (
          <div className="mt-4 rounded-xl bg-[var(--erp-panel-solid)] p-4 space-y-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div>
                <div className="text-[var(--erp-muted)]">{tr("قیمت پایه", "السعر الأساسي", "Taban fiyat", "Base price")}</div>
                <div className="font-bold">{money(simResult.base_price)}</div>
              </div>
              <div>
                <div className="text-[var(--erp-muted)]">{tr("قانون برنده", "القاعدة الفائزة", "Kazanan kural", "Winning rule")}</div>
                <div className="font-bold">{simResult.rule_name || (simResult.source === "price_tier" ? tr("پله قیمتی قدیمی", "شريحة سعرية قديمة", "Eski fiyat kademesi", "Legacy price tier") : tr("بدون قانون (پایه)", "لا توجد قاعدة (أساسي)", "Kural yok (taban)", "No rule (base)"))}</div>
              </div>
              <div>
                <div className="text-[var(--erp-muted)]">{tr("مبلغ تخفیف", "مبلغ الخصم", "İndirim tutarı", "Discount amount")}</div>
                <div className="font-bold">{money(simResult.discount_amount)}</div>
              </div>
              <div>
                <div className="text-[var(--erp-muted)]">{tr("قیمت نهایی واحد", "السعر النهائي للوحدة", "Nihai birim fiyat", "Final unit price")}</div>
                <div className="font-black text-[var(--erp-accent)]">{money(simResult.unit_price)}</div>
              </div>
            </div>
            <div className="text-sm pt-2 border-t border-[var(--erp-border)]">
              <span className="text-[var(--erp-muted)]">{tr("جمع کل: ", "الإجمالي: ", "Toplam: ", "Total: ")}</span>
              <span className="font-black">{money(simResult.unit_price * Number(sim.quantity || 1))}</span>
            </div>
            {simResult.matched_rules?.length > 1 && (
              <div className="text-xs text-[var(--erp-muted)] pt-2">
                {tr("سایر قوانین منطبق: ", "قواعد أخرى مطابقة: ", "Diğer eşleşen kurallar: ", "Other matching rules: ")}
                {simResult.matched_rules.filter((r) => r.id !== simResult.rule_id).map((r) => r.name).join(", ")}
              </div>
            )}
          </div>
        )}
      </section>

      <Modal open={ruleModalOpen} onClose={() => setRuleModalOpen(false)} maxWidthClassName="max-w-2xl" labelledBy="pricing-rule-title">
        <form onSubmit={handleSaveRule} className="p-5 space-y-3">
          <h2 id="pricing-rule-title" className="text-lg font-bold mb-2">
            {editingRuleId ? tr("ویرایش قانون قیمت‌گذاری", "تعديل قاعدة التسعير", "Fiyatlandırma kuralını düzenle", "Edit pricing rule") : tr("قانون قیمت‌گذاری جدید", "قاعدة تسعير جديدة", "Yeni fiyatlandırma kuralı", "New pricing rule")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input className={inputClass} placeholder={tr("نام قانون", "اسم القاعدة", "Kural adı", "Rule name")} value={ruleDraft.name} onChange={(e) => setRuleDraft({ ...ruleDraft, name: e.target.value })} />
            <input type="number" className={inputClass} placeholder={tr("اولویت (عدد کمتر = اولویت بالاتر در تساوی)", "الأولوية", "Öncelik", "Priority")} value={ruleDraft.priority} onChange={(e) => setRuleDraft({ ...ruleDraft, priority: e.target.value })} />

            <select className={inputClass} value={ruleDraft.scope_type} onChange={(e) => setRuleDraft({ ...ruleDraft, scope_type: e.target.value, scope_value: "" })}>
              {SCOPE_TYPES.map((t) => <option key={t} value={t}>{scopeTypeLabel(t)}</option>)}
            </select>
            {ruleDraft.scope_type === "all" ? (
              <div />
            ) : ruleDraft.scope_type === "product" ? (
              <select className={inputClass} value={ruleDraft.scope_value} onChange={(e) => setRuleDraft({ ...ruleDraft, scope_value: e.target.value })}>
                <option value="">{tr("انتخاب کالا...", "اختر منتجًا...", "Ürün seçin...", "Select product...")}</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            ) : (
              <input className={inputClass} placeholder={ruleDraft.scope_type === "category" ? tr("نام دسته‌بندی", "اسم الفئة", "Kategori adı", "Category name") : tr("نام برند", "اسم العلامة التجارية", "Marka adı", "Brand name")} value={ruleDraft.scope_value} onChange={(e) => setRuleDraft({ ...ruleDraft, scope_value: e.target.value })} />
            )}

            <select className={inputClass} value={ruleDraft.customer_scope_type} onChange={(e) => setRuleDraft({ ...ruleDraft, customer_scope_type: e.target.value, customer_scope_value: "" })}>
              {CUSTOMER_SCOPE_TYPES.map((t) => <option key={t} value={t}>{customerScopeTypeLabel(t)}</option>)}
            </select>
            {ruleDraft.customer_scope_type === "any" ? (
              <div />
            ) : ruleDraft.customer_scope_type === "group" ? (
              <select className={inputClass} value={ruleDraft.customer_scope_value} onChange={(e) => setRuleDraft({ ...ruleDraft, customer_scope_value: e.target.value })}>
                <option value="">{tr("انتخاب گروه...", "اختر مجموعة...", "Grup seçin...", "Select group...")}</option>
                <option value="retail">{tr("خرده‌فروشی", "تجزئة", "Perakende", "Retail")}</option>
                <option value="wholesale">{tr("عمده‌فروشی", "جملة", "Toptan", "Wholesale")}</option>
              </select>
            ) : ruleDraft.customer_scope_type === "loyalty_tier" ? (
              <select className={inputClass} value={ruleDraft.customer_scope_value} onChange={(e) => setRuleDraft({ ...ruleDraft, customer_scope_value: e.target.value })}>
                <option value="">{tr("انتخاب سطح...", "اختر مستوى...", "Seviye seçin...", "Select tier...")}</option>
                {LOYALTY_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            ) : (
              <select className={inputClass} value={ruleDraft.customer_scope_value} onChange={(e) => setRuleDraft({ ...ruleDraft, customer_scope_value: e.target.value })}>
                <option value="">{tr("انتخاب مشتری...", "اختر عميلاً...", "Müşteri seçin...", "Select customer...")}</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}

            <select className={inputClass} value={ruleDraft.branch_id} onChange={(e) => setRuleDraft({ ...ruleDraft, branch_id: e.target.value })}>
              <option value="">{tr("همه شعب", "كل الفروع", "Tüm şubeler", "All branches")}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <input className={inputClass} placeholder={tr("کانال فروش (اختیاری، مثلاً online)", "قناة البيع (اختياري)", "Satış kanalı (isteğe bağlı)", "Sales channel (optional)")} value={ruleDraft.channel} onChange={(e) => setRuleDraft({ ...ruleDraft, channel: e.target.value })} />

            <input type="number" className={inputClass} placeholder={tr("حداقل تعداد", "الحد الأدنى للكمية", "Asgari miktar", "Min quantity")} value={ruleDraft.min_quantity} onChange={(e) => setRuleDraft({ ...ruleDraft, min_quantity: e.target.value })} />
            <input type="number" className={inputClass} placeholder={tr("حداکثر تعداد (اختیاری)", "الحد الأقصى للكمية (اختياري)", "Azami miktar (isteğe bağlı)", "Max quantity (optional)")} value={ruleDraft.max_quantity} onChange={(e) => setRuleDraft({ ...ruleDraft, max_quantity: e.target.value })} />

            <select className={inputClass} value={ruleDraft.price_mode} onChange={(e) => setRuleDraft({ ...ruleDraft, price_mode: e.target.value })}>
              {PRICE_MODES.map((m) => <option key={m} value={m}>{priceModeLabel(m)}</option>)}
            </select>
            <input type="number" step="any" className={inputClass} placeholder={tr("مقدار (مبلغ یا درصد)", "القيمة (مبلغ أو نسبة)", "Değer (tutar veya yüzde)", "Value (amount or percent)")} value={ruleDraft.price_value} onChange={(e) => setRuleDraft({ ...ruleDraft, price_value: e.target.value })} />

            <label className="text-sm">
              <span className="block mb-1 text-[var(--erp-muted)]">{tr("تاریخ شروع (اختیاری)", "تاريخ البدء (اختياري)", "Başlangıç tarihi (isteğe bağlı)", "Start date (optional)")}</span>
              <input type="date" className={inputClass} value={ruleDraft.start_date} onChange={(e) => setRuleDraft({ ...ruleDraft, start_date: e.target.value })} />
            </label>
            <label className="text-sm">
              <span className="block mb-1 text-[var(--erp-muted)]">{tr("تاریخ پایان (اختیاری)", "تاريخ الانتهاء (اختياري)", "Bitiş tarihi (isteğe bağlı)", "End date (optional)")}</span>
              <input type="date" className={inputClass} value={ruleDraft.end_date} onChange={(e) => setRuleDraft({ ...ruleDraft, end_date: e.target.value })} />
            </label>

            <select className={inputClass} value={ruleDraft.status} onChange={(e) => setRuleDraft({ ...ruleDraft, status: e.target.value })}>
              <option value="active">{tr("فعال", "نشط", "Aktif", "Active")}</option>
              <option value="inactive">{tr("غیرفعال", "غير نشط", "Pasif", "Inactive")}</option>
            </select>
            <input className={inputClass} placeholder={tr("یادداشت (اختیاری)", "ملاحظة (اختياري)", "Not (isteğe bağlı)", "Notes (optional)")} value={ruleDraft.notes} onChange={(e) => setRuleDraft({ ...ruleDraft, notes: e.target.value })} />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={() => setRuleModalOpen(false)} className="px-4 py-3 rounded-xl bg-[var(--erp-panel-solid)] border border-[var(--erp-border)]">
              {tr("انصراف", "إلغاء", "İptal", "Cancel")}
            </button>
            <button type="submit" disabled={savingRule} className="rounded-xl bg-[var(--erp-accent)] text-black font-black px-4 py-3 disabled:opacity-60">
              {savingRule ? tr("در حال ذخیره...", "جارٍ الحفظ...", "Kaydediliyor...", "Saving...") : tr("ذخیره", "حفظ", "Kaydet", "Save")}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
