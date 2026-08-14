import {
  uploadBufferToS3,
  getPublicS3ObjectUrl,
  downloadS3ObjectBuffer,
  deleteS3Object,
  getS3BucketName,
} from "./s3-storage.js";
import {
  uploadBufferToOneDrive,
  downloadOneDriveObjectBuffer,
  getOneDriveSharingUrl,
  deleteOneDriveObject,
  createOneDriveUploadSession,
  getOneDriveQuota,
  isOneDriveConfigured,
  getOneDriveDriveId,
} from "./onedrive-storage.js";
import { createPresignedPutUrl } from "../services/s3.service.js";

export function resolveStorageProvider({ domain, requestedProvider }) {
  if (requestedProvider === "ONEDRIVE" || requestedProvider === "S3") {
    return requestedProvider;
  }

  // Business Rule: WhatsApp and generated bills/documents (SALE_INVOICE, DAILY_SUMMARY, CUSTOMER_LEDGER, DISPATCH) default to OneDrive
  const oneDriveDomains = new Set([
    "WHATSAPP",
    "SALE_INVOICE",
    "DAILY_SUMMARY",
    "CUSTOMER_LEDGER",
    "DISPATCH",
  ]);

  if (domain && oneDriveDomains.has(domain)) {
    if (isOneDriveConfigured() || process.env.NODE_ENV === "test" || process.env.MOCK_ONEDRIVE === "true") {
      return "ONEDRIVE";
    }
  }

  const defaultEnvProvider = (process.env.PRIMARY_STORAGE_PROVIDER || "S3").toUpperCase();
  return defaultEnvProvider === "ONEDRIVE" ? "ONEDRIVE" : "S3";
}

export async function uploadBuffer({ body, key, mimeType, domain, provider }) {
  const targetProvider = resolveStorageProvider({ domain, requestedProvider: provider });

  if (targetProvider === "ONEDRIVE") {
    const result = await uploadBufferToOneDrive({ body, key, mimeType });
    return {
      storageProvider: "ONEDRIVE",
      storageBucket: result.bucket,
      storageKey: result.key,
      externalId: result.externalId,
      url: result.url,
      webUrl: result.webUrl,
      sizeBytes: result.sizeBytes,
    };
  }

  const s3Result = await uploadBufferToS3({ body, key, mimeType });
  return {
    storageProvider: "S3",
    storageBucket: s3Result.bucket,
    storageKey: s3Result.key,
    externalId: null,
    url: s3Result.url,
    webUrl: s3Result.url,
    sizeBytes: Buffer.isBuffer(body) ? body.length : Buffer.from(body).length,
  };
}

export async function createUploadSession({ key, mimeType, sizeBytes, domain, provider, expiresInSeconds = 600 }) {
  const targetProvider = resolveStorageProvider({ domain, requestedProvider: provider });

  if (targetProvider === "ONEDRIVE") {
    const session = await createOneDriveUploadSession({ key, sizeBytes });
    const headers = {};
    if (sizeBytes && Number(sizeBytes) > 0) {
      headers["Content-Range"] = `bytes 0-${Number(sizeBytes) - 1}/${Number(sizeBytes)}`;
      headers["Content-Length"] = String(sizeBytes);
    }
    return {
      storageProvider: "ONEDRIVE",
      uploadUrl: session.uploadUrl,
      key: session.key,
      bucket: getOneDriveDriveId() || "onedrive-default",
      method: "PUT",
      expiry: session.expiry,
      headers,
    };
  }

  const s3Presigned = await createPresignedPutUrl({
    key,
    mimeType,
    expiresInSeconds,
  });

  return {
    storageProvider: "S3",
    uploadUrl: s3Presigned.uploadUrl,
    key: s3Presigned.key,
    bucket: s3Presigned.bucket,
    method: "PUT",
    publicUrl: s3Presigned.publicUrl,
  };
}

export async function downloadObjectBuffer({ key, provider, externalId }) {
  if (provider === "ONEDRIVE") {
    return downloadOneDriveObjectBuffer(key, externalId);
  }
  return downloadS3ObjectBuffer(key);
}

export async function getObjectPublicUrl({ key, provider, externalId, fallbackUrl }) {
  if (provider === "ONEDRIVE") {
    try {
      return await getOneDriveSharingUrl(key, externalId);
    } catch (error) {
      if (fallbackUrl) return fallbackUrl;
      throw error;
    }
  }
  return fallbackUrl || getPublicS3ObjectUrl(key);
}

export async function deleteObject({ key, provider, externalId }) {
  if (provider === "ONEDRIVE") {
    return deleteOneDriveObject(key, externalId);
  }
  return deleteS3Object(key);
}

export async function getStorageStats() {
  const onedriveQuota = await getOneDriveQuota();
  return {
    providers: {
      s3: {
        configured: true,
        bucket: getS3BucketName(),
      },
      onedrive: {
        configured: isOneDriveConfigured() || process.env.NODE_ENV === "test" || process.env.MOCK_ONEDRIVE === "true",
        driveId: getOneDriveDriveId(),
        quota: onedriveQuota,
      },
    },
    defaults: {
      whatsapp: "ONEDRIVE",
      general: "S3",
    },
  };
}
