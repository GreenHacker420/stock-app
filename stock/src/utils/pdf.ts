import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Alert, Platform } from "react-native";
import { type Sale } from "../api/client";

const formatMoney = (val?: string | number | null) => {
  return `₹${Number(val ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDate = (dateStr?: string | Date | null) => {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleString("en-IN", {
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

const pdfCache: Record<string, { uri: string; timestamp: number }> = {};

async function printHtmlOnWeb(html: string): Promise<void> {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);
    
    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      
      iframe.onload = () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
          resolve();
        }, 1000);
      };
    } else {
      resolve();
    }
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
            .map((p) => `<path d="${p}" stroke="var(--primary)" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" />`)
            .join("");
          signatureHtml = `
            <div class="signature-section" style="margin-top: 30px; text-align: right;">
              <div class="meta-label" style="color: var(--muted); font-weight: 500; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Customer Signature</div>
              <div style="display: inline-block; width: 150px; height: 75px; border-bottom: 1px solid var(--border);">
                <svg viewBox="${signatureViewBox}" style="width: 100%; height: 100%;">${pathElements}</svg>
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
          <img class="signature-img" src="${rawSig}" alt="Signature" style="max-height: 50px; max-width: 150px; object-fit: contain; border-bottom: 1px solid var(--border);" />
        </div>
      `;
    }
  }

  const shopName = shop?.name || "RETAIL STORE";
  const shopCity = shop?.city || "";
  const shopAddress = shop?.address || "";
  const shopPhone = shop?.phone || "";
  const shopEmail = shop?.email || "";
  const shopGstin = shop?.gstin || "";
  const shopLogo = shop?.logo || "";

  const customerName = sale.isWalkin ? "Walk-in Customer" : sale.customer?.name || "Valued Customer";
  const customerPhone = sale.customer?.phone || "";
  const customerGstin = sale.customer?.gstin || "";
  const staffName = sale.staff?.name || "";

  const uniqueItemsCount = (sale.items || []).length;
  const totalQuantity = (sale.items || []).reduce((sum, item) => sum + Number(item.quantity), 0);
  const invoiceHash = (sale.id || "INV").substring(0, 8).toUpperCase();

  // Payment Status Badge
  const paid = Number(sale.paidAmount || 0);
  const total = Number(sale.totalAmount || 0);
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
    const qty = Number(item.quantity);
    const rate = Number(item.rate);
    const itemTotal = qty * rate;
    const itemName = item.item?.name || "Unknown Item";
    const itemSku = item.item?.sku ? `(${item.item.sku})` : "";
    const itemUnit = item.item?.unit || "pcs";
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
    const mode = p.paymentMode || "PAYMENT";
    const date = formatDate(p.receivedAt);
    const amount = Number(p.amount);
    const collectedBy = p.receivedBy?.name ? `Collected by: ${p.receivedBy.name}` : "";
    const details = [];
    if (p.details?.upiReference) details.push(`UPI Ref: ${p.details.upiReference}`);
    if (p.details?.chequeNumber) details.push(`Cheque: ${p.details.chequeNumber}`);
    if (p.details?.bankName) details.push(p.details.bankName);
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

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Invoice - ${sale.saleNumber}</title>
      <style>
        :root {
          --primary: #18181b;
          --muted: #71717a;
          --success: #16a34a;
          --danger: #dc2626;
          --border: #e4e4e7;
          --background-offset: #f9fafb;
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
        
        @media print {
          body {
            padding: 0;
            background: #ffffff;
          }
          .container {
            max-width: 100%;
            border: none;
            box-shadow: none;
            padding: 0;
            margin: 0;
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
            <div class="meta-value" style="font-size: 15px; color: var(--success);">#${sale.saleNumber}</div>
            <div style="color: #3f3f46; margin-top: 2px; font-size: 11px;">${formatDate(sale.createdAt)}</div>
            <div style="margin-top: 8px;">
              <img src="https://barcode.tec-it.com/barcode.ashx?data=${encodeURIComponent(sale.saleNumber)}&code=Code128&translate-esc=true" style="height: 30px; max-width: 150px; object-fit: contain;" alt="Barcode" />
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
              <div style="font-size: 14px; font-weight: 700; color: var(--success); margin-top: 2px;">${formatMoney(sale.paidAmount)}</div>
            </div>
            <div style="flex: 1;">
              <div style="font-size: 10px; color: var(--muted);">Balance Due</div>
              <div style="font-size: 14px; font-weight: 700; color: ${Number(sale.balanceAmount) > 0 ? "var(--danger)" : "var(--primary)"}; margin-top: 2px;">${formatMoney(sale.balanceAmount)}</div>
            </div>
          </div>
        </div>

        <!-- Totals & Payment Section -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-top: 20px;">
          <!-- Left: Payment QR Code if UPI ID configured -->
          <div style="flex: 1.2; margin-right: 20px;">
            ${shop?.upiId ? (() => {
              const upiUri = `upi://pay?pa=${shop.upiId}&pn=${encodeURIComponent(shop.upiName || shop.name)}&am=${sale.totalAmount}&cu=INR`;
              return `
                <div style="display: flex; align-items: center; border: 1px dashed var(--border); padding: 10px; border-radius: 6px; background-color: var(--background-offset);">
                  <div style="flex: 1; padding-right: 10px;">
                    <div style="font-weight: 700; color: var(--primary); font-size: 11px;">Scan to Pay via UPI</div>
                    <div style="font-size: 9px; color: var(--muted); margin-top: 2px;">Payee: ${shop.upiName || shop.name}</div>
                    <div style="font-size: 9px; color: var(--muted);">UPI ID: ${shop.upiId}</div>
                    <div style="font-size: 9px; color: var(--muted);">Amount: <b>${formatMoney(sale.totalAmount)}</b></div>
                  </div>
                  <img src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(upiUri)}" style="width: 70px; height: 70px;" alt="UPI QR" />
                </div>
              `;
            })() : ""}
          </div>
          
          <!-- Right: Summary totals -->
          <div class="totals-section" style="flex: 1; margin-top: 0; min-width: 200px;">
            <div class="totals-row">
              <span style="color: var(--muted);">Subtotal</span>
              <span style="font-weight: 600;">${formatMoney(sale.totalAmount)}</span>
            </div>
            ${sale.isGstRequired && sale.gstInvoiceNumber ? `
            <div class="totals-row">
              <span style="color: var(--muted);">GST Invoice</span>
              <span style="font-weight: 600; font-size: 11px;">#${sale.gstInvoiceNumber}</span>
            </div>
            ` : ""}
            <div class="totals-row grand-total">
              <span>Grand Total</span>
              <span>${formatMoney(sale.totalAmount)}</span>
            </div>
            <div class="totals-row" style="margin-top: 8px;">
              <span style="color: var(--muted); font-weight: 500;">Amount Paid</span>
              <span style="color: var(--success); font-weight: 700;">${formatMoney(sale.paidAmount)}</span>
            </div>
            <div class="totals-row">
              <span style="color: var(--muted); font-weight: 500;">Balance Due</span>
              <span style="color: ${Number(sale.balanceAmount) > 0 ? "var(--danger)" : "var(--primary)"}; font-weight: 700;">${formatMoney(sale.balanceAmount)}</span>
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
            <div>${sale.notes}</div>
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

    const cacheKey = `${sale.id}_${sale.paidAmount}_${sale.balanceAmount}_${(sale.payments || []).length}_${sale.customerSignature ? "signed" : "unsigned"}`;
    let uri = pdfCache[cacheKey]?.uri;
    
    if (!uri) {
      const html = await generateSaleInvoiceHtml(options);
      const result = await Print.printToFileAsync({ html });
      uri = result.uri;
      pdfCache[cacheKey] = { uri, timestamp: Date.now() };
    }

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
