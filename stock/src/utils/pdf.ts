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

interface ShareInvoiceOptions {
  sale: Sale & { staff?: { name: string } | null };
  shop?: { name: string; city: string; code: string } | null;
  signatureBase64?: string; // Optional customer signature image base64
}

export async function generateSaleInvoiceHtml({ sale, shop, signatureBase64 }: ShareInvoiceOptions): Promise<string> {
  const shopName = shop?.name || "RETAIL STORE";
  const shopCity = shop?.city || "";
  const shopCode = shop?.code || "";
  const customerName = sale.isWalkin ? "Walk-in Customer" : sale.customer?.name || "Valued Customer";
  const customerPhone = sale.customer?.phone || "";
  const customerGstin = sale.customer?.gstin || "";
  const staffName = sale.staff?.name || "";

  // Items rows
  const itemsHtml = (sale.items || []).map((item, index) => {
    const qty = Number(item.quantity);
    const rate = Number(item.rate);
    const total = qty * rate;
    const itemName = item.item?.name || "Unknown Item";
    const itemSku = item.item?.sku ? `(${item.item.sku})` : "";
    const itemUnit = item.item?.unit || "pcs";
    return `
      <tr style="border-bottom: 1px solid #e4e4e7;">
        <td style="padding: 10px 0; text-align: left;">
          <div style="font-weight: 600; color: #18181b;">${itemName}</div>
          <div style="font-size: 11px; color: #71717a;">${itemSku}</div>
        </td>
        <td style="padding: 10px 0; text-align: center; color: #3f3f46;">${qty} ${itemUnit}</td>
        <td style="padding: 10px 0; text-align: right; color: #3f3f46;">${formatMoney(rate)}</td>
        <td style="padding: 10px 0; text-align: right; font-weight: 600; color: #18181b;">${formatMoney(total)}</td>
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
    if (p.details?.bankUtr) details.push(`UTR: ${p.details.bankUtr}`);
    if (p.details?.chequeNumber) details.push(`Cheque: #${p.details.chequeNumber} (${p.details.chequeBankName || "N/A"})`);
    
    const detailsText = details.length > 0 ? `(${details.join(", ")})` : "";
    return `
      <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: #3f3f46;">
        <div>
          <span style="font-weight: 600; color: #18181b;">${mode}</span> ${detailsText}
          <div style="font-size: 11px; color: #71717a;">${date} ${collectedBy ? `• ${collectedBy}` : ""}</div>
        </div>
        <div style="font-weight: 600; color: #18181b;">${formatMoney(amount)}</div>
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
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          margin: 0;
          padding: 20px;
          color: #18181b;
          background-color: #ffffff;
        }
        .container {
          max-width: 650px;
          margin: 0 auto;
        }
        .header {
          text-align: center;
          margin-bottom: 24px;
        }
        .shop-name {
          font-size: 24px;
          font-weight: 800;
          color: #18181b;
          letter-spacing: -0.5px;
          margin: 0 0 4px 0;
          text-transform: uppercase;
        }
        .shop-sub {
          font-size: 12px;
          color: #71717a;
          margin: 0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .divider {
          border-top: 2px solid #18181b;
          margin: 16px 0;
        }
        .dashed-divider {
          border-top: 1px dashed #d4d4d8;
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
          color: #71717a;
          font-weight: 500;
          margin-bottom: 2px;
          text-transform: uppercase;
          font-size: 10px;
          letter-spacing: 0.5px;
        }
        .meta-value {
          font-weight: 600;
          color: #18181b;
        }
        .table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 16px;
        }
        .th {
          border-bottom: 2px solid #18181b;
          color: #71717a;
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
          border-top: 1px solid #18181b;
          padding-top: 8px;
          margin-top: 6px;
        }
        .notes-section {
          background-color: #f4f4f5;
          padding: 12px;
          border-radius: 8px;
          font-size: 12px;
          margin-top: 20px;
          color: #3f3f46;
          border: 1px solid #e4e4e7;
        }
        .notes-title {
          font-weight: 700;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #71717a;
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
          border-bottom: 1px solid #a1a1aa;
        }
        .footer {
          margin-top: 40px;
          text-align: center;
          font-size: 11px;
          color: #a1a1aa;
        }
        .thank-you {
          font-weight: 600;
          color: #71717a;
          margin-bottom: 2px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 class="shop-name">${shopName}</h1>
          <p class="shop-sub">${shopCity} ${shopCode ? `• CODE: ${shopCode}` : ""}</p>
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
            <div class="meta-label">Sale Invoice</div>
            <div class="meta-value" style="font-size: 15px; color: #16a34a;">#${sale.saleNumber}</div>
            <div style="color: #3f3f46; margin-top: 2px;">${formatDate(sale.createdAt)}</div>
            ${staffName ? `<div style="color: #71717a; font-size: 11px; margin-top: 4px;">Billed by: ${staffName}</div>` : ""}
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

        <div class="totals-section">
          <div class="totals-row">
            <span style="color: #71717a;">Subtotal</span>
            <span style="font-weight: 600;">${formatMoney(sale.totalAmount)}</span>
          </div>
          ${sale.isGstRequired && sale.gstInvoiceNumber ? `
          <div class="totals-row">
            <span style="color: #71717a;">GST Invoice</span>
            <span style="font-weight: 600; font-size: 11px;">#${sale.gstInvoiceNumber}</span>
          </div>
          ` : ""}
          <div class="totals-row grand-total">
            <span>Grand Total</span>
            <span>${formatMoney(sale.totalAmount)}</span>
          </div>
          <div class="totals-row" style="margin-top: 8px;">
            <span style="color: #71717a; font-weight: 500;">Amount Paid</span>
            <span style="color: #16a34a; font-weight: 700;">${formatMoney(sale.paidAmount)}</span>
          </div>
          <div class="totals-row">
            <span style="color: #71717a; font-weight: 500;">Balance Due</span>
            <span style="color: ${Number(sale.balanceAmount) > 0 ? "#dc2626" : "#18181b"}; font-weight: 700;">${formatMoney(sale.balanceAmount)}</span>
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

        ${signatureBase64 ? `
          <div class="signature-section">
            <div class="meta-label">Customer Signature</div>
            <img class="signature-img" src="${signatureBase64}" alt="Signature" />
          </div>
        ` : ""}

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
    const html = await generateSaleInvoiceHtml(options);
    const { uri } = await Print.printToFileAsync({ html });
    
    if (Platform.OS === "web") {
      Alert.alert("PDF Exported", "Your PDF invoice has been prepared successfully.");
    } else {
      const isSharingAvailable = await Sharing.isAvailableAsync();
      if (isSharingAvailable) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: `Invoice - ${options.sale.saleNumber}`,
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert("Sharing unavailable", "Native sharing is not available on this device.");
      }
    }
  } catch (error: any) {
    console.error("Failed to generate or share PDF invoice:", error);
    Alert.alert("Export Failed", error?.message || "An error occurred while generating the PDF.");
  }
}

export async function printSaleInvoiceDirect(options: ShareInvoiceOptions): Promise<void> {
  try {
    const html = await generateSaleInvoiceHtml(options);
    await Print.printAsync({ html });
  } catch (error: any) {
    console.error("Failed to print invoice:", error);
    Alert.alert("Print Failed", error?.message || "An error occurred while printing the receipt.");
  }
}
