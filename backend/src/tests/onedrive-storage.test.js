import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveStorageProvider,
  uploadBuffer,
  createUploadSession,
  getStorageStats,
  getObjectPublicUrl,
  deleteObject,
} from "../lib/storage-manager.js";

describe("OneDrive & Dual-Storage Architecture", () => {
  it("defaults WHATSAPP and document domains (CUSTOMER_LEDGER, SALE_INVOICE, DAILY_SUMMARY, DISPATCH) to ONEDRIVE", () => {
    assert.equal(resolveStorageProvider({ domain: "WHATSAPP" }), "ONEDRIVE");
    assert.equal(resolveStorageProvider({ domain: "CUSTOMER_LEDGER" }), "ONEDRIVE");
    assert.equal(resolveStorageProvider({ domain: "SALE_INVOICE" }), "ONEDRIVE");
    assert.equal(resolveStorageProvider({ domain: "DAILY_SUMMARY" }), "ONEDRIVE");
    assert.equal(resolveStorageProvider({ domain: "DISPATCH" }), "ONEDRIVE");
  });

  it("defaults PRODUCT domain to S3 unless explicitly requested", () => {
    const provider = resolveStorageProvider({ domain: "PRODUCT" });
    assert.equal(provider, "S3");

    const onedriveProvider = resolveStorageProvider({ domain: "PRODUCT", requestedProvider: "ONEDRIVE" });
    assert.equal(onedriveProvider, "ONEDRIVE");
  });

  it("uploads small buffer to ONEDRIVE with mock adapter", async () => {
    const result = await uploadBuffer({
      body: Buffer.from("test file content"),
      key: "shops/shop-1/assets/test.png",
      mimeType: "image/png",
      domain: "WHATSAPP",
    });

    assert.equal(result.storageProvider, "ONEDRIVE");
    assert.ok(result.storageKey.includes("test.png"));
    assert.ok(result.url);
  });

  it("creates upload session for ONEDRIVE", async () => {
    const session = await createUploadSession({
      key: "shops/shop-1/assets/large.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10 * 1024 * 1024,
      domain: "WHATSAPP",
    });

    assert.equal(session.storageProvider, "ONEDRIVE");
    assert.ok(session.uploadUrl.includes("mock-upload-session"));
    assert.equal(session.method, "PUT");
  });

  it("resolves public and shareable URLs for OneDrive assets", async () => {
    const fallbackUrl = "https://onedrive.live.com/view?item=stale";
    const url = await getObjectPublicUrl({
      key: "shops/shop-1/assets/test.png",
      provider: "ONEDRIVE",
      externalId: "item-123",
      fallbackUrl,
    });

    assert.ok(url.includes("onedrive.live.com"));
    assert.notEqual(url, fallbackUrl);
  });

  it("retrieves aggregated storage statistics for S3 and OneDrive", async () => {
    const stats = await getStorageStats();
    assert.ok(stats.providers.s3.configured);
    assert.ok(stats.providers.onedrive.configured);
    assert.equal(stats.defaults.whatsapp, "ONEDRIVE");
    assert.equal(stats.defaults.general, "S3");
    assert.ok(stats.providers.onedrive.quota.totalBytes > 0);
  });

  it("deletes OneDrive object safely", async () => {
    const res = await deleteObject({
      key: "shops/shop-1/assets/test.png",
      provider: "ONEDRIVE",
      externalId: "item-123",
    });
    assert.equal(res.success, true);
  });
});
