"use client";

import type { Shop } from "@/lib/api/client";
import type { SaleDetail } from "@/features/sales/lib/sale-detail-types";

const formatMoney = (value?: string | number | null): string => {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
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

function escapeHtml(value: string | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function printInvoiceDocument(sale: SaleDetail, shop?: Shop): Promise<void> {
  if (typeof window === "undefined") return;

  const shopName = shop?.name || "Shop Control";
  const shopCity = shop?.city || "";
  const shopAddress = shop?.address || "";
  const shopPhone = shop?.phone || "";
  const shopEmail = shop?.email || "";
  const shopGstin = shop?.gstin || "";

  const customerName = sale.customer?.name || "Walk-in Customer";
  const customerPhone = sale.customer?.phone || "";
  const customerGstin = sale.customer?.gstin || "";
  const saleDate = formatDate(sale.saleDate || sale.createdAt);
  const invoiceIssued = sale.gstRequired && sale.gstInvoiceStatus === "GENERATED" && Boolean(sale.gstInvoiceNumber);
  const documentNumber = invoiceIssued ? sale.gstInvoiceNumber! : sale.saleNumber;
  const documentTitle = invoiceIssued ? "TAX INVOICE" : "SALE RECEIPT";

  const totalAmount = Number(sale.totalAmount || 0);
  const verifiedPaid = Number(sale.verifiedPaidAmount || 0);
  const recordedPaid = Number(sale.recordedPaymentAmount || 0);
  const balanceDue = Number(sale.balanceAmount || 0);
  const statusText = sale.paymentStatus === "PAID" ? "PAID" : sale.paymentStatus.replaceAll("_", " ");

  const itemsHtml = sale.items.map((line) => {
    const itemName = escapeHtml(line.item?.name || "Product item");
    const sku = line.item?.sku ? escapeHtml(line.item.sku) : "";
    const serials = line.serialNumbers?.length ? `S/N: ${escapeHtml(line.serialNumbers.join(", "))}` : "";
    return `
      <tr style="border-bottom:1px solid #e5e7eb;">
        <td style="padding:9px 8px;text-align:left;">
          <div style="font-weight:700;color:#111827;">${itemName}</div>
          <div style="font-size:10px;color:#6b7280;">${[sku, serials].filter(Boolean).join(" · ")}</div>
        </td>
        <td style="padding:9px 8px;text-align:right;font-family:monospace;">${escapeHtml(String(line.quantity))}</td>
        <td style="padding:9px 8px;text-align:right;font-family:monospace;">${formatMoney(line.rate)}</td>
        <td style="padding:9px 8px;text-align:right;font-family:monospace;">${formatMoney(line.discountAmount)}</td>
        <td style="padding:9px 8px;text-align:right;font-weight:700;font-family:monospace;">${formatMoney(line.totalAmount)}</td>
      </tr>`;
  }).join("");

  const paymentHtml = sale.payments.length
    ? sale.payments.map((payment) => `
      <div class="row small">
        <span>${escapeHtml(payment.paymentMode.replaceAll("_", " "))} · ${escapeHtml(payment.status)}</span>
        <span>${formatMoney(payment.amount)}</span>
      </div>`).join("")
    : `<div class="small muted">No payment records attached to this sale.</div>`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${documentTitle} ${escapeHtml(documentNumber)}</title>
  <style>
    *{box-sizing:border-box} body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;margin:0;padding:20px;color:#111827;background:#fff}
    .document{width:100%;max-width:760px;margin:0 auto;padding:22px;border:1px solid #e5e7eb;border-radius:10px}
    .header{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #111827;padding-bottom:14px;margin-bottom:18px}
    .title{font-size:22px;font-weight:800;margin:0}.muted{color:#6b7280}.small{font-size:11px}.label{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;font-weight:700}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:14px;background:#f9fafb;border:1px solid #e5e7eb;padding:12px;border-radius:8px;margin-bottom:18px}
    table{width:100%;border-collapse:collapse;margin-bottom:18px} th{padding:8px;border-bottom:2px solid #111827;font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;text-align:right} th:first-child{text-align:left}
    .totals{margin-left:auto;width:310px;border:1px solid #e5e7eb;border-radius:8px;padding:12px}.row{display:flex;justify-content:space-between;gap:16px;padding:4px 0}.grand{font-size:15px;font-weight:800;border-top:1px solid #e5e7eb;margin-top:5px;padding-top:8px}
    .status{display:inline-block;border:1px solid #d1d5db;border-radius:999px;padding:3px 8px;font-size:9px;font-weight:800}.footer{margin-top:24px;border-top:1px dashed #d1d5db;padding-top:12px;text-align:center;font-size:10px;color:#6b7280}
    @media print{body{padding:0}.document{max-width:none;border:0;padding:0}}
  </style>
</head>
<body>
<div class="document">
  <div class="header">
    <div>
      <h1 class="title">${escapeHtml(shopName)}</h1>
      <div class="small muted">${escapeHtml([shopCity, shopAddress].filter(Boolean).join(" · "))}</div>
      ${shopPhone || shopEmail ? `<div class="small muted">${escapeHtml([shopPhone, shopEmail].filter(Boolean).join(" · "))}</div>` : ""}
      ${shopGstin ? `<div class="small" style="font-weight:700;margin-top:3px">GSTIN ${escapeHtml(shopGstin)}</div>` : ""}
    </div>
    <div style="text-align:right">
      <div style="font-size:16px;font-weight:800">${documentTitle}</div>
      <div style="font-size:12px;font-weight:700;margin-top:2px">#${escapeHtml(documentNumber)}</div>
      <div class="small muted">Sale ${escapeHtml(sale.saleNumber)} · ${saleDate}</div>
      <div style="margin-top:6px"><span class="status">${escapeHtml(statusText)}</span></div>
    </div>
  </div>

  <div class="meta">
    <div><div class="label">Customer</div><div style="font-size:13px;font-weight:700;margin-top:3px">${escapeHtml(customerName)}</div>${customerPhone ? `<div class="small">${escapeHtml(customerPhone)}</div>` : ""}${customerGstin ? `<div class="small">GSTIN ${escapeHtml(customerGstin)}</div>` : ""}</div>
    <div style="text-align:right"><div class="label">Document state</div><div class="small" style="margin-top:3px">GST requested: <b>${sale.gstRequired ? "Yes" : "No"}</b></div><div class="small">GST invoice: <b>${escapeHtml(sale.gstInvoiceStatus.replaceAll("_", " "))}</b></div><div class="small">Sale status: <b>${escapeHtml(sale.saleStatus)}</b></div></div>
  </div>

  <table>
    <thead><tr><th>Product</th><th>Qty</th><th>Rate</th><th>Discount</th><th>Line total</th></tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>

  <div class="totals">
    <div class="row"><span class="muted">Subtotal</span><b>${formatMoney(sale.subtotal)}</b></div>
    <div class="row"><span class="muted">Discount</span><b>${formatMoney(sale.discountAmount)}</b></div>
    <div class="row grand"><span>Total</span><span>${formatMoney(totalAmount)}</span></div>
    <div class="row"><span class="muted">Verified payments</span><b>${formatMoney(verifiedPaid)}</b></div>
    <div class="row"><span class="muted">Recorded, unverified</span><b>${formatMoney(recordedPaid)}</b></div>
    <div class="row"><span class="muted">Balance due</span><b>${formatMoney(balanceDue)}</b></div>
    <div style="border-top:1px solid #e5e7eb;margin-top:7px;padding-top:7px">${paymentHtml}</div>
  </div>

  <div class="footer">Generated from the server-authoritative sale record. Tax values are not guessed in the browser.</div>
</div>
</body>
</html>`;

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  const print = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    window.setTimeout(() => iframe.remove(), 1000);
  };

  iframe.onload = print;
  window.setTimeout(print, 350);
}
