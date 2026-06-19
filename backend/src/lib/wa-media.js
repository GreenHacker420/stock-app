import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const bucketName = process.env.AWS_S3_BUCKET_NAME || "shopcontrol-whatsapp-media";
const region = process.env.AWS_REGION || "us-east-1";

const s3Config = {
  region,
};

// Explicit credentials mapping if defined in environment
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  s3Config.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };
}

// Support custom endpoint for development/testing if configured
if (process.env.AWS_S3_ENDPOINT) {
  s3Config.endpoint = process.env.AWS_S3_ENDPOINT;
  s3Config.forcePathStyle = true;
}

export const s3Client = new S3Client(s3Config);

/**
 * Uploads a media buffer/stream to Amazon S3.
 * Amazon S3 is the only supported media storage backend.
 * @param {Buffer|Uint8Array|Blob|string|ReadableStream} body - File content
 * @param {string} key - S3 destination key (e.g. shops/{shopId}/media/{mediaId})
 * @param {string} mimeType - The mime type of the file
 */
export async function uploadToS3(body, key, mimeType) {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: body,
    ContentType: mimeType,
  });

  await s3Client.send(command);

  return {
    bucket: bucketName,
    key,
    url: `https://${bucketName}.s3.${region}.amazonaws.com/${key}`,
  };
}

/**
 * Generates a pre-signed URL for viewing private S3 media.
 * Pre-signed URLs are valid for 1 hour by default.
 * @param {string} key - S3 object key
 * @param {number} expiresIn - Expiry duration in seconds (default: 3600)
 */
export async function getSignedMediaUrl(key, expiresIn = 3600) {
  if (!key) return null;
  
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  return await getSignedUrl(s3Client, command, { expiresIn });
}
