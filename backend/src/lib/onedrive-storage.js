import axios from "axios";

const tenantId = process.env.AZURE_TENANT_ID || "";
const clientId = process.env.AZURE_CLIENT_ID || "";
const clientSecret = process.env.AZURE_CLIENT_SECRET || "";
const driveId = process.env.AZURE_ONEDRIVE_DRIVE_ID || "";
const userEmail = process.env.MICROSOFT_GRAPH_FROM_EMAIL || process.env.AZURE_ONEDRIVE_USER_EMAIL || "";
const rootFolder = (process.env.AZURE_ONEDRIVE_ROOT_FOLDER || "ShopControl").replace(/^\/+|\/+$/g, "");

let cachedAccessToken = null;
let tokenExpiresAt = 0;

function isMockStorageEnvironment() {
  return (
    process.env.NODE_ENV === "test" ||
    process.env.MOCK_ONEDRIVE === "true" ||
    Boolean(process.env.NODE_TEST_CONTEXT)
  );
}

export function isOneDriveConfigured() {
  if (isMockStorageEnvironment()) {
    return true;
  }
  return Boolean(tenantId && clientId && clientSecret);
}

export function getOneDriveDriveId() {
  return driveId || userEmail || "default";
}

export async function getOneDriveAccessToken() {
  if (isMockStorageEnvironment()) {
    return "mock-onedrive-access-token";
  }

  if (!isOneDriveConfigured()) {
    throw new Error("Microsoft OneDrive is not configured. Missing AZURE_TENANT_ID, AZURE_CLIENT_ID, or AZURE_CLIENT_SECRET.");
  }

  const now = Date.now();
  if (cachedAccessToken && tokenExpiresAt > now + 60000) {
    return cachedAccessToken;
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const response = await axios.post(tokenUrl, params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 10000,
  });

  const { access_token, expires_in } = response.data;
  cachedAccessToken = access_token;
  tokenExpiresAt = now + (Number(expires_in) || 3600) * 1000;
  return cachedAccessToken;
}

function normalizeKey(key) {
  const cleanKey = String(key || "").replace(/^\/+/, "");
  return rootFolder ? `${rootFolder}/${cleanKey}` : cleanKey;
}

function getDriveBaseUrl() {
  if (driveId) {
    return `https://graph.microsoft.com/v1.0/drives/${driveId}`;
  }
  if (userEmail) {
    return `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/drive`;
  }
  return `https://graph.microsoft.com/v1.0/drive`;
}

function buildItemPathUrl(key) {
  const normalized = normalizeKey(key);
  const encodedPath = normalized.split("/").map((segment) => encodeURIComponent(segment)).join("/");
  return `${getDriveBaseUrl()}/root:/${encodedPath}`;
}

function buildItemIdUrl(itemId) {
  return `${getDriveBaseUrl()}/items/${itemId}`;
}

export async function uploadBufferToOneDrive({ body, key, mimeType }) {
  if (isMockStorageEnvironment()) {
    return {
      provider: "ONEDRIVE",
      bucket: driveId || "onedrive-default",
      key: normalizeKey(key),
      externalId: `mock-od-${Date.now()}`,
      url: `https://graph.microsoft.com/v1.0/mock-download/${encodeURIComponent(key)}`,
      webUrl: `https://onedrive.live.com/view?mock=${encodeURIComponent(key)}`,
    };
  }

  const token = await getOneDriveAccessToken();
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const smallFileSizeThreshold = 4 * 1024 * 1024; // 4MB

  // Small file: Simple direct PUT
  if (buffer.length <= smallFileSizeThreshold) {
    const uploadUrl = `${buildItemPathUrl(key)}:/content`;
    const response = await axios.put(uploadUrl, buffer, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": mimeType || "application/octet-stream",
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      timeout: 30000,
    });

    const item = response.data;
    const downloadUrl = item["@microsoft.graph.downloadUrl"] || item.webUrl || "";

    return {
      provider: "ONEDRIVE",
      bucket: driveId || item.parentReference?.driveId || "onedrive-default",
      key: normalizeKey(key),
      externalId: item.id,
      url: downloadUrl,
      webUrl: item.webUrl || downloadUrl,
      sizeBytes: item.size || buffer.length,
    };
  }

  // Large file: Create upload session & chunked PUT
  const sessionUrl = `${buildItemPathUrl(key)}:/createUploadSession`;
  const sessionRes = await axios.post(
    sessionUrl,
    {
      item: {
        "@microsoft.graph.conflictBehavior": "replace",
        name: key.split("/").pop(),
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    }
  );

  const { uploadUrl } = sessionRes.data;
  const chunkSize = 320 * 1024 * 10; // 3.2MB chunks (must be multiple of 320 KiB)
  let offset = 0;
  let finalItem = null;

  while (offset < buffer.length) {
    const end = Math.min(offset + chunkSize, buffer.length);
    const chunk = buffer.subarray(offset, end);
    const chunkRes = await axios.put(uploadUrl, chunk, {
      headers: {
        "Content-Range": `bytes ${offset}-${end - 1}/${buffer.length}`,
        "Content-Length": String(chunk.length),
      },
      maxBodyLength: Infinity,
      timeout: 30000,
    });

    if (chunkRes.status === 200 || chunkRes.status === 201) {
      finalItem = chunkRes.data;
    }
    offset = end;
  }

  const downloadUrl = finalItem?.["@microsoft.graph.downloadUrl"] || finalItem?.webUrl || "";
  return {
    provider: "ONEDRIVE",
    bucket: driveId || finalItem?.parentReference?.driveId || "onedrive-default",
    key: normalizeKey(key),
    externalId: finalItem?.id,
    url: downloadUrl,
    webUrl: finalItem?.webUrl || downloadUrl,
    sizeBytes: finalItem?.size || buffer.length,
  };
}

