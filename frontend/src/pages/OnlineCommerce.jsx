import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, BadgePercent, CheckCircle2, Globe2, Megaphone, PackageCheck, RefreshCw, Save, Send, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { API_URL, getAuthHeaders } from "../services/api";
import { useLanguage } from "../localization/LanguageContext";
import { useAuth } from "../auth/AuthContext";

const channels = ["website", "instagram", "telegram", "whatsapp", "linkedin"];

async function storefrontApi(path) {
  const response = await fetch(`${API_URL}/api/storefront-sync${path}`, {
    headers: getAuthHeaders(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Storefront sync check failed");
  return data;
}

async function voiceApi(path, options = {}) {
  const response = await fetch(`${API_URL}/api/inbound-voice${path}`, {
    ...options,
    headers: { ...getAuthHeaders(), ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Voice connection check failed");
  return data;
}

async function api(path, options = {}) {
  const response = await fetch(`${API_URL}/api/online-commerce${path}`, {
    ...options,
    headers: { ...getAuthHeaders(), ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || "Request failed");
  return data;
}

export default function OnlineCommerce() {
  const { language, dir, money, n } = useLanguage();
  const { user } = useAuth();
  const fa = language === "fa";
  const [tab, setTab] = useState("products");
  const [summary, setSummary] = useState(null);
  const [products, setProducts] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [storefrontStatus, setStorefrontStatus] = useState(null);
  const [checkingConnections, setCheckingConnections] = useState(false);
  const [campaign, setCampaign] = useState({
    title: "", body: "", channel: "instagram", product_id: "", media_url: "",
    destination_url: "", scheduled_at: "",
  });

  const labels = {
    title: fa ? "مرکز فروش آنلاین و تبلیغات" : "Online Sales & Advertising",
    subtitle: fa
      ? "کنترل انتشار کالا، قیمت، موجودی، تخفیف و کمپین‌های شبکه‌های اجتماعی"
      : "Control product publishing, pricing, stock, discounts, and social campaigns",
    products: fa ? "کالاهای سایت" : "Website products",
    campaigns: fa ? "کمپین‌های تبلیغاتی" : "Campaigns",
    connections: fa ? "اتصال‌ها" : "Connections",
  };

  async function load() {
    setLoading(true);
    try {
      const [summaryData, productData, campaignData] = await Promise.all([
        api("/summary"), api("/products"), api("/campaigns"),
      ]);
      setSummary(summaryData);
      setProducts(productData);
      setCampaigns(campaignData);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function checkConnections(showToast = false) {
    if (!["admin", "accountant"].includes(user?.role)) return;
    setCheckingConnections(true);
    try {
      const [result, storefront] = await Promise.all([
        voiceApi(showToast ? "/diagnostics" : "/status", {
          method: showToast ? "POST" : "GET",
        }),
        storefrontApi("/readiness"),
      ]);
      setConnectionStatus(result);
      setStorefrontStatus(storefront);
      if (showToast) {
        const allReady = result.all_ready && storefront.ready;
        toast.success(allReady
          ? (fa ? "همه اتصال‌های صوتی و سایت آماده‌اند." : "Voice and storefront connections are ready.")
          : (fa ? "برخی تنظیمات اتصال هنوز کامل نیست." : "Some connection settings are incomplete."));
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setCheckingConnections(false);
    }
  }

  useEffect(() => {
    if (tab === "connections") checkConnections(false);
  }, [tab, user?.role]);

  function patchProduct(id, patch) {
    setProducts((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  async function saveProduct(product) {
    try {
      await api(`/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_published: Boolean(product.is_published),
          sync_stock: Boolean(product.sync_stock),
          online_price: product.online_price === "" || product.online_price == null ? null : Number(product.online_price),
          discount_percent: Number(product.discount_percent || 0),
          sale_start: product.sale_start || "",
          sale_end: product.sale_end || "",
          website_slug: product.website_slug || "",
        }),
      });
      toast.success(fa ? "تنظیمات کالا ذخیره شد" : "Product settings saved");
      load();
    } catch (error) { toast.error(error.message); }
  }

  async function createCampaign(event) {
    event.preventDefault();
    try {
      const created = await api("/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...campaign,
          product_id: campaign.product_id ? Number(campaign.product_id) : null,
        }),
      });
      await api(`/campaigns/${created.campaign_id}/submit`, { method: "POST" });
      setCampaign({ title: "", body: "", channel: "instagram", product_id: "", media_url: "", destination_url: "", scheduled_at: "" });
      toast.success(fa ? "کمپین برای تأیید مدیر ارسال شد" : "Campaign submitted for manager approval");
      load();
    } catch (error) { toast.error(error.message); }
  }

  return (
    <div dir={dir} className="space-y-5">
      <header className="erp-surface rounded-3xl p-6 overflow-hidden relative">
        <div className="absolute inset-0 opacity-40" style={{ background: "radial-gradient(circle at top right,var(--erp-glow),transparent 55%)" }} />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3">
              <Globe2 className="erp-accent" size={34} />
              <h1 className="text-3xl font-black erp-accent">{labels.title}</h1>
            </div>
            <p className="mt-2" style={{ color: "var(--erp-muted)" }}>{labels.subtitle}</p>
          </div>
          <button onClick={load} className="erp-surface erp-accent rounded-2xl px-4 py-3 font-black flex items-center gap-2">
            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            {fa ? "به‌روزرسانی" : "Refresh"}
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Metric icon={<PackageCheck />} label={fa ? "کالاهای منتشرشده" : "Published products"} value={summary?.products?.published || 0} n={n} />
        <Metric icon={<BadgePercent />} label={fa ? "کالاهای تخفیف‌دار" : "Discounted products"} value={summary?.products?.discounted || 0} n={n} />
        <Metric icon={<ShieldCheck />} label={fa ? "در انتظار تأیید" : "Pending approval"} value={summary?.campaigns?.pending || 0} n={n} />
        <Metric icon={<Send />} label={fa ? "کمپین منتشرشده" : "Published campaigns"} value={summary?.campaigns?.published || 0} n={n} />
      </section>

      <div className="erp-surface rounded-2xl p-2 flex gap-2 flex-wrap">
        {[
          ["products", labels.products, PackageCheck],
          ["campaigns", labels.campaigns, Megaphone],
          ["connections", labels.connections, Globe2],
        ].map(([id, text, Icon]) => (
          <button key={id} onClick={() => setTab(id)} className="rounded-xl px-4 py-3 font-black flex items-center gap-2"
            style={{ background: tab === id ? "linear-gradient(110deg,var(--erp-accent),var(--erp-accent-2))" : "transparent", color: tab === id ? "#071028" : "var(--erp-text)" }}>
            <Icon size={18} />{text}
          </button>
        ))}
      </div>

      {tab === "products" && (
        <div className="erp-surface rounded-3xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px]">
              <thead style={{ background: "var(--erp-panel-solid)" }}>
                <tr>{[fa ? "کالا" : "Product", fa ? "موجودی" : "Stock", fa ? "قیمت حسابداری" : "ERP price", fa ? "قیمت سایت" : "Online price", fa ? "تخفیف٪" : "Discount %", fa ? "انتشار" : "Publish", fa ? "همگام‌سازی موجودی" : "Sync stock", ""].map((text) => <th key={text} className="p-4 text-start">{text}</th>)}</tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.id} style={{ borderTop: "1px solid var(--erp-border)" }}>
                    <td className="p-4 font-black">{product.name}</td>
                    <td className="p-4">{n(product.stock || 0)}</td>
                    <td className="p-4">{money(product.sell_price || 0)}</td>
                    <td className="p-3"><input type="number" min="0" className="erp-focus rounded-xl p-3 w-36" style={inputStyle} value={product.online_price ?? ""} onChange={(e) => patchProduct(product.id, { online_price: e.target.value })} /></td>
                    <td className="p-3"><input type="number" min="0" max="100" className="erp-focus rounded-xl p-3 w-24" style={inputStyle} value={product.discount_percent || 0} onChange={(e) => patchProduct(product.id, { discount_percent: e.target.value })} /></td>
                    <td className="p-4"><Toggle value={Boolean(product.is_published)} onChange={(value) => patchProduct(product.id, { is_published: value })} /></td>
                    <td className="p-4"><Toggle value={Boolean(product.sync_stock)} onChange={(value) => patchProduct(product.id, { sync_stock: value })} /></td>
                    <td className="p-3"><button onClick={() => saveProduct(product)} className="rounded-xl p-3 font-black flex items-center gap-2" style={{ background: "var(--erp-accent)", color: "#071028" }}><Save size={17} />{fa ? "ذخیره" : "Save"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!products.length && !loading && <p className="p-8 text-center" style={{ color: "var(--erp-muted)" }}>{fa ? "ابتدا کالاها را در بخش کالا ثبت کنید." : "Create products in Products first."}</p>}
        </div>
      )}

      {tab === "campaigns" && (
        <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-5">
          <form onSubmit={createCampaign} className="erp-surface rounded-3xl p-5 space-y-3">
            <h2 className="text-xl font-black erp-accent">{fa ? "کمپین جدید" : "New campaign"}</h2>
            <Input label={fa ? "عنوان" : "Title"} value={campaign.title} onChange={(value) => setCampaign({ ...campaign, title: value })} required />
            <label className="block text-sm font-bold">{fa ? "شبکه" : "Channel"}<select style={inputStyle} className="w-full rounded-xl p-3 mt-1" value={campaign.channel} onChange={(e) => setCampaign({ ...campaign, channel: e.target.value })}>{channels.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="block text-sm font-bold">{fa ? "کالای مرتبط" : "Related product"}<select style={inputStyle} className="w-full rounded-xl p-3 mt-1" value={campaign.product_id} onChange={(e) => setCampaign({ ...campaign, product_id: e.target.value })}><option value="">{fa ? "بدون کالا" : "No product"}</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="block text-sm font-bold">{fa ? "متن تبلیغ" : "Post copy"}<textarea rows={5} style={inputStyle} className="w-full rounded-xl p-3 mt-1" value={campaign.body} onChange={(e) => setCampaign({ ...campaign, body: e.target.value })} /></label>
            <Input label={fa ? "لینک مقصد" : "Destination URL"} value={campaign.destination_url} onChange={(value) => setCampaign({ ...campaign, destination_url: value })} />
            <Input label={fa ? "زمان انتشار" : "Schedule"} type="datetime-local" value={campaign.scheduled_at} onChange={(value) => setCampaign({ ...campaign, scheduled_at: value })} />
            <button className="w-full rounded-2xl p-4 font-black flex items-center justify-center gap-2" style={{ background: "linear-gradient(110deg,var(--erp-accent),var(--erp-accent-2))", color: "#071028" }}><ShieldCheck size={18} />{fa ? "ارسال برای تأیید مدیر" : "Submit for approval"}</button>
          </form>
          <div className="space-y-3">
            {campaigns.map((item) => <CampaignCard key={item.id} item={item} fa={fa} />)}
            {!campaigns.length && <div className="erp-surface rounded-3xl p-8 text-center">{fa ? "کمپینی ثبت نشده است." : "No campaigns yet."}</div>}
          </div>
        </div>
      )}

      {tab === "connections" && (
        <div className="erp-surface rounded-3xl p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <ShieldCheck className="erp-accent mb-3" size={34} />
              <h2 className="text-xl font-black">{fa ? "اتصال امن سرویس‌ها" : "Secure service connections"}</h2>
              <p className="mt-2" style={{ color: "var(--erp-muted)" }}>
                {fa ? "فقط وضعیت تنظیم‌شدن Secretها نمایش داده می‌شود و مقدار هیچ کلیدی از سرور خارج نمی‌شود." : "Only secret readiness is reported; secret values never leave the server."}
              </p>
            </div>
            {["admin", "accountant"].includes(user?.role) && <button type="button" onClick={() => checkConnections(true)} disabled={checkingConnections} className="rounded-2xl px-4 py-3 font-black flex items-center gap-2" style={{ background: "var(--erp-accent)", color: "#071028", opacity: checkingConnections ? .6 : 1 }}><Activity size={18} />{checkingConnections ? "..." : (fa ? "اجرای عیب‌یابی امن" : "Run secure diagnostics")}</button>}
          </div>
          {!["admin", "accountant"].includes(user?.role) && <div className="mt-5 rounded-2xl p-4 flex gap-3 items-center" style={{ background: "rgba(245,158,11,.12)", color: "#fde68a" }}><AlertTriangle />{fa ? "مشاهده وضعیت اتصال فقط برای مدیر و حسابدار مجاز است." : "Connection status is restricted to managers."}</div>}
          {connectionStatus && <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
            {["telegram", "whatsapp"].map((channel) => {
              const status = connectionStatus[channel];
              return <article key={channel} className="rounded-2xl p-5" style={{ background: "var(--erp-panel-solid)", border: `1px solid ${status.ready ? "#22c55e" : "#f59e0b"}` }}>
                <div className="flex items-center justify-between gap-3"><strong className="text-lg">{channel}</strong>{status.ready ? <CheckCircle2 color="#86efac" /> : <AlertTriangle color="#fcd34d" />}</div>
                <p className="mt-3 font-black" style={{ color: status.ready ? "#86efac" : "#fcd34d" }}>{status.ready ? (fa ? "آماده فعال‌سازی واقعی" : "Ready for live activation") : (fa ? "تنظیمات ناقص" : "Configuration incomplete")}</p>
                <code className="block mt-3 text-xs" dir="ltr">{status.webhook_path}</code>
              </article>;
            })}
            <article className="rounded-2xl p-5 md:col-span-2" style={{ background: "var(--erp-panel-solid)", border: "1px solid var(--erp-border)" }}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                <ConnectionMetric label={fa ? "فرستنده مجاز" : "Allowed senders"} value={n(connectionStatus.allowed_sender_count)} />
                <ConnectionMetric label={fa ? "حساب سرویس معتبر" : "Valid service user"} value={connectionStatus.service_user?.valid && connectionStatus.service_user?.non_admin ? (fa ? "بله" : "Yes") : (fa ? "خیر" : "No")} />
                <ConnectionMetric label={fa ? "پیام دریافت‌شده" : "Received events"} value={n(connectionStatus.events?.total || 0)} />
                <ConnectionMetric label={fa ? "افشای Secret" : "Secret exposure"} value={connectionStatus.secrets_exposed ? (fa ? "خطر" : "Risk") : (fa ? "صفر" : "None")} />
              </div>
            </article>
          </div>}
          {storefrontStatus && <article className="rounded-2xl p-5 mt-5" style={{ background: "var(--erp-panel-solid)", border: `1px solid ${storefrontStatus.ready ? "#22c55e" : "#f59e0b"}` }}>
            <div className="flex items-center justify-between gap-3"><strong className="text-lg">{fa ? "همگام‌سازی فروشگاه" : "Storefront synchronization"}</strong>{storefrontStatus.ready ? <CheckCircle2 color="#86efac" /> : <AlertTriangle color="#fcd34d" />}</div>
            <p className="mt-3 font-black" style={{ color: storefrontStatus.ready ? "#86efac" : "#fcd34d" }}>{storefrontStatus.ready ? (fa ? "فید امضاشده آماده اتصال است" : "Signed feed is ready") : (fa ? "Secret همگام‌سازی هنوز تنظیم نشده" : "Synchronization secret is not configured")}</p>
            <code className="block mt-3 text-xs" dir="ltr">{storefrontStatus.feed_path}</code>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-center">
              <ConnectionMetric label={fa ? "کالای منتشرشده" : "Published products"} value={n(storefrontStatus.published_products)} />
              <ConnectionMetric label={fa ? "همگام با موجودی" : "Stock synced"} value={n(storefrontStatus.stock_synced_products)} />
              <ConnectionMetric label={fa ? "امضای امنیتی" : "Security signature"} value={storefrontStatus.signature_algorithm} />
              <ConnectionMetric label={fa ? "افشای Secret" : "Secret exposure"} value={storefrontStatus.secrets_exposed ? (fa ? "خطر" : "Risk") : (fa ? "صفر" : "None")} />
            </div>
          </article>}
          <div className="grid grid-cols-2 gap-3 mt-5">{["instagram", "linkedin"].map((channel) => <div key={channel} className="rounded-2xl p-4 text-center font-black" style={{ background: "var(--erp-panel-solid)", border: "1px solid var(--erp-border)" }}>{channel}<span className="block text-xs mt-2" style={{ color: "var(--erp-muted)" }}>{fa ? "فاز اتصال بعدی" : "Next connector phase"}</span></div>)}</div>
        </div>
      )}
    </div>
  );
}

const inputStyle = { background: "var(--erp-panel-solid)", color: "var(--erp-text)", border: "1px solid var(--erp-border)" };

function ConnectionMetric({ label, value }) {
  return <div className="rounded-xl p-3" style={{ background: "var(--erp-glow)" }}><strong className="block text-lg">{value}</strong><span className="text-xs" style={{ color: "var(--erp-muted)" }}>{label}</span></div>;
}

function Metric({ icon, label, value, n }) {
  return <div className="erp-surface rounded-2xl p-4"><div className="erp-accent">{icon}</div><strong className="block text-2xl mt-2">{n(value)}</strong><span className="text-sm" style={{ color: "var(--erp-muted)" }}>{label}</span></div>;
}

function Toggle({ value, onChange }) {
  return <button type="button" onClick={() => onChange(!value)} className="w-12 h-7 rounded-full p-1" style={{ background: value ? "var(--erp-accent)" : "var(--erp-panel-solid)", border: "1px solid var(--erp-border)" }}><span className="block w-5 h-5 bg-white rounded-full transition-transform" style={{ transform: value ? "translateX(20px)" : "translateX(0)" }} /></button>;
}

function Input({ label, value, onChange, type = "text", required = false }) {
  return <label className="block text-sm font-bold">{label}<input required={required} type={type} style={inputStyle} className="w-full rounded-xl p-3 mt-1" value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}

function CampaignCard({ item, fa }) {
  const status = { draft: fa ? "پیش‌نویس" : "Draft", pending_approval: fa ? "در انتظار تأیید" : "Pending approval", approved: fa ? "تأییدشده" : "Approved", scheduled: fa ? "زمان‌بندی‌شده" : "Scheduled", published: fa ? "منتشرشده" : "Published", rejected: fa ? "ردشده" : "Rejected", failed: fa ? "ناموفق" : "Failed" }[item.status] || item.status;
  return <article className="erp-surface rounded-2xl p-5"><div className="flex justify-between gap-3"><div><h3 className="font-black text-lg">{item.title}</h3><p className="text-sm mt-1" style={{ color: "var(--erp-muted)" }}>{item.channel} {item.product_name ? `• ${item.product_name}` : ""}</p></div><span className="rounded-full px-3 py-1 h-fit text-sm font-black" style={{ background: "var(--erp-glow)", color: "var(--erp-accent)" }}>{status}</span></div>{item.body && <p className="mt-3 whitespace-pre-wrap">{item.body}</p>}</article>;
}
