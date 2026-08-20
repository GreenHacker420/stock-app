import { BaseStorageAdapter } from "./base-storage.adapter.js";
import {
  uploadBufferToOneDrive,
  downloadOneDriveObjectBuffer,
  getOneDriveDownloadUrl,
  getOneDriveThumbnailUrl,
  getOneDriveObjectMetadata,
  deleteOneDriveObject,
  createOneDriveUploadSession,
  getOneDriveQuota,
  isOneDriveConfigured,
  getOneDriveDriveId,
} from "../onedrive-storage.js";

export class OneDriveStorageAdapter extends BaseStorageAdapter {
  constructor() {
    super("OneDriveStorageAdapter");
    this.providerName = "ONEDRIVE";
  }

  async uploadBuffer({ body, key, mimeType }) {
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

  async createUploadSession({ key, sizeBytes }) {
    const session = await createOneDriveUploadSession({ key });
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

  async downloadBuffer({ key, externalId }) {
    return downloadOneDriveObjectBuffer(key, externalId);
  }

  async getDownloadUrl({ key, externalId }) {
    const url = await getOneDriveDownloadUrl(key, externalId);
    return {
      url,
      expiresInSeconds: null,
    };
  }

  async getThumbnailUrl({ key, externalId, size }) {
    return getOneDriveThumbnailUrl(key, externalId, size);
  }

  async verifyObject({ key, externalId }) {
    const metadata = await getOneDriveObjectMetadata(key, externalId);
    return {
      exists: true,
      externalId: metadata.id,
      contentLength: metadata.size,
      contentType: metadata.mimeType,
      eTag: metadata.eTag,
      checksumSha256: null,
    };
  }

  async deleteObject({ key, externalId }) {
    return deleteOneDriveObject(key, externalId);
  }

  async getQuota() {
    const quota = await getOneDriveQuota();
    return {
      configured: isOneDriveConfigured() || process.env.NODE_ENV === "test" || process.env.MOCK_ONEDRIVE === "true",
      driveId: getOneDriveDriveId(),
      quota,
    };
  }
}
