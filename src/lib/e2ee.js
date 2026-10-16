/**
 * Onicord End-to-End Encryption (E2EE) Module
 * Uses native Web Crypto API (AES-GCM 256-bit) to encrypt/decrypt messages.
 */

// Helper to convert ArrayBuffer to Hex string
function bufToHex(buffer) {
  return Array.prototype.map
    .call(new Uint8Array(buffer), (x) => ("00" + x.toString(16)).slice(-2))
    .join("");
}

// Helper to convert Hex string to ArrayBuffer
function hexToBuf(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes.buffer;
}

const keyCache = new Map();
const legacyKeyCache = new Map();

// Derive a CryptoKey from roomCode using PBKDF2 with 10,000 iterations
async function deriveKeyFromRoom(roomCode) {
  const normalizedCode = String(roomCode).trim().toUpperCase();
  if (keyCache.has(normalizedCode)) {
    return keyCache.get(normalizedCode);
  }

  const encoder = new TextEncoder();
  const rawCode = encoder.encode(normalizedCode);
  const salt = encoder.encode("Onicord::E2EE::Salt::2026");

  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    rawCode,
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const derivedKey = await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 10000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  keyCache.set(normalizedCode, derivedKey);
  return derivedKey;
}

async function deriveLegacyKeyFromRoom(roomCode) {
  const normalizedCode = String(roomCode).trim().toUpperCase();
  if (legacyKeyCache.has(normalizedCode)) {
    return legacyKeyCache.get(normalizedCode);
  }

  const encoder = new TextEncoder();
  const rawCode = encoder.encode(normalizedCode);
  const hash = await window.crypto.subtle.digest("SHA-256", rawCode);

  const legacyKey = await window.crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );

  legacyKeyCache.set(normalizedCode, legacyKey);
  return legacyKey;
}

/**
 * Encrypts a plaintext string using the room code as key source.
 * @param {string} roomCode - The target server/room code.
 * @param {string} plaintext - The message to encrypt.
 * @returns {Promise<string>} The E2EE encrypted hex payload (IV + ciphertext).
 */
export async function encryptMessage(roomCode, plaintext) {
  if (!roomCode || !plaintext) return plaintext;
  try {
    const key = await deriveKeyFromRoom(roomCode);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const encoded = encoder.encode(plaintext);

    const ciphertext = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoded
    );

    // Concat IV + Ciphertext
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return `[E2EE]:${bufToHex(combined.buffer)}`;
  } catch (err) {
    console.error("[E2EE Encryption Error]:", err.message);
    return plaintext;
  }
}

/**
 * Decrypts an E2EE encrypted payload back to plaintext.
 * @param {string} roomCode - The target server/room code.
 * @param {string} payload - The message string (which may be E2EE prefixed).
 * @returns {Promise<string>} The decrypted plaintext string.
 */
export async function decryptMessage(roomCode, payload) {
  if (!roomCode || !payload || !payload.startsWith("[E2EE]:")) return payload;
  try {
    const rawHex = payload.slice(7);
    const combined = new Uint8Array(hexToBuf(rawHex));

    // Extract IV (first 12 bytes) and ciphertext
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    try {
      const key = await deriveKeyFromRoom(roomCode);
      const decrypted = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ciphertext
      );
      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch {
      // Fallback to legacy SHA-256 key for historical backward compatibility
      const legacyKey = await deriveLegacyKeyFromRoom(roomCode);
      const decrypted = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        legacyKey,
        ciphertext
      );
      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    }
  } catch (err) {
    console.warn("[E2EE Decryption Error - Key mismatch or corrupt payload]:", err.message);
    return `[Cifrado - No disponible]`;
  }
}
