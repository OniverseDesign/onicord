const { DbManager } = require("../storage/dbManager.cjs");
const cryptoService = require("./cryptoService.cjs");

class PeerTrustService {
  _getDb(userDataPath) {
    if (!userDataPath) return null;
    return DbManager.getInstance(userDataPath).getGlobalDb("app_config");
  }

  recordPeerSighting(userDataPath, userId, peerPublicKey, transportAuth = "noise-hyperswarm") {
    const cleanUserId = typeof userId === "string" ? userId.trim() : "";
    const normKey = cryptoService._normalizePublicKeyHex(peerPublicKey);
    if (!userDataPath || !cleanUserId || !normKey) {
      return { status: "unavailable", keyChanged: false, hadVerifiedKey: false };
    }
    if (transportAuth === "unauthenticated") {
      return { status: "unauthenticated", keyChanged: false, hadVerifiedKey: false };
    }

    try {
      const db = this._getDb(userDataPath);
      if (!db) return { status: "unverified", keyChanged: false, hadVerifiedKey: false };

      const rows = db
        .prepare(
          "SELECT peer_public_key, verified, first_seen_at, verified_at, last_seen_at FROM trusted_peers WHERE user_id = ? ORDER BY last_seen_at DESC"
        )
        .all(cleanUserId);

      const now = Date.now();
      const existing = rows.find((r) => r.peer_public_key === normKey);

      if (existing) {
        db.prepare(
          "UPDATE trusted_peers SET last_seen_at = ? WHERE user_id = ? AND peer_public_key = ?"
        ).run(now, cleanUserId, normKey);

        const status =
          existing.verified === 1
            ? "verified"
            : rows.length > 1
              ? "key_changed"
              : "unverified";
        return { status, keyChanged: false, hadVerifiedKey: false };
      }

      db.prepare(
        "INSERT INTO trusted_peers (user_id, peer_public_key, verified, first_seen_at, verified_at, last_seen_at) VALUES (?, ?, 0, ?, NULL, ?)"
      ).run(cleanUserId, normKey, now, now);

      const keyChanged = rows.length > 0;
      const hadVerifiedKey = rows.some((r) => r.verified === 1);
      return {
        status: keyChanged ? "key_changed" : "unverified",
        keyChanged,
        hadVerifiedKey,
      };
    } catch (err) {
      console.warn("[PeerTrust] Error recording peer sighting:", err.message);
      return { status: "unverified", keyChanged: false, hadVerifiedKey: false };
    }
  }

  getVerificationStatusQuick(userDataPath, userId, peerPublicKey, transportAuth = "noise-hyperswarm") {
    if (transportAuth === "unauthenticated") return "unauthenticated";
    const cleanUserId = typeof userId === "string" ? userId.trim() : "";
    const normKey = cryptoService._normalizePublicKeyHex(peerPublicKey);
    if (!userDataPath || !cleanUserId || !normKey) return "unavailable";

    try {
      const db = this._getDb(userDataPath);
      if (!db) return "unverified";
      const rows = db
        .prepare("SELECT peer_public_key, verified FROM trusted_peers WHERE user_id = ?")
        .all(cleanUserId);
      const current = rows.find((r) => r.peer_public_key === normKey);
      if (current?.verified === 1) return "verified";
      if (rows.length > 1 || (rows.length === 1 && !current)) return "key_changed";
      return "unverified";
    } catch {
      return "unverified";
    }
  }

