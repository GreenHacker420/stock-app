import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 12 bytes is standard for AES-GCM

/**
 * Derives a 32-byte key from the MASTER_ENCRYPTION_KEY environment variable.
 */
function getSecretKey() {
  const rawKey = process.env.MASTER_ENCRYPTION_KEY || "dev-master-encryption-key-for-shopcontrol-whatsapp-layer";
  return crypto.scryptSync(rawKey, "whatsapp-salt", 32);
}

/**
 * Encrypts cleartext using AES-256-GCM.
 * Returns the combined format: iv:authTag:encryptedText
 */
export function encrypt(text) {
  if (!text) return "";
  
  const key = getSecretKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  
  const authTag = cipher.getAuthTag().toString("hex");
  
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypts AES-256-GCM encrypted text.
 * Falls back to returning the input string if it is not in the encrypted format (enables backward compatibility).
 */
export function decrypt(encryptedText) {
  if (!encryptedText) return "";
  
  const parts = encryptedText.split(":");
  if (parts.length !== 3) {
    // Treat as plaintext if it does not match encrypted pattern
    return encryptedText;
  }
  
  try {
    const [ivHex, authTagHex, encrypted] = parts;
    const key = getSecretKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    
    return decrypted;
  } catch (error) {
    console.error("[WhatsApp Crypto] Decryption failed:", error.message);
    // Return original string as fallback
    return encryptedText;
  }
}
