const Hyperswarm = require("hyperswarm");
const SecretStream = require("@hyperswarm/secret-stream");
const b4a = require("b4a");
const crypto = require("crypto");
const os = require("os");
const { StringDecoder } = require("string_decoder");

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

function ipToLong(ip) {
  return String(ip).split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function normalizeIP(ip) {
  if (!ip) return "";
  const s = String(ip).trim();
  if (s.startsWith("::ffff:")) return s.substring(7);
  if (s === "::1") return "127.0.0.1";
  return s;
}

function isPrivateIP(ip) {
  const clean = normalizeIP(ip);
  if (!clean) return false;
  if (clean === "127.0.0.1" || clean === "localhost") return true;
  if (clean.startsWith("10.")) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(clean)) return true;
  if (clean.startsWith("192.168.")) return true;
  if (clean.startsWith("169.254.")) return true;
  return false;
}

function isSameSubnet(ipA, ipB) {
  if (!ipA || !ipB) return false;
  
  const cleanA = normalizeIP(ipA);
  const cleanB = normalizeIP(ipB);
  if (cleanA === cleanB) return true;
  if (cleanA === "127.0.0.1" && cleanB === "127.0.0.1") return true;

  const interfaces = os.networkInterfaces();
  let netmask = "255.255.255.0"; // fallback
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && (iface.address === cleanA || iface.address === cleanB)) {
        netmask = iface.netmask;
        break;
      }
    }
  }

  const longA = ipToLong(cleanA);
  const longB = ipToLong(cleanB);
  const longMask = ipToLong(netmask);

  return (longA & longMask) === (longB & longMask);
}

function topicFromRoomCode(code) {
  const normalized = String(code).trim().toUpperCase();
  return crypto.createHash("sha256").update(normalized).digest();
}

function encodeMessage(type, payload) {
  let wirePayload = payload;
  try {
    const { app } = require("electron");
    if (app && typeof app.getPath === "function") {
      const { CasStore } = require("../storage/casStore.cjs");
      wirePayload = CasStore.getInstance(app.getPath("userData")).hydrateForNetwork(payload);
    }
  } catch {}
  return JSON.stringify({ type, payload: wirePayload }) + "\n";
}

function safeWriteSocket(socket, dataStr) {
  if (!socket || socket.destroyed) return;
  try {
    const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB safe chunks to avoid V8/net.Socket 16MB atomic write limit
    const buf = Buffer.isBuffer(dataStr) ? dataStr : Buffer.from(String(dataStr), "utf8");
    if (buf.length <= CHUNK_SIZE) {
      socket.write(buf);
    } else {
      console.log(`[P2P Socket] Partitioning large payload (${buf.length} bytes) into ${Math.ceil(buf.length / CHUNK_SIZE)} safe chunks...`);
      for (let offset = 0; offset < buf.length; offset += CHUNK_SIZE) {
        if (socket.destroyed) break;
        const chunk = buf.subarray(offset, offset + CHUNK_SIZE);
        socket.write(chunk);
      }
    }
  } catch (err) {
    console.error("[P2P Socket] safeWriteSocket error:", err.message);
  }
}

function decodeMessages(bufferStr) {
  const messages = [];
  const lines = bufferStr.split("\n");
  const remaining = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      messages.push(JSON.parse(line));
    } catch {
    }
  }
  return { messages, remaining };
}

const P2P_PROTOCOL_VERSION = 2;
const P2P_CAPABILITIES = [
  "hmac-rooms",
  "ed25519-meta",
  "e2ee2-room",
  "dm-ecdh",
  "cas-sha256",
  "key-epochs-v1",
  "expiring-invite-v1",
];

const RATE_LIMIT_CONFIGS = {
  sync: { capacity: 25, refillPerSec: 10 },
  chat: { capacity: 40, refillPerSec: 20 },
  file: { capacity: 400, refillPerSec: 250 },
  draw: { capacity: 120, refillPerSec: 60 },
  general: { capacity: 80, refillPerSec: 40 },
};

const RATE_TYPE_CATEGORY = {
  "sync-req": "sync",
  "sync-res": "sync",
  "invite-preview-req": "sync",
  "room-key-sync": "sync",
  "invite-redeem-req": "sync",
  "invite-redeem-res": "sync",
  "chat": "chat",
  "chat-delete": "chat",
  "typing-state": "chat",
  "chat-typing": "chat",
  "file-request-block": "file",
  "file-request": "file",
  "file-response-chunk": "file",
  "file-block-res": "file",
  "whiteboard-event": "draw",
  "sketch-draw": "draw",
};

