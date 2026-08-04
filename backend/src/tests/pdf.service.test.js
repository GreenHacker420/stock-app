import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInvoiceS3Key,
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
      serialNumbers: ["SN-001", "SN-002", "SN-003"],
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

  assert.match(html, /₹2,940\.00/);
  assert.doesNotMatch(html, /₹12,940\.00/);
  assert.match(html, /UPI Ref: UPI-123/);
  assert.match(html, /Billed by: Owner/);
  assert.match(html, /https:\/\/example\.com\/logo\.png/);
  assert.match(html, /S\/N: SN-001, SN-002, SN-003/);
});

test("sale invoice uses the business sale date", () => {
  const html = generateSaleInvoiceHtml({
    sale: {
      ...baseSale,
      saleDate: "2026-07-20T12:00:00.000Z",
      createdAt: "2026-07-29T03:29:00.000Z",
    },
    shop,
  });

  assert.match(html, /20 Jul 2026/);
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

  assert.match(html, /Discount: ₹40\.00/);
  assert.match(html, /−₹40\.00/);
  assert.match(html, /₹2,900\.00/);
  assert.doesNotMatch(html, /₹12,940\.00/);
});

test("invoice S3 keys are stable for an unchanged invoice fingerprint", () => {
  const args = {
    shopId: "shop-1",
    saleId: "sale-1",
    fileName: "Invoice_SAL-001.pdf",
    fingerprint: "abc123",
  };

  const first = buildInvoiceS3Key(args);
  const second = buildInvoiceS3Key(args);

  assert.equal(first, second);
  assert.equal(first, "invoices/shop-1/sale-1/abc123/Invoice_SAL-001.pdf");
});

test("sale invoice displays change returned when paid amount exceeds total amount", () => {
  const sale = {
    ...baseSale,
    totalAmount: 350,
    paidAmount: 500,
    balanceAmount: 0,
    payments: [
      {
        paymentMode: "CASH",
        amount: 500,
        receivedAt: "2026-08-04T10:00:00.000Z",
      },
    ],
  };

  const html = generateSaleInvoiceHtml({ sale, shop });

  assert.match(html, /Change Returned/);
  assert.match(html, /₹150\.00/);
});

