import { S3StorageAdapter } from "./s3-storage.adapter.js";
import { OneDriveStorageAdapter } from "./onedrive-storage.adapter.js";
import { isOneDriveConfigured } from "../onedrive-storage.js";

const ONEDRIVE_DOMAINS = new Set([
  "WHATSAPP",
  "SALE_INVOICE",
  "DAILY_SUMMARY",
  "CUSTOMER_LEDGER",
  "DISPATCH",
]);


export class StorageFactory {
  static s3Adapter = new S3StorageAdapter();
  static oneDriveAdapter = new OneDriveStorageAdapter();


  static getAdapter(provider) {
    const normalized = String(provider || "").toUpperCase();
    if (normalized === "ONEDRIVE") {
      return StorageFactory.oneDriveAdapter;
    }
    if (normalized === "S3") {
      return StorageFactory.s3Adapter;
    }
    return StorageFactory.getDefaultAdapter();
  }

  static getAdapterForDomain({ domain, requestedProvider } = {}) {
    const resolvedProvider = StorageFactory.resolveProviderName({ domain, requestedProvider });
    return StorageFactory.getAdapter(resolvedProvider);
  }

  static resolveProviderName({ domain, requestedProvider } = {}) {
    const reqNorm = String(requestedProvider || "").toUpperCase();
    if (reqNorm === "ONEDRIVE" || reqNorm === "S3") {
      return reqNorm;
    }

    if (domain && ONEDRIVE_DOMAINS.has(domain)) {
      if (isOneDriveConfigured() || process.env.NODE_ENV === "test" || process.env.MOCK_ONEDRIVE === "true") {
        return "ONEDRIVE";
      }
    }

    const defaultEnv = (process.env.PRIMARY_STORAGE_PROVIDER || "S3").toUpperCase();
    return defaultEnv === "ONEDRIVE" ? "ONEDRIVE" : "S3";
  }


  static getDefaultAdapter() {
    const defaultEnv = (process.env.PRIMARY_STORAGE_PROVIDER || "S3").toUpperCase();
    return defaultEnv === "ONEDRIVE"
      ? StorageFactory.oneDriveAdapter
      : StorageFactory.s3Adapter;
  }
}
