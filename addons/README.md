# Onicord Addons

Official open-source addon registry and developer ecosystem for Onicord.

Onicord Addons are decentralized, sandboxed extensions packaged as `.onipkg` bundles. They allow users and developers to customize their personal Bento Dashboard, add collaborative sidebar tools, run multiplayer games in voice calls, stream movies via watch parties, and automate chat interactions with slash commands.

---

## Official Addon Catalog

The following official addons are bundled with the repository and available in the in-app Addon Store:

| Addon | Scope | Identifier | Version | Description |
| :--- | :---: | :--- | :---: | :--- |
| **Cinema** | `hybrid` | `onicord-cinema` | `0.2.0` | Decentralized Watch Party addon with Stremio v3 protocol, autonomous native P2P torrent engine, on-the-fly FFmpeg transcoding, and server favorites (`/cinema`). |
| **Arcade** | `hybrid` | `onicord-arcade` | `0.2.0` | Voice channel retro and web gaming stage runner with multiplayer room discovery, ad blocking, and customizable game catalog (`/arcade`). |
| **Soundboard** | `hybrid` | `onicord-soundboard` | `0.2.0` | Collaborative soundboard for the Plugin Island sidebar with voice channel scoping, audio uploading, dynamic marquee, and private preview. |
| **Quick Polls** | `server` | `onicord-polls` | `0.2.0` | Interactive real-time polls embedded directly into text channels with live voter tracking (`/p`). |
| **Dices** | `server` | `onicord-dice` | `0.2.0` | Collaborative 3D dice roller for the Plugin Island with real-time P2P physics synchronization (`/roll`). |
| **YouTube Search** | `server` | `onicord-youtube-search` | `0.2.0` | Inline video discovery and search embeds for text channels (`/y`). |
| **Google Search** | `server` | `onicord-google-search` | `0.2.0` | Web search summary cards and link preview embeds for text channels (`/g`). |
| **Demo Widgets Addon** | `hybrid` | `com.oniverse.demo_dashboard_addon` | `0.2.0` | Reference developer template illustrating local Pomodoro timers and collaborative P2P notes. |

---

## User Guide: Installing and Using Addons

### Installing Addons
You can add extensions to your Onicord client through three methods:

1. **In-App Store**: Navigate to **Settings > Addons**, browse the official catalog, and click **Install**.
2. **Import Package**: Open **Settings > Addons**, click **Import .onipkg**, and select an `.onipkg` file from your computer.
3. **Drag and Drop**: Drag any `.onipkg` file directly into the Onicord window.

### Activating Addons in Servers and Rooms
Addon management is decoupled between your client and your servers:
- **Global Library**: Downloaded addons reside in your personal library.
- **Server Activation**: To use an addon in a specific server, open **Server Settings > Addons** and link the desired addon. Linking enables its slash commands, sidebar tools, and voice buttons for all participants in that room.

---

## Developer Documentation

For software engineers, designers, and contributors building extensions for Onicord, consult the specialized guides in the `docs/` directory:

- [Architecture and Sandboxing Overview](docs/architecture.md)
  V8 isolated VM sandbox, sandboxed iframe execution, Hyperswarm P2P networking, and native P2P torrent streaming engine.

- [Scopes and Lifecycle Model](docs/scopes-and-lifecycle.md)
  Classification taxonomy (`server`, `client`, `hybrid`), intelligent auto-detection, and decoupled room binding models.

- [API Reference and Interaction Vectors](docs/api-reference.md)
  Complete technical reference for all 14 interaction vectors across `Onicord` (sandbox) and `OnicordWidgetAPI` (UI frames).

- [Permissions and Security Matrix](docs/permissions-and-security.md)
  Granular permission definitions, runtime data access matrix, Zip Slip prevention, and protocol validation.

- [Packaging and Publishing Guide](docs/packaging-and-publishing.md)
  Directory structure, `manifest.json` schemas, compiling packages with `node build.js`, self-hosting, and submitting to the official catalog.

---

## Compiling Addons (`build.js`)

To validate, package, and generate `.onipkg` bundles for all source addons in this folder:

```bash
node build.js
```

The script verifies manifest schemas, compiles binary packages into `plugins/<addon-id>/package.onipkg`, and updates the central `index.json` catalog.
