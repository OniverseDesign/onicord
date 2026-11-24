<div align="center">

  <img src="docs/logo.svg" alt="Onicord Logo" width="320" />

  <h1>Onicord — Sovereign P2P Voice, Video &amp; Chat Platform</h1>
  <p>
    <strong>The Open-Source, Serverless Alternative to Discord with Encrypted Mesh Networking.</strong><br/>
    <em>Decentralized, End-to-End Encrypted, P2P Voice, Video, Chat, Screen Sharing &amp; Media Suite.</em>
  </p>

  <p>
    <a href="https://github.com/OniverseDesign/onicord/releases/latest">
      <img src="https://img.shields.io/github/v/release/OniverseDesign/onicord?style=for-the-badge&label=Release&color=cba6f7" alt="Latest Release" />
    </a>
    <a href="https://github.com/OniverseDesign/onicord/releases">
      <img src="https://img.shields.io/github/downloads/OniverseDesign/onicord/total?style=for-the-badge&color=89b4fa&label=Downloads" alt="Total Downloads" />
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
    <a href="#highlights">Features</a> ·
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

* **Serverless P2P Mesh & Headless Node Mode**: Powered by Hyperswarm DHT, WebRTC, and AES-256-GCM encryption backed by SQLite (WAL) and SHA-256 Content-Addressed Storage. Includes **Headless Node Mode ("Modo Nodo")**, freeing Chromium RAM/GPU while keeping your node, swarms, and unread queue active 24/7.
* **Public P2P Discovery (Discover)**: Browse and join decentralized public communities via DHT with tags, categories, and "Knock to Join" approvals—zero central directories.
* **Crystal-Clear Voice, Webcam & 60 FPS Multi-Stream**: Adaptive Opus voice mesh, AFK voice channels, drag-and-drop voice moderation, webcam + screen PiP compositing, multi-stream grid views, and digital loopback echo cancellation (AEC).
* **Synchronized Watch Party, P2P Cinema & Jukebox**: Watch YouTube, web videos, or P2P torrents/magnets in sync with multi-audio/subtitle switching, intelligent voice ducking, and an embedded `yt-dlp` Jukebox.
* **Rich Chat, Forums & Expressive Freedom**: Forum channels, ephemeral self-destructing messages, NSFW (+18) safeguards, per-server profiles, mosaic media galleries, virtualized HiDPI PDF viewer, Rich Presence activity grouping, webhooks, and RSS ingress.
* **Adaptive Themes, Vault Backups & Modular Addons (`.onipkg`)**: Light & Dark adaptive themes with live CSS token syncing to sandboxed plugins, drag-and-drop server folders, encrypted `.onipkg` / `.onibackup` vaults, and Bento Dashboard widgets (including Sketchpad, Diagnostics, and Music).
* **Native MCP Server (`onicord-mcp`)**: Built-in Model Context Protocol server with 10 tools for real-time diagnostics, peer log inspection, WebRTC telemetry, and multi-instance automation.

---

## Documentation

For detailed technical references, explore the guides in [`docs/guides/`](docs/guides):

| Guide | Topics Covered |
| :--- | :--- |
| **[Architecture](docs/guides/architecture.md)** | Hyperswarm DHT, WebRTC mesh, AES-256-GCM, SQLite WAL & CAS, Headless Node Mode |
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
