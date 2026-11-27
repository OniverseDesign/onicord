<div align="center">

  <img src="docs/logo.svg" alt="Onicord Logo" width="320" />

  <h1>Onicord — Sovereign P2P Voice, Video &amp; Chat Platform</h1>
  <p>
    <strong>The Open-Source, Serverless Alternative to Discord with Encrypted Mesh Networking.</strong><br/>
    <em>Decentralized, End-to-End Encrypted, P2P Voice, Video, Chat, Screen Sharing &amp; Media Suite.</em>
  </p>

  <p>
    <a href="https://github.com/OniverseDesign/onicord/releases/latest">
      <img src="https://flat.badgen.net/github/release/OniverseDesign/onicord?color=cba6f7&label=RELEASE&scale=1.4" alt="Latest Release" />
    </a>
    <a href="https://github.com/OniverseDesign/onicord/releases">
      <img src="https://flat.badgen.net/github/assets-dl/OniverseDesign/onicord?color=89b4fa&label=DOWNLOADS&scale=1.4" alt="Total Downloads" />
    </a>
    <a href="LICENSE">
      <img src="https://img.shields.io/badge/License-AGPL%20v3-74c7ec.svg?style=for-the-badge" alt="License: AGPL-3.0" />
    </a>
    <a href="docs/guides/mcp-server.md">
      <img src="https://img.shields.io/badge/AI-MCP%20Native-a6e3a1.svg?style=for-the-badge" alt="MCP Server" />
    </a>
    <a href="https://ko-fi.com/oniversedesign">
      <img src="https://img.shields.io/badge/Ko--fi-Support-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white" alt="Ko-fi" />
    </a>
  </p>

  <p>
    <a href="https://github.com/OniverseDesign/onicord/releases/latest">
      <img src="https://img.shields.io/badge/Windows-Setup%20&%20Portable%20(.exe)-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Download for Windows" />
    </a>
    <a href="https://github.com/OniverseDesign/onicord/releases/latest">
      <img src="https://img.shields.io/badge/winget-Oniverse.Onicord-0078D6?style=for-the-badge&logo=windows-terminal&logoColor=white" alt="Install with WinGet" />
    </a>
    <a href="https://github.com/OniverseDesign/onicord/releases/latest">
      <img src="https://img.shields.io/badge/Linux-AppImage%20&%20.deb-FCC624?style=for-the-badge&logo=linux&logoColor=black" alt="Download for Linux" />
    </a>
    <a href="https://github.com/OniverseDesign/onicord/releases/latest">
      <img src="https://img.shields.io/badge/macOS-DMG%20&%20Zip-000000?style=for-the-badge&logo=apple&logoColor=white" alt="Download for macOS" />
    </a>
  </p>

  <h4>
    <a href="https://github.com/OniverseDesign/onicord/releases/latest">Download</a> ·
    <a href="docs/guides/architecture.md">Architecture</a> ·
    <a href="docs/guides/features.md">Full Feature Guide</a> ·
    <a href="docs/guides/mcp-server.md">MCP Server</a> ·
    <a href="docs/guides/development.md">Development</a>
  </h4>

  <br/>

  <a href="https://github.com/OniverseDesign/onicord/releases/latest">
    <img src="docs/mockup.png" alt="Onicord Desktop App Showcase" width="95%" style="border-radius: 12px; box-shadow: 0 16px 38px rgba(0,0,0,0.6);" />
  </a>

</div>

---

## Overview

**Onicord** is a sovereign, serverless communication suite built for users who value privacy, audio clarity, and independence. Unlike centralized platforms (such as Discord, Teams, or Slack), Onicord requires **no central accounts, no cloud servers, and no phone numbers**.

All voice, chat, file sharing, screen streaming, torrent cinema, and synchronized music flow directly between participants over encrypted P2P swarms. **There are no paywalls, artificial tier limits, or paid subscriptions**: transfer files of any size, use animated avatars and server banners, install community sticker and custom emoji packs, and broadcast at 60 FPS completely free.

