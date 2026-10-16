const crypto = require("crypto");

const SALT = Buffer.from("Onicord::E2EE::Salt::2026");

class CryptoService {
  _deriveKey(roomCode) {
    const raw = String(roomCode).trim().toUpperCase();
    return crypto.pbkdf2Sync(raw, SALT, 10000, 32, "sha256");
  }

  _deriveLegacyKey(roomCode) {
    const raw = String(roomCode).trim().toUpperCase();
    return crypto.createHash("sha256").update(raw).digest();
  }

  encrypt(roomCode, plaintext) {
    if (!roomCode || !plaintext) return plaintext;
    try {
      const key = this._deriveKey(roomCode);
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      let encrypted = cipher.update(plaintext, "utf8", "hex");
      encrypted += cipher.final("hex");
      const authTag = cipher.getAuthTag().toString("hex");
      return `[E2EE]:${iv.toString("hex")}:${encrypted}:${authTag}`;
    } catch (err) {
      console.error("[E2EE Node Encryption Error]:", err.message);
      return plaintext;
    }
  }

  decrypt(roomCode, ciphertext) {
    if (!roomCode || !ciphertext || !ciphertext.startsWith("[E2EE]:")) return ciphertext;
    const parts = ciphertext.slice(7).split(":");
    if (parts.length !== 3) return ciphertext;

    const iv = Buffer.from(parts[0], "hex");
    const encryptedHex = parts[1];
    const authTag = Buffer.from(parts[2], "hex");

    // Try primary PBKDF2 key
    try {
      const key = this._deriveKey(roomCode);
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedHex, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch (primaryErr) {
      // Fallback to legacy SHA-256 key for historical messages
      try {
        const legacyKey = this._deriveLegacyKey(roomCode);
        const decipher = crypto.createDecipheriv("aes-256-gcm", legacyKey, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedHex, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;
      } catch (legacyErr) {
        console.warn("[E2EE Node Decryption Error]:", legacyErr.message);
        return `[Cifrado - No disponible]`;
      }
    }
  }
}

module.exports = new CryptoService();
