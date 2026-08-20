import { StorageFactory } from "./storage/storage.factory.js";

export function resolveStorageProvider({ domain, requestedProvider }) {
  return StorageFactory.resolveProviderName({ domain, requestedProvider });
}

export async function uploadBuffer({ body, key, mimeType, domain, provider }) {
  const adapter = StorageFactory.getAdapterForDomain({ domain, requestedProvider: provider });
  return adapter.uploadBuffer({ body, key, mimeType, domain });
}

export async function createUploadSession({
  key,
  mimeType,
  sizeBytes,
  checksumSha256,
  domain,
  provider,
  expiresInSeconds = 600,
}) {
  const adapter = StorageFactory.getAdapterForDomain({ domain, requestedProvider: provider });
  return adapter.createUploadSession({
    key,
    mimeType,
    sizeBytes,
    checksumSha256,
    expiresInSeconds,
  });
}

export async function downloadObjectBuffer({ key, provider, externalId }) {
  const adapter = StorageFactory.getAdapter(provider);
  return adapter.downloadBuffer({ key, externalId });
}

export async function getObjectDownloadUrl({
  key,
  bucket,
  provider,
  externalId,
  fallbackUrl,
  expiresInSeconds,
}) {
  const adapter = StorageFactory.getAdapter(provider);
  return adapter.getDownloadUrl({
    key,
    bucket,
    externalId,
    fallbackUrl,
    expiresInSeconds,
  });
}

export async function getObjectThumbnailUrl({ key, provider, externalId, size }) {
  const adapter = StorageFactory.getAdapter(provider);
  return adapter.getThumbnailUrl({ key, externalId, size });
}

export async function getObjectPublicUrl(args) {
  const delivery = await getObjectDownloadUrl(args);
  return delivery?.url || null;
}

export async function verifyObject({ key, bucket, provider, externalId }) {
  const adapter = StorageFactory.getAdapter(provider);
  return adapter.verifyObject({ key, bucket, externalId });
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
