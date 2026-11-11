const Hyperswarm = require("hyperswarm");
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

class P2PService {
  constructor({ onPeerJoined, onPeerLeft, onMessage }) {
    this.swarm = null;
    this.peers = new Map();
    this._buffers = new Map();
    this.localPeerId = null;
    this.profile = null;
    this.roomCode = null;
    this.joinedRooms = new Set();
    this.roomDiscoveries = new Map();
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

  _resolveLocalPeerId() {
    if (this.localPeerId) return this.localPeerId;
    if (this.swarm?.keyPair?.publicKey) {
      this.localPeerId = b4a.toString(this.swarm.keyPair.publicKey, "hex");
    }
    return this.localPeerId;
  }

  async ensureSwarm() {
    if (!this.swarm) {
      this.swarm = new Hyperswarm({ maxPeers: 64 });
      this.swarm.on("connection", (socket, peerInfo) => this._handleConnection(socket, peerInfo));
      this._resolveLocalPeerId();
      try {
        const globalDiscoverTopic = topicFromRoomCode("__ONICORD_GLOBAL_DISCOVER_V1__");
        this.swarm.join(globalDiscoverTopic, { server: true, client: true });
      } catch (e) {
        console.error("[P2P] Error joining global discovery swarm:", e.message);
      }
    }
  }

  async joinRoom(roomCode, options = {}) {
    await this.ensureSwarm();
    const normalized = String(roomCode || "").trim().toUpperCase();
    if (!normalized) return null;

    this.roomCode = normalized;
    if (this.joinedRooms.has(normalized) && this.roomDiscoveries.has(normalized)) {
      return this.roomDiscoveries.get(normalized);
    }

    this.joinedRooms.add(normalized);
    const topic = topicFromRoomCode(normalized);
    const discovery = this.swarm.join(topic, { server: true, client: true });
    this.roomDiscoveries.set(normalized, discovery);

    const waitFlush = Boolean(options?.waitFlush);
    if (waitFlush) {
      await discovery.flushed();
    } else {
      discovery.flushed().catch((err) => {
        console.warn(`[P2P] Background discovery flush warning for ${normalized}:`, err.message);
      });
    }

    // Announce active joined rooms to all connected peers
    this._broadcastJoinedRooms();
    return discovery;
  }

  async leaveRoom(roomCode) {
    const normalized = String(roomCode || "").trim().toUpperCase();
    if (!normalized) return;

    this.joinedRooms.delete(normalized);
    if (this.roomCode === normalized) {
      this.roomCode = this.joinedRooms.size > 0 ? [...this.joinedRooms][0] : null;
    }
    if (this.profile) {
      this.profile.joinedRooms = Array.from(this.joinedRooms);
    }
    this._broadcastJoinedRooms();

    const discovery = this.roomDiscoveries.get(normalized);
    if (discovery) {
      this.roomDiscoveries.delete(normalized);
    }

    if (this.swarm) {
      const topic = topicFromRoomCode(normalized);
      try {
        await this.swarm.leave(topic);
      } catch {}
    }
    // Note: Do NOT delete `normalized` from `this.peerRooms` (which tracks *remote* peers' joined rooms)
    // and do NOT tear down peer sockets, as sockets remain shared for other servers & global discovery.
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
    this.roomCode = null;
  }

  _broadcastJoinedRooms() {
    this._broadcast("room-announce", { rooms: Array.from(this.joinedRooms) });
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

    const peer = {
      id: peerId,
      userId: null,
      nickname: "Conectando…",
      avatar: null,
      socket,
      decoder: new StringDecoder("utf8"),
      isDirectTCP: Boolean(peerInfo?.isDirectTCP),
      remoteAddress: remoteAddr,
    };
    this.peers.set(peerId, peer);
    this._buffers.set(peerId, "");
    if (!this.peerRooms.has(peerId)) {
      this.peerRooms.set(peerId, new Set());
    }

    if (this.profile) {
      safeWriteSocket(socket, encodeMessage("profile", {
        ...this.profile,
        joinedRooms: Array.from(this.joinedRooms),
      }));
    }

    this._broadcastJoinedRooms();

    socket.on("data", (data) => this._onSocketData(peerId, data));
    socket.on("error", (err) => console.error(`[P2P Socket Error] ${peerId}:`, err.message));
    socket.on("close", () => this._removePeer(peerId));

    this.onPeerJoined?.(peerId, socket);
  }

  _removePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    try {
      peer.decoder?.end();
    } catch {}
    try {
      peer.socket?.destroy();
    } catch {}

    this.peers.delete(peerId);
    this._buffers.delete(peerId);
    this.peerRooms.delete(peerId);

    this.onPeerLeft?.(peerId);
  }

