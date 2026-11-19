# Onicord Architecture

Onicord replaces centralized client-server relays with an autonomous, federated peer-to-peer (P2P) mesh network orchestrated directly by user devices.

```
                  +-------------------------------+
                  |      Global DHT (Holepunch)   |
                  +---------------+---------------+
                                  | (Signaling / Hole Punching)
         +------------------------+------------------------+
         v                                                 v
+------------------+    WebRTC Voice Mesh Channel  +------------------+
|  Peer A (Client) |<----------------------------->|  Peer B (Client) |
|                  |                               |                  |
|  - AES-256-GCM   |    P2P Data Channel (TCP)     |  - AES-256-GCM   |
|  - SQLite + CAS  |<----------------------------->|  - SQLite + CAS  |
+------------------+                               +------------------+
```

## Decentralized Mesh Network

- **Serverless Topology**: Every room participant acts as both client and host. If the original room creator goes offline, active peers continue operating the room and synchronize history autonomously.
- **Persistent Node Identity**: A persistent 32-byte cryptographic seed stored in SQLite (`app_config.db`) ensures stable peer identities across restarts and minimizes DHT routing churn.
- **DHT Hole Punching with Hyperswarm**: Discovers peers across global Distributed Hash Tables (DHT) and traverses NAT firewalls transparently without manual port forwarding.
- **Adaptive Connection Engine**: Automatically negotiates the optimal route across Direct LAN (socket-verified), DHT Hole Punching (Hyperswarm), direct mapped TCP links (`onicord://direct:<IP>:<PORT>/<CODE>`), or user-configured STUN/TURN relays.

## Encryption & Local Storage

- **End-to-End Encryption (E2EE)**: AES-256-GCM ciphers protect all chat messages, file indices, and room metadata. Decryption occurs strictly in-memory.
- **SQLite in WAL Mode**: Core persistence relies on `better-sqlite3` relational databases in Write-Ahead Logging (WAL) mode, with serialized write queues and periodic passive WAL checkpointing.
- **Content-Addressed Storage (CAS)**: Media files and attachments are deduplicated via SHA-256 hashing and off-thread worker hashing (`casHasherWorker.cjs`).
- **Atomic Backups**: `.onipkg` and `.onibackup` exports use SQLite's native `db.backup()` API to prevent database corruption during live writes.

## Bi-Directional State Synchronization

- **Cryptographic Reconciliation**: When peers connect, they reconcile chat logs, channels, forum threads, roles, bans/kicks, and per-server profiles verified by cryptographic timestamping.
- **P2P Voice & Media Mesh**: Audio, webcam, and screen-sharing streams flow over WebRTC (`simple-peer`) with adaptive Opus bitrates (up to 128 kbps studio quality) and automatic decoding pause when peers mute or deafen.

## Headless Node Mode ("Modo Nodo")

- **Window Close Options**: Users can choose between quitting completely (`quit`), hiding to the system tray (`tray`), or entering Headless Node Mode (`headless`).
- **Zero-Renderer Background Operation**: In Headless Node Mode, closing the window destroys the Chromium `BrowserWindow` (freeing renderer and GPU memory) while keeping the Node.js Main Process running 24/7.
- **Automatic Presence & Unread Queue**: The node leaves active voice calls, pauses local Rich Presence RPC, sets peer status to `invisible`, and buffers incoming encrypted messages in `headlessUnreadQueue` until the UI is reopened.

---

[Back to README](../../README.md)
