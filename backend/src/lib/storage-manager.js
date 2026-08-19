import { StorageFactory } from "./storage/storage.factory.js";


export function resolveStorageProvider({ domain, requestedProvider }) {
  return StorageFactory.resolveProviderName({ domain, requestedProvider });
}

export async function uploadBuffer({ body, key, mimeType, domain, provider }) {
  const adapter = StorageFactory.getAdapterForDomain({ domain, requestedProvider: provider });
  return adapter.uploadBuffer({ body, key, mimeType, domain });
}

export async function createUploadSession({ key, mimeType, sizeBytes, domain, provider, expiresInSeconds = 600 }) {
  const adapter = StorageFactory.getAdapterForDomain({ domain, requestedProvider: provider });
  return adapter.createUploadSession({ key, mimeType, sizeBytes, expiresInSeconds });
}

export async function downloadObjectBuffer({ key, provider, externalId }) {
  const adapter = StorageFactory.getAdapter(provider);
  return adapter.downloadBuffer({ key, externalId });
}

export async function getObjectPublicUrl({ key, provider, externalId, fallbackUrl }) {
  const adapter = StorageFactory.getAdapter(provider);
  return adapter.getPublicUrl({ key, externalId, fallbackUrl });
}

export async function deleteObject({ key, provider, externalId }) {
  const adapter = StorageFactory.getAdapter(provider);
  return adapter.deleteObject({ key, externalId });
}

export async function getStorageStats() {
  const s3Adapter = StorageFactory.getAdapter("S3");
  const onedriveAdapter = StorageFactory.getAdapter("ONEDRIVE");

  const [s3Quota, onedriveQuota] = await Promise.all([
    s3Adapter.getQuota(),
    onedriveAdapter.getQuota(),
  ]);

  return {
    providers: {
      s3: s3Quota,
      onedrive: onedriveQuota,
    },
    defaults: {
      whatsapp: "ONEDRIVE",
      general: "S3",
    },
  };
}
