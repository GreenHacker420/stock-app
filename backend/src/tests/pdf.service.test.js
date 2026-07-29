import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTemporaryInvoiceS3Key,
  generateSaleInvoiceHtml,
} from "../services/pdf.service.js";

const baseSale = {
  id: "cmrixyrwp00dy01npwkf0x2zu",
  saleNumber: "SAL-20260729-001",
  createdAt: "2026-07-29T03:29:00.000Z",
  isWalkin: false,
  customer: { name: "B Dongre Trading", phone: "9876543210" },
  staff: { name: "Owner" },
  subtotal: 2940,
  discountAmount: 0,
  totalAmount: 2940,
  paidAmount: 2940,
  balanceAmount: 0,
  paymentStatus: "PAID",
  items: [
    {
      quantity: 3,
      rate: 980,
      discountAmount: 0,
      // Deliberately stale: the renderer must not trust this persisted value.
      totalAmount: 12940,
      item: {
        name: "008 Black Ink",
        sku: "8906049014508",
        unit: "pcs",
        brand: { name: "Epson" },
      },
    },
  ],
  payments: [
    {
      paymentMode: "UPI",
      amount: 2940,
      receivedAt: "2026-07-29T03:29:00.000Z",
      receivedBy: { name: "Owner" },
      details: { upiReference: "UPI-123" },
    },
  ],
};

const shop = {
  name: "Vardaman Sales",
  city: "Nagpur",
  address: "Shop no. 62",
  phone: "9329470933",
  logo: "https://example.com/logo.png",
};

test("sale invoice recalculates line totals instead of trusting stale totalAmount", () => {
  const html = generateSaleInvoiceHtml({ sale: baseSale, shop });

  assert.match(html, /Rs\. 2,940\.00/);
  assert.doesNotMatch(html, /Rs\. 12,940\.00/);
  assert.doesNotMatch(html, /₹/);
  assert.match(html, /UPI Ref: UPI-123/);
  assert.match(html, /Billed by: Owner/);
  assert.match(html, /https:\/\/example\.com\/logo\.png/);
});

test("sale invoice displays line and sale discounts consistently", () => {
  const sale = {
    ...baseSale,
    subtotal: 2940,
    discountAmount: 40,
    totalAmount: 2900,
    paidAmount: 2900,
    items: [
      {
        ...baseSale.items[0],
        discountAmount: 40,
        totalAmount: 12940,
      },
    ],
  };

  const html = generateSaleInvoiceHtml({ sale, shop });

  assert.match(html, /Discount: Rs\. 40\.00/);
  assert.match(html, /−Rs\. 40\.00/);
  assert.match(html, /Rs\. 2,900\.00/);
  assert.doesNotMatch(html, /Rs\. 12,940\.00/);
});

test("temporary invoice S3 keys are unique across repeated sends", () => {
  const args = {
    shopId: "shop-1",
    saleId: "sale-1",
    fileName: "Invoice_SAL-001.pdf",
  };

  const first = buildTemporaryInvoiceS3Key(args);
  const second = buildTemporaryInvoiceS3Key(args);

  assert.notEqual(first, second);
  assert.match(first, /^invoices\/shop-1\/sale-1\/[^/]+\/Invoice_SAL-001\.pdf$/);
});