class P2PService {
  constructor({ userDataPath, onPeerJoined, onPeerLeft, onMessage } = {}) {
    this.userDataPath = userDataPath || null;
    this.swarm = null;
    this.peers = new Map();
    this._buffers = new Map();
    this.localPeerId = null;
    this.profile = null;
    this.roomCode = null;
    this.joinedRooms = new Set();
    this.roomDiscoveries = new Map();
    this.inviteDiscoveries = new Map();
    this.peerRooms = new Map(); // Map<peerId, Set<roomCode>>

    this.onPeerJoined = onPeerJoined;
    this.onPeerLeft = onPeerLeft;
    this.onMessage = onMessage;

    this.directConfig = null;
    this.directServer = null;
    this.directServerPort = null;
    this.directClientConnecting = false;
    this._directRetryCount = 0;
  }

  _getOrCreateNodeSeed() {
    try {
      if (!this.userDataPath) return null;
      const { DbManager } = require("../storage/dbManager.cjs");
      const db = DbManager.getInstance(this.userDataPath).getGlobalDb("app_config");
      const row = db.prepare("SELECT value_json FROM app_settings WHERE key = ?").get("p2p_node_seed");
      if (row && row.value_json) {
        const parsed = JSON.parse(row.value_json);
        if (parsed?.seedHex) {
          return Buffer.from(parsed.seedHex, "hex");
        }
      }
      const newSeed = crypto.randomBytes(32);
      const now = Date.now();
      db.prepare("INSERT OR REPLACE INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)").run(
        "p2p_node_seed",
        JSON.stringify({ seedHex: newSeed.toString("hex") }),
        now
      );
      return newSeed;
    } catch (err) {
      console.warn("[P2P] Podría no persistirse la semilla P2P, usando clave efímera:", err.message);
      return null;
    }
  }

  _resolveLocalPeerId() {
    if (this.localPeerId) return this.localPeerId;
    if (this.swarm?.keyPair?.publicKey) {
      this.localPeerId = b4a.toString(this.swarm.keyPair.publicKey, "hex");
    } else {
      const kp = this.getKeyPair();
      if (kp?.publicKey) {
        this.localPeerId = b4a.toString(kp.publicKey, "hex");
      }
    }
    return this.localPeerId;
  }

  getKeyPair() {
    if (this.swarm?.keyPair?.secretKey && this.swarm?.keyPair?.publicKey) {
      return this.swarm.keyPair;
    }
    if (this._cachedKeyPair) return this._cachedKeyPair;
    const seed = this._getOrCreateNodeSeed();
    if (seed) {
      this._cachedKeyPair = SecretStream.keyPair(seed);
      return this._cachedKeyPair;
    }
    return null;
  }

  async ensureSwarm() {
    if (!this.swarm) {
      const swarmOpts = { maxPeers: 64 };
      const seed = this._getOrCreateNodeSeed();
      if (seed) {
        swarmOpts.seed = seed;
      }
      this.swarm = new Hyperswarm(swarmOpts);
      this.swarm.on("connection", (socket, peerInfo) => this._handleConnection(socket, peerInfo));
      this._resolveLocalPeerId();
    }
  }

