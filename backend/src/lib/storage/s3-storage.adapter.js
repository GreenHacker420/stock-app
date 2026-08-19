import { BaseStorageAdapter } from "./base-storage.adapter.js";
import {
  uploadBufferToS3,
  getPublicS3ObjectUrl,
  downloadS3ObjectBuffer,
  deleteS3Object,
  getS3BucketName,
} from "../s3-storage.js";
import { createPresignedPutUrl, verifyS3Object } from "../../services/s3.service.js";


export class S3StorageAdapter extends BaseStorageAdapter {
  constructor() {
    super("S3StorageAdapter");
    this.providerName = "S3";
  }

  async uploadBuffer({ body, key, mimeType }) {
    const s3Result = await uploadBufferToS3({ body, key, mimeType });
    const sizeBytes = Buffer.isBuffer(body)
      ? body.length
      : Buffer.from(body || "").length;

    return {
      storageProvider: "S3",
      storageBucket: s3Result.bucket,
      storageKey: s3Result.key,
      externalId: null,
      url: s3Result.url,
      webUrl: s3Result.url,
      sizeBytes,
    };
  }

  async createUploadSession({ key, mimeType, expiresInSeconds = 600 }) {
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

  async downloadBuffer({ key }) {
    return downloadS3ObjectBuffer(key);
  }

  async getPublicUrl({ key, fallbackUrl }) {
    return fallbackUrl || getPublicS3ObjectUrl(key);
  }

  async deleteObject({ key }) {
    return deleteS3Object(key);
  }

  async verifyObject({ key, bucket }) {
    return verifyS3Object({ key, bucket });
  }

  async getQuota() {
    return {
      configured: true,
      bucket: getS3BucketName(),
    };
  }
}
