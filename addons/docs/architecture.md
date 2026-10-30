# Onicord Addons Architecture

Technical overview of the Onicord Addon runtime, execution boundaries, sandboxing models, and communication layers.

---

## 1. Core Principles

Onicord extensions operate through a decentralized, modular, and sandboxed architecture designed around three core principles:

1. **Host Isolation**: Addons must never have direct, unmediated access to the host operating system, Electron main process internals, private application storage, or host file systems.
2. **Deterministic Permissions**: All capabilities (network requests, P2P broadcasting, storage, audio state, Rich Presence activity) require explicit declaration in `manifest.json` and are enforced at the runtime boundary.
3. **Decentralized Execution**: Addons run locally on each peer client without requiring a central coordination server. State synchronization occurs over encrypted peer-to-peer data channels.

---

## 2. Sandboxing Models

The runtime separates execution into distinct isolation tiers based on whether the code performs background logic or visual UI rendering.

```text
+-------------------------------------------------------------------------+
|                           Onicord Host Core                             |
|    (Electron Main Process, IPC Handlers, Hyperswarm P2P, Storage)       |
+-------------------------------------------------------------------------+
       |                                                |
       | Injected Onicord Bridge                        | postMessage Bridge
       v                                                v
+-------------------------------+       +---------------------------------+
|       V8 Isolated VM          |       |      Sandboxed Iframe / Stage   |
|   (pluginSandboxService.cjs)  |       |    (Dashboard, Island, Stage)   |
|                               |       |                                 |
| - Command Handlers (/p, /roll)|       | - sandboxed DOM execution       |
| - Voice button handlers       |       | - window.OnicordWidgetAPI       |
| - No window/document globals  |       | - Restricted CSP (media, http)  |
| - No require("fs"), child_proc|       | - Ad & tracker blocker active   |
+-------------------------------+       +---------------------------------+
```

### 2.1 Background Logic: V8 Isolated VM (`pluginSandboxService.cjs`)
All scripts referenced in `manifest.json: "main"` (typically `index.js`) run within an isolated Node.js `vm` context created per active addon.
- **Restricted Environment**: Standard Node.js modules (`fs`, `child_process`, `net`, `http`, `cluster`, `process`) are completely absent from the sandbox scope.
- **Injected Global**: Background scripts interact exclusively via the frozen `Onicord` global object.
- **Memory & Lifecycle Safety**: When an addon is disabled or unlinked, its VM context and registered command listeners are cleanly dismantled.

### 2.2 Visual UI Containers: Sandboxed Iframes & Stage Views
Interactive user interfaces (Widgets Dashboard widgets, Plugin Island cards, and Addon Stage canvases) run inside Chromium `iframe` elements with strict sandboxing:
- **Sandbox Attribute**: Widgets use `sandbox="allow-scripts allow-same-origin"`.
- **Content Security Policy (CSP)**: Disallows unsafe inline script evaluations, enforces strict protocol access, and permits media playback only through validated schemes (`blob:`, `data:`, `mediastream:`, and proxy streams).
- **Communication Bridge**: Visual frames receive the `window.OnicordWidgetAPI` bridge over `postMessage`, providing event-driven communication with the host application.

---

## 3. Communication and Streaming Layers

### 3.1 Encrypted P2P Network (Hyperswarm + Noise)
Collaborative addons exchange real-time state using Onicord's decentralized P2P transport:
- **Payload Encryption**: End-to-end encrypted across peers using AES-256-GCM.
- **Packet Scoping**: The host automatically scopes every outgoing and incoming packet by `pluginId` and `widgetId`, ensuring one addon can never intercept or pollute packets from another addon in the same room.

### 3.2 Native P2P BitTorrent and Transcoding Engine (`torrentService.cjs`)
For streaming video and cinema addons, Onicord integrates a native BitTorrent client and FFmpeg transcoding service into its local multimedia proxy (`127.0.0.1:42883`):
- **Autonomous Torrent Engine**: Addons stream torrent files or magnet links directly through local HTTP endpoints (`/torrent/:infoHash/:fileIdx`) without needing external third-party software running in the background.
- **On-The-Fly Transcoding**: Non-native video codecs (such as HEVC/H.265) or audio tracks (AC3, E-AC3, DTS) are automatically remuxed and transcoded on the fly to standard H.264/AAC with zero-latency tuning.
- **Probed Metadata & Duration**: Streams expose accurate duration and codec info via `/torrent/:infoHash/:fileIdx/meta` and HTTP headers, allowing video scrubbers and timeline bars to navigate media precisely.

---

## 4. Navigation and Cross-References

- [Scopes and Lifecycle](scopes-and-lifecycle.md) - Understanding addon execution scopes and room bindings.
- [API Reference](api-reference.md) - Complete documentation of the 14 runtime interaction vectors.
- [Permissions and Security](permissions-and-security.md) - Security policies and permission matrix.
- [Packaging and Publishing](packaging-and-publishing.md) - Compiling `.onipkg` bundles and catalog distribution.