export async function createOneDriveUploadSession({ key, sizeBytes }) {
  if (isMockStorageEnvironment()) {
    return {
      provider: "ONEDRIVE",
      uploadUrl: `https://graph.microsoft.com/v1.0/mock-upload-session/${encodeURIComponent(key)}`,
      key: normalizeKey(key),
      expiry: new Date(Date.now() + 3600000).toISOString(),
    };
  }

  const token = await getOneDriveAccessToken();
  const sessionUrl = `${buildItemPathUrl(key)}:/createUploadSession`;
  const response = await axios.post(
    sessionUrl,
    {
      item: {
        "@microsoft.graph.conflictBehavior": "replace",
        name: key.split("/").pop(),
      },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    }
  );

  return {
    provider: "ONEDRIVE",
    uploadUrl: response.data.uploadUrl,
    key: normalizeKey(key),
    expiry: response.data.expirationDateTime,
  };
}

export async function downloadOneDriveObjectBuffer(key, externalId) {
  if (isMockStorageEnvironment()) {
    return Buffer.from("mock-onedrive-file-buffer");
  }

  const token = await getOneDriveAccessToken();
  const contentUrl = externalId
    ? `${buildItemIdUrl(externalId)}/content`
    : `${buildItemPathUrl(key)}:/content`;

  const response = await axios.get(contentUrl, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: "arraybuffer",
    timeout: 30000,
  });

  return Buffer.from(response.data);
}

export async function getOneDriveThumbnailUrl(key, externalId, size = "large") {
  if (isMockStorageEnvironment()) {
    return `https://southeastasia1-mediap.svc.ms/transform/thumbnail?mock=${encodeURIComponent(key || externalId)}`;
  }

  try {
    const token = await getOneDriveAccessToken();
    const driveId = getOneDriveDriveId();
    const itemUrl = externalId
      ? `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${externalId}/thumbnails`
      : `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodeURIComponent(normalizeKey(key))}:/thumbnails`;

    const res = await axios.get(itemUrl, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });

    if (res.data.value && res.data.value[0]) {
      const thumb = res.data.value[0];
      const url = thumb[size]?.url || thumb.large?.url || thumb.medium?.url || thumb.small?.url || "";
      if (url) return url;
    }
  } catch (err) {
    console.warn(`[OneDrive Storage] Warning: Could not fetch Graph thumbnail for ${key || externalId}:`, err.message);
  }
  return "";
}

export async function getOneDriveSharingUrl(key, externalId) {
  if (isMockStorageEnvironment()) {
    return `https://onedrive.live.com/view?mock=${encodeURIComponent(key || externalId)}`;
  }

  const token = await getOneDriveAccessToken();
  const itemUrl = externalId ? buildItemIdUrl(externalId) : buildItemPathUrl(key);

  try {
    const metaRes = await axios.get(itemUrl, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });
    if (metaRes.data["@microsoft.graph.downloadUrl"]) {
      return metaRes.data["@microsoft.graph.downloadUrl"];
    }
    if (metaRes.data.webUrl) {
      return metaRes.data.webUrl;
    }
  } catch (err) {
    // Continue to createLink
  }

  const linkUrl = `${itemUrl}/createLink`;
  const linkRes = await axios.post(
    linkUrl,
    { type: "view", scope: "anonymous" },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    }
  );

  return linkRes.data?.link?.webUrl || "";
}

export async function deleteOneDriveObject(key, externalId) {
  if (isMockStorageEnvironment()) {
    return { success: true };
  }

  const token = await getOneDriveAccessToken();
  const deleteUrl = externalId ? buildItemIdUrl(externalId) : buildItemPathUrl(key);

  try {
    await axios.delete(deleteUrl, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
    });
    return { success: true };
  } catch (err) {
    if (err.response?.status === 404) {
      return { success: true, notFound: true };
    }
    throw err;
  }
}

export async function getOneDriveQuota() {
  if (isMockStorageEnvironment()) {
    return {
      provider: "ONEDRIVE",
      totalBytes: 1073741824000, // 1TB
      usedBytes: 524288000, // 500MB
      remainingBytes: 1073217536000,
      state: "normal",
    };
  }

  if (!isOneDriveConfigured()) {
    return null;
  }

  const token = await getOneDriveAccessToken();
  const driveUrl = driveId
    ? `https://graph.microsoft.com/v1.0/drives/${driveId}`
    : "https://graph.microsoft.com/v1.0/drive";

  const response = await axios.get(driveUrl, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10000,
  });

  const quota = response.data?.quota || {};
  return {
    provider: "ONEDRIVE",
    totalBytes: quota.total || 0,
    usedBytes: quota.used || 0,
    remainingBytes: quota.remaining || 0,
    deletedBytes: quota.deleted || 0,
    state: quota.state || "normal",
  };
}
