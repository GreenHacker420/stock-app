import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { validateFlowJson } from "../services/whatsapp.flow.service.js";
import {
  decryptFlowPayload,
  encryptFlowResponse,
} from "../controllers/whatsapp.flow-endpoint.controller.js";

const VALID_FLOW = {
  version: "7.3",
  screens: [
    {
      id: "WELCOME",
      title: "Welcome",
      terminal: true,
      layout: {
        type: "SingleColumnLayout",
        children: [
          {
            type: "Footer",
            label: "Complete",
            "on-click-action": { name: "complete", payload: {} },
          },
        ],
      },
    },
  ],
};

test("validates basic Flow JSON and rejects broken routing", () => {
  assert.equal(validateFlowJson(VALID_FLOW).valid, true);
  const invalid = validateFlowJson({
    ...VALID_FLOW,
    routing_model: { WELCOME: ["MISSING"] },
  });
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors[0].message, /does not exist/i);
});

test("round-trips official Flow endpoint encryption shape", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const aesKey = crypto.randomBytes(16);
  const iv = crypto.randomBytes(16);
  const request = {
    version: "3.0",
    action: "ping",
  };
  const cipher = crypto.createCipheriv("aes-128-gcm", aesKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(request), "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  const encryptedAesKey = crypto.publicEncrypt({
    key: publicKey,
    padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: "sha256",
  }, aesKey);

  const decrypted = decryptFlowPayload(
    encrypted.toString("base64"),
    encryptedAesKey.toString("base64"),
    iv.toString("base64"),
    privateKey,
  );
  assert.deepEqual(decrypted.decryptedData, request);

  const response = { data: { status: "active" } };
  const encryptedResponse = Buffer.from(
    encryptFlowResponse(response, decrypted.aesKey, decrypted.iv),
    "base64",
  );
  const responseIv = Buffer.from(iv.map((byte) => byte ^ 0xff));
  const responseBody = encryptedResponse.subarray(0, -16);
  const responseTag = encryptedResponse.subarray(-16);
  const decipher = crypto.createDecipheriv("aes-128-gcm", aesKey, responseIv);
  decipher.setAuthTag(responseTag);
  const clear = Buffer.concat([decipher.update(responseBody), decipher.final()]);
  assert.deepEqual(JSON.parse(clear.toString("utf8")), response);
});
