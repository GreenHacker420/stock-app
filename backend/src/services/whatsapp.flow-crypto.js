import crypto from "crypto";

function invertIv(iv) {
  const flipped = Buffer.alloc(iv.length);
  for (let index = 0; index < iv.length; index += 1) {
    flipped[index] = iv[index] ^ 0xff;
  }
  return flipped;
}

export function decryptFlowPayload(encryptedFlowDataB64, encryptedAesKeyB64, initialVectorB64, privateKeyPem) {
  const aesKey = crypto.privateDecrypt(
    {
      key: privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(encryptedAesKeyB64, "base64"),
  );
  const flowData = Buffer.from(encryptedFlowDataB64, "base64");
  const iv = Buffer.from(initialVectorB64, "base64");
  const encryptedData = flowData.subarray(0, flowData.length - 16);
  const authTag = flowData.subarray(flowData.length - 16);
  const decipher = crypto.createDecipheriv("aes-128-gcm", aesKey, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);

  return {
    decryptedData: JSON.parse(decrypted.toString("utf8")),
    aesKey,
    iv,
  };
}

export function encryptFlowResponse(responsePayload, aesKey, iv) {
  const cipher = crypto.createCipheriv("aes-128-gcm", aesKey, invertIv(iv));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(responsePayload), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([encrypted, cipher.getAuthTag()]).toString("base64");
}
