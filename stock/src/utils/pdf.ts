import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Alert, Platform } from "react-native";
import qrcode from "qrcode-generator";
import { type Sale } from "../api/client";

const escapeHtml = (value: unknown): string => {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const escapeAttr = escapeHtml;

const toFiniteNumber = (value: unknown, fallback = 0): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const formatMoney = (val?: string | number | null): string => {
  return `₹${toFiniteNumber(val).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatDate = (dateStr?: string | Date | null): string => {
  if (!dateStr) return "N/A";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    return "N/A";
  }
  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const getSignatureViewBox = (paths: string[]): string => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  paths.forEach(path => {
    if (typeof path !== "string") return;
    const matches = path.match(/[-+]?[0-9]*\.?[0-9]+/g);
    if (matches) {
      for (let i = 0; i < matches.length; i += 2) {
        const x = parseFloat(matches[i]);
        const y = parseFloat(matches[i+1]);
        if (!isNaN(x) && !isNaN(y)) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  });
  if (minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
    return "0 0 300 150";
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const padding = 10;
  return `${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}`;
};

interface ShareInvoiceOptions {
  sale: Sale & { staff?: { name: string } | null };
  shop?: { 
    name: string; 
    city: string; 
    code: string; 
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    gstin?: string | null;
    logo?: string | null;
    upiId?: string | null;
    upiName?: string | null;
  } | null;
  signatureBase64?: string; // Optional customer signature image base64
}

// Code 128 Barcode patterns for 0-106 (Start A, B, C, Stop)
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
  "211412", // 103: Start A
  "211214", // 104: Start B
  "211232", // 105: Start C
  "2331112" // 106: Stop
];

export function generateCode128BSvg(text: string): string {
  // Only encode printable ASCII characters (space to ~)
  const cleanText = text.replace(/[^\x20-\x7E]/g, "");

  // Start with Start Code B (value 104)
  const codeValues: number[] = [104];
  let checksum = 104;

  // Add character values
  for (let i = 0; i < cleanText.length; i++) {
    const val = cleanText.charCodeAt(i) - 32;
    codeValues.push(val);
    checksum += val * (i + 1);
  }

  // Calculate check digit
  const checkValue = checksum % 103;
  codeValues.push(checkValue);

  // End with Stop Code (value 106)
  codeValues.push(106);

  // Generate binary representation
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

  // Convert binary to SVG rects
  let rects = "";
  let x = 0;
  for (let i = 0; i < binary.length; i++) {
    if (binary[i] === "1") {
      rects += `<rect x="${x}" y="0" width="1" height="30" fill="black" stroke="none" />`;
    }
    x += 1;
  }

  return `
    <svg viewBox="0 0 ${binary.length} 30" width="100%" height="100%" preserveAspectRatio="none" style="display: block;">
      ${rects}
    </svg>
  `;
}

async function printHtmlOnWeb(html: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve();
      return;
    }

    const iframe = document.createElement("iframe");

    const cleanup = () => {
      if (iframe.parentNode) {
        document.body.removeChild(iframe);
      }
      resolve();
    };

    iframe.onload = () => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(cleanup, 1000);
    };

    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";

    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;

    if (!doc) {
      cleanup();
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    setTimeout(cleanup, 5000);
  });
}

export async function generateSaleInvoiceHtml({ sale, shop, signatureBase64 }: ShareInvoiceOptions): Promise<string> {
  let signatureHtml = "";
  let rawSig = sale.customerSignature || signatureBase64;
  if (rawSig) {
    rawSig = rawSig.trim();
    if (rawSig.startsWith("{") || rawSig.startsWith("[")) {
      try {
        const parsed = JSON.parse(rawSig);
        let paths: string[] = [];
        let signatureViewBox = "0 0 300 150";
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          paths = parsed.paths || [];
          signatureViewBox = parsed.viewBox || "0 0 300 150";
        } else if (Array.isArray(parsed)) {
          paths = parsed;
          signatureViewBox = getSignatureViewBox(parsed);
        }

        if (paths.length > 0) {
          const pathElements = paths
            .filter((p) => typeof p === "string")
            .map((p) => {
              const safePath = escapeAttr(p);
              return `<path d="${safePath}" stroke="var(--primary)" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" />`;
            })
            .join("");
          signatureHtml = `
            <div class="signature-section" style="margin-top: 30px; text-align: right;">
              <div class="meta-label" style="color: var(--muted); font-weight: 500; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Customer Signature</div>
              <div style="display: inline-block; width: 150px; height: 75px; border-bottom: 1px solid var(--border);">
                <svg viewBox="${escapeAttr(signatureViewBox)}" style="width: 100%; height: 100%;">${pathElements}</svg>
              </div>
            </div>
          `;
        }
      } catch (e) {
        console.error("Failed to parse customer signature for PDF:", e);
      }
    } else if (rawSig.startsWith("data:") || rawSig.length > 100) {
      signatureHtml = `
        <div class="signature-section" style="margin-top: 30px; text-align: right;">
          <div class="meta-label" style="color: var(--muted); font-weight: 500; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Customer Signature</div>
          <img class="signature-img" src="${escapeAttr(rawSig)}" alt="Signature" style="max-height: 50px; max-width: 150px; object-fit: contain; border-bottom: 1px solid var(--border);" />
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

  const customerName = escapeHtml(sale.isWalkin ? "Walk-in Customer" : sale.customer?.name || "Valued Customer");
  const customerPhone = escapeHtml(sale.customer?.phone || "");
  const customerGstin = escapeHtml(sale.customer?.gstin || "");
  const staffName = escapeHtml(sale.staff?.name || "");

  const uniqueItemsCount = (sale.items || []).length;
  const totalQuantity = (sale.items || []).reduce((sum, item) => sum + toFiniteNumber(item.quantity), 0);
  const invoiceHash = escapeHtml((sale.id || "INV").substring(0, 8).toUpperCase());

  // Payment Status Badge
  const paid = toFiniteNumber(sale.paidAmount);
  const total = toFiniteNumber(sale.totalAmount);
  const balanceDue = Math.max(toFiniteNumber(sale.balanceAmount), 0);

  let statusText = "PAYMENT DUE";
  let statusClass = "due";
  
  if (paid >= total) {
    statusText = "PAID";
    statusClass = "paid";
  } else if (paid > 0) {
    statusText = "PARTIALLY PAID";
    statusClass = "partial";
  } else if (sale.paymentStatus === "PAID") {
    statusText = "PAID";
    statusClass = "paid";
  }

  // Items rows
  const itemsHtml = (sale.items || []).map((item, index) => {
    const qty = toFiniteNumber(item.quantity);
    const rate = toFiniteNumber(item.rate);
    const itemTotal = qty * rate;
    const itemName = escapeHtml(item.item?.name || "Unknown Item");
    const itemSku = item.item?.sku ? `(${escapeHtml(item.item.sku)})` : "";
    const itemUnit = escapeHtml(item.item?.unit || "pcs");
    return `
      <tr style="border-bottom: 1px solid var(--border);">
        <td style="padding: 10px 0; text-align: left;">
          <div style="font-weight: 600; color: var(--primary);">${itemName}</div>
          <div style="font-size: 11px; color: var(--muted);">${itemSku}</div>
        </td>
        <td style="padding: 10px 0; text-align: center; color: #3f3f46;">${qty} ${itemUnit}</td>
        <td style="padding: 10px 0; text-align: right; color: #3f3f46;">${formatMoney(rate)}</td>
        <td style="padding: 10px 0; text-align: right; font-weight: 600; color: var(--primary);">${formatMoney(itemTotal)}</td>
      </tr>
    `;
  }).join("");

  // Payments rows
  const paymentsHtml = (sale.payments || []).map((p: any) => {
    const mode = escapeHtml(p.paymentMode || "PAYMENT");
    const date = formatDate(p.receivedAt);
    const amount = toFiniteNumber(p.amount);
    const collectedBy = p.receivedBy?.name ? `Collected by: ${escapeHtml(p.receivedBy.name)}` : "";
    const details = [];
    if (p.details?.upiReference) details.push(`UPI Ref: ${escapeHtml(p.details.upiReference)}`);
    if (p.details?.chequeNumber) details.push(`Cheque: ${escapeHtml(p.details.chequeNumber)}`);
    if (p.details?.bankName) details.push(escapeHtml(p.details.bankName));
    const detailsText = details.length > 0 ? `(${details.join(", ")})` : "";

    return `
      <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: #3f3f46; border-bottom: 1px solid var(--border);">
        <div>
          <span style="font-weight: 600; color: var(--primary);">${mode}</span> ${detailsText}
          <div style="font-size: 11px; color: var(--muted);">${date} ${collectedBy ? `• ${collectedBy}` : ""}</div>
        </div>
        <div style="font-weight: 600; color: var(--primary);">${formatMoney(amount)}</div>
      </div>
    `;
  }).join("");

  // Generate Barcode SVG locally
  const barcodeSvg = generateCode128BSvg(sale.saleNumber);

  return `
    <!DOCTYPE html>
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
          padding: 20px;
          color: var(--primary);
          background-color: #ffffff;
        }
        .container {
          max-width: 650px;
          margin: 0 auto;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 24px;
        }
        .shop-name {
          font-size: 24px;
          font-weight: 800;
          color: var(--primary);
          letter-spacing: -0.5px;
          margin: 0 0 4px 0;
          text-transform: uppercase;
        }
        .shop-sub {
          font-size: 12px;
          color: var(--muted);
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .divider {
          border-top: 2px solid var(--primary);
          margin: 16px 0;
        }
        .dashed-divider {
          border-top: 1px dashed var(--border);
          margin: 16px 0;
        }
        .meta-section {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          margin-bottom: 20px;
        }
        .meta-col {
          flex: 1;
        }
        .meta-col:last-child {
          text-align: right;
        }
        .meta-label {
          color: var(--muted);
          font-weight: 500;
          margin-bottom: 2px;
          text-transform: uppercase;
          font-size: 10px;
          letter-spacing: 0.5px;
        }
        .meta-value {
          font-weight: 600;
          color: var(--primary);
        }
        .status-badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .status-badge.paid {
          background-color: rgba(22, 163, 74, 0.1);
          color: var(--success);
          border: 1px solid rgba(22, 163, 74, 0.2);
        }
        .status-badge.partial {
          background-color: rgba(217, 119, 6, 0.1);
          color: #d97706;
          border: 1px solid rgba(217, 119, 6, 0.2);
        }
        .status-badge.due {
          background-color: rgba(220, 38, 38, 0.1);
          color: var(--danger);
          border: 1px solid rgba(220, 38, 38, 0.2);
        }
        .table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 16px;
        }
        .th {
          border-bottom: 2px solid var(--primary);
          color: var(--muted);
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          padding-bottom: 8px;
        }
        .totals-section {
          margin-left: auto;
          width: 250px;
          margin-top: 16px;
        }
        .totals-row {
          display: flex;
          justify-content: space-between;
          padding: 4px 0;
          font-size: 13px;
        }
        .grand-total {
          font-size: 16px;
          font-weight: 800;
          border-top: 1px solid var(--primary);
          padding-top: 8px;
          margin-top: 6px;
        }
        .notes-section {
          background-color: var(--background-offset);
          padding: 12px;
          border-radius: 8px;
          font-size: 12px;
          margin-top: 20px;
          color: #3f3f46;
          border: 1px solid var(--border);
        }
        .notes-title {
          font-weight: 700;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--muted);
          margin-bottom: 4px;
        }
        .signature-section {
          margin-top: 30px;
          text-align: right;
        }
        .signature-img {
          max-height: 50px;
          max-width: 150px;
          object-fit: contain;
          border-bottom: 1px solid var(--border);
        }
        .footer {
          margin-top: 40px;
          text-align: center;
          font-size: 11px;
          color: var(--muted);
        }
        .thank-you {
          font-weight: 600;
          color: var(--muted);
          margin-bottom: 2px;
        }
        
        @page {
          margin: 15mm 15mm 15mm 15mm;
        }
        @media print {
          body {
            padding: 24px !important;
            margin: 0 !important;
            background: #ffffff;
          }
          .container {
            max-width: 100%;
            border: none;
            box-shadow: none;
            padding: 0 !important;
            margin: 0 !important;
          }
          .footer {
            page-break-inside: avoid;
          }
          tr {
            page-break-inside: avoid;
          }
          thead {
            display: table-header-group;
          }
          tfoot {
            display: table-footer-group;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <!-- Header / Company Branding -->
        <div class="header">
          <div>
            <h1 class="shop-name">${shopName}</h1>
            <p class="shop-sub">${shopCity}${shopAddress ? ` • ${shopAddress}` : ""}</p>
            ${(shopPhone || shopEmail) ? `
              <p style="margin: 4px 0 0 0; font-size: 11px; color: var(--muted);">
                ${shopPhone ? `Phone: ${shopPhone}` : ""}
                ${shopPhone && shopEmail ? " | " : ""}
                ${shopEmail ? `Email: ${shopEmail}` : ""}
              </p>
            ` : ""}
            ${shopGstin ? `<p style="margin: 4px 0 0 0; font-size: 11px; color: var(--muted); font-weight: 500;">GSTIN: ${shopGstin}</p>` : ""}
          </div>
          ${shopLogo ? `
            <img src="${shopLogo}" style="max-height: 60px; max-width: 160px; object-fit: contain;" alt="Logo" />
          ` : ""}
        </div>
        
        <div class="divider"></div>
        
        <!-- Meta details & barcode -->
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
            <div style="color: #3f3f46; margin-top: 2px; font-size: 11px;">${formatDate(sale.createdAt)}</div>
            <div style="margin-top: 8px; display: inline-block; width: 140px; height: 30px;">
              ${barcodeSvg}
            </div>
            ${staffName ? `<div style="color: var(--muted); font-size: 10px; margin-top: 4px;">Billed by: ${staffName}</div>` : ""}
          </div>
        </div>

        <!-- Items Table -->
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

        <!-- Invoice Summary Card -->
        <div style="background-color: var(--background-offset); border-radius: 6px; padding: 12px; margin-top: 25px; border: 1px solid var(--border);">
          <div style="font-weight: 700; font-size: 11px; color: var(--primary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Invoice Summary</div>
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

        <!-- Totals & Payment Section -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 20px;">
          <!-- Left: Payment QR Code if UPI ID configured and balance is due -->
          <div style="flex: 1.2; margin-right: 20px;">
            ${shop?.upiId && balanceDue > 0 ? (() => {
              const upiPayeeName = shop.upiName || shop.name;
              const upiUri = `upi://pay?pa=${encodeURIComponent(shop.upiId)}&pn=${encodeURIComponent(upiPayeeName)}&am=${total.toFixed(2)}&cu=INR`;
              
              // Generate QR code locally offline using qrcode-generator
              const qr = qrcode(0, 'M');
              qr.addData(upiUri);
              qr.make();
              const qrBase64 = qr.createDataURL(4);

              return `
                <div style="display: flex; align-items: center; border: 1px dashed var(--border); padding: 10px; border-radius: 6px; background-color: var(--background-offset);">
                  <div style="flex: 1; padding-right: 10px;">
                    <div style="font-weight: 700; color: var(--primary); font-size: 11px;">Scan to Pay via UPI</div>
                    <div style="font-size: 9px; color: var(--muted); margin-top: 2px;">Payee: ${escapeHtml(upiPayeeName)}</div>
                    <div style="font-size: 9px; color: var(--muted);">UPI ID: ${escapeHtml(shop.upiId)}</div>
                    <div style="font-size: 9px; color: var(--muted);">Amount: <b>${formatMoney(total)}</b></div>
                  </div>
                  <img src="${qrBase64}" style="width: 70px; height: 70px;" alt="UPI QR" />
                </div>
              `;
            })() : ""}
          </div>
          
          <!-- Right: Summary totals -->
          <div class="totals-section" style="flex: 1; margin-top: 0; min-width: 200px;">
            <div class="totals-row">
              <span style="color: var(--muted);">Subtotal</span>
              <span style="font-weight: 600;">${formatMoney(total)}</span>
            </div>
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

        <!-- Terms & Verification -->
        <div class="dashed-divider"></div>
        <div style="margin-top: 20px; display: flex; justify-content: space-between; align-items: flex-start; gap: 20px;">
          <div style="flex: 2;">
            <div style="font-weight: 700; font-size: 10px; color: var(--primary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Terms & Conditions</div>
            <ul style="margin: 0; padding-left: 12px; font-size: 10px; color: var(--muted); line-height: 1.4;">
              <li>Goods once sold will not be taken back or exchanged.</li>
              <li>Warranty is subject to manufacturer policies.</li>
              <li>All disputes are subject to Nagpur jurisdiction.</li>
            </ul>
          </div>
          <div style="flex: 1; text-align: right;">
            <div style="font-weight: 700; font-size: 10px; color: var(--primary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Verification</div>
            <div style="font-size: 10px; font-weight: 600; color: var(--primary); font-family: monospace;">Hash: ${invoiceHash}</div>
            <div style="font-size: 8px; color: var(--muted); margin-top: 2px;">Verified Secure Pos Transaction</div>
          </div>
        </div>

        <!-- Footer -->
        <div class="footer">
          <div class="thank-you">Thank you for your business!</div>
          <div style="color: #cbd5e1; margin-top: 4px;">Powered by ShopControl</div>
        </div>
      </div>
    </body>
    </html>
  `;
}

export async function shareSaleInvoicePdf(options: ShareInvoiceOptions): Promise<void> {
  try {
    const { sale } = options;
    
    if (Platform.OS === "web") {
      const html = await generateSaleInvoiceHtml(options);
      await printHtmlOnWeb(html);
      return;
    }

    const html = await generateSaleInvoiceHtml(options);
    const result = await Print.printToFileAsync({ html });
    const uri = result.uri;

    const isSharingAvailable = await Sharing.isAvailableAsync();
    if (isSharingAvailable) {
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `Invoice - ${sale.saleNumber}`,
        UTI: "com.adobe.pdf",
      });
    } else {
      Alert.alert("Sharing unavailable", "Native sharing is not available on this device.");
    }
  } catch (error: any) {
    console.error("Failed to generate or share PDF invoice:", error);
    Alert.alert("Export Failed", error?.message || "An error occurred while generating the PDF.");
  }
}

export async function printSaleInvoiceDirect(options: ShareInvoiceOptions): Promise<void> {
  try {
    const html = await generateSaleInvoiceHtml(options);
    
    if (Platform.OS === "web") {
      await printHtmlOnWeb(html);
      return;
    }

    await Print.printAsync({ html });
  } catch (error: any) {
    console.error("Failed to print invoice:", error);
    Alert.alert("Print Failed", error?.message || "An error occurred while printing the receipt.");
  }
}
