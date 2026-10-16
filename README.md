# Onicord (v0.1.0)

[![Ko-fi](https://img.shields.io/badge/Ko--fi-Buy%20Me%20a%20Coffee-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/oniversedesign)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL%20v3-blue.svg?style=flat-square)](LICENSE)

> **Decentralized, End-to-End Encrypted, P2P Voice, Chat, and Media Platform.**  
> Built on a hybrid serverless architecture (Hyperswarm + WebRTC) for direct peer-to-peer communication between devices without central servers or required router port forwarding.

---

## Architecture and Technological Innovation

Onicord replaces traditional centralized client-server models (like Discord or Teams) with a **federated, decentralized mesh network** controlled directly by its users.

```
                  ┌───────────────────────────────┐
                  │      Global DHT (Holepunch)   │
                  └───────────────┬───────────────┘
                                  │ (Signaling / Hole Punching)
         ┌────────────────────────┴────────────────────────┐
         ▼                                                 ▼
┌──────────────────┐    WebRTC Voice Mesh Channel  ┌──────────────────┐
│  Peer A (Client) │◄─────────────────────────────►│  Peer B (Client) │
│                  │                               │                  │
│  - AES-256-GCM   │    P2P Data Channel (TCP)     │  - AES-256-GCM   │
│  - Local Cache   │◄─────────────────────────────►│  - Local Cache   │
└──────────────────┘                               └──────────────────┘
```

* **Decentralized Mesh Network**: Every room participant acts as both a client and a host node. If a room creator disconnects, active peers maintain room operations and synchronize chat history automatically.
* **DHT and Hole Punching**: Utilizes **Hyperswarm** for peer discovery across global Distributed Hash Tables (DHT). Traverses NAT firewalls transparently via direct TCP/UDP sockets without opening router ports.
* **Bi-Directional State Synchronization**: When two peers connect, they automatically reconcile chat logs, channel structures, shared files, and room metadata based on cryptographic timestamp verification.

---

## Core Features

### Server Management and Customization

* **Custom Roles and Hierarchy**: Fine-grained role permissions, color customization, administrative hierarchy, and role badge rendering in member lists and chat.
* **Audit Logs**: Server event logging recording administrative actions (channel creations, role modifications, bans/kicks, and server settings updates).
* **Animated Icons and Cover Banners**: Support for animated GIF and WebP server icons and header cover banners to personalize server identities.
* **Channel Categories**: Collapsible channel categories to structure text, voice, media, and announcement channels efficiently.
* **Screen Sharing and Video Streaming**: High-quality WebRTC screen broadcasting, window selection, multi-user video feeds, and Picture-in-Picture (PiP) streaming.

### Advanced Chat Experience and Interactions

* **Floating Formatting Bar (WYSIWYG)**: Interactive formatting toolbar appearing upon text selection in chat inputs for quick application of bold, italic, strikethrough, inline code, blockquote, and spoiler tags.
* **Interactive Slash Commands (`/commands`)**: Built-in slash command popover supporting server utilities, polls, dice rolls (`/roll`), and administrative actions.
* **Smart Mentions (`@mentions`)**: Auto-completion popover for `@user`, `@role`, `@everyone`, and `@here` with role badge coloring.
* **Interactive P2P Server Invite Cards**: Cryptographically signed server invite cards shared directly in chat with member count previews and 1-click server joining.

### Network Architecture and Connection Modes

Onicord provides adaptive networking fallback modes to guarantee reliable connectivity across any network environment:

* **Direct LAN**: Automatic zero-latency peer discovery and data exchange within local area networks.
* **Port Forwarding (Direct TCP/UDP)**: Optimized direct socket connections when public IPs and router ports are mapped.
* **DHT Hole Punching (Hyperswarm)**: Automatic NAT traversal across routers using global DHT signaling without manual configuration.
* **TURN / STUN Relay Infrastructure**: Default relay fallback support, plus the ability for users and room owners to configure their own custom, self-hosted STUN and TURN server URLs and credentials directly in network settings for private relay infrastructure.
* **Real-time Diagnostic Panel**: Interactive overlay showing live metrics:
  * **RTT / Latency (Ping)** calculated dynamically via WebRTC `getStats()`.
  * **Audio Packet Loss Rate** and dynamic bandwidth management.
  * Bandwidth optimization disabling remote audio decoding (`track.enabled = false`) when peers mute or deafen.

### End-to-End Encryption (E2EE)

* **AES-256-GCM Cipher**: All text messages, media indexes, and private metadata are encrypted at the source using AES-256-GCM with keys derived from private room credentials.
* **Zero-Knowledge Storage**: Local SQLite/JSON storage stores messages strictly in E2EE format. Decryption occurs strictly in-memory during UI rendering.

### Private Direct Messages (DMs) and Friend Streaks

* **1-on-1 Encrypted DMs**: Direct P2P private text, file transfers, and media streams without server intermediaries.
* **Interaction Streaks System**: Track daily activity streaks with friends and community members, featuring streak counters, status indicators, and activity retention rewards.

### YouTube and SoundCloud Music Player

* **Integrated Room Jukebox**: Stream audio in voice channels directly from YouTube and SoundCloud using embedded `yt-dlp` services.
* **Synchronized Playback**: Real-time playback synchronization (Play, Pause, Queue management) across all connected room peers.
* **Dedicated Music Island Widget**: Control bar with track search, album art previews, and volume controls.

### Modular Addons and Plugin System (`.onimod`)

* **Open Addon Ecosystem**: Create, package, install, and share custom plugins and modules (`.onimod` - Onicord Module Package).
* **Security Sandbox**: Executes custom plugins in an isolated Node.js V8 sandbox (`pluginSandboxService.cjs`) with permission checks to ensure security.
* **Plugin Capabilities**: Extend functionality with custom UI elements, automated utilities, themes, and server bots.
* **Addon Marketplace and Manager**: Built-in management interface in server settings to install, enable, disable, and configure local plugins safely.

### Custom Sticker Packs and Emojis

* **Sticker Pack Manager**: Support for downloadable custom sticker collections (`.opk` package format).
* **Rich Animated Media**: Native rendering of animated WebP, APNG, and custom animated stickers in chat.
* **Picker Popovers**: Integrated emoji and sticker pickers with quick search and category filtering.

### Customizable Theme Engine

* **Dynamic UI Styling**: Tailor the visual interface with customizable theme presets, dark/light modes, CSS custom properties, and background customization.

### Multi-Language System (i18n)

* **Full Localization**: Seamless dual-language support for Spanish and English, switchable dynamically on the fly within the application settings.
* **Automated i18n Auditing**: Integrated script (`node check-i18n.js`) to validate translation completeness across JSX components and locale files.

### Privacy-First Activity Status and Game Scanner

* **Privacy-First Local Scanning**: Game process detection (`gameScanner.cjs`) operates strictly on the user's local machine against an internal dictionary (`games.json`). No personal data, file paths, window titles, or telemetry logs are collected or transmitted to external servers.
* **Native Rich Presence**: Displays real-time game status ("Playing [Game]"), active server name, voice channel state, and music playback directly inside user profiles and member lists within Onicord.
* **Granular Privacy Controls**: Users can toggle activity status broadcasting and process scanning on or off at any time within privacy settings.

### Custom Dashboard Widgets

Onicord features a modular dashboard layout customizable with real-time interactive widgets:

1. **Music Player Widget**: Room audio controls, track queue, and history.
2. **Gaming & Activity Widget**: Game status detection, user activity tracking, and playtime stats.
3. **P2P Diagnostic Widget**: Real-time bandwidth usage, ping graph, packet loss, and active peer count.
4. **Shared Files Widget**: Download history, and storage access.
5. **Hardware Monitor Widget**: CPU, Memory, and Internet performance indicators.
6. **Weather Widget**: Real-time weather forecasts and local climate updates.
7. **Clock Widget**: Server uptime clock, stopwatches, and timezone indicators.

### Native Model Context Protocol (MCP) Server (`onicord-mcp`)

Onicord includes a native **Model Context Protocol (MCP)** server (`mcp-server/`) allowing AI assistants (such as Antigravity IDE or Claude Desktop) to interact with, monitor, and automate the application in real-time:

* **Real-time Diagnostic Inspection (`onicord_get_live_logs`)**: Query in-memory `DiagService` logs instantly with level/category filtering without manual JSON file exports.
* **Remote P2P Peer Log Requests (`onicord_request_peer_logs`)**: Fetch diagnostic logs directly from connected P2P room members over the encrypted network.
* **Live WebRTC Bandwidth & Packet Monitoring (`onicord_get_webrtc_stats`)**: Real-time inspection of incoming/outgoing bitrates (RX/TX kbps), WebRTC audio packet loss, audio energy levels, and transceiver states.
* **Universal Action & Keybinding Controller (`onicord_trigger_action`)**: Remotely dispatch any application shortcut or action (`toggle_mute`, `toggle_deafen`, `toggle_stream`, `disconnect_voice`, `switch_server`, `open_settings`, etc.) directly into Onicord's Keybinding Engine.
* **Zero-Dependency Bridge**: Connects via an isolated, lightweight local HTTP/JSON-RPC bridge (`http://127.0.0.1:42884`) embedded in Electron's main process (`mcpBridgeService.cjs`).

---

## Technology Stack

* **Runtime**: [Electron 33](https://www.electronjs.org/) (Main & Preload processes in CommonJS).
* **Frontend**: [React 18](https://react.dev/) + [Vite 6](https://vite.dev/) + Vanilla CSS.
* **P2P Networking**: [Hyperswarm](https://github.com/holepunchto/hyperswarm) & [simple-peer](https://github.com/feross/simple-peer) (WebRTC).
* **Media Engine**: Native `yt-dlp` integration for audio stream extraction.
* **Cryptography**: Node.js `crypto` module (AES-256-GCM).
* **Internationalization**: `i18next` with full coverage for English and Spanish, validated via `check-i18n.js`.

---

## Installation and Development

### Prerequisites

* **Node.js**: v20 LTS or higher.
* **npm**: v8 or higher.

### Setup Instructions

1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/OniverseDesign/onicord.git
   cd onicord
   npm install
   ```

2. Start the development environment:
   ```bash
   npm run start
   ```
   *Note: `npm run start` launches Vite development server and Electron native window concurrently.*

3. Validate internationalization strings before submitting changes:
   ```bash
   node check-i18n.js
   ```

---

## Packaging and Distribution

To build standalone production executables:

```bash
# Build Windows Installer (NSIS Setup .exe)
npm run pack

# Build Standalone Portable Executable (.exe)
npm run pack:portable

# Export, version, compile and publish release to GitHub
npm run export:github
```

Compiled binaries will be generated inside the `release/` and `project/release/` directories.

---

## Support and Donations

Onicord is an independent, free, and open-source project created by Oniverse. If you enjoy using Onicord and want to support the development of independent digital tools, consider buying me a coffee:

[![Buy Me a Coffee](https://img.shields.io/badge/Ko--fi-Buy%20Me%20a%20Coffee-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/oniversedesign)

