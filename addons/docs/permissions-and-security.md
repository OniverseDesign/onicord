# Onicord Addons Permissions and Security

Security architecture, runtime sandbox enforcement, and complete data access permissions matrix for Onicord addons.

---

## 1. Security Architecture

Onicord employs defense-in-depth principles across all addon execution boundaries to protect user data, local systems, and peer privacy.

### 1.1 Least Privilege Enforcement
Addons must declare all required capabilities in `manifest.json`. Any attempt by an addon to access an undeclared API vector throws an explicit permission error and is logged to OniDiag diagnostics.

### 1.2 Zip Slip and Extraction Sanitization
When unpacking `.onipkg` bundles (or downloading addons from the catalog), the extraction engine in `pluginService.cjs` enforces canonical path validation:
- All target paths are normalized.
- Any archive entry attempting directory traversal (such as `../`, `..\`, or absolute system root references) is rejected immediately.
- Files cannot be written outside the addon directory.

### 1.3 Strict Network Protocol Validation
All web targets opened within stage frames, widget iframes, and media players are strictly validated against allowed protocols:
- **Allowed Schemes**: `https:`, `http:` (local proxy only), and `onicord-media:`.
- **Blocked Schemes**: Dangerous pseudo-protocols (`javascript:`, `file:`, `vbscript:`, `data:` in top-level navigations) are blocked.

### 1.4 XSS Sanitization & DOM Safety
Dynamic HTML injected by addons into chat embeds, widgets, and dialogs is sanitized to prevent cross-site scripting (XSS). Custom script execution is confined to sandboxed iframes.

---

## 2. Granular Permissions Reference Table

| Permission in `manifest.json` | Description | Subsystem and Target Data | Compatible Scopes |
| :--- | :--- | :--- | :---: |
| `user.profile` | Read user identity | User nickname, avatar base64, and user ID | All |
| `server.info` | Read server details | Room code, server name, member count | `server`, `hybrid` |
| `audio.state` | Inspect voice status | Active connection state, mute/deafen status, voice peers, channel ID | All |
| `gaming.activity` | Rich Presence & Activity | Sets and reads current game/media activity (`name`, `details`, `state`, `cover`, `type: "game" \| "movie"`) | All |
| `chat.read` | Listen to chat | Slash command listeners and message arguments | `server`, `hybrid` |
| `chat.send` | Send chat messages | Outgoing messages, `[PLUGIN_EMBED]` cards, and `clearPluginMessages` | `server`, `hybrid` |
| `p2p.network` | Decentralized P2P Data | Scoped real-time JSON packet exchange between room peers | `server`, `hybrid` |
| `storage` | Scoped Storage | Isolated persistent JSON key-value store on disk | All |
| `ui.plugin_island` | Sidebar Capsule Card | Registration of Plugin Island cards, heights, and capsule summaries | `server`, `hybrid` |
| `ui.voice_control_button` | Voice Call Buttons | Custom action buttons in the active voice control panel | All |
| `ui.stage_view` | Full-Canvas Stage | Launching web games, media players, confirmation modals, and PiP stages | `server`, `hybrid` |
| `ui.custom_widget` | Custom UI Styling | Setting dynamic container backgrounds (`ui.setBackground`) | All |
| `network.outbound` | Outbound HTTP Requests | External `fetch()` calls to remote REST APIs | All |

---

## 3. Runtime Data Access Matrix

| Permission | Context | Exact API Call / Event | Returned Schema |
| :--- | :--- | :--- | :--- |
| *(Public)* | Iframe Widget | `OnicordWidgetAPI.meta` | `{ roomCode, peerId, widgetId, pluginId, type }` |
| *(Public)* | Iframe Widget | Event: `onicord:widget-ready` | Injected on `window` when API bridge is bound |
| `user.profile` | Sandbox / Widget | `Onicord.user.getProfile()`<br/>`OnicordWidgetAPI.user.getProfile()` | `{ nickname: string, avatar: string, id: string }` |
| `server.info` | Sandbox / Widget | `Onicord.server.getInfo()`<br/>`OnicordWidgetAPI.server.getInfo()` | `{ roomCode: string, serverName: string, memberCount: number }` |
| `audio.state` | Sandbox / Widget | `Onicord.voice.getState()`<br/>`OnicordWidgetAPI.voice.getState()`<br/>`OnicordWidgetAPI.voice.isInVoice()`<br/>`OnicordWidgetAPI.voice.getChannelId()` | `{ isConnected: boolean, isMuted: boolean, isDeaf: boolean, peers: [] }`<br/>`boolean`<br/>`string \| null` |
| *(Audio Ducking)* | Iframe Event | Event: `VOICE_DUCKING` | `event.data: { duckMultiplier: 0.3 - 1.0 }` |
| `gaming.activity` | Sandbox / Widget | `Onicord.gaming.setActivity(act)`<br/>`Onicord.gaming.getActivity()` | Sets `{ name, details, state, cover, type: "game" \| "movie", isCatalog: boolean }` |
| `p2p.network` | Sandbox / Widget | `OnicordWidgetAPI.p2p.broadcast(data)`<br/>`OnicordWidgetAPI.p2p.onMessage(cb)` | Broadcasts and listens for scoped JSON packets |
| `storage` | Sandbox / Widget | `await Onicord.storage.get/set(k, v)` | Scoped JSON value |
| `chat.read` | Sandbox | `Onicord.chat.onCommand(cmd, fn)` | Registers slash command |
| `chat.send` | Sandbox / Widget | `Onicord.chat.sendMessage({ text })`<br/>`OnicordWidgetAPI.chat.send(text)` | Sends chat message |
| `ui.plugin_island` | Sandbox | `Onicord.ui.registerPluginIslandWidget(opts)` | Registers Island sidebar view |
| `ui.stage_view` | Sandbox / Stage | `Onicord.ui.openStageView(opts)`<br/>`window.onicord.confirm(opts)` | Mounts stage canvas |
| `network.outbound`| Sandbox / Widget | `fetch(url, options)` | Standard Promise Response |

---

## 4. Navigation and Cross-References

- [Architecture Overview](architecture.md) - Host isolation and sandboxing models.
- [Scopes and Lifecycle](scopes-and-lifecycle.md) - Scope taxonomy and room binding lifecycles.
- [API Reference](api-reference.md) - Complete documentation of the 14 runtime interaction vectors.
- [Packaging and Publishing](packaging-and-publishing.md) - Compiling `.onipkg` bundles and catalog distribution.