  getPeerVerification(userDataPath, { userId, peerPublicKey, localPublicKey, transportAuth } = {}) {
    const cleanUserId = typeof userId === "string" ? userId.trim() : "";
    const normLocal = cryptoService._normalizePublicKeyHex(localPublicKey);
    const localFingerprint = normLocal ? cryptoService.computeIdentityFingerprint(normLocal) : null;

    let resolvedKey = cryptoService._normalizePublicKeyHex(peerPublicKey);
    let rows = [];

    if (userDataPath && cleanUserId) {
      try {
        const db = this._getDb(userDataPath);
        if (db) {
          rows = db
            .prepare(
              "SELECT peer_public_key, verified, first_seen_at, verified_at, last_seen_at FROM trusted_peers WHERE user_id = ? ORDER BY last_seen_at DESC"
            )
            .all(cleanUserId);
          if (!resolvedKey && rows.length > 0) {
            resolvedKey = rows[0].peer_public_key;
          }
        }
      } catch (err) {
        console.warn("[PeerTrust] Error reading trusted_peers:", err.message);
      }
    }

    if (!resolvedKey) {
      return {
        status: "unavailable",
        userId: cleanUserId || null,
        peerPublicKey: null,
        localPublicKey: normLocal,
        localFingerprint,
        peerFingerprint: null,
        safetyNumber: null,
        safetyNumberGroups: [],
        transportAuth: transportAuth || null,
        firstSeenAt: null,
        verifiedAt: null,
        lastSeenAt: null,
        previousKeysCount: 0,
      };
    }

    const peerFingerprint = cryptoService.computeIdentityFingerprint(resolvedKey);
    const safety = normLocal ? cryptoService.computeSafetyNumber(normLocal, resolvedKey) : null;
    const currentRow = rows.find((r) => r.peer_public_key === resolvedKey) || null;
    const previousKeysCount = Math.max(0, rows.length - (currentRow ? 1 : 0));

    let status = "unverified";
    if (transportAuth === "unauthenticated") {
      status = "unauthenticated";
    } else if (currentRow?.verified === 1) {
      status = "verified";
    } else if (rows.length > 1 || (rows.length >= 1 && !currentRow)) {
      status = "key_changed";
    }

    return {
      status,
      userId: cleanUserId || null,
      peerPublicKey: resolvedKey,
      localPublicKey: normLocal,
      localFingerprint,
      peerFingerprint,
      safetyNumber: safety?.formatted || null,
      safetyNumberGroups: safety?.groups || [],
      transportAuth: transportAuth || "offline",
      firstSeenAt: currentRow?.first_seen_at || null,
      verifiedAt: currentRow?.verified_at || null,
      lastSeenAt: currentRow?.last_seen_at || null,
      previousKeysCount,
    };
  }

  setPeerVerified(userDataPath, userId, peerPublicKey, verified) {
    const cleanUserId = typeof userId === "string" ? userId.trim() : "";
    const normKey = cryptoService._normalizePublicKeyHex(peerPublicKey);
    if (!userDataPath || !cleanUserId || !normKey) {
      return { ok: false, error: "Invalid peer identity parameters" };
    }

    try {
      const db = this._getDb(userDataPath);
      if (!db) return { ok: false, error: "Database unavailable" };

      const now = Date.now();
      const flag = verified ? 1 : 0;
      const verifiedAt = verified ? now : null;

      const existing = db
        .prepare("SELECT first_seen_at FROM trusted_peers WHERE user_id = ? AND peer_public_key = ?")
        .get(cleanUserId, normKey);

      if (existing) {
        db.prepare(
          "UPDATE trusted_peers SET verified = ?, verified_at = ?, last_seen_at = ? WHERE user_id = ? AND peer_public_key = ?"
        ).run(flag, verifiedAt, now, cleanUserId, normKey);
      } else {
        db.prepare(
          "INSERT INTO trusted_peers (user_id, peer_public_key, verified, first_seen_at, verified_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)"
        ).run(cleanUserId, normKey, flag, now, verifiedAt, now);
      }

      if (verified) {
        db.prepare(
          "UPDATE trusted_peers SET verified = 0, verified_at = NULL WHERE user_id = ? AND peer_public_key != ?"
        ).run(cleanUserId, normKey);
      }

      return { ok: true, verified: Boolean(verified), verifiedAt };
    } catch (err) {
      console.error("[PeerTrust] Error setting verification state:", err.message);
      return { ok: false, error: err.message };
    }
  }
}

module.exports = new PeerTrustService();
