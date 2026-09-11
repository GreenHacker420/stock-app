import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeProductImageUrl } from "./assetImageUrl";

describe("product image URL normalization", () => {
  it("routes legacy OneDrive thumbnail URLs through the stable Cloudflare worker", () => {
    const documentUrl = "https://tenant.sharepoint.com/_api/v2.0/drives/drive/items/ITEM-123?tempauth=expired";
    const legacyUrl = `https://southeastasia1-mediap.svc.ms/transform/thumbnail?docid=${encodeURIComponent(documentUrl)}&width=800&height=800&cb=63924381306`;

    assert.equal(
      normalizeProductImageUrl(legacyUrl),
      "https://assets.evergreenclassic.in/a/ITEM-123/thumbnail.webp?v=63924381306",
    );
  });

  it("does not change working S3 or regular HTTPS image URLs", () => {
    const s3Url = "https://bucket.s3.ap-south-1.amazonaws.com/products/photo.webp";
    assert.equal(normalizeProductImageUrl(s3Url), s3Url);
  });

  it("leaves malformed values untouched", () => {
    assert.equal(normalizeProductImageUrl("not-a-url"), "not-a-url");
  });
});