---

## Highlights

* **Serverless P2P Mesh & Headless Node Mode**: Powered by Hyperswarm DHT (Noise XX), authenticated direct Noise TCP, WebRTC, and HKDF/AES-256-GCM encryption (`[E2EE2]:` rooms & X25519 ECDH DMs) backed by SQLite (WAL) and SHA-256 Content-Addressed Storage. Includes **Headless Node Mode ("Modo Nodo")**, freeing Chromium RAM/GPU while keeping your node, swarms, and unread queue active 24/7.
* **Public P2P Discovery (Discover)**: Browse and join decentralized public communities via an isolated DHT swarm with tags, categories, and "Knock to Join" approvals—zero central directories and zero leakage of private room memberships.
* **Crystal-Clear Voice, Webcam & 60 FPS Multi-Stream**: Adaptive Opus voice mesh, AFK voice channels, drag-and-drop voice moderation, webcam + screen PiP compositing, multi-stream grid views, digital loopback echo cancellation (AEC), and an optional **"Always Relay" (TURN-only)** toggle for IP privacy.
* **Synchronized Watch Party, P2P Cinema & Jukebox**: Watch YouTube, web videos, or P2P torrents/magnets in sync with multi-audio/subtitle switching, intelligent voice ducking, and an embedded `yt-dlp` Jukebox.
* **Rich Chat, Forums & Expressive Freedom**: Forum channels, ephemeral self-destructing messages, NSFW (+18) safeguards, per-server profiles, mosaic media galleries, virtualized HiDPI PDF viewer, Rich Presence activity grouping, webhooks, and RSS ingress.
* **Adaptive Themes, Vault Backups & Modular Addons (`.onipkg`)**: Light & Dark adaptive themes with live CSS token syncing to sandboxed plugins, drag-and-drop server folders, encrypted `.onipkg` / `.onibackup` vaults, and Bento Dashboard widgets (including Sketchpad, Diagnostics, and Music).
* **Native MCP Server (`onicord-mcp`)**: Built-in Model Context Protocol server with 10 tools for real-time diagnostics, peer log inspection, WebRTC telemetry, and multi-instance automation.

---

## Privacy, Encryption & Threat Model

Onicord is genuinely serverless: your device connects directly to other peers rather than routing chat or media through a central company server. Understanding that trade-off helps you configure Onicord for your threat model:

