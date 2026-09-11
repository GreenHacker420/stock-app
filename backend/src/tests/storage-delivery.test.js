import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

const srcRoot = path.resolve(import.meta.dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(srcRoot, relativePath), "utf8");
}

test("S3 presigning fails closed and uses native SHA-256 checksums", () => {
  const src = read("services/s3.service.js");

  assert.ok(src.includes("input.ChecksumSHA256 = checksumBase64"));
  assert.ok(src.includes('headers["x-amz-checksum-sha256"] = checksumBase64'));
  assert.ok(src.includes('ChecksumMode: "ENABLED"'));
  assert.ok(src.includes('throw new ApiError(500, `Failed to generate presigned GET URL'));
  assert.ok(!src.includes('return getPublicS3ObjectUrl(key);\n  }\n}\n\n\nexport async function verifyS3Object'));
});

test("storage facade keeps download and thumbnail semantics separate", () => {
  const base = read("lib/storage/base-storage.adapter.js");
  const manager = read("lib/storage-manager.js");
  const oneDrive = read("lib/storage/onedrive-storage.adapter.js");

  assert.ok(base.includes("async getDownloadUrl("));
  assert.ok(base.includes("async getThumbnailUrl("));
  assert.ok(manager.includes("export async function getObjectDownloadUrl"));
  assert.ok(manager.includes("export async function getObjectThumbnailUrl"));
  assert.ok(oneDrive.includes("getOneDriveDownloadUrl"));
  assert.ok(oneDrive.includes("getOneDriveThumbnailUrl"));
});

test("OneDrive delivery never creates anonymous sharing links", () => {
  const src = read("lib/onedrive-storage.js");

  assert.ok(src.includes("export async function getOneDriveDownloadUrl"));
  assert.ok(src.includes('metaRes.data["@microsoft.graph.downloadUrl"]'));
  assert.ok(!src.includes('scope: "anonymous"'));
  assert.ok(!src.includes("/createLink"));
});

test("asset delivery avoids expiring OneDrive transform thumbnail URLs", () => {
  const src = read("services/upload.service.js");

  assert.ok(!src.includes("getObjectThumbnailUrl"));
  assert.ok(src.includes("getObjectDownloadUrl"));
});

test("Cloudflare asset origin resolves OneDrive URLs just in time", () => {
  const service = read("services/media-origin.service.ts");
  const routes = read("routes/media-origin.routes.ts");

  assert.ok(service.includes("getObjectDownloadUrl"));
  assert.ok(service.includes('visibility: "public"'));
  assert.ok(service.includes("externalId: asset.externalId"));
  assert.ok(routes.includes("timingSafeEqual"));
  assert.ok(!service.includes("getOneDriveThumbnailUrl"));
});

test("asset URL parser keeps product links attached after CDN migration", async () => {
  const { extractAssetIdsFromImageUrl } = await import("../lib/asset-url.ts");
  const assetId = "asset-with-special/chars";
  const cdnUrl = `https://assets.evergreenclassic.in/a/${encodeURIComponent(assetId)}/thumbnail.webp?v=42`;

  assert.deepEqual(extractAssetIdsFromImageUrl(cdnUrl), [assetId]);
});

test("public asset route is restricted to ready product images", () => {
  const src = read("services/upload.service.js");

  assert.ok(src.includes('asset.domain === "PRODUCT"'));
  assert.ok(src.includes('asset.kind === "IMAGE"'));
  assert.ok(src.includes('asset.status === "READY"'));
  assert.ok(src.includes('res.setHeader("Cache-Control", "no-store")'));
  assert.ok(!src.includes("downloadOneDriveObjectBuffer"));
  assert.ok(!src.includes("getPublicS3ObjectUrl"));
});

test("storage cleanup treats product links as live references", () => {
  const dashboard = read("services/dashboard.service.js");
  assert.ok(dashboard.includes("itemAssets: { none: {} }"));
  assert.ok(dashboard.includes("a._count.itemAssets === 0"));
  assert.ok(dashboard.includes("buildAssetThumbnailPath(a.id, shopId)"));
  assert.ok(!dashboard.includes("await Promise.all(batch.map(async (a)"));
});

test("upload intents propagate the checksum to the storage provider", () => {
  const service = read("services/upload.service.js");
  const manager = read("lib/storage-manager.js");
  const s3Adapter = read("lib/storage/s3-storage.adapter.js");

  assert.ok(service.includes("checksumSha256: normalizedChecksum"));
  assert.ok(manager.includes("checksumSha256,"));
  assert.ok(s3Adapter.includes("checksumSha256,"));
  assert.ok(s3Adapter.includes("headers: s3Presigned.headers || {}"));
});

test("legacy DOC requests are normalized to the Prisma DOCUMENT kind", () => {
  const service = read("services/upload.service.js");
  const routes = read("routes/upload.routes.js");

  assert.ok(service.includes('if (kind === "DOC") return "DOCUMENT"'));
  assert.ok(routes.includes('"DOCUMENT", "DOC"'));
});
