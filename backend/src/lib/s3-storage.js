import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const bucketName = process.env.AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET || "shopcontrol-whatsapp-media";
const region = process.env.AWS_REGION || "ap-south-1";
const endpoint = process.env.AWS_S3_ENDPOINT || "";
const publicBaseUrl = process.env.AWS_S3_PUBLIC_BASE_URL || "";

const s3Config = {
  region,
};

if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  s3Config.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };
}

if (endpoint) {
  s3Config.endpoint = endpoint;
  s3Config.forcePathStyle = true;
}

export const s3Client = new S3Client(s3Config);

function encodeS3KeyForUrl(key) {
  return String(key)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export function getS3BucketName() {
  return bucketName;
}

export function getPublicS3ObjectUrl(key) {
  const encodedKey = encodeS3KeyForUrl(key);
  if (publicBaseUrl) {
    return `${publicBaseUrl.replace(/\/+$/, "")}/${encodedKey}`;
  }
  if (endpoint) {
    return `${endpoint.replace(/\/+$/, "")}/${bucketName}/${encodedKey}`;
  }
  return `https://${bucketName}.s3.${region}.amazonaws.com/${encodedKey}`;
}

export async function uploadBufferToS3({ body, key, mimeType, cacheControl }) {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: body,
    ContentType: mimeType,
    CacheControl: cacheControl,
  });

  await s3Client.send(command);

  return {
    bucket: bucketName,
    key,
    url: getPublicS3ObjectUrl(key),
  };
}

export async function getSignedS3ObjectUrl(key, expiresIn = 3600) {
  if (!key) return null;

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

export async function deleteS3Object(key) {
  if (!key) return;

  const command = new DeleteObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  await s3Client.send(command);
}
