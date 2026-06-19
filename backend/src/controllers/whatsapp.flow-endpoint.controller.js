import crypto from "crypto";
import prisma from "../lib/db.js";
import { decrypt } from "../lib/wa-crypto.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Inverts the bits of a Buffer (IV) for response encryption.
 */
function invertIV(iv) {
  const flipped = Buffer.alloc(iv.length);
  for (let i = 0; i < iv.length; i++) {
    flipped[i] = iv[i] ^ 0xff;
  }
  return flipped;
}

/**
 * Decrypts WhatsApp Flows request payload using RSA-OAEP and AES-128-GCM.
 */
function decryptFlowPayload(encryptedFlowDataB64, encryptedAesKeyB64, initialVectorB64, privateKeyPEM) {
  // 1. Decrypt the AES Key using RSA-OAEP with SHA-256
  const encryptedAesKey = Buffer.from(encryptedAesKeyB64, "base64");
  const aesKey = crypto.privateDecrypt(
    {
      key: privateKeyPEM,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    encryptedAesKey
  );

  // 2. Extract ciphertext and Auth Tag
  const flowData = Buffer.from(encryptedFlowDataB64, "base64");
  const iv = Buffer.from(initialVectorB64, "base64");
  
  const encryptedData = flowData.subarray(0, flowData.length - 16);
  const authTag = flowData.subarray(flowData.length - 16);

  // 3. Decrypt the ciphertext via AES-128-GCM
  const decipher = crypto.createDecipheriv("aes-128-gcm", aesKey, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedData, null, "utf8");
  decrypted += decipher.final("utf8");

  return {
    decryptedData: JSON.parse(decrypted),
    aesKey,
    iv,
  };
}

/**
 * Encrypts response payload using the same AES key and inverted IV.
 */
function encryptFlowResponse(responsePayload, aesKey, iv) {
  const invertedIv = invertIV(iv);
  const cipher = crypto.createCipheriv("aes-128-gcm", aesKey, invertedIv);
  
  let encrypted = cipher.update(JSON.stringify(responsePayload), "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([encrypted, authTag]).toString("base64");
}

class WhatsAppFlowEndpointController {
  /**
   * Meta Flow Webhook Handshake (GET /whatsapp/flow-endpoint/:shopId)
   */
  verifyWebhook = asyncHandler(async (req, res) => {
    const { shopId } = req.params;
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token) {
      const integration = await prisma.waIntegration.findUnique({
        where: { shopId },
        select: { verifyToken: true },
      });

      if (integration && integration.verifyToken === token) {
        return res.status(200).send(challenge);
      }
    }

    res.status(403).send("Forbidden");
  });

  /**
   * Meta Flow Data Exchange (POST /whatsapp/flow-endpoint/:shopId)
   */
  handleFlowRequest = asyncHandler(async (req, res) => {
    const { shopId } = req.params;
    const { encrypted_flow_data, encrypted_aes_key, initial_vector } = req.body;

    if (!encrypted_flow_data || !encrypted_aes_key || !initial_vector) {
      return res.status(400).send("Bad Request: Missing E2EE parameters");
    }

    // 1. Fetch integration and E2EE keys
    const integration = await prisma.waIntegration.findUnique({
      where: { shopId },
      select: { rsaPrivateKeyEncrypted: true },
    });

    if (!integration || !integration.rsaPrivateKeyEncrypted) {
      return res.status(500).send("Integration keypair not configured");
    }

    const privateKeyPEM = decrypt(integration.rsaPrivateKeyEncrypted);

    let decryptedData;
    let aesKey;
    let iv;

    try {
      // 2. Decrypt request
      const decrypted = decryptFlowPayload(
        encrypted_flow_data,
        encrypted_aes_key,
        initial_vector,
        privateKeyPEM
      );
      decryptedData = decrypted.decryptedData;
      aesKey = decrypted.aesKey;
      iv = decrypted.iv;
    } catch (err) {
      console.error("[WhatsApp Flow Endpoint] Decryption failed:", err.message);
      return res.status(421).send("Decryption Failed");
    }

    console.log("[WhatsApp Flow Endpoint] Decrypted Payload:", decryptedData);

    const { action, screen, data, flow_token } = decryptedData;
    let responsePayload = {};

    // 3. Resolve execution token and status
    if (flow_token) {
      const execution = await prisma.waFlowExecution.findUnique({
        where: { flowToken: flow_token },
      });

      if (execution) {
        await prisma.waFlowExecution.update({
          where: { id: execution.id },
          data: {
            status: action === "complete" ? "COMPLETED" : "STARTED",
            resultJson: action === "complete" ? data : execution.resultJson,
            completedAt: action === "complete" ? new Date() : null,
          },
        });
      }
    }

    // 4. Determine response based on action
    if (action === "ping") {
      responsePayload = {
        version: "3.0",
        status: "SUCCESS",
      };
    } else if (action === "INIT") {
      // Return initial data (e.g. list of items)
      const items = await prisma.item.findMany({
        take: 10,
        where: { shopId, status: "ACTIVE" },
        select: { id: true, name: true, defaultSellingPrice: true },
      });

      responsePayload = {
        screen: screen || "CATALOG",
        data: {
          items: items.map((i) => ({
            id: i.id,
            title: i.name,
            description: `Price: ₹${i.defaultSellingPrice}`,
          })),
        },
      };
    } else if (action === "data_exchange") {
      // Handle screen submission/transitions
      responsePayload = {
        screen: "SUCCESS_SCREEN",
        data: {
          message: "Thank you! Your request was received successfully.",
        },
      };
    } else {
      responsePayload = {
        screen: "SUCCESS_SCREEN",
        data: {
          message: "Flow submitted successfully.",
        },
      };
    }

    // 5. Encrypt response payload
    try {
      const encryptedResponse = encryptFlowResponse(responsePayload, aesKey, iv);
      res.setHeader("Content-Type", "text/plain");
      res.status(200).send(encryptedResponse);
    } catch (err) {
      console.error("[WhatsApp Flow Endpoint] Encryption failed:", err.message);
      res.status(500).send("Encryption Failed");
    }
  });
}

export const whatsappFlowEndpointController = new WhatsAppFlowEndpointController();
