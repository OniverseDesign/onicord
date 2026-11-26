const crypto = require("crypto");
const sodium = require("sodium-universal");

const SALT = Buffer.from("Onicord::E2EE::Salt::2026");
const keyCache = new Map();
const pendingDerivations = new Map();
const MAX_KEY_CACHE_SIZE = 256;

class CryptoService {
  _cacheKey(raw, derived) {
    if (keyCache.size >= MAX_KEY_CACHE_SIZE) {
      const oldestKey = keyCache.keys().next().value;
      keyCache.delete(oldestKey);
    }
    keyCache.set(raw, derived);
  }

  _deriveKey(roomCode) {
    const raw = String(roomCode).trim().toUpperCase();
    if (keyCache.has(raw)) {
      return keyCache.get(raw);
    }
    const derived = crypto.pbkdf2Sync(raw, SALT, 10000, 32, "sha256");
    this._cacheKey(raw, derived);
    return derived;
  }

  prewarmKey(roomCode) {
    if (!roomCode) return Promise.resolve(null);
    const raw = String(roomCode).trim().toUpperCase();
    if (!raw) return Promise.resolve(null);
    if (keyCache.has(raw)) {
      return Promise.resolve(keyCache.get(raw));
    }
    if (pendingDerivations.has(raw)) {
      return pendingDerivations.get(raw);
    }
    const promise = new Promise((resolve, reject) => {
      crypto.pbkdf2(raw, SALT, 10000, 32, "sha256", (err, derived) => {
        pendingDerivations.delete(raw);
        if (err) return reject(err);
        this._cacheKey(raw, derived);
        resolve(derived);
      });
    });
    pendingDerivations.set(raw, promise);
    return promise;
  }

  _deriveLegacyKey(roomCode) {
    const raw = String(roomCode).trim().toUpperCase();
    return crypto.createHash("sha256").update(raw).digest();
  }

  canonicalJson(value) {
    if (value === null || value === undefined) return "null";
    if (typeof value === "object" && typeof value.toJSON === "function") {
      return this.canonicalJson(value.toJSON());
    }
    if (typeof value !== "object") {
      return JSON.stringify(value) ?? "null";
    }
    if (Array.isArray(value)) {
      const items = value.map((item) =>
        item === undefined || typeof item === "function" || typeof item === "symbol"
          ? "null"
          : this.canonicalJson(item)
      );
      return `[${items.join(",")}]`;
    }
    const keys = Object.keys(value)
      .filter((k) => {
        const v = value[k];
        return v !== undefined && typeof v !== "function" && typeof v !== "symbol";
      })
      .sort();
    const pairs = keys.map((k) => `${JSON.stringify(k)}:${this.canonicalJson(value[k])}`);
    return `{${pairs.join(",")}}`;
  }