* **IP Address Exposure in P2P Calls**: By default, direct P2P data connections and WebRTC calls reveal your IP address to peers you connect with in a room or call (the exact opposite of centralized relays like Discord). If you want to hide your IP during voice/video calls, configure custom STUN/TURN servers and enable **"Always Relay" (`alwaysRelayVoice`)** in **Settings** to force WebRTC ICE candidates strictly through your TURN relay—trading slightly higher latency for IP privacy. Local LAN IP hints are only shared with peers already connected over a verified LAN socket and are suppressed when Always Relay is active.
* **First Contact Verification (Safety Numbers & TOFU)**: Every node uses a persistent Ed25519 cryptographic identity over Noise XX-authenticated transport (`Hyperswarm` SecretStream and Noise-wrapped direct TCP). To detect man-in-the-middle attacks or key changes on first contact, open any user's profile or DM header to inspect their **Key Fingerprint** and **60-digit Safety Number**. Onicord pins peer keys locally (**Trust On First Use / TOFU**) and alerts you immediately if a peer's public key ever changes.
* **Hardened Cryptography & Governance**:
  * **Rooms (`[E2EE2]:` & Rotating Key Epochs)**: Rooms separate their 256-bit DHT routing secret from per-epoch HKDF-SHA256 encryption keys (`keyRing` / `[E2EE2:e<N>]:`), with Ed25519-signed metadata/roles/evictions, manual key rotation, automatic key rotation on ban (blocking banned users from future epochs while keeping returning offline members seamlessly connected), and single time-limited/revocable invites (`CODE#I:<inviteSecret>`).
  * **Direct Messages (`[E2EE-DM]:`)**: DMs are encrypted pairwise using X25519 ECDH (derived from each peer's Ed25519 identity) + HKDF-SHA256 + AES-256-GCM, preventing unrelated peers from decrypting 1-on-1 conversations.
  * **Zero Private-Room Leakage**: Public Discover runs on an isolated ephemeral swarm, and private rooms intersect membership privately via nonced HMAC-SHA256 challenges instead of broadcasting plaintext room lists.
  * **Additional Safeguards**: Token-bucket P2P packet rate limiting, interactive consent modals for remote diagnostic requests, strict room-isolated P2P file transfers with streaming SHA-256 verification, and Chromium `webSecurity: true` with strict Content Security Policy.

---

## Documentation

For detailed technical references, explore the guides in [`docs/guides/`](docs/guides):

| Guide | Topics Covered |
| :--- | :--- |
| **[Architecture](docs/guides/architecture.md)** | Hyperswarm Noise XX mesh, WebRTC + Always Relay, `[E2EE2]:` & ECDH DMs, Safety Numbers/TOFU, Security & Threat Model, SQLite WAL & CAS |
| **[Features Guide](docs/guides/features.md)** | Discover, Watch Party, Torrent Cinema, Forums, Ephemeral Chat, Webhooks, Backups & Plugins |
| **[MCP Server (`onicord-mcp`)](docs/guides/mcp-server.md)** | Multi-instance bridge setup, JSON config, and all 10 AI diagnostic/control tools |
| **[Development & Packaging](docs/guides/development.md)** | Prerequisites, local setup, i18n/theme audit scripts, tech stack, and `electron-builder` targets |

---

## Downloads & Installation

### Quick Install (Windows via WinGet)

```powershell
winget install Oniverse.Onicord
```

### Multi-Platform Installers

Official release assets are available on the [Latest Release Page](https://github.com/OniverseDesign/onicord/releases/latest):

| Platform | Packaging / Format | Architecture | Download |
| :--- | :--- | :--- | :--- |
| **Windows** | Setup Installer (`.exe`) & Portable (`.exe`) | `x64` | [Download Windows](https://github.com/OniverseDesign/onicord/releases/latest) |
| **Linux** | AppImage (`.AppImage`) & Debian (`.deb`) | `x86_64` / `amd64` | [Download Linux](https://github.com/OniverseDesign/onicord/releases/latest) |
| **macOS** | Disk Image (`.dmg`) & Bundle (`.zip`) | Apple Silicon (`arm64`) | [Download macOS](https://github.com/OniverseDesign/onicord/releases/latest) |
| **Verification** | SHA-256 Checksums | All Files | [`SHA256SUMS.txt`](https://github.com/OniverseDesign/onicord/releases/latest/download/SHA256SUMS.txt) |

---

## Ecosystem Repositories

| Repository | Description | Link |
| :--- | :--- | :--- |
| **Onicord Client** | Main desktop application, P2P mesh engine, and native MCP server. | [OniverseDesign/onicord](https://github.com/OniverseDesign/onicord) |
| **Onicord Addons** | Official catalog, SDK documentation, and open-source `.onipkg` plugins. | [OniverseDesign/onicord-addons](https://github.com/OniverseDesign/onicord-addons) |
| **Onicord Stickers** | Official and community sticker packs repository (`.onipkg`). | [OniverseDesign/onicord-stickers](https://github.com/OniverseDesign/onicord-stickers) |
| **Onicord Emojis** | Official and community custom emoji & emote packs repository (`.onipkg`). | [OniverseDesign/onicord-emojis](https://github.com/OniverseDesign/onicord-emojis) |

---

## Support and Community

Onicord is free, open-source software under the **[AGPL-3.0 License](LICENSE)**, crafted with passion by **Oniverse**. If you value decentralized software and want to support independent development:

<div align="center">

[![Buy Me a Coffee](https://img.shields.io/badge/Ko--fi-Buy%20Me%20a%20Coffee-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/oniversedesign)

</div>