  async _onSocketData(peerId, chunk) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
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
      const { type } = msg;
      let { payload } = msg;
      try {
        const { app } = require("electron");
        if (payload && app && typeof app.getPath === "function") {
          const { CasStore } = require("../storage/casStore.cjs");
          payload = CasStore.getInstance(app.getPath("userData")).ingestObject(payload);
        }
      } catch {}

      if (type === "profile" && payload) {
        peer.userId = payload.id || peer.userId;
        peer.nickname = payload.nickname || "Anonymous";
        peer.avatar = payload.avatar || null;
        peer.filePort = payload.filePort || null;
        peer.localIPs = payload.localIPs || [];
        peer.customLink = payload.customLink || "";
        peer.profileColor = payload.profileColor || "";
        peer.customStatus = payload.customStatus || "";
        peer.showRichPresence = payload.showRichPresence ?? true;
        peer.flame = payload.flame || null;
        peer.serverProfiles = payload.serverProfiles || null;
        peer.isPreview = Boolean(payload.isPreview);

        if (Array.isArray(payload.joinedRooms)) {
          this.peerRooms.set(
            peerId,
            new Set(payload.joinedRooms.map((r) => String(r || "").trim().toUpperCase()).filter(Boolean))
          );
        }
      }

      if (type === "room-announce" && payload && Array.isArray(payload.rooms)) {
        this.peerRooms.set(
          peerId,
          new Set(payload.rooms.map((r) => String(r || "").trim().toUpperCase()).filter(Boolean))
        );
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

  setProfile(profile, fileServerPort) {
    this.profile = {
      ...profile,
      filePort: fileServerPort,
      localIPs: getLocalIPs(),
      joinedRooms: Array.from(this.joinedRooms),
    };
    this._broadcast("profile", this.profile);
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

    if (enabled && !isHost && ip) {
      if (this.directClientConnecting) return;

      for (const peer of this.peers.values()) {
        if (peer.socket?.remoteAddress === ip || peer.socket?.address?.()?.address === ip) {
          return;
        }
      }

      this.directClientConnecting = true;
      this._connectDirectTCPClient(ip, port);
    }
  }

  _handleIncomingDirectTCP(socket) {
    let buffer = "";
    const decoder = new StringDecoder("utf8");
    const MAX_BUFFER_SIZE = 50 * 1024 * 1024; // 50MB guard before handshake completion

    const handshakeTimer = setTimeout(() => {
      console.warn("[P2P Direct TCP] Handshake timeout (15s) on incoming socket. Destroying.");
      cleanupHandshake();
      try {
        socket.destroy();
      } catch {}
    }, 15000);

    const cleanupHandshake = () => {
      clearTimeout(handshakeTimer);
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", cleanupHandshake);
    };

    if (this.swarm?.keyPair?.publicKey) {
      const myPubKey = b4a.toString(this.swarm.keyPair.publicKey, "hex");
      safeWriteSocket(socket, JSON.stringify({ type: "direct-handshake", payload: { publicKeyHex: myPubKey } }) + "\n");
    }

    const onData = (chunk) => {
      buffer += Buffer.isBuffer(chunk) ? decoder.write(chunk) : String(chunk);
      if (buffer.length > MAX_BUFFER_SIZE) {
        console.error("[P2P Direct TCP] Handshake buffer overflow (>50MB). Destroying socket.");
        cleanupHandshake();
        try {
          socket.destroy();
        } catch {}
        return;
      }
      const lines = buffer.split("\n");
      const remaining = lines.pop() ?? "";
      buffer = remaining;

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === "direct-handshake" && msg.payload?.publicKeyHex) {
            cleanupHandshake();

            const peerPublicKey = b4a.from(msg.payload.publicKeyHex, "hex");
            const peerInfo = { publicKey: peerPublicKey, isDirectTCP: true };

            this._handleConnection(socket, peerInfo);
            return;
          }
        } catch (e) {
        }
      }
    };

    const onError = (err) => {
      console.error("[P2P Direct TCP Handshake Error]:", err.message);
      cleanupHandshake();
      try {
        socket.destroy();
      } catch {}
    };

    socket.on("data", onData);
    socket.on("error", onError);
    socket.on("close", cleanupHandshake);
  }

  _connectDirectTCPClient(ip, port) {
    const net = require("net");
    console.log(`[P2P Direct TCP] Intentando conexión directa a ${ip}:${port}...`);
    const socket = net.createConnection({ host: ip, port: port });

    let buffer = "";
    const decoder = new StringDecoder("utf8");
    const MAX_BUFFER_SIZE = 50 * 1024 * 1024; // 50MB guard before handshake completion

    const handshakeTimer = setTimeout(() => {
      console.warn(`[P2P Direct TCP] Handshake timeout (15s) connecting to ${ip}:${port}.`);
      onError(new Error("Direct TCP handshake timeout (15s)"));
    }, 15000);

    const cleanupHandshake = () => {
      clearTimeout(handshakeTimer);
      socket.off("data", onData);
      socket.off("error", onError);
    };

    socket.on("connect", () => {
      if (this.swarm?.keyPair?.publicKey) {
        const myPubKey = b4a.toString(this.swarm.keyPair.publicKey, "hex");
        safeWriteSocket(socket, JSON.stringify({ type: "direct-handshake", payload: { publicKeyHex: myPubKey } }) + "\n");
      }
    });

    const onData = (chunk) => {
      buffer += Buffer.isBuffer(chunk) ? decoder.write(chunk) : String(chunk);
      if (buffer.length > MAX_BUFFER_SIZE) {
        console.error("[P2P Direct TCP Client] Handshake buffer overflow (>50MB). Destroying socket.");
        onError(new Error("Direct TCP handshake buffer overflow"));
        return;
      }
      const lines = buffer.split("\n");
      const remaining = lines.pop() ?? "";
      buffer = remaining;

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === "direct-handshake" && msg.payload?.publicKeyHex) {
            cleanupHandshake();
            this.directClientConnecting = false;

            const peerPublicKey = b4a.from(msg.payload.publicKeyHex, "hex");
            const peerInfo = { publicKey: peerPublicKey, isDirectTCP: true };

            console.log(`[P2P Direct TCP] ¡Conexión directa exitosa con host ${msg.payload.publicKeyHex}!`);
            this._handleConnection(socket, peerInfo);
            return;
          }
        } catch (e) {
        }
      }
    };

    const onError = (err) => {
      cleanupHandshake();
      console.warn("[P2P Direct TCP Client Connection Failed]:", err.message);
      this.directClientConnecting = false;
      try {
        socket.destroy();
      } catch {}

      // Retry with exponential backoff (max 5 attempts, up to 15s delay)
      const retryCount = (this._directRetryCount || 0) + 1;
      if (
        this.directConfig?.enabled &&
        !this.directConfig?.isHost &&
        this.directConfig?.ip &&
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

    socket.on("data", onData);
    socket.on("error", onError);
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
