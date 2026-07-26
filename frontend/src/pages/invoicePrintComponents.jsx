import { computeInvoiceTotals } from "./invoicePrintHelpers";

export function Canvas({ page, zoom, showGrid, config, selectedElementId, editMode, onElementMouseDown, onResizeMouseDown, renderElement, dir }) {
  return (
    <div className="min-w-max flex justify-center pb-10">
      <div
        className="print-canvas relative bg-white text-slate-950 shadow-2xl origin-top"
        style={{
          width: page.w,
          height: page.h,
          transform: `scale(${zoom})`,
          backgroundImage: showGrid
            ? "linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px)"
            : "none",
          backgroundSize: "20px 20px",
        }}
      >
        {(config.elements || []).map((element) => (
          <div
            key={element.id}
            onMouseDown={(e) => onElementMouseDown(e, element)}
            className={`absolute select-none overflow-hidden flex items-center justify-center ${editMode ? "cursor-move" : ""} ${selectedElementId === element.id ? "ring-2 ring-cyan-500" : ""}`}
            style={{
              left: element.x,
              top: element.y,
              width: element.w,
              height: element.h,
              color: element.color,
              background: element.bg,
              border: `1px solid ${element.border || "transparent"}`,
              borderRadius: element.radius,
              fontSize: element.fontSize,
              fontWeight: element.bold ? 900 : 500,
              textAlign: element.align || "center",
              padding: 8,
              direction: dir || "ltr",
            }}
          >
            {renderElement(element)}
            {editMode && selectedElementId === element.id && (
              <div
                data-resize="true"
                onMouseDown={(e) => onResizeMouseDown(e, element)}
                className="absolute -bottom-2 -right-2 w-4 h-4 bg-cyan-500 rounded-full cursor-se-resize border border-white"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ItemsTable({ items, language, n, money }) {
  const fa = language === "fa";
  const ar = language === "ar";
  const tr = language === "tr";
  return (
    <table className="w-full border-collapse text-[11px]">
      <thead>
        <tr className="bg-slate-900 text-white">
          <th className="border p-1">#</th>
          <th className="border p-1">{fa ? "شرح" : ar ? "الوصف" : tr ? "Açıklama" : "Item"}</th>
          <th className="border p-1">{fa ? "تعداد" : ar ? "الكمية" : tr ? "Adet" : "Qty"}</th>
          <th className="border p-1">{fa ? "واحد" : ar ? "الوحدة" : tr ? "Birim" : "Unit"}</th>
          <th className="border p-1">{fa ? "جمع" : ar ? "الإجمالي" : tr ? "Toplam" : "Total"}</th>
        </tr>
      </thead>
      <tbody>
        {items.length ? (
          items.map((item, index) => {
            const unit = item.unit_price ?? item.price ?? 0;
            const total = item.total ?? item.total_price ?? Number(item.quantity || 0) * Number(unit || 0);
            return (
              <tr key={`${item.product_id || item.id || index}-${index}`}>
                <td className="border p-1 text-center">{n(index + 1)}</td>
                <td className="border p-1">{item.product_name || item.name || item.product?.name || "-"}</td>
                <td className="border p-1 text-center">{n(item.quantity || 0)}</td>
                <td className="border p-1 text-center">{money(unit)}</td>
                <td className="border p-1 text-center">{money(total)}</td>
              </tr>
            );
          })
        ) : (
          <tr>
            <td colSpan={5} className="border p-2 text-center">
              {fa ? "اقلامی ثبت نشده است." : ar ? "لا توجد بنود مسجلة." : tr ? "Kayıtlı kalem yok." : "No items."}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export function TotalsBox({ totals, language, money }) {
  const fa = language === "fa";
  const ar = language === "ar";
  const tr = language === "tr";
  const rows = [
    [fa ? "جمع جزء" : ar ? "المجموع الفرعي" : tr ? "Ara Toplam" : "Subtotal", totals.subtotal],
    [fa ? "تخفیف" : ar ? "الخصم" : tr ? "İskonto" : "Discount", totals.discount],
    [fa ? "مالیات" : ar ? "الضريبة" : tr ? "Vergi" : "Tax", totals.tax],
    [fa ? "حمل" : ar ? "الشحن" : tr ? "Kargo" : "Shipping", totals.shipping],
    [fa ? "پرداخت شده" : ar ? "المسدد" : tr ? "Ödenen" : "Settled", totals.settled],
    [fa ? "باقی‌مانده" : ar ? "المتبقي" : tr ? "Kalan" : "Remaining", totals.remaining],
  ];

  return (
    <div className="w-full text-[12px] space-y-1">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between border-b border-slate-200 pb-1">
          <span>{label}</span>
          <b>{money(value)}</b>
        </div>
      ))}
      <div className="flex justify-between text-cyan-700 font-black text-sm pt-2">
        <span>{fa ? "مبلغ نهایی" : ar ? "المبلغ الإجمالي" : tr ? "Genel Toplam" : "Total"}</span>
        <b>{money(totals.total)}</b>
      </div>
    </div>
  );
}

export function PrintElement({ element, items, language, n, money, invoice, replaceTokens }) {
  if (element.type === "table") return <ItemsTable items={items} language={language} n={n} money={money} />;
  if (element.type === "totals") return <TotalsBox totals={computeInvoiceTotals(invoice, items)} language={language} money={money} />;

  if (element.type === "qr") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-slate-700">
        <div className="w-14 h-14 border-4 border-slate-800 grid grid-cols-3 grid-rows-3 gap-1 p-1 bg-white">
          <span className="bg-slate-900" /><span /><span className="bg-slate-900" />
          <span /><span className="bg-slate-900" /><span />
          <span className="bg-slate-900" /><span /><span className="bg-slate-900" />
        </div>
        <small>QR #{n(invoice?.id || "")}</small>
      </div>
    );
  }

  if (element.type === "barcode") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-slate-800">
        <div className="tracking-[6px] text-3xl">|||| || ||| |||| || |</div>
        <small>{invoice?.id || ""}</small>
      </div>
    );
  }

  if (element.type === "logo") {
    return <div className="w-full h-full flex items-center justify-center text-cyan-700 font-black">{replaceTokens(element.text || "LOGO")}</div>;
  }

  return <div className="whitespace-pre-line leading-relaxed w-full">{replaceTokens(element.text)}</div>;
}