  _payloadToBuffer(payload) {
    if (Buffer.isBuffer(payload)) return payload;
    if (payload instanceof Uint8Array) {
      return Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength);
    }
    if (typeof payload === "string") {
      return Buffer.from(payload, "utf8");
    }
    return Buffer.from(this.canonicalJson(payload), "utf8");
  }

  _toSecretKeyBuffer(secretKeyBuf) {
    if (Buffer.isBuffer(secretKeyBuf)) return secretKeyBuf;
    if (secretKeyBuf instanceof Uint8Array) {
      return Buffer.from(secretKeyBuf.buffer, secretKeyBuf.byteOffset, secretKeyBuf.byteLength);
    }
    if (typeof secretKeyBuf === "string" && /^[0-9a-f]{128}$/i.test(secretKeyBuf.trim())) {
      return Buffer.from(secretKeyBuf.trim(), "hex");
    }
    return null;
  }

  signPayload(payload, secretKeyBuf) {
    const skBuf = this._toSecretKeyBuffer(secretKeyBuf);
    if (!skBuf || skBuf.length !== sodium.crypto_sign_SECRETKEYBYTES) {
      throw new Error("[CryptoService] Invalid Ed25519 secret key for signPayload");
    }
    const msgBuf = this._payloadToBuffer(payload);
    const sig = Buffer.alloc(sodium.crypto_sign_BYTES);
    sodium.crypto_sign_detached(sig, msgBuf, skBuf);
    return sig.toString("hex");
  }

  verifyPayload(payload, signatureHex, publicKeyHex) {
    try {
      const normPub = this._normalizePublicKeyHex(publicKeyHex);
      if (!normPub || typeof signatureHex !== "string") return false;
      const cleanSig = signatureHex.trim().toLowerCase();
      if (!/^[0-9a-f]{128}$/.test(cleanSig)) return false;

      const msgBuf = this._payloadToBuffer(payload);
      const sigBuf = Buffer.from(cleanSig, "hex");
      const pubBuf = Buffer.from(normPub, "hex");
      if (sigBuf.length !== sodium.crypto_sign_BYTES || pubBuf.length !== sodium.crypto_sign_PUBLICKEYBYTES) {
        return false;
      }
      return Boolean(sodium.crypto_sign_verify_detached(sigBuf, msgBuf, pubBuf));
    } catch {
      return false;
    }
  }

  computeRoomProof(sharedNonceBuf, roomCode) {
    if (!sharedNonceBuf || !roomCode) return null;
    const keyBuf = Buffer.isBuffer(sharedNonceBuf)
      ? sharedNonceBuf
      : sharedNonceBuf instanceof Uint8Array
        ? Buffer.from(sharedNonceBuf.buffer, sharedNonceBuf.byteOffset, sharedNonceBuf.byteLength)
        : Buffer.from(String(sharedNonceBuf), "hex");
    if (!keyBuf || keyBuf.length === 0) return null;
    const normalizedRoom = String(roomCode).trim().toUpperCase();
    return crypto
      .createHmac("sha256", keyBuf)
      .update(`Onicord::RoomProof::v1:${normalizedRoom}`)
      .digest("hex");
  }

  isValidRoomSecret(secret) {
    return typeof secret === "string" && /^[A-Za-z0-9_-]{32,64}$/.test(secret.trim());
  }

  deriveRoomKeyV2(roomSecret) {
    if (!this.isValidRoomSecret(roomSecret)) {
      throw new Error("[CryptoService] Invalid v2 roomSecret");
    }
    const clean = roomSecret.trim();
    const cacheId = `v2:${clean}`;
    if (keyCache.has(cacheId)) {
      return keyCache.get(cacheId);
    }
    const ikm = Buffer.from(clean, "base64url");
    const derived = Buffer.from(
      crypto.hkdfSync(
        "sha256",
        ikm,
        Buffer.from("Onicord::RoomKey::v2"),
        Buffer.from("aes-256-gcm"),
        32
      )
    );
    this._cacheKey(cacheId, derived);
    return derived;
  }

  deriveRoomKeyForEpoch(secret, epoch = 1) {
    if (!this.isValidRoomSecret(secret)) {
      throw new Error("[CryptoService] Invalid v2 epoch secret");
    }
    const ep = Math.max(1, parseInt(epoch, 10) || 1);
    if (ep <= 1) {
      return this.deriveRoomKeyV2(secret);
    }
    const clean = secret.trim();
    const cacheId = `v2:e${ep}:${clean}`;
    if (keyCache.has(cacheId)) {
      return keyCache.get(cacheId);
    }
    const ikm = Buffer.from(clean, "base64url");
    const derived = Buffer.from(
      crypto.hkdfSync(
        "sha256",
        ikm,
        Buffer.from(`Onicord::RoomKey::v2:e${ep}`),
        Buffer.from("aes-256-gcm"),
        32
      )
    );
    this._cacheKey(cacheId, derived);
    return derived;
  }

  topicFromRoomSecret(roomCode, roomSecret) {
    if (!roomCode || !this.isValidRoomSecret(roomSecret)) {
      throw new Error("[CryptoService] Invalid arguments for topicFromRoomSecret");
    }
    const normalizedRoom = String(roomCode).trim().toUpperCase();
    return crypto
      .createHash("sha256")
      .update(`Onicord::Topic::v2:${normalizedRoom}:${roomSecret.trim()}`)
      .digest();
  }

  topicFromInviteSecret(roomCode, inviteSecret) {
    if (!roomCode || !this.isValidRoomSecret(inviteSecret)) {
      throw new Error("[CryptoService] Invalid arguments for topicFromInviteSecret");
    }
    const normalizedRoom = String(roomCode).trim().toUpperCase();
    return crypto
      .createHash("sha256")
      .update(`Onicord::InviteTopic::v1:${normalizedRoom}:${inviteSecret.trim()}`)
      .digest();
  }

  hashInviteSecret(inviteSecret) {
    return crypto
      .createHash("sha256")
      .update(`Onicord::InviteHash::v1:${String(inviteSecret || "").trim()}`)
      .digest("hex");
  }

  encrypt(roomCode, plaintext, options = {}) {
    if (!roomCode || !plaintext) return plaintext;
    try {
      const epochNum = Math.max(1, parseInt(options?.keyEpoch, 10) || 1);
      const chosenSecret =
        epochNum >= 2 && this.isValidRoomSecret(options?.epochSecret || options?.roomSecret)
          ? (options.epochSecret || options.roomSecret)
          : (this.isValidRoomSecret(options?.roomSecret) ? options.roomSecret : null);
      const useV2 = Boolean(chosenSecret);
      const key = useV2
        ? this.deriveRoomKeyForEpoch(chosenSecret, epochNum)
        : this._deriveKey(roomCode);
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      let encrypted = cipher.update(plaintext, "utf8", "hex");
      encrypted += cipher.final("hex");
      const authTag = cipher.getAuthTag().toString("hex");
      const prefix = !useV2
        ? "[E2EE]:"
        : epochNum >= 2
          ? `[E2EE2:e${epochNum}]:`
          : "[E2EE2]:";
      return `${prefix}${iv.toString("hex")}:${encrypted}:${authTag}`;
    } catch (err) {
      console.error("[E2EE Node Encryption Error]:", err.message);
      return "";
    }
  }

  decrypt(roomCode, ciphertext, options = {}) {
    if (!ciphertext || typeof ciphertext !== "string") return ciphertext;

    const epochMatch = ciphertext.match(/^\[E2EE2:e(\d+)\]:/);
    if (epochMatch) {
      const epoch = Math.max(1, parseInt(epochMatch[1], 10) || 1);
      const body = ciphertext.slice(epochMatch[0].length);
      const parts = body.split(":");
      if (parts.length !== 3) return "[Cifrado - No disponible]";
      const secret =
        options?.keyRing?.[epoch] ||
        options?.keyRing?.[String(epoch)] ||
        (epoch === 1 ? options?.roomSecret : null);
      if (!secret || !this.isValidRoomSecret(secret)) {
        return "[Cifrado - No disponible]";
      }
      try {
        const iv = Buffer.from(parts[0], "hex");
        const encryptedHex = parts[1];
        const authTag = Buffer.from(parts[2], "hex");
        const key = this.deriveRoomKeyForEpoch(secret, epoch);
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedHex, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;
      } catch (err) {
        console.warn(`[E2EE2:e${epoch} Node Decryption Error]:`, err.message);
        return "[Cifrado - No disponible]";
      }
    }

    if (ciphertext.startsWith("[E2EE2]:")) {
      const parts = ciphertext.slice(8).split(":");
      if (parts.length !== 3) return "[Cifrado - No disponible]";
      const v2Secret =
        options?.keyRing?.[1] ||
        options?.keyRing?.["1"] ||
        options?.roomSecret;
      if (!v2Secret || !this.isValidRoomSecret(v2Secret)) {
        return "[Cifrado - No disponible]";
      }
      try {
        const iv = Buffer.from(parts[0], "hex");
        const encryptedHex = parts[1];
        const authTag = Buffer.from(parts[2], "hex");
        const key = this.deriveRoomKeyV2(v2Secret);
        const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedHex, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;
      } catch (err) {
        console.warn("[E2EE2 Node Decryption Error]:", err.message);
        return "[Cifrado - No disponible]";
      }
    }

    if (!roomCode || !ciphertext.startsWith("[E2EE]:")) return ciphertext;
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

  deriveDmKey(localSecretKeyBuf, localPublicKeyHex, remotePublicKeyHex) {
    const skBuf = this._toSecretKeyBuffer(localSecretKeyBuf);
    const localNorm = this._normalizePublicKeyHex(localPublicKeyHex);
    const remoteNorm = this._normalizePublicKeyHex(remotePublicKeyHex);
    if (!skBuf || skBuf.length !== sodium.crypto_sign_SECRETKEYBYTES || !localNorm || !remoteNorm) {
      throw new Error("[CryptoService] Invalid keys for deriveDmKey");
    }

    const skC = Buffer.alloc(sodium.crypto_scalarmult_SCALARBYTES);
    const pkC = Buffer.alloc(sodium.crypto_scalarmult_BYTES);
    const shared = Buffer.alloc(sodium.crypto_scalarmult_BYTES);

    try {
      sodium.crypto_sign_ed25519_sk_to_curve25519(skC, skBuf);
      sodium.crypto_sign_ed25519_pk_to_curve25519(pkC, Buffer.from(remoteNorm, "hex"));
      sodium.crypto_scalarmult(shared, skC, pkC);

      const [first, second] = localNorm <= remoteNorm ? [localNorm, remoteNorm] : [remoteNorm, localNorm];
      return Buffer.from(
        crypto.hkdfSync(
          "sha256",
          shared,
          Buffer.from(`Onicord::DM::v1:${first}:${second}`),
          Buffer.from("aes-256-gcm"),
          32
        )
      );
    } finally {
      skC.fill(0);
      shared.fill(0);
    }
  }

  encryptDM(localSecretKeyBuf, localPublicKeyHex, remotePublicKeyHex, plaintext) {
    if (!plaintext || typeof plaintext !== "string") return plaintext;
    const localNorm = this._normalizePublicKeyHex(localPublicKeyHex);
    const remoteNorm = this._normalizePublicKeyHex(remotePublicKeyHex);
    if (!localNorm || !remoteNorm) {
      throw new Error("[CryptoService] Invalid public keys for encryptDM");
    }
    const key = this.deriveDmKey(localSecretKeyBuf, localNorm, remoteNorm);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    let encrypted = cipher.update(plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return `[E2EE-DM]:${localNorm}:${remoteNorm}:${iv.toString("hex")}:${encrypted}:${authTag}`;
  }

  decryptDM(localSecretKeyBuf, localPublicKeyHex, ciphertext) {
    if (!ciphertext || typeof ciphertext !== "string" || !ciphertext.startsWith("[E2EE-DM]:")) {
      return ciphertext;
    }
    const parts = ciphertext.slice(10).split(":");
    if (parts.length !== 5) return "[Cifrado - No disponible]";

    const localNorm = this._normalizePublicKeyHex(localPublicKeyHex);
    const senderPub = this._normalizePublicKeyHex(parts[0]);
    const recipientPub = this._normalizePublicKeyHex(parts[1]);
    if (!localNorm || !senderPub || !recipientPub) {
      return "[Cifrado - No disponible]";
    }
    if (localNorm !== senderPub && localNorm !== recipientPub) {
      return "[Cifrado - No disponible]";
    }

    const remotePub = localNorm === senderPub ? recipientPub : senderPub;
    try {
      const iv = Buffer.from(parts[2], "hex");
      const encryptedHex = parts[3];
      const authTag = Buffer.from(parts[4], "hex");
      const key = this.deriveDmKey(localSecretKeyBuf, localNorm, remotePub);
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedHex, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch (err) {
      console.warn("[E2EE-DM Decryption Error]:", err.message);
      return "[Cifrado - No disponible]";
    }
  }

  _normalizePublicKeyHex(hex) {
    if (typeof hex !== "string") return null;
    const clean = hex.trim().toLowerCase();
    return /^[0-9a-f]{64}$/.test(clean) ? clean : null;
  }

  computeIdentityFingerprint(publicKeyHex) {
    const norm = this._normalizePublicKeyHex(publicKeyHex);
    if (!norm) return null;
    const digest = crypto
      .createHash("sha256")
      .update(Buffer.from("Onicord::Identity::v1:"))
      .update(Buffer.from(norm, "hex"))
      .digest();
    const hex32 = digest.subarray(0, 16).toString("hex").toUpperCase();
    return hex32.match(/.{1,4}/g).join(" ");
  }

  computeSafetyNumber(localPublicKeyHex, remotePublicKeyHex) {
    const local = this._normalizePublicKeyHex(localPublicKeyHex);
    const remote = this._normalizePublicKeyHex(remotePublicKeyHex);
    if (!local || !remote) return null;

    const [first, second] = local <= remote ? [local, remote] : [remote, local];
    const firstBuf = Buffer.from(first, "hex");
    const secondBuf = Buffer.from(second, "hex");

    let digest = crypto
      .createHash("sha256")
      .update(Buffer.from("Onicord::SafetyNumber::v1:"))
      .update(firstBuf)
      .update(secondBuf)
      .digest();

    for (let i = 1; i < 5200; i++) {
      digest = crypto
        .createHash("sha256")
        .update(digest)
        .update(firstBuf)
        .update(secondBuf)
        .digest();
    }

    const p1 = crypto.createHash("sha256").update(digest).update(Buffer.from(":part1")).digest();
    const p2 = crypto.createHash("sha256").update(digest).update(Buffer.from(":part2")).digest();
    const expanded = Buffer.concat([p1, p2]);

    const groups = [];
    for (let i = 0; i < 12; i++) {
      const off = i * 5;
      const val =
        expanded[off] * 0x100000000 +
        ((expanded[off + 1] << 24) >>> 0) +
        (expanded[off + 2] << 16) +
        (expanded[off + 3] << 8) +
        expanded[off + 4];
      groups.push(String(val % 100000).padStart(5, "0"));
    }

    return {
      groups,
      formatted: groups.join(" "),
    };
  }
}

module.exports = new CryptoService();
