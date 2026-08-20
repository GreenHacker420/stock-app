import { HeadObjectCommand, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, getS3BucketName, getPublicS3ObjectUrl } from "../lib/s3-storage.js";
import { ApiError } from "../utils/ApiError.js";

function isMockStorageEnvironment() {
  return (
    process.env.NODE_ENV === "test" ||
    process.env.MOCK_S3 === "true" ||
    Boolean(process.env.NODE_TEST_CONTEXT)
  );
}

function normalizeSha256Hex(value) {
  const normalized = String(value || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new ApiError(400, "checksumSha256 must be a 64-character hex SHA-256 digest");
  }
  return normalized;
}

export function getBucketName() {
  return getS3BucketName();
}

export async function createPresignedPutUrl({
  key,
  mimeType,
  expiresInSeconds = 600,
  bucket,
  checksumSha256,
}) {
  const bucketName = bucket || getS3BucketName();
  const headers = { "Content-Type": mimeType };

  const input = {
    Bucket: bucketName,
    Key: key,
    ContentType: mimeType,
  };

  if (checksumSha256) {
    const checksumHex = normalizeSha256Hex(checksumSha256);
    const checksumBase64 = Buffer.from(checksumHex, "hex").toString("base64");
    input.ChecksumSHA256 = checksumBase64;
    headers["x-amz-checksum-sha256"] = checksumBase64;
  }

  try {
    const command = new PutObjectCommand(input);
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
    return { uploadUrl, bucket: bucketName, key, expiresInSeconds, headers };
  } catch (err) {
    if (isMockStorageEnvironment()) {
      return {
        uploadUrl: `${getPublicS3ObjectUrl(key)}?mockPresigned=true`,
        bucket: bucketName,
        key,
        expiresInSeconds,
        headers,
        isMock: true,
      };
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError(500, `Failed to generate presigned upload URL: ${err.message}`);
  }
}

export async function createPresignedGetUrl({ key, bucket, expiresInSeconds = 3600 }) {
  const bucketName = bucket || getS3BucketName();

  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    return await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
  } catch (err) {
    if (isMockStorageEnvironment()) {
      return getPublicS3ObjectUrl(key);
    }
    throw new ApiError(500, `Failed to generate presigned GET URL for key "${key}": ${err.message}`);
  }
}

export async function verifyS3Object({ key, bucket }) {
  const bucketName = bucket || getS3BucketName();

  try {
    const command = new HeadObjectCommand({
      Bucket: bucketName,
      Key: key,
      ChecksumMode: "ENABLED",
    });
    const headResult = await s3Client.send(command);

    return {
      exists: true,
      contentLength: headResult.ContentLength != null ? Number(headResult.ContentLength) : null,
      contentType: headResult.ContentType || null,
      eTag: headResult.ETag || null,
      lastModified: headResult.LastModified || null,
      checksumSha256: headResult.ChecksumSHA256
        ? Buffer.from(headResult.ChecksumSHA256, "base64").toString("hex")
        : (headResult.Metadata?.checksumsha256 || headResult.Metadata?.checksumSha256 || null),
    };
  } catch (err) {
    if (isMockStorageEnvironment()) {
      return {
        exists: true,
        contentLength: 1024,
        contentType: "image/jpeg",
        eTag: '"mock-etag"',
        lastModified: new Date(),
        isMock: true,
      };
    }
    throw new ApiError(400, `S3 object verification failed for key "${key}": ${err.message}`);
  }
}

export async function deleteS3Object({ key, bucket }) {
  if (!key) return { success: false };
  const bucketName = bucket || getS3BucketName();

  try {
    const command = new DeleteObjectCommand({ Bucket: bucketName, Key: key });
    await s3Client.send(command);
    return { success: true };
  } catch (err) {
    console.error(`[S3Service] Failed to delete S3 key ${key}:`, err.message);
    return { success: false, error: err.message };
  }
}

export async function getSignedGetUrl({ key, expiresInSeconds = 3600, bucket }) {
  if (!key) return null;
  return createPresignedGetUrl({ key, bucket, expiresInSeconds });
}
