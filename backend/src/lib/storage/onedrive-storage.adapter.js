import { BaseStorageAdapter } from "./base-storage.adapter.js";
import {
  uploadBufferToOneDrive,
  downloadOneDriveObjectBuffer,
  getOneDriveSharingUrl,
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

  async downloadBuffer({ key, externalId }) {
    return downloadOneDriveObjectBuffer(key, externalId);
  }

  async getPublicUrl({ key, externalId, fallbackUrl }) {
    try {
      return await getOneDriveSharingUrl(key, externalId);
    } catch (error) {
      if (fallbackUrl) return fallbackUrl;
      throw error;
    }
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
