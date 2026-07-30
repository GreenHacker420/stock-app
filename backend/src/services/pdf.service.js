import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";
import qrcode from "qrcode-generator";
import {
  uploadBufferToS3,
  getPublicS3ObjectUrl,
  getS3BucketName,
  downloadS3ObjectBuffer,
  deleteS3Object,
} from "../lib/s3-storage.js";
import prisma from "../lib/db.js";
import {
  HTML_ESCAPE_AMP_REGEX,
  HTML_ESCAPE_LT_REGEX,
  HTML_ESCAPE_GT_REGEX,
  HTML_ESCAPE_QUOT_REGEX,
  HTML_ESCAPE_APOS_REGEX,
  CODE128_ASCII_REGEX,
  SVG_NUMERIC_MATCH_REGEX,
} from "../lib/validate.js";

const escapeHtml = (value) => {
  return String(value ?? "")
    .replace(HTML_ESCAPE_AMP_REGEX, "&amp;")
    .replace(HTML_ESCAPE_LT_REGEX, "&lt;")
    .replace(HTML_ESCAPE_GT_REGEX, "&gt;")
    .replace(HTML_ESCAPE_QUOT_REGEX, "&quot;")
    .replace(HTML_ESCAPE_APOS_REGEX, "&#039;");
};

const escapeAttr = escapeHtml;

const toFiniteNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const formatMoney = (val) => {
  return `₹${toFiniteNumber(val).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const activeInvoiceBuilds = new Map();

function resolveChromiumExecutable() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  const executablePath = candidates.find((candidate) => existsSync(candidate));
  if (!executablePath) {
    throw new Error("Chromium is not installed or PUPPETEER_EXECUTABLE_PATH is not configured");
  }
  return executablePath;
}

export async function renderInvoicePdfFromHtml(html) {
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: resolveChromiumExecutable(),
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
      ],
    });
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setContent(html, {
      waitUntil: "networkidle0",
      timeout: 20_000,
    });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    await page.close();
    return Buffer.from(pdf);
  } finally {
    await browser?.close().catch(() => {});
  }
}

const getSignatureViewBox = (paths) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  paths.forEach((path) => {
    if (typeof path !== "string") return;
    const matches = path.match(SVG_NUMERIC_MATCH_REGEX);
    if (!matches) return;
    for (let index = 0; index < matches.length; index += 2) {
      const x = Number.parseFloat(matches[index]);
      const y = Number.parseFloat(matches[index + 1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  });
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return "0 0 300 150";
  const padding = 10;
  return `${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`;
};

const formatDate = (dateStr) => {
  if (!dateStr) return "N/A";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const formatSaleDate = (dateStr) => {
  if (!dateStr) return "N/A";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  });
};

const CODE128_B_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212132", "212231", "222131", "213122", "223121", "233111", "211232", "211322", "212123", "212321",
  "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", "231113", "231311",
  "112133", "112331", "132131", "113123", "113321", "133121", "131331", "133131", "113133", "113313",
  "133113", "133311", "113113", "113311", "131133", "131331", "111333", "113133", "113313", "131113",
  "131311", "133111", "121133", "121331", "131231", "131132", "133211", "132231", "232211", "221113",
  "221311", "231112", "231211", "221211", "212113", "212311", "231211", "221123", "221321", "231121",
  "221121", "222113", "222311", "232111", "221131", "221311", "231111", "311122", "311221", "321112",
  "321211", "312112", "312211",
  "211412", "211214", "211232", "2331112"
];

function generateCode128BSvg(text) {
  const cleanText = String(text || "").replace(CODE128_ASCII_REGEX, "");
  const codeValues = [104];
  let checksum = 104;

  for (let i = 0; i < cleanText.length; i++) {
    const val = cleanText.charCodeAt(i) - 32;
    codeValues.push(val);
    checksum += val * (i + 1);
  }

  codeValues.push(checksum % 103);
  codeValues.push(106);

  let binary = "";
  for (const val of codeValues) {
    const pattern = CODE128_B_PATTERNS[val];
    if (!pattern) continue;
    for (let j = 0; j < pattern.length; j++) {
      const width = parseInt(pattern[j], 10);
      const isBar = j % 2 === 0;
      binary += (isBar ? "1" : "0").repeat(width);
    }
  }

  let rects = "";
  let x = 0;
  for (let i = 0; i < binary.length; i++) {
    if (binary[i] === "1") {
      rects += `<rect x="${x}" y="0" width="1" height="30" fill="black" stroke="none" />`;
    }
    x += 1;
  }

  return `<svg viewBox="0 0 ${binary.length} 30" width="100%" height="100%" preserveAspectRatio="none" style="display: block;">${rects}</svg>`;
}

export function generateSaleInvoiceHtml({ sale, shop }) {
  let signatureHtml = "";
  if (sale.customerSignature) {
    const rawSig = sale.customerSignature.trim();
    if (rawSig.startsWith("{") || rawSig.startsWith("[")) {
      try {
        const parsed = JSON.parse(rawSig);
        const paths = Array.isArray(parsed) ? parsed : (parsed.paths || []);
        const signatureViewBox = parsed.viewBox || getSignatureViewBox(paths);
        if (paths.length > 0) {
          const pathElements = paths
            .filter((path) => typeof path === "string")
            .map((p) => `<path d="${escapeAttr(p)}" stroke="#18181b" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" />`)
            .join("");
          signatureHtml = `
            <div style="margin-top: 30px; text-align: right;">
              <div style="color: #71717a; font-weight: 500; font-size: 10px; text-transform: uppercase; margin-bottom: 4px;">Customer Signature</div>
              <div style="display: inline-block; width: 150px; height: 75px; border-bottom: 1px solid #e4e4e7;">
                <svg viewBox="${escapeAttr(signatureViewBox)}" style="width: 100%; height: 100%;">${pathElements}</svg>
              </div>
            </div>
          `;
        }
      } catch (error) {
        console.error("[PDF] Failed to parse customer signature:", error?.message || error);
      }
    } else if (rawSig.startsWith("data:") || rawSig.length > 100) {
      signatureHtml = `
        <div style="margin-top: 30px; text-align: right;">
          <div style="color: #71717a; font-weight: 500; font-size: 10px; text-transform: uppercase; margin-bottom: 4px;">Customer Signature</div>
          <img src="${escapeAttr(rawSig)}" alt="Customer signature" style="max-height: 50px; max-width: 150px; object-fit: contain; border-bottom: 1px solid #e4e4e7;" />
        </div>
      `;
    }
  }

  const shopName = escapeHtml(shop?.name || "RETAIL STORE");
  const shopCity = escapeHtml(shop?.city || "");
  const shopAddress = escapeHtml(shop?.address || "");
  const shopPhone = escapeHtml(shop?.phone || "");
  const shopEmail = escapeHtml(shop?.email || "");
  const shopGstin = escapeHtml(shop?.gstin || "");
  const shopLogo = escapeAttr(shop?.logo || "");

  const customerName = escapeHtml(sale.isWalkin ? "Customer" : sale.customer?.name || "Valued Customer");
  const customerPhone = escapeHtml(sale.customer?.phone || "");
  const customerGstin = escapeHtml(sale.customer?.gstin || "");
  const staffName = escapeHtml(sale.staff?.name || "");

  const uniqueItemsCount = (sale.items || []).length;
  const totalQuantity = (sale.items || []).reduce((sum, item) => sum + toFiniteNumber(item.quantity), 0);
  const calculatedSubtotal = (sale.items || []).reduce(
    (sum, item) => sum + (toFiniteNumber(item.quantity) * toFiniteNumber(item.rate)),
    0,
  );
  const calculatedLineDiscount = (sale.items || []).reduce(
    (sum, item) => sum + Math.max(toFiniteNumber(item.discountAmount), 0),
    0,
  );
  const subtotal = toFiniteNumber(sale.subtotal, calculatedSubtotal);
  const discount = Math.max(toFiniteNumber(sale.discountAmount, calculatedLineDiscount), 0);
  const invoiceHash = escapeHtml(String(sale.id || "INV").substring(0, 8).toUpperCase());

  const paid = toFiniteNumber(sale.paidAmount);
  const total = toFiniteNumber(sale.totalAmount, Math.max(subtotal - discount, 0));
  const balanceDue = Math.max(toFiniteNumber(sale.balanceAmount), 0);

  let statusText = "PAYMENT DUE";
  let statusClass = "due";
  if (paid >= total || sale.paymentStatus === "PAID") {
    statusText = "PAID";
    statusClass = "paid";
  } else if (paid > 0) {
    statusText = "PARTIALLY PAID";
    statusClass = "partial";
  }

  const itemsHtml = (sale.items || []).map((item) => {
    const qty = toFiniteNumber(item.quantity);
    const rate = toFiniteNumber(item.rate);
    const itemDiscount = Math.max(toFiniteNumber(item.discountAmount), 0);
    const itemTotal = Math.max((qty * rate) - itemDiscount, 0);
    const brandPrefix = item.item?.brand?.name ? `${item.item.brand.name} · ` : "";
    const itemName = escapeHtml(`${brandPrefix}${item.item?.name || "Product"}`);
    const itemSku = item.item?.sku ? `(${escapeHtml(item.item.sku)})` : "";
    const itemUnit = escapeHtml(item.item?.unit || "pcs");
    const serialNumbers = Array.isArray(item.serialNumbers)
      ? item.serialNumbers.map((serial) => String(serial).trim()).filter(Boolean)
      : [];
    return `
      <tr style="border-bottom: 1px solid #e4e4e7;">
        <td style="padding: 10px 0; text-align: left;">
          <div style="font-weight: 600; color: #18181b;">${itemName}</div>
          <div style="font-size: 11px; color: #71717a;">${itemSku}</div>
          ${serialNumbers.length ? `<div style="font-size: 10px; color: #52525b; margin-top: 3px;">S/N: ${serialNumbers.map(escapeHtml).join(", ")}</div>` : ""}
          ${itemDiscount > 0 ? `<div style="font-size: 10px; color: #16a34a;">Discount: ${formatMoney(itemDiscount)}</div>` : ""}
        </td>
        <td style="padding: 10px 0; text-align: center; color: #3f3f46;">${qty} ${itemUnit}</td>
        <td style="padding: 10px 0; text-align: right; color: #3f3f46;">${formatMoney(rate)}</td>
        <td style="padding: 10px 0; text-align: right; font-weight: 600; color: #18181b;">${formatMoney(itemTotal)}</td>
      </tr>
    `;
  }).join("");

  const paymentsHtml = (sale.payments || []).map((p) => {
    const mode = escapeHtml(p.paymentMode || "PAYMENT");
    const date = formatDate(p.receivedAt);
    const amount = toFiniteNumber(p.amount);
    const collectedBy = p.receivedBy?.name ? `Collected by: ${escapeHtml(p.receivedBy.name)}` : "";
    const details = [];
    if (p.details?.upiReference) details.push(`UPI Ref: ${escapeHtml(p.details.upiReference)}`);
    if (p.details?.bankUtr) details.push(`UTR: ${escapeHtml(p.details.bankUtr)}`);
    if (p.details?.chequeNumber) details.push(`Cheque: ${escapeHtml(p.details.chequeNumber)}`);
    if (p.details?.chequeBankName) details.push(escapeHtml(p.details.chequeBankName));
    if (p.referenceNumber) details.push(`Ref: ${escapeHtml(p.referenceNumber)}`);
    const detailsText = details.length > 0 ? ` (${details.join(", ")})` : "";
    return `
      <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: #3f3f46; border-bottom: 1px solid #e4e4e7;">
        <div>
          <span style="font-weight: 600; color: #18181b;">${mode}</span>${detailsText}
          <div style="font-size: 11px; color: #71717a;">${date} ${collectedBy ? `• ${collectedBy}` : ""}</div>
        </div>
        <div style="font-weight: 600; color: #18181b;">${formatMoney(amount)}</div>
      </div>
    `;
  }).join("");

  const barcodeSvg = generateCode128BSvg(sale.saleNumber);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Invoice - ${escapeHtml(sale.saleNumber)}</title>
  <style>
    :root {
      --primary: #18181b;
      --muted: #71717a;
      --success: #16a34a;
      --danger: #dc2626;
      --border: #e4e4e7;
      --background-offset: #f4f6f4;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 24px;
      color: var(--primary);
      background-color: #ffffff;
    }
    .container { max-width: 650px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
    .shop-name { font-size: 24px; font-weight: 800; color: var(--primary); letter-spacing: -0.5px; margin: 0 0 4px 0; text-transform: uppercase; }
    .shop-sub { font-size: 12px; color: var(--muted); margin: 0; text-transform: uppercase; letter-spacing: 0.5px; }
    .divider { border-top: 2px solid var(--primary); margin: 16px 0; }
    .dashed-divider { border-top: 1px dashed var(--border); margin: 16px 0; }
    .meta-section { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 20px; }
    .meta-col { flex: 1; }
    .meta-col:last-child { text-align: right; }
    .meta-label { color: var(--muted); font-weight: 500; margin-bottom: 2px; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; }
    .meta-value { font-weight: 600; color: var(--primary); }
    .status-badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    .status-badge.paid { background-color: rgba(22, 163, 74, 0.1); color: var(--success); border: 1px solid rgba(22, 163, 74, 0.2); }
    .status-badge.partial { background-color: rgba(217, 119, 6, 0.1); color: #d97706; border: 1px solid rgba(217, 119, 6, 0.2); }
    .status-badge.due { background-color: rgba(220, 38, 38, 0.1); color: var(--danger); border: 1px solid rgba(220, 38, 38, 0.2); }
    .table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    .th { border-bottom: 2px solid var(--primary); color: var(--muted); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 8px; }
    .totals-section { margin-left: auto; width: 250px; margin-top: 16px; }
    .totals-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
    .grand-total { font-size: 16px; font-weight: 800; border-top: 1px solid var(--primary); padding-top: 8px; margin-top: 6px; }
    .notes-section { background-color: var(--background-offset); padding: 12px; border-radius: 8px; font-size: 12px; margin-top: 20px; color: #3f3f46; border: 1px solid var(--border); }
    .notes-title { font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); margin-bottom: 4px; }
    .footer { margin-top: 40px; text-align: center; font-size: 11px; color: var(--muted); }
    .thank-you { font-weight: 600; color: var(--muted); margin-bottom: 2px; }
    @page { margin: 15mm; }
    @media print {
      body { padding: 24px !important; margin: 0 !important; background: #ffffff; }
      .container { max-width: 100%; margin: 0 !important; }
      .footer, tr { page-break-inside: avoid; }
      thead { display: table-header-group; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1 class="shop-name">${shopName}</h1>
        <p class="shop-sub">${shopCity}${shopAddress ? ` • ${shopAddress}` : ""}</p>
        ${(shopPhone || shopEmail) ? `<p style="margin: 4px 0 0 0; font-size: 11px; color: var(--muted);">${shopPhone ? `Phone: ${shopPhone}` : ""} ${shopPhone && shopEmail ? " | " : ""} ${shopEmail ? `Email: ${shopEmail}` : ""}</p>` : ""}
        ${shopGstin ? `<p style="margin: 4px 0 0 0; font-size: 11px; color: var(--muted); font-weight: 500;">GSTIN: ${shopGstin}</p>` : ""}
      </div>
      ${shopLogo ? `<img src="${shopLogo}" style="max-height: 60px; max-width: 160px; object-fit: contain;" alt="Logo" />` : ""}
    </div>
    <div class="divider"></div>
    <div class="meta-section">
      <div class="meta-col">
        <div class="meta-label">Customer</div>
        <div class="meta-value" style="font-size: 15px;">${customerName}</div>
        ${customerPhone ? `<div style="color: #3f3f46; margin-top: 2px;">Ph: ${customerPhone}</div>` : ""}
        ${customerGstin ? `<div style="color: #3f3f46; margin-top: 2px;">GSTIN: ${customerGstin}</div>` : ""}
      </div>
      <div class="meta-col">
        <div style="display: flex; justify-content: flex-end; align-items: center; margin-bottom: 6px;">
          <span class="status-badge ${statusClass}">${statusText}</span>
        </div>
        <div class="meta-label">Sale Invoice</div>
        <div class="meta-value" style="font-size: 15px; color: var(--success);">#${escapeHtml(sale.saleNumber)}</div>
        <div style="color: #3f3f46; margin-top: 2px; font-size: 11px;">${sale.saleDate ? formatSaleDate(sale.saleDate) : formatDate(sale.createdAt)}</div>
        <div style="margin-top: 8px; display: inline-block; width: 140px; height: 30px;">
          ${barcodeSvg}
        </div>
        ${staffName ? `<div style="color: var(--muted); font-size: 10px; margin-top: 4px;">Billed by: ${staffName}</div>` : ""}
      </div>
    </div>

    <table class="table">
      <thead>
        <tr>
          <th class="th" style="text-align: left; width: 45%;">Item / Product</th>
          <th class="th" style="text-align: center; width: 15%;">Qty</th>
          <th class="th" style="text-align: right; width: 20%;">Rate</th>
          <th class="th" style="text-align: right; width: 20%;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <div style="background-color: var(--background-offset); border-radius: 6px; padding: 12px; margin-top: 25px; border: 1px solid var(--border);">
      <div style="font-weight: 700; font-size: 11px; color: var(--primary); text-transform: uppercase; margin-bottom: 8px;">Invoice Summary</div>
      <div style="display: flex; justify-content: space-between; text-align: center;">
        <div style="flex: 1; border-right: 1px solid var(--border);">
          <div style="font-size: 10px; color: var(--muted);">Items Purchased</div>
          <div style="font-size: 14px; font-weight: 700; color: var(--primary); margin-top: 2px;">${uniqueItemsCount}</div>
        </div>
        <div style="flex: 1; border-right: 1px solid var(--border);">
          <div style="font-size: 10px; color: var(--muted);">Quantity Total</div>
          <div style="font-size: 14px; font-weight: 700; color: var(--primary); margin-top: 2px;">${totalQuantity}</div>
        </div>
        <div style="flex: 1; border-right: 1px solid var(--border);">
          <div style="font-size: 10px; color: var(--muted);">Amount Paid</div>
          <div style="font-size: 14px; font-weight: 700; color: var(--success); margin-top: 2px;">${formatMoney(paid)}</div>
        </div>
        <div style="flex: 1;">
          <div style="font-size: 10px; color: var(--muted);">Balance Due</div>
          <div style="font-size: 14px; font-weight: 700; color: ${balanceDue > 0 ? "var(--danger)" : "var(--primary)"}; margin-top: 2px;">${formatMoney(balanceDue)}</div>
        </div>
      </div>
    </div>

    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 20px;">
      <div style="flex: 1.2; margin-right: 20px;">
        ${shop?.upiId && balanceDue > 0 ? (() => {
          const upiPayeeName = shop.upiName || shop.name;
          const upiUri = `upi://pay?pa=${encodeURIComponent(shop.upiId)}&pn=${encodeURIComponent(upiPayeeName)}&am=${balanceDue.toFixed(2)}&cu=INR`;
          const qr = qrcode(0, "M");
          qr.addData(upiUri);
          qr.make();
          return `
            <div style="display: flex; align-items: center; border: 1px dashed var(--border); padding: 10px; border-radius: 6px; background-color: var(--background-offset);">
              <div style="flex: 1; padding-right: 10px;">
                <div style="font-weight: 700; color: var(--primary); font-size: 11px;">Scan to Pay via UPI</div>
                <div style="font-size: 9px; color: var(--muted); margin-top: 2px;">Payee: ${escapeHtml(upiPayeeName)}</div>
                <div style="font-size: 9px; color: var(--muted);">UPI ID: ${escapeHtml(shop.upiId)}</div>
                <div style="font-size: 9px; color: var(--muted);">Amount: <b>${formatMoney(balanceDue)}</b></div>
              </div>
              <img src="${qr.createDataURL(4)}" style="width: 70px; height: 70px;" alt="UPI QR" />
            </div>
          `;
        })() : ""}
      </div>
      <div class="totals-section" style="flex: 1; margin-top: 0; min-width: 200px;">
        <div class="totals-row">
          <span style="color: var(--muted);">Subtotal</span>
          <span style="font-weight: 600;">${formatMoney(subtotal)}</span>
        </div>
        ${discount > 0 ? `
        <div class="totals-row">
          <span style="color: var(--muted);">Discount</span>
          <span style="font-weight: 600; color: var(--success);">−${formatMoney(discount)}</span>
        </div>
        ` : ""}
        ${sale.gstInvoiceNumber ? `
        <div class="totals-row">
          <span style="color: var(--muted);">GST Invoice</span>
          <span style="font-weight: 600; font-size: 11px;">#${escapeHtml(sale.gstInvoiceNumber)}</span>
        </div>
        ` : ""}
        <div class="totals-row grand-total">
          <span>Grand Total</span>
          <span>${formatMoney(total)}</span>
        </div>
        <div class="totals-row" style="margin-top: 8px;">
          <span style="color: var(--muted); font-weight: 500;">Amount Paid</span>
          <span style="color: var(--success); font-weight: 700;">${formatMoney(paid)}</span>
        </div>
        <div class="totals-row">
          <span style="color: var(--muted); font-weight: 500;">Balance Due</span>
          <span style="color: ${balanceDue > 0 ? "var(--danger)" : "var(--primary)"}; font-weight: 700;">${formatMoney(balanceDue)}</span>
        </div>
      </div>
    </div>

    ${paymentsHtml ? `
      <div class="dashed-divider"></div>
      <div style="margin-top: 16px;">
        <div class="meta-label" style="margin-bottom: 8px;">Collections & Settlement</div>
        ${paymentsHtml}
      </div>
    ` : ""}

    ${sale.notes ? `
      <div class="notes-section">
        <div class="notes-title">Operational Notes</div>
        <div>${escapeHtml(sale.notes)}</div>
      </div>
    ` : ""}

    ${signatureHtml}

    <div class="dashed-divider"></div>
    <div style="margin-top: 20px; display: flex; justify-content: space-between; align-items: flex-start; gap: 20px;">
      <div style="flex: 2;">
        <div style="font-weight: 700; font-size: 10px; color: var(--primary); text-transform: uppercase; margin-bottom: 4px;">Terms & Conditions</div>
        <ul style="margin: 0; padding-left: 12px; font-size: 10px; color: var(--muted); line-height: 1.4;">
          <li>Goods once sold will not be taken back or exchanged.</li>
          <li>Warranty is subject to manufacturer policies.</li>
          <li>All disputes are subject to ${shopCity || "local"} jurisdiction.</li>
        </ul>
      </div>
      <div style="flex: 1; text-align: right;">
        <div style="font-weight: 700; font-size: 10px; color: var(--primary); text-transform: uppercase; margin-bottom: 4px;">Verification</div>
        <div style="font-size: 10px; font-weight: 600; color: var(--primary); font-family: monospace;">Hash: ${invoiceHash}</div>
        <div style="font-size: 8px; color: var(--muted); margin-top: 2px;">Verified secure POS transaction</div>
      </div>
    </div>
    <div class="footer">
      <div class="thank-you">Thank you for your business!</div>
      <div style="color: #cbd5e1; margin-top: 4px;">Powered by ShopControl</div>
    </div>
  </div>
</body>
</html>`;
}

export function buildInvoiceS3Key({ shopId, saleId, fileName, fingerprint }) {
  if (!fingerprint) throw new Error("An invoice fingerprint is required");
  return `invoices/${shopId}/${saleId}/${fingerprint}/${fileName}`;
}

async function getOrCreateSaleInvoicePdf({ sale, shop }) {
  const html = generateSaleInvoiceHtml({ sale, shop });
  const fileName = `Invoice_${sale.saleNumber}.pdf`;
  const fingerprint = createHash("sha256").update(html).digest("hex");
  const s3Key = buildInvoiceS3Key({
    shopId: shop.id,
    saleId: sale.id,
    fileName,
    fingerprint,
  });

  const existing = await prisma.asset.findFirst({
    where: {
      shopId: shop.id,
      storageProvider: "S3",
      storageBucket: getS3BucketName(),
      storageKey: s3Key,
      status: "READY",
      deletedAt: null,
    },
  });
  if (existing) {
    return {
      assetId: existing.id,
      s3Key,
      publicUrl: existing.remoteUrl || getPublicS3ObjectUrl(s3Key),
      fileName: existing.fileName || fileName,
      pdfBuffer: null,
      externalId: existing.externalId,
      cached: true,
      fingerprint,
    };
  }

  const pdfBuffer = await renderInvoicePdfFromHtml(html);
  await uploadBufferToS3({
    body: Buffer.from(pdfBuffer),
    key: s3Key,
    mimeType: "application/pdf",
    cacheControl: "private, max-age=300",
  });

  const publicUrl = getPublicS3ObjectUrl(s3Key);
  const bucketName = getS3BucketName();

  // 3. Record in Asset table (WHATSAPP_OUTBOUND DOCUMENT)
  let asset;
  try {
    asset = await prisma.asset.create({
      data: {
        shopId: shop.id,
        kind: "DOCUMENT",
        source: "WHATSAPP_OUTBOUND",
        status: "READY",
        storageProvider: "S3",
        storageBucket: bucketName,
        storageKey: s3Key,
        remoteUrl: publicUrl,
        mimeType: "application/pdf",
        fileName,
        sizeBytes: BigInt(pdfBuffer.byteLength ?? pdfBuffer.length),
        metadata: {
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          shopId: shop.id,
          purpose: "whatsapp_receipt",
          invoiceFingerprint: fingerprint,
          renderer: "chromium",
        },
        readyAt: new Date(),
      },
    });
  } catch (error) {
    try {
      await deleteS3Object(s3Key);
    } catch (cleanupError) {
      console.error("[PDF] Orphaned upload cleanup failed:", cleanupError?.message || cleanupError);
    }
    throw error;
  }

  return {
    assetId: asset.id,
    s3Key,
    publicUrl,
    fileName,
    pdfBuffer: Buffer.from(pdfBuffer),
    externalId: asset.externalId,
    cached: false,
    fingerprint,
  };
}

export async function generateAndUploadSaleInvoicePdf({ sale, shop }) {
  const html = generateSaleInvoiceHtml({ sale, shop });
  const fingerprint = createHash("sha256").update(html).digest("hex");
  const lockKey = `${shop.id}:${sale.id}:${fingerprint}`;
  const active = activeInvoiceBuilds.get(lockKey);
  if (active) return active;

  const build = getOrCreateSaleInvoicePdf({ sale, shop })
    .finally(() => activeInvoiceBuilds.delete(lockKey));
  activeInvoiceBuilds.set(lockKey, build);
  return build;
}

export async function getInvoicePdfBuffer(invoiceAsset) {
  if (invoiceAsset.pdfBuffer) return invoiceAsset.pdfBuffer;
  return downloadS3ObjectBuffer(invoiceAsset.s3Key);
}

/**
 * Deletes the S3 object and soft-deletes the Asset record.
 */
export async function deleteInvoiceAsset(assetId) {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) return;

  if (asset.storageKey) {
    await deleteS3Object(asset.storageKey);
  }

  // Soft delete in DB
  await prisma.asset.update({
    where: { id: assetId },
    data: { status: "DELETED", deletedAt: new Date() },
  });
}
