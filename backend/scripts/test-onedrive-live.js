import "dotenv/config";
import {
  getOneDriveAccessToken,
  uploadBufferToOneDrive,
  downloadOneDriveObjectBuffer,
  getOneDriveSharingUrl,
  deleteOneDriveObject,
  getOneDriveQuota,
  isOneDriveConfigured,
} from "../src/lib/onedrive-storage.js";

async function main() {
  console.log("=== Testing Microsoft Graph OneDrive Integration ===");
  console.log("Configured:", isOneDriveConfigured());
  console.log("Tenant ID:", process.env.AZURE_TENANT_ID);
  console.log("Client ID:", process.env.AZURE_CLIENT_ID);
  console.log("User Email:", process.env.MICROSOFT_GRAPH_FROM_EMAIL);

  console.log("\n1. Acquiring Access Token from Microsoft Entra...");
  const token = await getOneDriveAccessToken();
  console.log(" Token acquired successfully! Token prefix:", token.slice(0, 20) + "...");

  console.log("\n2. Querying Drive Quota...");
  try {
    const quota = await getOneDriveQuota();
    console.log(" Drive Quota:", quota);
  } catch (err) {
    console.log(" Quota query warning (may require tenant admin drive consent):", err.response?.data || err.message);
  }

  console.log("\n3. Testing Small File Upload to OneDrive...");
  const testKey = `test-run/test-live-${Date.now()}.txt`;
  const content = `Hello from ShopControl at ${new Date().toISOString()}`;
  const uploadResult = await uploadBufferToOneDrive({
    body: Buffer.from(content),
    key: testKey,
    mimeType: "text/plain",
  });
  console.log(" Upload Result:", uploadResult);

  console.log("\n4. Testing File Download from OneDrive...");
  const downloaded = await downloadOneDriveObjectBuffer(uploadResult.key, uploadResult.externalId);
  console.log(" Downloaded Content:", downloaded.toString("utf-8"));

  console.log("\n5. Testing Sharing / Public Link Creation...");
  const shareUrl = await getOneDriveSharingUrl(uploadResult.key, uploadResult.externalId);
  console.log(" Share / View URL:", shareUrl);

  console.log("\n6. Cleaning Up (Deleting Test File)...");
  await deleteOneDriveObject(uploadResult.key, uploadResult.externalId);
  console.log(" Cleaned up successfully!");

  console.log("\n ALL LIVE MICROSOFT GRAPH ONEDRIVE TESTS PASSED SUCCESSFULLY!");
}

main().catch((err) => {
  console.error("\n LIVE TEST FAILED:", err.response?.data || err.message || err);
  process.exit(1);
});