  async joinRoom(roomCode, options = {}) {
    await this.ensureSwarm();
    const normalized = String(roomCode || "").trim().toUpperCase();
    if (!normalized) return null;

    const cryptoService = require("../services/cryptoService.cjs");
    const roomSecret =
      typeof options?.roomSecret === "string" && cryptoService.isValidRoomSecret(options.roomSecret)
        ? options.roomSecret.trim()
        : null;
    const keepLegacyTopic = options?.keepLegacyTopic !== false;

    this.roomCode = normalized;
    this.joinedRooms.add(normalized);

    let entry = this.roomDiscoveries.get(normalized);
    if (entry && !entry.v2Topic && !entry.legacyTopic) {
      // Upgrade older discovery entry shape if needed
      entry = { legacyDiscovery: entry, v2Discovery: null, legacyTopic: topicFromRoomCode(normalized), v2Topic: null };
    } else if (!entry) {
      entry = { legacyDiscovery: null, v2Discovery: null, legacyTopic: null, v2Topic: null };
    }

    if (roomSecret && !entry.v2Discovery) {
      const v2Topic = cryptoService.topicFromRoomSecret(normalized, roomSecret);
      entry.v2Topic = v2Topic;
      entry.v2Discovery = this.swarm.join(v2Topic, { server: true, client: true });
    }

    if (keepLegacyTopic && !entry.legacyDiscovery) {
      const legacyTopic = topicFromRoomCode(normalized);
      entry.legacyTopic = legacyTopic;
      entry.legacyDiscovery = this.swarm.join(legacyTopic, { server: true, client: true });
    }

    this.roomDiscoveries.set(normalized, entry);
    const primaryDiscovery = entry.v2Discovery || entry.legacyDiscovery;

    const waitFlush = Boolean(options?.waitFlush);
    const flushes = [entry.v2Discovery, entry.legacyDiscovery].filter(Boolean).map((d) => d.flushed());
    if (waitFlush) {
      await Promise.all(flushes);
    } else {
      Promise.all(flushes).catch((err) => {
        console.warn(`[P2P] Background discovery flush warning for ${normalized}:`, err.message);
      });
    }

    // Recompute HMAC room proofs for connected v2 peers
    this._broadcastJoinedRooms();
    return primaryDiscovery;
  }

  async syncInviteTopic(roomCode, inviteSecret) {
    const normalized = String(roomCode || "").trim().toUpperCase();
    if (!normalized) return null;
    const cryptoService = require("../services/cryptoService.cjs");
    const cleanSecret =
      typeof inviteSecret === "string" && cryptoService.isValidRoomSecret(inviteSecret)
        ? inviteSecret.trim()
        : null;
    if (!cleanSecret) {
      await this.leaveInviteTopic(normalized);
      return null;
    }

    const existing = this.inviteDiscoveries.get(normalized);
    if (existing && existing.inviteSecret === cleanSecret) {
      return existing.discovery;
    }
    if (existing) {
      await this.leaveInviteTopic(normalized);
    }

    await this.ensureSwarm();
    const topic = cryptoService.topicFromInviteSecret(normalized, cleanSecret);
    const discovery = this.swarm.join(topic, { server: true, client: true });
    this.inviteDiscoveries.set(normalized, {
      topic,
      discovery,
      inviteSecret: cleanSecret,
    });
    discovery.flushed().catch(() => {});
    return discovery;
  }

  async leaveInviteTopic(roomCode) {
    const normalized = String(roomCode || "").trim().toUpperCase();
    if (!normalized) return;
    const entry = this.inviteDiscoveries.get(normalized);
    if (!entry) return;
    this.inviteDiscoveries.delete(normalized);
    if (this.swarm && entry.topic) {
      try {
        await this.swarm.leave(entry.topic);
      } catch {}
    }
  }

  async leaveRoom(roomCode) {
    const normalized = String(roomCode || "").trim().toUpperCase();
    if (!normalized) return;

    await this.leaveInviteTopic(normalized);

    this.joinedRooms.delete(normalized);
    if (this.roomCode === normalized) {
      this.roomCode = this.joinedRooms.size > 0 ? [...this.joinedRooms][0] : null;
    }
    this._broadcastJoinedRooms();

    const entry = this.roomDiscoveries.get(normalized);
    if (entry) {
      this.roomDiscoveries.delete(normalized);
      if (this.swarm) {
        if (entry.v2Topic) {
          try { await this.swarm.leave(entry.v2Topic); } catch {}
        }
        if (entry.legacyTopic) {
          try { await this.swarm.leave(entry.legacyTopic); } catch {}
        }
      }
    } else if (this.swarm) {
      const topic = topicFromRoomCode(normalized);
      try {
        await this.swarm.leave(topic);
      } catch {}
    }
  }

  disconnectAllPeers() {
    for (const peerId of this.peers.keys()) {
      this._removePeer(peerId);
    }
    this.peers.clear();
    this._buffers.clear();
    this.peerRooms.clear();
    this.joinedRooms.clear();
    this.roomDiscoveries.clear();
    this.inviteDiscoveries.clear();
    this.roomCode = null;
  }

