# Onicord Architecture

Onicord replaces centralized client-server relays with an autonomous, federated peer-to-peer (P2P) mesh network orchestrated directly by user devices.

```
                  +-------------------------------+
                  |      Global DHT (Holepunch)   |
                  +---------------+---------------+
                                  | (Signaling / Hole Punching)
         +------------------------+------------------------+
         v                                                 v
+------------------+    WebRTC Voice Mesh / TURN   +------------------+
|  Peer A (Client) |<----------------------------->|  Peer B (Client) |
| - Ed25519 + TOFU |                               | - Ed25519 + TOFU |
| - [E2EE2] / ECDH |    Noise XX Stream (P2P/TCP)  | - [E2EE2] / ECDH |
| - SQLite + CAS   |<----------------------------->| - SQLite + CAS   |
+------------------+                               +------------------+
```

## Decentralized Mesh Network

- **Serverless Topology**: Every room participant acts as both client and host. If the original room creator goes offline, active peers continue operating the room and synchronize history autonomously.
- **Persistent Node Identity**: A persistent 32-byte Ed25519 cryptographic identity stored in SQLite (`app_config.db`) ensures stable peer identities across restarts, powers Noise XX transport authentication, and minimizes DHT routing churn.
- **DHT Hole Punching with Hyperswarm**: Discovers peers across global Distributed Hash Tables (DHT) using secret-derived 256-bit room topics (`topicFromRoomSecret`) and traverses NAT firewalls transparently without manual port forwarding.
- **Adaptive Connection Engine**: Automatically negotiates the optimal route across Direct LAN (socket-verified), DHT Hole Punching (Hyperswarm Noise XX), authenticated Direct Noise TCP links (`onicord://direct:<IP>:<PORT>/<CODE>#<SECRET>`), or user-configured STUN/TURN relays—including strict **`alwaysRelayVoice`** TURN-only enforcement for WebRTC media.

## Encryption & Local Storage

- **Room End-to-End Encryption (`[E2EE2]:` & Key Epochs)**: Rooms separate the 256-bit DHT routing secret (`roomRoutingSecret`) from rotating per-epoch HKDF-SHA256 encryption keys (`[E2EE2:e<N>]:` stored in each member's local `keyRing`). Owners and authorized Admins can rotate keys manually, and keys rotate automatically when banning a user—keeping prior message history intact for authorized members and letting returning offline peers catch up via signed `room-key-sync` while blocking banned users from future epochs.
- **Single Time-Limited Invites (`CODE#I:<inviteSecret>`)**: Each server maintains one Ed25519-signed `activeInvite` at a time with configurable expiration (`30m`, `1h`, `6h`, `24h`, `7d`, or permanent) and instant revocation. Online room peers advertise a temporary DHT invite topic until `expiresAt` or revocation, validate redemptions against their own clock and ban list, and deliver `roomRoutingSecret` + `keyRing` over the Noise XX stream only when accepted. Legacy `CODE#SECRET` rooms remain supported seamlessly.
- **Strict Pairwise Direct Messages (`[E2EE-DM]:`)**: Direct messages derive per-pair secrets via X25519 ECDH (converted from peers' Ed25519 keys) + HKDF-SHA256 + AES-256-GCM, preventing third-party peers from reading DMs even when both users share a room.
- **Signed Room Governance**: Server metadata, channels, roles, and peer evictions (`evict`) carry canonical JSON Ed25519 signatures validated against the room's `ownerPublicKey` / `adminPublicKeys`.
- **SQLite in WAL Mode**: Core persistence relies on `better-sqlite3` relational databases in Write-Ahead Logging (WAL) mode, with serialized write queues and periodic passive WAL checkpointing.
- **Content-Addressed Storage & Verified Transfers (CAS / Ares)**: Media files and attachments are hashed via SHA-256 (`casHasherWorker.cjs` and streaming hashes). P2P downloads enforce room-membership isolation, write to `.part` temporary files, and verify exact SHA-256 integrity before committing.
- **Atomic Backups**: `.onipkg` and `.onibackup` exports use SQLite's native `db.backup()` API to prevent database corruption during live writes.

## Security & Threat Model

- **IP Address Visibility & Always Relay Mode**: Because Onicord is serverless, P2P data channels and direct WebRTC ICE connections expose your IP address to connected peers. Users needing IP privacy in voice/video calls can configure a TURN server and enable **Always Relay (`alwaysRelayVoice`)** to force WebRTC ICE transport (`iceTransportPolicy: 'relay'`) strictly through the relay. Local LAN IP advertisements are withheld unless Always Relay is off and the remote peer shares a verified LAN socket.
- **First Contact Verification (Safety Numbers & TOFU)**: Both Hyperswarm SecretStreams and Direct TCP sockets perform Noise XX handshakes bound to each peer's Ed25519 public key. Users can verify **Key Fingerprints** and **60-digit Safety Numbers** out-of-band in the Peer Profile or DM Security modal, backed by persistent **Trust On First Use (TOFU)** pinning and key-change warnings.
- **Private Room Intersection & Isolated Discovery**: Public Discover runs inside a dedicated ephemeral `Hyperswarm` instance (`__ONICORD_GLOBAL_DISCOVER_V1__`) completely separate from private room swarms. Connected peers never leak plaintext `joinedRooms`; instead they verify shared rooms via nonced HMAC-SHA256 challenges (`room-hello` / `room-proofs`).
- **Abuse Controls & Electron Hardening**: Incoming P2P channels enforce token-bucket rate limits per traffic category (`sync`, `chat`, `file`, `draw`, `general`), remote diagnostics requests (`diag-request`) require explicit user approval via an interactive consent modal, and the Electron renderer enforces `webSecurity: true`, `allowRunningInsecureContent: false`, strict CSP, and origin-validated `onicord-media://` resource serving.

## Bi-Directional State Synchronization

- **Cryptographic Reconciliation**: When peers connect, they reconcile chat logs, channels, forum threads, roles, bans/kicks, and per-server profiles verified by cryptographic timestamping and Ed25519 governance signatures.
- **P2P Voice & Media Mesh**: Audio, webcam, and screen-sharing streams flow over WebRTC (`simple-peer`) with adaptive Opus bitrates (up to 128 kbps studio quality) and automatic decoding pause when peers mute or deafen.

## Headless Node Mode ("Modo Nodo")

- **Window Close Options**: Users can choose between quitting completely (`quit`), hiding to the system tray (`tray`), or entering Headless Node Mode (`headless`).
- **Zero-Renderer Background Operation**: In Headless Node Mode, closing the window destroys the Chromium `BrowserWindow` (freeing renderer and GPU memory) while keeping the Node.js Main Process running 24/7.
- **Automatic Presence & Unread Queue**: The node leaves active voice calls, pauses local Rich Presence RPC, sets peer status to `invisible`, and buffers incoming encrypted messages in `headlessUnreadQueue` until the UI is reopened.

---

[Back to README](../../README.md)
