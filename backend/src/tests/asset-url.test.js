import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAssetMediaPath,
  buildAssetThumbnailPath,
  extractAssetIdFromUrl,
  extractAssetIdsFromImageUrl,
} from "../lib/asset-url.js";

test("asset media URLs stay stable and round-trip their asset ID", () => {
  const path = buildAssetMediaPath("asset 123");
  assert.equal(path, "/assets/media/asset%20123");
  assert.equal(extractAssetIdFromUrl(path), "asset 123");
  assert.equal(
    extractAssetIdFromUrl(`https://shop-api.example.com${path}`),
    "asset 123",
  );
});

test("comma-separated product image URLs expose only internal asset IDs", () => {
  assert.deepEqual(
    extractAssetIdsFromImageUrl(
      "https://cdn.example.com/photo.jpg,/assets/media/one,/assets/media/one,https://api.example.com/assets/media/two",
    ),
    ["one", "two"],
  );
});

test("authenticated thumbnail paths include the owning shop", () => {
  assert.equal(
    buildAssetThumbnailPath("asset/1", "shop 1"),
    "/assets/asset%2F1/thumbnail?shopId=shop+1",
  );
});
