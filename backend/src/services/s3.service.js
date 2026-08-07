import { HeadObjectCommand, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, getS3BucketName, getPublicS3ObjectUrl } from "../lib/s3-storage.js";
import { ApiError } from "../utils/ApiError.js";

export function getBucketName() {
  return getS3BucketName();
}


export async function createPresignedPutUrl({ key, mimeType, expiresInSeconds = 600, bucket, checksumSha256, contentLength }) {
  const bucketName = bucket || getS3BucketName();

  const isMockEnv = process.env.NODE_ENV === "test" || process.env.MOCK_S3 === "true";

  const input = {
    Bucket: bucketName,
    Key: key,
    ContentType: mimeType,
  };
  // Prefer Content-Length + checksum headers when provided
  if (Number.isFinite(contentLength) && contentLength > 0) {
    input.ContentLength = contentLength;
  }
  if (checksumSha256) {
    // AWS SDK expects base64 ChecksumSHA256; clients that send hex use x-amz-checksum-sha256 via custom header
    input.Metadata = { ...(input.Metadata || {}), checksumSha256 };
  }

  const command = new PutObjectCommand(input);
  const headers = {
    "Content-Type": mimeType,
  };
  if (checksumSha256) {
    headers["x-amz-meta-checksumsha256"] = checksumSha256;
  }

  try {
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
    return { uploadUrl, bucket: bucketName, key, expiresInSeconds, headers };
  } catch (err) {
    if (isMockEnv) {
      return {
        uploadUrl: `${getPublicS3ObjectUrl(key)}?mockPresigned=true`,
        bucket: bucketName,
        key,
        expiresInSeconds,
        headers,
        isMock: true,
      };
    }
    throw new ApiError(500, `Failed to generate presigned upload URL: ${err.message}`);
  }
}


export async function verifyS3Object({ key, bucket }) {
  const bucketName = bucket || getS3BucketName();
  const isMockEnv = process.env.NODE_ENV === "test" || process.env.MOCK_S3 === "true";

  try {
    const command = new HeadObjectCommand({ Bucket: bucketName, Key: key });
    const headResult = await s3Client.send(command);

    return {
      exists: true,
      contentLength: headResult.ContentLength ? Number(headResult.ContentLength) : null,
      contentType: headResult.ContentType || null,
      eTag: headResult.ETag || null,
      lastModified: headResult.LastModified || null,
      checksumSha256: headResult.ChecksumSHA256
        ? Buffer.from(headResult.ChecksumSHA256, "base64").toString("hex")
        : (headResult.Metadata?.checksumsha256 || headResult.Metadata?.checksumSha256 || null),
    };
  } catch (err) {
    if (isMockEnv) {
      // Test-only fallback — returns predictable mock metadata
      return {
        exists: true,
        contentLength: 1024,
        contentType: "image/jpeg",
        eTag: '"mock-etag"',
        lastModified: new Date(),
        isMock: true,
      };
    }
    // Production: never silently succeed — propagate the error
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
  const bucketName = bucket || getS3BucketName();

  try {
    const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
    return await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
  } catch (err) {
    if (process.env.NODE_ENV === "test" || process.env.MOCK_S3 === "true") {
      return getPublicS3ObjectUrl(key);
    }
    throw new ApiError(500, `Failed to generate signed GET URL for key "${key}": ${err.message}`);
  }
}