  _broadcastJoinedRooms() {
    const cryptoService = require("../services/cryptoService.cjs");
    for (const peer of this.peers.values()) {
      if (!peer?.socket || peer.socket.destroyed) continue;
      if ((peer.protocolVersion || 1) >= 2 && peer.sharedNonceBuf) {
        const proofs = [];
        for (const room of this.joinedRooms) {
          const proof = cryptoService.computeRoomProof(peer.sharedNonceBuf, room);
          if (proof) proofs.push(proof);
        }
        safeWriteSocket(peer.socket, encodeMessage("room-proofs", { proofs }));
      }
    }
  }

  _buildWireProfileForPeer(peerId, { includeJoinedRooms = false, legacySharedRooms = [] } = {}) {
    if (!this.profile) return null;
    const { joinedRooms: _omitted, localIPs: _omittedIPs, ...safeBase } = this.profile;
    const allowLanIPs = this.isVerifiedLan(peerId) && !this._isAlwaysRelayEnabled();
    const wireProfile = {
      ...safeBase,
      localIPs: allowLanIPs ? getLocalIPs() : [],
    };
    if (includeJoinedRooms) {
      wireProfile.joinedRooms = legacySharedRooms;
    }
    return wireProfile;
  }

  _sendProfileToPeer(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer?.socket || peer.socket.destroyed || !this.profile) return;
    const shared = this.peerRooms.get(peerId);
    if (!shared || shared.size === 0) return;
    const isLegacy = (peer.protocolVersion || 1) < 2;
    const wireProfile = this._buildWireProfileForPeer(peerId, {
      includeJoinedRooms: isLegacy,
      legacySharedRooms: isLegacy ? Array.from(shared) : [],
    });
    if (wireProfile) {
      safeWriteSocket(peer.socket, encodeMessage("profile", wireProfile));
      peer.profileSent = true;
    }
  }

  _consumeRateToken(peer, msgType) {
    const cat = RATE_TYPE_CATEGORY[msgType] || "general";
    const cfg = RATE_LIMIT_CONFIGS[cat] || RATE_LIMIT_CONFIGS.general;
    if (!peer.rateBuckets) peer.rateBuckets = new Map();
    const now = Date.now();
    let bucket = peer.rateBuckets.get(cat);
    if (!bucket) {
      bucket = { tokens: cfg.capacity, lastRefill: now };
      peer.rateBuckets.set(cat, bucket);
    }
    const elapsedSec = Math.max(0, (now - bucket.lastRefill) / 1000);
    bucket.tokens = Math.min(cfg.capacity, bucket.tokens + elapsedSec * cfg.refillPerSec);
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }

    if (!peer.rateWindowStart || now - peer.rateWindowStart > 10000) {
      peer.rateWindowStart = now;
      peer.rateDropCount = 0;
    }
    peer.rateDropCount = (peer.rateDropCount || 0) + 1;
    return false;
  }

  _handleConnection(socket, peerInfo) {
    const peerId = b4a.toString(peerInfo.publicKey, "hex");
    if (this.peers.has(peerId)) {
      try {
        socket.destroy();
      } catch {}
      return;
    }

    const remoteAddr = normalizeIP(
      socket.remoteAddress ||
      socket.rawStream?.remoteAddress ||
      socket._handle?._peername?.address ||
      peerInfo?.remoteIP ||
      null
    );

    const transportAuth = peerInfo?.isDirectTCP
      ? (peerInfo?.isNoiseAuthenticated ? "noise-direct-tcp" : "unauthenticated")
      : "noise-hyperswarm";

    const localNonceHex = crypto.randomBytes(16).toString("hex");
    const peer = {
      id: peerId,
      userId: null,
      nickname: "Conectando…",
      avatar: null,
      banner: null,
      socket,
      decoder: new StringDecoder("utf8"),
      isDirectTCP: Boolean(peerInfo?.isDirectTCP),
      transportAuth,
      remoteAddress: remoteAddr,
      lastPingAck: Date.now(),
      protocolVersion: 1,
      capabilities: [],
      localNonceHex,
      remoteNonceHex: null,
      sharedNonceBuf: null,
      profileSent: false,
      rateBuckets: new Map(),
      rateDropCount: 0,
      rateWindowStart: Date.now(),
    };
    this.peers.set(peerId, peer);
    this._buffers.set(peerId, "");
    if (!this.peerRooms.has(peerId)) {
      this.peerRooms.set(peerId, new Set());
    }

    // Begin private HMAC room intersection handshake before sharing profile or rooms
    safeWriteSocket(socket, encodeMessage("room-hello", {
      nonce: localNonceHex,
      protocolVersion: P2P_PROTOCOL_VERSION,
      capabilities: P2P_CAPABILITIES,
    }));

    socket.on("data", (data) => this._onSocketData(peerId, data));
    socket.on("error", (err) => {
      if (String(err?.message || "").includes("Duplicate connection")) return;
      console.error(`[P2P Socket Error] ${peerId}:`, err.message);
    });
    socket.on("close", () => this._removePeer(peerId, socket));

    this.onPeerJoined?.(peerId, socket);
  }

  _removePeer(peerId, expectedSocket = null) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    if (expectedSocket && peer.socket !== expectedSocket) return;

    this.peers.delete(peerId);
    this._buffers.delete(peerId);
    this.peerRooms.delete(peerId);

    try {
      peer.decoder?.end();
    } catch {}
    try {
      peer.socket?.destroy();
    } catch {}

    this.onPeerLeft?.(peerId);
  }

  async _onSocketData(peerId, chunk) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    peer.lastPingAck = Date.now();
    if (!peer.decoder) peer.decoder = new StringDecoder("utf8");

    const prev = this._buffers.get(peerId) || "";
    const decoded = Buffer.isBuffer(chunk) ? peer.decoder.write(chunk) : String(chunk);
    const combined = prev + decoded;

    // Guard: prevent OOM from a malicious/buggy peer that never terminates messages
    const MAX_BUFFER_SIZE = 50 * 1024 * 1024; // 50MB
    if (combined.length > MAX_BUFFER_SIZE) {
      console.error(`[P2P] Buffer overflow from peer ${peerId} (${combined.length} bytes). Disconnecting.`);
      this._removePeer(peerId);
      return;
    }

    const { messages, remaining } = decodeMessages(combined);
    this._buffers.set(peerId, remaining);

    for (const msg of messages) {
      if (!msg || typeof msg.type !== "string") continue;
      const { type } = msg;

      if (!this._consumeRateToken(peer, type)) {
        if (peer.rateDropCount > 200) {
          console.warn(`[P2P RateLimit] Flood sostenido desde ${peerId} (${type}). Desconectando.`);
          this._removePeer(peerId);
          return;
        }
        continue;
      }

      let { payload } = msg;
      try {
        const { app } = require("electron");
        if (payload && app && typeof app.getPath === "function") {
          const { CasStore } = require("../storage/casStore.cjs");
          payload = CasStore.getInstance(app.getPath("userData")).ingestObject(payload);
        }
      } catch {}

      if (type === "room-hello" && payload && typeof payload.nonce === "string") {
        const remoteHex = payload.nonce.trim().toLowerCase();
        if (!/^[0-9a-f]{32}$/.test(remoteHex)) continue;
        peer.protocolVersion = Math.max(2, Number(payload.protocolVersion) || 2);
        peer.capabilities = Array.isArray(payload.capabilities) ? payload.capabilities : [];
        peer.remoteNonceHex = remoteHex;

        const [first, second] =
          peer.localNonceHex <= remoteHex
            ? [peer.localNonceHex, remoteHex]
            : [remoteHex, peer.localNonceHex];
        peer.sharedNonceBuf = Buffer.from(first + second, "hex");

        const cryptoService = require("../services/cryptoService.cjs");
        const proofs = [];
        for (const room of this.joinedRooms) {
          const proof = cryptoService.computeRoomProof(peer.sharedNonceBuf, room);
          if (proof) proofs.push(proof);
        }
        safeWriteSocket(peer.socket, encodeMessage("room-proofs", { proofs }));
        continue;
      }

      if (type === "room-proofs" && payload && Array.isArray(payload.proofs)) {
        if (!peer.sharedNonceBuf) continue;
        const cryptoService = require("../services/cryptoService.cjs");
        const proofToRoom = new Map();
        for (const room of this.joinedRooms) {
          const proof = cryptoService.computeRoomProof(peer.sharedNonceBuf, room);
          if (proof) proofToRoom.set(proof, room);
        }
        const prevRooms = this.peerRooms.get(peerId) || new Set();
        const nextRooms = new Set();
        const addedRooms = [];
        const removedRooms = [];
        for (const remoteProof of payload.proofs.slice(0, 500)) {
          if (typeof remoteProof !== "string") continue;
          const matchedRoom = proofToRoom.get(remoteProof.trim().toLowerCase());
          if (matchedRoom && !nextRooms.has(matchedRoom)) {
            nextRooms.add(matchedRoom);
            if (!prevRooms.has(matchedRoom)) addedRooms.push(matchedRoom);
          }
        }
        for (const oldRoom of prevRooms) {
          if (!nextRooms.has(oldRoom)) removedRooms.push(oldRoom);
        }
        this.peerRooms.set(peerId, nextRooms);

        if (nextRooms.size > 0 && !peer.profileSent) {
          this._sendProfileToPeer(peerId);
        }

        await this.onMessage?.(peerId, "room-proofs-matched", {
          sharedRooms: Array.from(nextRooms),
          addedRooms,
          removedRooms,
        });
        continue;
      }

      if (type === "profile" && payload) {
        peer.userId = payload.id || peer.userId;
        peer.nickname = payload.nickname || "Anonymous";
        peer.avatar = payload.avatar || null;
        peer.banner = payload.banner || null;
        peer.filePort = payload.filePort || null;
        peer.localIPs = payload.localIPs || [];
        peer.customLink = payload.customLink || "";
        peer.profileColor = payload.profileColor || "";
        peer.customStatus = payload.customStatus || "";
        peer.showRichPresence = payload.showRichPresence ?? true;
        peer.flame = payload.flame || null;
        peer.serverProfiles = payload.serverProfiles || null;
        peer.status = payload.status || "online";
        peer.isPreview = Boolean(payload.isPreview);

        // Legacy v1 (v0.3.6) fallback: intersect locally and never adopt non-joined rooms
        if ((peer.protocolVersion || 1) < 2 && Array.isArray(payload.joinedRooms)) {
          const shared = payload.joinedRooms
            .map((r) => String(r || "").trim().toUpperCase())
            .filter((r) => r && this.joinedRooms.has(r));
          this.peerRooms.set(peerId, new Set(shared));
          if (shared.length > 0 && !peer.profileSent) {
            this._sendProfileToPeer(peerId);
          }
        }
      }

      if (type === "room-announce" && payload && Array.isArray(payload.rooms)) {
        if ((peer.protocolVersion || 1) >= 2) {
          // v2 peers must use HMAC room-proofs instead of plaintext room announcements
          continue;
        }
        const shared = payload.rooms
          .map((r) => String(r || "").trim().toUpperCase())
          .filter((r) => r && this.joinedRooms.has(r));
        this.peerRooms.set(peerId, new Set(shared));
        payload = { ...payload, rooms: shared };
      }

      this.onMessage?.(peerId, type, payload);
    }
  }

  _sendToPeer(peerId, type, payload) {
    const peer = this.peers.get(peerId);
    if (peer?.socket && !peer.socket.destroyed) {
      try {
        safeWriteSocket(peer.socket, encodeMessage(type, payload));
      } catch (err) {
        console.error(`[P2P Send Error] Failed to write to peer ${peerId}:`, err.message);
      }
    }
  }

  _broadcast(type, payload, targetRoomCode) {
    const line = encodeMessage(type, payload);
    const normalizedTarget = targetRoomCode ? String(targetRoomCode).trim().toUpperCase() : null;
    for (const [peerId, peer] of this.peers.entries()) {
      if (peer.socket && !peer.socket.destroyed) {
        if (normalizedTarget) {
          const rooms = this.peerRooms.get(peerId);
          if (!rooms || !rooms.has(normalizedTarget)) {
            continue;
          }
        }
        try {
          safeWriteSocket(peer.socket, line);
        } catch (err) {
          console.error(`[P2P Broadcast Error] Failed to write to peer ${peer.id}:`, err.message);
        }
      }
    }
  }

  _isAlwaysRelayEnabled() {
    return Boolean(this.profile?.general?.alwaysRelayVoice);
  }

  setProfile(profile, fileServerPort) {
    const { joinedRooms: _omitted, localIPs: _omittedIPs, ...safeProfile } = profile || {};
    const hideLocalIPs = Boolean(safeProfile?.general?.alwaysRelayVoice);
    this.profile = {
      ...safeProfile,
      filePort: fileServerPort,
      localIPs: hideLocalIPs ? [] : getLocalIPs(),
    };
    for (const peerId of this.peers.keys()) {
      this._sendProfileToPeer(peerId);
    }
  }

  isVerifiedLan(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) return false;
    const remoteAddr = normalizeIP(peer.remoteAddress);
    if (!remoteAddr) return false;
    if (remoteAddr === "127.0.0.1" || remoteAddr === "localhost") return true;

    // Check if the socket connection was physically established to/from a private IP on the same subnet
    if (isPrivateIP(remoteAddr)) {
      const myIPs = getLocalIPs();
      for (const myIP of myIPs) {
        if (isSameSubnet(myIP, remoteAddr)) {
          return true;
        }
      }
    }
    return false;
  }

  getConnectionType(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) return "Hyperswarm (DHT)";
    
    if (this.isVerifiedLan(peerId)) {
      return "LAN (Direct)";
    }
    if (peer.isDirectTCP) {
      return "Direct (TCP)";
    }
    return "Hyperswarm (DHT)";
  }

  setDirectConfig(config) {
    // Reset connection lock and retry counter so future calls can try again if config changes
    this.directClientConnecting = false;
    this._directRetryCount = 0;
    this.directConfig = config;
    this._updateDirectServer();
    this._tryDirectClientConnection();
  }

  _updateDirectServer() {
    const net = require("net");
    const enabled = this.directConfig?.enabled;
    const isHost = this.directConfig?.isHost;
    const port = this.directConfig?.port || 7777;

    if (enabled && isHost) {
      if (this.directServer) {
        if (this.directServerPort === port) {
          return;
        } else {
          try {
            this.directServer.close();
          } catch {}
          this.directServer = null;
        }
      }

      this.directServerPort = port;
      this.directServer = net.createServer((socket) => {
        this._handleIncomingDirectTCP(socket);
      });

      this.directServer.on("error", (err) => {
        console.error("[P2P Direct TCP Server Error]:", err.message);
      });

      this.directServer.listen(port, "0.0.0.0", () => {
        console.log(`[P2P Direct TCP Server] Escuchando conexiones directas en puerto ${port}`);
      });
    } else {
      if (this.directServer) {
        try {
          this.directServer.close();
        } catch {}
        this.directServer = null;
        console.log("[P2P Direct TCP Server] Servidor de conexiones directas detenido.");
      }
    }
  }

  _tryDirectClientConnection() {
    const enabled = this.directConfig?.enabled;
    const isHost = this.directConfig?.isHost;
    const ip = this.directConfig?.ip;
    const port = this.directConfig?.port || 7777;

    if (this._isAlwaysRelayEnabled()) {
      console.log("[P2P Direct TCP] Omitido porque Always Relay está activo.");
      return;
    }

    if (enabled && !isHost && ip) {
      if (this.directClientConnecting) return;

      const normalizedIp = normalizeIP(ip);
      for (const peer of this.peers.values()) {
        if (
          peer.socket?.remoteAddress === ip ||
          peer.socket?.rawStream?.remoteAddress === ip ||
          peer.remoteAddress === normalizedIp ||
          peer.socket?.address?.()?.address === ip
        ) {
          return;
        }
      }

      this.directClientConnecting = true;
      this._connectDirectTCPClient(ip, port);
    }
  }

  _handleIncomingDirectTCP(rawSocket) {
    if (!this.swarm?.keyPair) {
      console.warn("[P2P Direct TCP] Swarm keyPair no disponible; rechazando conexión entrante.");
      try {
        rawSocket.destroy();
      } catch {}
      return;
    }

    const stream = new SecretStream(false, rawSocket, { keyPair: this.swarm.keyPair });
    let finished = false;

    const failHandshake = (reason) => {
      if (finished) return;
      finished = true;
      clearTimeout(handshakeTimer);
      console.warn(`[P2P Direct TCP] Handshake Noise fallido (${reason}). Destruyendo.`);
      try {
        stream.destroy();
      } catch {}
      try {
        rawSocket.destroy();
      } catch {}
    };

    const handshakeTimer = setTimeout(() => {
      failHandshake("timeout 15s");
    }, 15000);

    const onRawError = (err) => failHandshake(err.message);
    const onStreamError = (err) => failHandshake(err.message);
    const onStreamClose = () => {
      if (!finished) {
        finished = true;
        clearTimeout(handshakeTimer);
      }
    };

    rawSocket.on("error", onRawError);
    stream.on("error", onStreamError);
    stream.on("close", onStreamClose);

    stream.once("open", () => {
      if (finished) return;
      if (!stream.remotePublicKey) {
        failHandshake("missing remotePublicKey");
        return;
      }
      finished = true;
      clearTimeout(handshakeTimer);

      rawSocket.off("error", onRawError);
      rawSocket.on("error", () => {});
      stream.off("error", onStreamError);
      stream.off("close", onStreamClose);

      const peerInfo = {
        publicKey: stream.remotePublicKey,
        isDirectTCP: true,
        isNoiseAuthenticated: true,
        remoteIP: rawSocket.remoteAddress || null,
      };
      this._handleConnection(stream, peerInfo);
    });
  }

  _connectDirectTCPClient(ip, port) {
    if (!this.swarm?.keyPair) {
      this.directClientConnecting = false;
      return;
    }

    const net = require("net");
    console.log(`[P2P Direct TCP] Intentando conexión Noise XX directa a ${ip}:${port}...`);
    const rawSocket = net.createConnection({ host: ip, port });
    const stream = new SecretStream(true, rawSocket, { keyPair: this.swarm.keyPair });
    let finished = false;

    const cleanupPreOpen = () => {
      clearTimeout(handshakeTimer);
      rawSocket.off("error", onError);
      stream.off("error", onError);
      stream.off("close", onCloseBeforeOpen);
    };

    const handshakeTimer = setTimeout(() => {
      console.warn(`[P2P Direct TCP] Handshake Noise timeout (15s) conectando a ${ip}:${port}.`);
      onError(new Error("Direct TCP Noise handshake timeout (15s)"));
    }, 15000);

    const onCloseBeforeOpen = () => {
      if (!finished) {
        onError(new Error("Direct TCP socket closed before Noise handshake completed"));
      }
    };

    const onError = (err) => {
      if (finished) return;
      finished = true;
      cleanupPreOpen();
      console.warn("[P2P Direct TCP Client Connection Failed]:", err.message);
      this.directClientConnecting = false;
      try {
        stream.destroy();
      } catch {}
      try {
        rawSocket.destroy();
      } catch {}

      // Retry with exponential backoff (max 5 attempts, up to 15s delay)
      const retryCount = (this._directRetryCount || 0) + 1;
      if (
        this.directConfig?.enabled &&
        !this.directConfig?.isHost &&
        this.directConfig?.ip &&
        !this._isAlwaysRelayEnabled() &&
        retryCount <= 5
      ) {
        this._directRetryCount = retryCount;
        const delay = Math.min(15000, retryCount * 3000);
        console.log(`[P2P Direct TCP] Reintentando en ${delay}ms (intento ${retryCount}/5)...`);
        setTimeout(() => this._tryDirectClientConnection(), delay);
      } else {
        this._directRetryCount = 0;
        console.warn("[P2P Direct TCP] Máximo de reintentos alcanzado. Conexión directa no disponible.");
      }
    };

    rawSocket.on("error", onError);
    stream.on("error", onError);
    stream.on("close", onCloseBeforeOpen);

    stream.once("open", () => {
      if (finished) return;
      if (!stream.remotePublicKey) {
        onError(new Error("Missing remotePublicKey"));
        return;
      }
      finished = true;
      cleanupPreOpen();
      rawSocket.on("error", () => {});
      this.directClientConnecting = false;
      this._directRetryCount = 0;

      const remoteHex = b4a.toString(stream.remotePublicKey, "hex");
      const peerInfo = {
        publicKey: stream.remotePublicKey,
        isDirectTCP: true,
        isNoiseAuthenticated: true,
        remoteIP: rawSocket.remoteAddress || ip,
      };

      console.log(`[P2P Direct TCP] ¡Conexión directa Noise XX exitosa con host ${remoteHex}!`);
      this._handleConnection(stream, peerInfo);
    });
  }

  async destroy() {
    this.disconnectAllPeers();
    if (this.directServer) {
      try {
        this.directServer.close();
      } catch {}
      this.directServer = null;
    }
    if (this.swarm) {
      await this.swarm.destroy();
      this.swarm = null;
    }
  }
}

module.exports = { P2PService, encodeMessage, decodeMessages, getLocalIPs, isSameSubnet, isPrivateIP, normalizeIP, safeWriteSocket };
