"use client";

const formatMoney = (val?: string | number | null): string => {
  const num = Number(val) || 0;
  return `₹${num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatDate = (dateStr?: string | Date | null): string => {
  if (!dateStr) return "N/A";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
};

export async function printInvoiceDocument(sale: any, shop?: any): Promise<void> {
  if (typeof window === "undefined") return;

  const shopName = shop?.name || "SHOP CONTROL RETAIL";
  const shopCity = shop?.city || "";
  const shopAddress = shop?.address || "";
  const shopPhone = shop?.phone || "";
  const shopEmail = shop?.email || "";
  const shopGstin = shop?.gstin || "";

  const customerName = sale.customerName || sale.customer?.name || "Walk-in Customer";
  const customerPhone = sale.customer?.phone || "";
  const customerGstin = sale.customer?.gstin || "";

  const saleNumber = sale.invoiceNumber || (sale.id ? sale.id.slice(0, 8).toUpperCase() : "INV-001");
  const saleDate = formatDate(sale.saleDate || sale.createdAt);

  const items = Array.isArray(sale.items) ? sale.items : [];
  const totalAmount = Number(sale.totalAmount || sale.finalAmount || 0);
  const paidAmount = Number(sale.paidAmount || (sale.paymentStatus === "PAID" ? totalAmount : 0));
  const balanceDue = Math.max(totalAmount - paidAmount, 0);

  const statusText = sale.paymentStatus === "PAID" || paidAmount >= totalAmount ? "PAID" : "PAYMENT DUE";

  const itemsHtml = items.map((item: any) => {
    const name = item.item?.name || item.name || "Product Item";
    const sku = item.item?.sku ? `(${item.item.sku})` : "";
    const qty = Number(item.quantity || 1);
    const rate = Number(item.rate || 0);
    const lineTotal = qty * rate;

    return `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 8px; text-align: left;">
          <div style="font-weight: 700; color: #0f172a;">${name}</div>
          <div style="font-size: 11px; color: #64748b;">${sku}</div>
        </td>
        <td style="padding: 10px 8px; text-align: center; color: #334155; font-family: monospace;">${qty}</td>
        <td style="padding: 10px 8px; text-align: right; color: #334155; font-family: monospace;">${formatMoney(rate)}</td>
        <td style="padding: 10px 8px; text-align: right; font-weight: 700; color: #0f172a; font-family: monospace;">${formatMoney(lineTotal)}</td>
      </tr>
    `;
  }).join("");

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Tax Invoice #${saleNumber}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          margin: 0;
          padding: 24px;
          color: #0f172a;
          background: #ffffff;
        }
        .invoice-box {
          max-width: 700px;
          margin: 0 auto;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 24px;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #0f172a;
          padding-bottom: 16px;
          margin-bottom: 20px;
        }
        .shop-title {
          font-size: 22px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: -0.5px;
          margin: 0;
        }
        .shop-sub {
          font-size: 11px;
          color: #64748b;
          margin: 4px 0 0 0;
        }
        .meta-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 24px;
          background: #f8fafc;
          padding: 12px;
          border-radius: 6px;
          font-size: 12px;
        }
        .table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 24px;
        }
        .th {
          border-bottom: 2px solid #0f172a;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          color: #475569;
          padding: 8px;
        }
        .totals-box {
          margin-left: auto;
          width: 260px;
          border-top: 2px solid #0f172a;
          padding-top: 8px;
          font-size: 13px;
        }
        .totals-row {
          display: flex;
          justify-content: space-between;
          padding: 4px 0;
        }
        .grand-total {
          font-size: 16px;
          font-weight: 900;
          border-top: 1px solid #e2e8f0;
          padding-top: 8px;
          margin-top: 4px;
        }
        .footer {
          margin-top: 32px;
          text-align: center;
          font-size: 11px;
          color: #64748b;
          border-top: 1px dashed #cbd5e1;
          padding-top: 16px;
        }
        @media print {
          body { padding: 0 !important; }
          .invoice-box { border: none !important; padding: 0 !important; }
        }
      </style>
    </head>
    <body>
      <div class="invoice-box">
        <div class="header">
          <div>
            <h1 class="shop-title">${shopName}</h1>
            <p class="shop-sub">${[shopCity, shopAddress].filter(Boolean).join(" • ")}</p>
            ${shopPhone || shopEmail ? `<p class="shop-sub">${[shopPhone && `Ph: ${shopPhone}`, shopEmail && `Email: ${shopEmail}`].filter(Boolean).join(" | ")}</p>` : ""}
            ${shopGstin ? `<p class="shop-sub" style="font-weight: 700;">GSTIN: ${shopGstin}</p>` : ""}
          </div>
          <div style="text-align: right;">
            <div style="font-size: 16px; font-weight: 900; color: #4338ca;">TAX INVOICE</div>
            <div style="font-size: 12px; font-weight: 700; margin-top: 2px;">#${saleNumber}</div>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">${saleDate}</div>
            <div style="margin-top: 6px;">
              <span style="display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 800; background: ${statusText === "PAID" ? "#dcfce7" : "#ffe4e6"}; color: ${statusText === "PAID" ? "#15803d" : "#be123c"}; border: 1px solid ${statusText === "PAID" ? "#86efac" : "#fca5a5"};">
                ${statusText}
              </span>
            </div>
          </div>
        </div>

        <div class="meta-grid">
          <div>
            <div style="color: #64748b; font-size: 10px; font-weight: 700; text-transform: uppercase;">Customer Details</div>
            <div style="font-[14px]; font-weight: 800; color: #0f172a; margin-top: 2px;">${customerName}</div>
            ${customerPhone ? `<div>Ph: ${customerPhone}</div>` : ""}
            ${customerGstin ? `<div>GSTIN: ${customerGstin}</div>` : ""}
          </div>
          <div style="text-align: right;">
            <div style="color: #64748b; font-size: 10px; font-weight: 700; text-transform: uppercase;">Invoice Summary</div>
            <div style="margin-top: 2px;">Items: <b>${items.length}</b></div>
            <div>GST: <b>${sale.gstRequired ? "18% Included" : "Non-GST"}</b></div>
          </div>
        </div>

        <table class="table">
          <thead>
            <tr>
              <th class="th" style="text-align: left;">Product Item</th>
              <th class="th" style="text-align: center;">Qty</th>
              <th class="th" style="text-align: right;">Rate</th>
              <th class="th" style="text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="totals-box">
          <div class="totals-row">
            <span style="color: #64748b;">Subtotal</span>
            <span style="font-weight: 700; font-family: monospace;">${formatMoney(totalAmount)}</span>
          </div>
          <div class="totals-row grand-total">
            <span>Grand Total</span>
            <span style="font-family: monospace;">${formatMoney(totalAmount)}</span>
          </div>
          <div class="totals-row" style="margin-top: 6px;">
            <span style="color: #64748b;">Amount Paid</span>
            <span style="font-weight: 700; color: #16a34a; font-family: monospace;">${formatMoney(paidAmount)}</span>
          </div>
          <div class="totals-row">
            <span style="color: #64748b;">Balance Due</span>
            <span style="font-weight: 700; color: ${balanceDue > 0 ? "#dc2626" : "#0f172a"}; font-family: monospace;">${formatMoney(balanceDue)}</span>
          </div>
        </div>

        <div class="footer">
          <div style="font-weight: 700;">Thank you for your business!</div>
          <div>This is a computer-generated tax invoice verified by ShopControl.</div>
        </div>
      </div>
    </body>
    </html>
  `;

  // Create clean print iframe
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) return;

  doc.open();
  doc.write(html);
  doc.close();

  iframe.onload = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => {
      if (iframe.parentNode) document.body.removeChild(iframe);
    }, 1000);
  };

  // Fallback trigger if onload fires immediately
  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => {
      if (iframe.parentNode) document.body.removeChild(iframe);
    }, 1000);
  }, 300);
}
