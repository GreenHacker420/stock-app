export class BaseStorageAdapter {
  constructor(name) {
    if (new.target === BaseStorageAdapter) {
      throw new Error("BaseStorageAdapter is an abstract class and cannot be instantiated directly.");
    }
    this.name = name;
  }

  async uploadBuffer({ body, key, mimeType, domain }) {
    throw new Error(`uploadBuffer() method not implemented on ${this.name}`);
  }

  async createUploadSession({ key, mimeType, sizeBytes, checksumSha256, expiresInSeconds = 600 }) {
    throw new Error(`createUploadSession() method not implemented on ${this.name}`);
  }

  async downloadBuffer({ key, externalId }) {
    throw new Error(`downloadBuffer() method not implemented on ${this.name}`);
  }

  async getDownloadUrl({ key, externalId, fallbackUrl, expiresInSeconds }) {
    throw new Error(`getDownloadUrl() method not implemented on ${this.name}`);
  }

  async getThumbnailUrl({ key, externalId, size }) {
    return null;
  }

  async getPublicUrl(args) {
    const delivery = await this.getDownloadUrl(args);
    return delivery?.url || null;
  }

  async deleteObject({ key, externalId }) {
    throw new Error(`deleteObject() method not implemented on ${this.name}`);
  }

  async verifyObject({ key, externalId, bucket }) {
    return { exists: true, isMock: true };
  }

  async getQuota() {
    return { configured: true };
  }
}
