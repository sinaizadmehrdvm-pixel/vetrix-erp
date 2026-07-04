import { useEffect, useMemo, useState } from "react";
import axios from "axios";

import fa from "../i18n/fa";
import en from "../i18n/en";
import InvoiceSummary from "./InvoiceSummary";
import InvoicePrint from "./InvoicePrint";

const API = "http://127.0.0.1:8001";

export default function InvoiceBuilder() {
  const [language, setLanguage] = useState("fa");
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);

  const [invoiceType, setInvoiceType] = useState("sale");
  const [customerId, setCustomerId] = useState("");
  const [discountPercent, setDiscountPercent] = useState(0);
  const [taxPercent, setTaxPercent] = useState(0);

  const [items, setItems] = useState([
    {
      product_id: "",
      quantity: 1,
      unit_price: 0,
    },
  ]);

  const [createdInvoice, setCreatedInvoice] = useState(null);

  const t = language === "fa" ? fa : en;
  const dir = language === "fa" ? "rtl" : "ltr";

  async function loadData() {
    const customersRes = await axios.get(`${API}/customers`);
    const productsRes = await axios.get(`${API}/products`);

    setCustomers(customersRes.data || []);
    setProducts(productsRes.data || []);
  }

  useEffect(() => {
    loadData();
  }, []);

  const calc = useMemo(() => {
    const subtotal = items.reduce((sum, item) => {
      return sum + Number(item.quantity || 0) * Number(item.unit_price || 0);
    }, 0);

    const discountAmount = subtotal * (Number(discountPercent || 0) / 100);
    const afterDiscount = subtotal - discountAmount;
    const taxAmount = afterDiscount * (Number(taxPercent || 0) / 100);
    const grandTotal = afterDiscount + taxAmount;

    return {
      subtotal,
      discountAmount,
      taxAmount,
      grandTotal,
    };
  }, [items, discountPercent, taxPercent]);

  function updateItem(index, key, value) {
    const next = [...items];

    next[index] = {
      ...next[index],
      [key]: value,
    };

    if (key === "product_id") {
      const selectedProduct = products.find((p) => String(p.id) === String(value));
      if (selectedProduct) {
        next[index].unit_price = selectedProduct.sell_price || selectedProduct.price || 0;
      }
    }

    setItems(next);
  }

  function addItem() {
    setItems([
      ...items,
      {
        product_id: "",
        quantity: 1,
        unit_price: 0,
      },
    ]);
  }

  function removeItem(index) {
    const next = items.filter((_, i) => i !== index);
    setItems(next.length ? next : [{ product_id: "", quantity: 1, unit_price: 0 }]);
  }

  async function createInvoice() {
    if (!customerId) {
      alert(language === "fa" ? "لطفاً مشتری را انتخاب کن" : "Please select customer");
      return;
    }

    const cleanItems = items
      .filter((item) => item.product_id && Number(item.quantity) > 0)
      .map((item) => ({
        product_id: Number(item.product_id),
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
      }));

    if (!cleanItems.length) {
      alert(language === "fa" ? "حداقل یک محصول انتخاب کن" : "Select at least one product");
      return;
    }

    const res = await axios.post(`${API}/invoices`, {
      invoice_type: invoiceType,
      customer_id: Number(customerId),
      items: cleanItems,
    });

    if (res.data.status === "created") {
      const customer = customers.find((c) => String(c.id) === String(customerId));

      setCreatedInvoice({
        id: res.data.invoice_id,
        customerName: customer?.name || "",
        total: calc.grandTotal,
        subtotal: calc.subtotal,
        discount: calc.discountAmount,
        tax: calc.taxAmount,
        items: cleanItems,
      });

      alert(language === "fa" ? "فاکتور با موفقیت ثبت شد" : "Invoice created successfully");
      await loadData();
    } else {
      alert(res.data.message || "Error creating invoice");
    }
  }

  return (
    <div
      dir={dir}
      style={{
        padding: 30,
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(34,211,238,0.16), transparent 35%), radial-gradient(circle at top right, rgba(99,102,241,0.16), transparent 35%), #071028",
        color: "white",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 34, fontWeight: 900, marginBottom: 6 }}>
            {t.invoiceSystem}
          </h1>
          <p style={{ color: "#94a3b8" }}>
            {language === "fa"
              ? "فاکتور فروش و خرید با محاسبه لحظه‌ای، تخفیف، مالیات و چاپ"
              : "Sales and purchase invoice with live calculation, discount, tax and print"}
          </p>
        </div>

        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          style={fieldStyle}
        >
          <option value="fa">فارسی</option>
          <option value="en">English</option>
        </select>
      </div>

      <div style={panelStyle}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
            gap: 14,
            marginBottom: 18,
          }}
        >
          <select
            value={invoiceType}
            onChange={(e) => setInvoiceType(e.target.value)}
            style={fieldStyle}
          >
            <option value="sale">{t.saleInvoice}</option>
            <option value="buy">{t.buyInvoice}</option>
          </select>

          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            style={fieldStyle}
          >
            <option value="">{t.customer}</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>

          <input
            type="number"
            value={discountPercent}
            onChange={(e) => setDiscountPercent(e.target.value)}
            placeholder={`${t.discount} %`}
            style={fieldStyle}
          />

          <input
            type="number"
            value={taxPercent}
            onChange={(e) => setTaxPercent(e.target.value)}
            placeholder={`${t.tax} %`}
            style={fieldStyle}
          />
        </div>

        {items.map((item, index) => (
          <div
            key={index}
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr auto",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <select
              value={item.product_id}
              onChange={(e) => updateItem(index, "product_id", e.target.value)}
              style={fieldStyle}
            >
              <option value="">{t.product}</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} | Stock: {product.stock}
                </option>
              ))}
            </select>

            <input
              type="number"
              value={item.quantity}
              onChange={(e) => updateItem(index, "quantity", e.target.value)}
              placeholder={t.quantity}
              style={fieldStyle}
            />

            <input
              type="number"
              value={item.unit_price}
              onChange={(e) => updateItem(index, "unit_price", e.target.value)}
              placeholder={t.unitPrice}
              style={fieldStyle}
            />

            <button onClick={() => removeItem(index)} style={dangerButton}>
              {t.remove}
            </button>
          </div>
        ))}

        <button onClick={addItem} style={secondaryButton}>
          + {t.addItem}
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
          gap: 20,
          marginTop: 20,
        }}
      >
        <InvoiceSummary
          subtotal={calc.subtotal}
          discount={calc.discountAmount}
          tax={calc.taxAmount}
          total={calc.grandTotal}
          t={t}
        />

        <div style={panelStyle}>
          <button onClick={createInvoice} style={primaryButton}>
            {t.createInvoice}
          </button>
        </div>
      </div>

      <InvoicePrint invoice={createdInvoice} t={t} dir={dir} />
    </div>
  );
}

const panelStyle = {
  background: "rgba(15,23,42,0.82)",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 24,
  padding: 20,
  boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
};

const fieldStyle = {
  width: "100%",
  padding: "14px 16px",
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(30,41,59,0.95)",
  color: "white",
  outline: "none",
};

const primaryButton = {
  width: "100%",
  padding: "16px 20px",
  borderRadius: 18,
  border: "none",
  background: "#22d3ee",
  color: "#071028",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryButton = {
  padding: "12px 18px",
  borderRadius: 16,
  border: "none",
  background: "#10b981",
  color: "#071028",
  fontWeight: 900,
  cursor: "pointer",
};

const dangerButton = {
  padding: "12px 16px",
  borderRadius: 16,
  border: "none",
  background: "#ef4444",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
};