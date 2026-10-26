<div align="center">

  <h1>Onicord Addons</h1>

  <p>
    <strong>Official developer documentation, technical specifications, and open-source addon registry for Onicord.</strong><br/>
    <em>Build, test, and distribute decentralized extensions, Bento Dashboard widgets, and chat slash commands formatted as <code>.onipkg</code> bundles.</em>
  </p>

  <p>
    <a href="https://github.com/OniverseDesign/onicord">
      <img src="https://img.shields.io/badge/App-Onicord-cba6f7?style=for-the-badge&logo=github&logoColor=white" alt="Onicord App" />
    </a>
    <a href="https://github.com/OniverseDesign/onicord-stickers">
      <img src="https://img.shields.io/badge/Ecosystem-Stickers-fab387?style=for-the-badge&logo=github&logoColor=white" alt="Onicord Stickers" />
    </a>
    <a href="https://github.com/OniverseDesign/onicord/blob/main/LICENSE">
      <img src="https://img.shields.io/badge/License-GPL%20v3-74c7ec.svg?style=for-the-badge" alt="License: GPL-3.0" />
    </a>
    <img src="https://img.shields.io/badge/Format-.onipkg-a6e3a1?style=for-the-badge" alt="Format: .onipkg" />
  </p>

  <h4>
    <a href="https://github.com/OniverseDesign/onicord">Main Application</a> ·
    <a href="#1-architecture--sandboxing-overview">Architecture</a> ·
    <a href="#2-addon-scope-classification--lifecycle-model">Scopes</a> ·
    <a href="#3-plugin-interaction-vectors">Vectors</a> ·
    <a href="#4-widgets-dashboard-specification">Dashboard Specs</a> ·
    <a href="#5-unified-granular-permission-system--runtime-data-access-matrix">Permissions Matrix</a> ·
    <a href="#6-addon-creation-structure--compilation-onipkg">Packaging (.onipkg)</a> ·
    <a href="#7-addon-repository-structure--official-packages">Official Packages</a> ·
    <a href="#8-distribution-and-publishing-workflows">Publishing</a> ·
    <a href="index.json">Catalog (index.json)</a>
  </h4>

</div>

---

Welcome to the official developer documentation for Onicord addons, plugins, and Dashboard widgets. This guide details the sandboxing architecture, addon scope classification taxonomy, interaction vectors, Widgets Dashboard specifications, unified permission schemas, and instructions for compiling and packaging addons into `.onipkg` bundles.

---

## 1. Architecture & Sandboxing Overview

Onicord plugins operate through a secure, decentralized architecture:

* **V8 Isolated Sandbox**: System scripts and command handlers run within an isolated Node.js `vm` context (`pluginSandboxService.cjs`). They have no direct access to the host file system or main process except via the injected `Onicord` global object.
* **Widgets Dashboard Widgets**: UI widgets run inside sandboxed `iframe` containers with `sandbox="allow-scripts allow-same-origin"`. They are wrapped inside Onicord's standardized `onicord-widget-shell` container layout and receive the secure `window.OnicordWidgetAPI` context bridge.
* **Voice Channel Stage Views**: Interactive canvases and web apps embedded inside voice calls run in secured webview/iframe instances with integrated ad/tracker blocking, responsive canvas scaling, automatic voice teardown, and native confirmation dialog bridges (`window.onicord.confirm`).
* **Encrypted P2P Network**: Room communications between peers are transmitted via AES-256-GCM encrypted P2P data channels over Hyperswarm.
* **Permission Gatekeeper**: All API endpoints and data access vectors enforce strict permission checks declared in `manifest.json`.

---

## 2. Addon Scope Classification & Lifecycle Model

To ensure clarity for developers and end-users, Onicord employs a strict **Addon Scope Taxonomy**. Every addon explicitly declares its intended scope of execution in `manifest.json`.

### 2.1 Scope Categories

| Scope | Identifier | Visual UI Indicator | Purpose & Target Environment | Typical Capabilities |
| :--- | :---: | :---: | :--- | :--- |
| **Server / Collaborative** | `"server"` | Blue / Sapphire Badge (`groups` icon) | Designed exclusively for P2P servers and shared channels. Requires activation by a server host or administrator in room settings. | Slash commands (`/p`, `/roll`, `/g`), Plugin Island sidebar cards, room-wide P2P broadcasts, chat embeds. |
| **Personal / Dashboard** | `"client"` | Purple / Lavender Badge (`dashboard` icon) | Runs 100% on the user's local device without needing an active room or server. Embeds interactive Bento widgets directly into the home screen. | Pomodoro timers, calculators, quick notes, world clocks, local hardware monitors. |
| **Hybrid** | `"hybrid"` | Amber / Gold Badge (`hub` icon) | Combines personal Bento Dashboard widgets with collaborative server and room tools. | P2P music players, synchronized boards with room export, collaborative note-taking tools. |

### 2.2 Intelligent Scope Detection & Fallbacks
If an existing or legacy addon omits the explicit `"scope"` field in `manifest.json`, the Onicord engine analyzes its capabilities dynamically:
1. If it defines both `dashboardWidgets` AND server permissions (`ui.plugin_island`, `p2p.network`, or chat commands) -> Detected as `"hybrid"`.
2. If it defines chat commands or collaborative permissions (`p2p.network`, `ui.plugin_island`, `chat.send`, `chat.read`) -> Detected as `"server"`.
3. If it only provides `dashboardWidgets` or `ui.custom_widget` -> Detected as `"client"`.
4. Fallback default: `"client"`.

### 2.3 Two-Level Addon Lifecycle Architecture

Onicord completely decouples physical file management from room configuration:

1. **User / Global Level (`AppSettingsModal` > Complementos)**:
   - Central Store: Browse, download, and update addons directly from GitHub.
   - Physical Disk Management: Addon files reside in `<userData>/plugins/`. Deleting an addon here uninstalls its files from the computer.
   - Local Package Imports: Import third-party `.onipkg` archives or package local development folders.
   - Filtering: Filter installed and remote catalog addons by scope (`Todos`, `Servidor`, `Personal`, `Híbrido`).

2. **Server / Room Level (`ServerSettingsModal` > Complementos)**:
   - Pure Room Configurator: Zero network requests to GitHub and instant modal opening.
   - Local Binding: Instantly link or unlink addons already present in the user's local library.
   - Safe Unlinking: Unlinking an addon removes it from `server.plugins` without deleting its physical files from the computer.
   - Room-Specific Preferences: Configure per-room aliases, prefixes, and widget visibility.

---

## 3. Plugin Interaction Vectors

Plugins have 14 primary methods to interact with the application, chat, user interface, Widgets Dashboard, voice rooms, and P2P network, grouped into 4 functional categories:

| Category | Vectors Included | Primary Focus |
| :--- | :--- | :--- |
| **Chat & Slash Commands** | **3.1** Slash Commands · **3.3** Interactive Embeds · **3.4** Action Callbacks · **3.9** Message Purging | Text-based workflows, slash triggers (`/p`, `/roll`, `/g`), and interactive chat cards. |
| **UI Canvases & Mounting** | **3.2** Bento Dashboard · **3.6** Dynamic Plugin Island · **3.10** Voice Stage Display · **3.11** Voice Control Buttons | Embedding visual widgets into home dashboards, the sidebar capsule, voice bar buttons, and full stages. |
| **P2P Network & Persistence** | **3.5** Real-time P2P Data · **3.7** Scoped Local Storage · **3.8** External Network `fetch` | Decentralized peer synchronization, persistent JSON key-value store, and external web APIs. |
| **Voice & Media Runtime** | **3.12** Voice Scoping API · **3.13** Audio Auto-Ducking · **3.14** CSP Media Playback | Call state inspection, peer vocal ducking attenuation, and local audio/video file playback. |

---

### 3.1 Slash Command Registration (`Onicord.chat.onCommand`)
Allows plugins to register custom chat commands (e.g., `/p`, `/y`, `/g`, `/roll`) that users can execute from the chat input.

```javascript
// Register a slash command inside the V8 Sandbox
Onicord.chat.onCommand('p', (args) => {
  const query = args.join(' ');
  console.log('Command executed with args:', query);
});
```

---

### 3.2 Widgets Dashboard Widgets (`dashboardWidgets`)
Plugins can expose local or collaborative P2P widgets that integrate seamlessly into Onicord's Widgets Dashboard.

```json
"dashboardWidgets": [
  {
    "id": "pomodoro_timer",
    "title": "Temporizador Pomodoro",
    "badgeText": "Local",
    "type": "local",
    "bgVariant": "dark",
    "entryPoint": "widgets/pomodoro.html",
    "defaultGeo": { "x": 1, "y": 1, "w": 2, "h": 2 }
  }
]
```

Inside the widget's HTML entry file, access the injected `window.OnicordWidgetAPI`:

```javascript
window.addEventListener("onicord:widget-ready", async () => {
  // Access permitted APIs
  const user = OnicordWidgetAPI.user.getProfile();
  const saved = await OnicordWidgetAPI.storage.get("saved_key");
});
```

---

### 3.3 Chat Messages & Interactive Cards (`[PLUGIN_EMBED]`)
Plugins can publish chat messages under their official addon identity (`isComplement: true`). To render rich interactive cards (polls, search results, dice rolls), use the `[PLUGIN_EMBED]` payload format.

```javascript
const embedPayload = {
  pluginId: 'onicord-polls',
  type: 'poll',
  data: {
    pollId: 'poll_123456',
    question: 'What are we having for dinner?',
    options: [
      { id: 'opt_0', text: 'Pizza', voters: [] },
      { id: 'opt_1', text: 'Tacos', voters: [] }
    ],
    createdAt: Date.now()
  }
};

Onicord.chat.sendMessage({
  text: `[PLUGIN_EMBED]:${JSON.stringify(embedPayload)}`
});
```

---

### 3.4 Real-Time User Interactions (`[PLUGIN_ACTION]`)
Capture user actions on plugin cards (e.g., clicking a poll option or button) and transmit them to all room participants without polluting the visible chat history.

```javascript
window.electronAPI.sendChatMessage(
  roomCode,
  channelId,
  `[PLUGIN_ACTION]:${JSON.stringify({
    pluginId: 'onicord-polls',
    action: 'VOTE',
    targetId: 'poll_123456',
    data: {
      pollId: 'poll_123456',
      optionId: 'opt_0',
      voter: { id: 'user_1', name: 'Alex', avatar: null }
    }
  })}`
);
```

---

### 3.5 Direct P2P Data Broadcasting (`Onicord.p2p` / `OnicordWidgetAPI.p2p`)
For applications and collaborative widgets requiring direct, low-latency peer-to-peer data exchange (real-time whiteboards, shared dice, turn-based games, synchronized state) without sending visible chat messages. Requires the `p2p.network` permission in `manifest.json`.

#### Automatic Scoping & Packet Isolation
All data transmitted through `p2p.broadcast` is automatically scoped with the addon's `pluginId` and `widgetId`. This guarantees that packets from one addon will never interfere with, or be intercepted by, other addons in the same room.

```javascript
// 1. Broadcast any JavaScript object/data to all room peers
window.OnicordWidgetAPI.p2p.broadcast({
  type: 'DICE_ROLL_START',
  authorName: 'Alex',
  rolls: [4, 6],
  total: 10,
  timestamp: Date.now()
});

// 2. Listen for incoming P2P packets from peers in the room
const unsubscribe = window.OnicordWidgetAPI.p2p.onMessage((data, senderPeerId) => {
  if (data?.type === 'DICE_ROLL_START') {
    renderRollAnimation(data.rolls, data.authorName);
  }
});
```

#### The Decentralized Initial State Handshake Pattern
Because `storage` is isolated per user and per profile on their local devices, a peer who opens a room or widget for the first time starts with an empty local store. To achieve immediate real-time synchronization with active room members, all collaborative widgets should implement the standard **Request-Response Handshake Pattern**:

```javascript
// A. When widget initializes, request the current room state
function requestRoomState() {
  window.OnicordWidgetAPI?.p2p?.broadcast({
    type: 'ROOM_STATE_REQUEST'
  });
}

// B. In the onMessage listener:
window.OnicordWidgetAPI.p2p.onMessage((data, senderPeerId) => {
  if (data.type === 'ROOM_STATE_REQUEST') {
    // If we have active configured state, respond to the room
    if (state.configured) {
      window.OnicordWidgetAPI.p2p.broadcast({
        type: 'ROOM_STATE_RESPONSE',
        state: state
      });
    }
  } else if (data.type === 'ROOM_STATE_RESPONSE') {
    // Merge or adopt remote state into local widget
    applyRemoteState(data.state);
  }
});

// Request state immediately on startup and retry after 1s if still waiting
requestRoomState();
setTimeout(requestRoomState, 1000);
```

---

### 3.6 Plugin Island Widgets (`Onicord.ui.registerPluginIslandWidget`)
The **Plugin Island** is Onicord's dedicated sidebar area situated on the right side of room channels (above the members list). It provides a persistent, interactive canvas for collaborative widgets, tools, and mini-games.

#### Registering an Island Widget in `index.js`:
```javascript
if (typeof Onicord !== "undefined" && Onicord.ui?.registerPluginIslandWidget) {
  Onicord.ui.registerPluginIslandWidget({
    id: "dice-island-widget",              // Unique widget identifier
    title: "Dados",                        // Human-readable title
    entryPoint: "widgets/dice_island.html",// HTML entry point inside addon directory
    height: 275                            // Target height in pixels (default 255-280px)
  });
}
```

#### Native Island Shell Features:
- **Sandboxed Execution**: Runs in an isolated `iframe` with `sandbox="allow-scripts allow-same-origin"`.
- **Dynamic Capsule Mode (56px Pill)**:
  - **Initial Collapsed State**: Upon entering any room or server, the Island initiates in compact 56px Capsule Mode by default to preserve maximum vertical space for the room members list.
  - **Auto-Contraction Timer**: When expanded, it automatically contracts back to the 56px capsule banner after **2 minutes of inactivity**.
  - **Capsule Layout**: Features the addon's circular avatar on the left, the addon name with Onicord's official `smart_toy` addon icon (matching chat and room commands) and timestamp on the top line, and a live text summary of the latest room update on the bottom line (e.g. `Oniverse lanzó d6 -> 6`).
  - **Zero Emojis**: Official and third-party addons must strictly avoid emojis in status text or summaries, using clean typography and Material Icons instead.
- **Hover to Peek**: Hovering over the capsule temporarily expands it to full height (`275px`) for quick inspection. Moving the mouse away without clicking collapses it back down smoothly.
- **Click to Pin (2-minute timer)**: Clicking anywhere on the capsule pins it in full expanded mode. Every user interaction or dice roll resets the 2-minute countdown timer.
- **Event-Driven Auto-Expansion & Smart Addon Switching**: Whenever any room peer broadcasts an event or updates state on an addon:
  - If multiple addons are installed and an update belongs to an inactive addon (e.g., Addon #2 while currently viewing Addon #1), the Island automatically switches to that addon in the carousel.
  - The capsule immediately updates its icon, title, timestamp, and summary.
  - The Island springs open to full size so all members witness the action in real-time, restarting the 2-minute timer.
- **Persistent Multi-Addon State**: All active island addons remain mounted in the background (using CSS visibility switching), preserving their internal state, timers, and P2P network listeners without reloading when switching between carousel items.
- **Automatic Carousel Navigation**: If a user has multiple island addons active, the Onicord host container automatically renders smooth pagination controls (chevron arrows and dot indicators) at the bottom.

#### Communicating Updates to the Island Capsule:
Addons can update the status text displayed in the 56px capsule and trigger the Island to automatically spring open using two generic mechanisms:

1. **Direct Bridge Call (`window.OnicordWidgetAPI.island.setSummary`)**:
   ```javascript
   // Set or update the status description shown in the capsule (strictly zero emojis)
   window.OnicordWidgetAPI.island.setSummary("Alex tiró una carta especial");
   ```

2. **P2P Broadcast Field (`data.summary` or `data.description`)**:
   When broadcasting room events via `window.OnicordWidgetAPI.p2p.broadcast`, include a `summary` or `description` property:
   ```javascript
   window.OnicordWidgetAPI.p2p.broadcast({
     type: "GAME_ACTION",
     summary: "Alex avanzó 3 casillas", // Intercepted automatically by Onicord Island
     timestamp: Date.now()
   });
   ```
   Whenever the `PluginIsland` container intercepts a P2P packet with a `summary` or `description` property (locally or from a remote peer), it automatically:
   - Updates the capsule's bottom status line text.
   - Updates the timestamp in the capsule header.
   - Automatically expands and pins the island for **2 minutes** so all room participants see the activity live.

- **Visual Design Guidelines**:
  - Use `background: transparent;` on the `body` so the island container theme shines through.
  - Do not use background containers darker than Onicord's island surface (`--bg-island` / `#16161c`).
  - Use system typography (`font-family: "Roboto", system-ui, sans-serif;`).
  - Rounded squircle buttons/containers (`border-radius: 16px - 20px;`) and smooth micro-animations.

---

### 3.7 Persistent Local Storage (`Onicord.storage` / `OnicordWidgetAPI.storage`)
Store and retrieve persistent key-value JSON data scoped to the plugin. Requires the `storage` permission in `manifest.json`.

```javascript
// Save data to plugin storage
await OnicordWidgetAPI.storage.set("settings_key", { theme: "dark" });

// Load data from plugin storage
const data = await OnicordWidgetAPI.storage.get("settings_key");
```

---

### 3.8 External Network Requests (`fetch`)
Perform HTTP requests to external REST APIs. Requires the `network.outbound` permission in `manifest.json`.

```javascript
fetch('https://api.example.com/data')
  .then((res) => res.json())
  .then((data) => {
    console.log('API Response received:', data);
  })
  .catch((err) => console.error('Network error:', err));
```

---

### 3.9 Purging Plugin Messages (`Onicord.chat.clearPluginMessages`)
Allows a plugin to programmatically purge or clear its previously sent messages in the current room.

```javascript
Onicord.chat.clearPluginMessages();
```

---

### 3.10 Voice Channel Addon Stage Display (`Onicord.ui.openStageView` / `closeStageView`)
The **Addon Stage** provides a full-canvas interactive presentation, gaming, and application environment embedded directly within voice channels. It is designed for interactive web applications, multiplayer games, collaborative workspaces, and presentations that require high visual real estate while talking with peers. Requires the `ui.stage_view` (or `ui.custom_widget`) permission in `manifest.json`.

#### Opening a Stage from a Slash Command or Sandbox Script:
```javascript
Onicord.chat.onCommand('mycommand', (args) => {
  Onicord.ui.openStageView({
    id: "my-app-stage",
    title: "My Application",
    badge: "Web App",
    entryPoint: "widgets/launcher.html", // Relative path inside addon directory
    url: "https://example.com/app",       // Optional external HTTPS web app or game URL
    isFloating: false,                    // true to start in Picture-in-Picture mode
    frameScripts: [                       // Injected client scripts
      "console.log('Stage initialized');"
    ],
    shareCapture: {                       // Capture room/lobby codes to invite chat peers
      queryParam: "room"
    }
  });
});
```

#### Native Stage Features & Sandboxing Capabilities:
- **Sandboxed Execution**: External web content runs in an isolated webview/iframe environment restricted to safe network protocols (`https:`, `onicord-media:`).
- **Built-in Ad & Tracker Blocker**: Automatically shields users from malicious popups, redirects, and intrusive ad networks without requiring external browser extensions.
- **Voice Lifecycle Synchronization**: When a user leaves or is disconnected from the voice channel, Onicord automatically terminates the active stage session and releases system resources.
- **Native Confirmation Bridge (`window.onicord.confirm`)**: Embedded web apps and stage widgets can trigger Onicord's native modal confirmation dialogs asynchronously without relying on ugly browser popups:
  ```javascript
  const confirmed = await window.onicord.confirm({
    title: "¿Limpiar datos de navegación?",
    message: "Esta acción borrará las cookies, caché y partidas guardadas en el almacenamiento local.",
    confirmText: "Borrar datos",
    cancelText: "Cancelar",
    isDestructive: true
  });
  if (confirmed) {
    localStorage.clear();
    sessionStorage.clear();
  }
  ```
- **Integrated Floating Controls**: Features one-click Fullscreen toggle, isolated browsing data cleanup dialog, and exit controls.
- **Automatic User Identity**: Automatically injects `window._onicordUserNick` into the stage frame, allowing web apps to seamlessly synchronize player profiles.

#### Programmatically Closing a Stage:
```javascript
Onicord.ui.closeStageView();
```

---

### 3.11 Voice Channel Control Buttons (`Onicord.ui.registerVoiceControlButton`)
Addons can inject custom interactive buttons directly into Onicord's voice control panel (next to mute, deafen, and screen share controls in `UserPanel`). This allows users inside voice rooms to trigger addon actions, open stage canvases, or toggle features with a single click. Requires the `ui.voice_control_button` permission in `manifest.json`.

#### Programmatic Registration in `index.js`:
```javascript
if (typeof Onicord !== "undefined" && Onicord.ui?.registerVoiceControlButton) {
  Onicord.ui.registerVoiceControlButton({
    id: "arcade_joystick",
    icon: "sports_esports",                 // Material symbol icon name or path to PNG/SVG asset
    tooltip: "Arcade (Catálogo de Juegos)", // Hover tooltip
    action: "TOGGLE_ARCADE_STAGE",
    onClick: () => {
      openArcadeLauncher();
    }
  });
}
```

#### Declarative Registration in `manifest.json`:
Buttons can also be statically declared in `manifest.json`:
```json
"voiceControlButtons": [
  {
    "id": "arcade_joystick",
    "icon": "sports_esports",
    "tooltip": "Arcade (Catálogo de Juegos)",
    "action": "TOGGLE_ARCADE_STAGE"
  }
]
```

---

### 3.12 Voice Channel State & Scoping API (`OnicordWidgetAPI.voice`)
Addons and widgets can inspect the user's active voice connection state and receive real-time updates when the user connects, disconnects, or switches voice channels. This allows collaborative addons (such as soundboards, push-to-talk audio tools, or call mini-games) to scope audio playback and P2P actions strictly to participants in the same voice call, while offering private local preview mode when disconnected from voice.

#### Synchronous Inspection Methods:
- `window.OnicordWidgetAPI.voice.isInVoice()`: Returns a `boolean` indicating whether the user is actively connected to a voice channel.
- `window.OnicordWidgetAPI.voice.getChannelId()`: Returns the unique channel ID (`string | null`) of the active voice channel.
- `window.OnicordWidgetAPI.voice.getChannelName()`: Returns the display name (`string | null`) of the active voice channel.

```javascript
// Check if user is in voice before broadcasting audio
const inVoice = window.OnicordWidgetAPI?.voice?.isInVoice?.();
const channelId = window.OnicordWidgetAPI?.voice?.getChannelId?.();

if (inVoice && channelId) {
  // Broadcast to peers in the same voice channel
  window.OnicordWidgetAPI.p2p.broadcast({
    type: "PLAY_SOUND",
    soundId: "airhorn",
    voiceChannelId: channelId
  });
} else {
  // Play locally in private preview mode (no broadcast)
  playLocally("airhorn");
}
```

#### Reactive `ONICORD_VOICE_STATE` Event (`postMessage`):
The parent Onicord window automatically emits an `ONICORD_VOICE_STATE` message to all widget iframes whenever the user joins, leaves, or transitions between voice channels:

```javascript
window.addEventListener("message", (event) => {
  if (event.data?.type === "ONICORD_VOICE_STATE") {
    const { inVoice, channelId } = event.data;
    console.log("Voice state changed:", { inVoice, channelId });
    updateUIForVoiceState(inVoice, channelId);
  }
});
```

---

### 3.13 Voice Auto-Ducking System (`VOICE_DUCKING`)
When members speak inside an active voice channel, Onicord notifies all running widget frames with a `VOICE_DUCKING` event so background media, music players, or soundboard widgets can automatically duck their audio volume, ensuring vocal clarity during calls:

```javascript
window.addEventListener("message", (event) => {
  if (event.data?.type === "VOICE_DUCKING") {
    // duckMultiplier ranges from 0.3 (attenuated when peers speak) to 1.0 (normal)
    const multiplier = event.data.duckMultiplier ?? 1.0;
    activeAudioElement.volume = userConfiguredVolume * multiplier;
  }
});
```

---

### 3.14 Local Media Playback & Content Security Policy (`media-src`)
Onicord's Electron runtime enforces a strict Content Security Policy (CSP). The `media-src` directive explicitly permits:
- `blob:` URLs generated via `URL.createObjectURL(blob)` (ideal for fast in-memory playback of user-imported files).
- `data:` URIs (Base64-encoded audio/video data like `data:audio/ogg;base64,...`).
- `mediastream:` for real-time WebRTC audio and video streams.

This enables audio and video widgets to load and play user-selected media directly without CSP rejections:

```javascript
// Instant Blob playback from user file input
const blobUrl = URL.createObjectURL(file);
const audio = new Audio(blobUrl);
audio.play();
```

---

## 4. Widgets Dashboard Specification

Dashboard widgets extend Onicord's main grid layout. All dashboard widgets are automatically formatted within Onicord's standardized design system.

### 4.1 Layout & Visual Container Standard (`onicord-widget-shell`)
Every plugin widget is rendered inside the official shell container:

* **Container Query Units**: Root element uses `containerType: "inline-size"`. Font sizing uses `clamp(0.6rem, 3.5cqi, 0.8rem)` to dynamically scale with card resizing.
* **Standard Header**: Displays the widget title and dynamic category badge (`onicord-widget-badge-dynamic`).
* **Color Variants (`bgVariant`)**: Supports official palette themes (`dark`, `sapphire`, `sky`, `teal`, `lavender`, `mauve`, `pink`, `peach`, `yellow`, `success`, `danger`).
* **Dynamic Blurred Image Backgrounds (`ui.setBackground`)**: Widgets can set cover art or background images that leverage Onicord's `backdrop-blur-md` rendering engine.

```javascript
// Apply dynamic blurred image background (e.g. music cover or game background)
OnicordWidgetAPI.ui.setBackground({
  type: "image",
  value: "https://example.com/cover.jpg"
});
```

---

## 5. Unified Granular Permission System & Runtime Data Access Matrix

Every plugin, widget, and background script must explicitly declare its required permissions in `manifest.json`. The application gatekeeper blocks any API call for ungranted permissions.

To accelerate development and provide an instant reference, the matrix below details all runtime access vectors, required permissions, exact method signatures, returned data schemas, and compatible addon scopes.

### 5.1 Runtime Data Access Cheat Sheet

| Permission in `manifest.json` | Execution Context | Exact API Method / Event | Data Structure / Return Value | Scope |
| :--- | :--- | :--- | :--- | :---: |
| *(None / Public)* | Iframe Widget | `OnicordWidgetAPI.meta` | `{ roomCode, peerId, widgetId, pluginId, type }` | All |
| *(None / Public)* | Iframe Widget | Event: `onicord:widget-ready` | Injected on `window` when iframe API is bound | All |
| `user.profile` | Sandbox (V8)<br/>Iframe Widget | `Onicord.user.getProfile()`<br/>`OnicordWidgetAPI.user.getProfile()` | `{ nickname: string, avatar: string, id: string }` | All |
| `server.info` | Sandbox (V8)<br/>Iframe Widget | `Onicord.server.getInfo()`<br/>`OnicordWidgetAPI.server.getInfo()` | `{ roomCode: string, serverName: string, memberCount: number }` | `server`<br/>`hybrid` |
| `audio.state` | Sandbox (V8)<br/>Iframe Widget<br/>Iframe Methods<br/>Iframe Event | `Onicord.voice.getState()`<br/>`OnicordWidgetAPI.voice.getState()`<br/>`OnicordWidgetAPI.voice.isInVoice()`<br/>`OnicordWidgetAPI.voice.getChannelId()`<br/>`OnicordWidgetAPI.voice.getChannelName()`<br/>Event: `ONICORD_VOICE_STATE` | `{ isConnected, isMuted, isDeaf, peers: [] }`<br/>`{ isConnected, isMuted, isDeaf, peers: [] }`<br/>`boolean`<br/>`string \| null`<br/>`string \| null`<br/>`event.data: { inVoice, channelId, channelName, ... }` | All |
| *(Audio Ducking)* | Iframe Event | Event: `VOICE_DUCKING` | `event.data: { duckMultiplier: 0.3 - 1.0 }` | All |
| `gaming.activity` | Sandbox (V8)<br/>Iframe Widget | `Onicord.gaming.getActivity()`<br/>`OnicordWidgetAPI.gaming.getActivity()`<br/>`Onicord.gaming.setActivity(data)` | `{ name: string, startTime: number, cover: string }` | All |
| `p2p.network` | Sandbox (V8)<br/>Iframe Widget | `Onicord.p2p.broadcast(data)`<br/>`OnicordWidgetAPI.p2p.broadcast(data)`<br/>`OnicordWidgetAPI.p2p.onMessage(callback)` | Sends & receives isolated JSON packets to room peers.<br/>Listener signature: `(data, senderPeerId) => void` | `server`<br/>`hybrid` |
| `storage` | Sandbox (V8)<br/>Iframe Widget | `await Onicord.storage.get/set(key, val)`<br/>`await OnicordWidgetAPI.storage.get/set(key, val)` | Scoped persistent key-value store (returns string or JSON object) | All |
| `chat.read` | Sandbox (V8) | `Onicord.chat.onCommand(command, handler)` | Registers chat `/command` listener with arguments | `server`<br/>`hybrid` |
| `chat.send` | Sandbox (V8)<br/>Iframe Widget | `Onicord.chat.sendMessage({ text, embed })`<br/>`Onicord.chat.clearPluginMessages()`<br/>`OnicordWidgetAPI.chat.send(text)` | Publishes `[PLUGIN_EMBED]`, action triggers, or raw text into chat | `server`<br/>`hybrid` |
| `ui.plugin_island` | Sandbox (V8)<br/>Iframe Widget | `Onicord.ui.registerPluginIslandWidget(opts)`<br/>`OnicordWidgetAPI.island.setSummary(text)`<br/>P2P Broadcast: `data.summary` | Registers Island card; updates 56px capsule status line and springs island open | `server`<br/>`hybrid` |
| `ui.voice_control_button` | Sandbox / Manifest | `Onicord.ui.registerVoiceControlButton(opts)`<br/>`manifest.json: "voiceControlButtons"` | Registers interactive action buttons in the active voice call bar | All |
| `ui.stage_view` | Sandbox (V8)<br/>Stage Frame | `Onicord.ui.openStageView(opts)`<br/>`Onicord.ui.closeStageView()`<br/>`await window.onicord.confirm(opts)`<br/>`window._onicordUserNick` | Opens full-canvas stage app; triggers native confirmation modal dialogs | `server`<br/>`hybrid` |
| `ui.custom_widget` | Iframe Widget | `OnicordWidgetAPI.ui.setBackground(bgData)`<br/>`OnicordWidgetAPI.ui.clearBackground()` | Applies dynamic blurred cover backgrounds or custom themes | All |
| `network.outbound` | Sandbox / Iframe | `fetch(url, options)` | Standard HTTP/HTTPS REST network requests | All |

---

### 5.2 Declarative Permission Reference Table

| Permission | Description | Target Subsystem & Access Vector |
| :--- | :--- | :--- |
| `user.profile` | Access local user profile | User nickname, avatar base64, ID |
| `server.info` | Access active room information | Room code, server name, member count |
| `audio.state` | Access voice channel status | Connection state, mute/deaf, voice peers, channel scoping |
| `gaming.activity` | Access Rich Presence game activity | Active game name, start time, cover art |
| `chat.read` | Read incoming chat messages | Messages and slash command triggers |
| `chat.send` | Send and purge chat messages | Addon messages and interactive embeds |
| `p2p.network` | Real-time P2P data channel | Direct data packet broadcasting between room peers |
| `storage` | Persistent storage | Local JSON key-value storage per addon |
| `ui.plugin_island` | Sidebar widgets | Plugin Island right-panel cards & capsule summaries |
| `ui.voice_control_button` | Voice control action buttons | Custom action buttons in the active voice call bar |
| `ui.stage_view` | Voice Channel Stage Display | Full-canvas interactive stage inside voice channels |
| `ui.custom_widget` | Custom UI controls | Custom buttons, panels, and dynamic container backgrounds |
| `network.outbound` | Outbound HTTP requests | External `fetch()` calls to web APIs |

---

## 6. Addon Creation, Structure & Compilation (`.onipkg`)

> **Development Model**: Addon source code (JavaScript, HTML, CSS, JSON) is authored externally in a code editor or IDE. However, once your addon folder is prepared with its `manifest.json`, Onicord allows you to package it into a `.onipkg` bundle directly from inside the desktop app (**Settings > Addons > Package addon folder**) or via the command-line compiler script (`node build.js`).

### 6.1 Directory Structure
Create a directory inside `addons/` matching your plugin ID:

```text
my-addon/
├── manifest.json
├── index.js
├── widgets/
│   ├── pomodoro.html
│   └── p2p_notes.html
└── assets/
    └── icon.png
```

### 6.2 Complete `manifest.json` Schema & Example

```json
{
  "id": "com.oniverse.demo_dashboard_addon",
  "name": "Demo Widgets Addon",
  "version": "0.1.0",
  "scope": "hybrid",
  "author": "Oniverse Team",
  "description": "Custom dashboard widgets and slash commands",
  "main": "index.js",
  "icon": "assets/icon.png",
  "permissions": [
    "user.profile",
    "server.info",
    "audio.state",
    "gaming.activity",
    "storage",
    "p2p.network",
    "chat.read",
    "chat.send"
  ],
  "dashboardWidgets": [
    {
      "id": "pomodoro_timer",
      "title": "Temporizador Pomodoro",
      "badgeText": "Local",
      "type": "local",
      "bgVariant": "dark",
      "entryPoint": "widgets/pomodoro.html",
      "defaultGeo": { "x": 1, "y": 1, "w": 2, "h": 2 }
    },
    {
      "id": "squad_notes",
      "title": "Notas de la Sala P2P",
      "badgeText": "P2P Live",
      "type": "collaborative",
      "bgVariant": "sapphire",
      "entryPoint": "widgets/p2p_notes.html",
      "defaultGeo": { "x": 3, "y": 1, "w": 2, "h": 2 }
    }
  ]
}
```

---

### 6.3 Complete Widget HTML Example (`widgets/pomodoro.html`)

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body {
      background: transparent;
      color: #cdd6f4;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 10px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      height: 100vh;
    }
    .timer-display {
      font-size: 32px;
      font-weight: 800;
      font-family: monospace;
      color: #89b4fa;
      margin: 10px 0;
    }
    .btn {
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.15);
      padding: 6px 14px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div id="userInfo" style="font-size: 11px; opacity: 0.8;">Focus Time</div>
  <div class="timer-display" id="display">25:00</div>
  <button class="btn" id="toggleBtn">Iniciar</button>

  <script>
    let time = 1500;
    let timerId = null;

    window.addEventListener("onicord:widget-ready", async () => {
      // Access user profile (requires user.profile permission)
      const user = OnicordWidgetAPI.user.getProfile();
      if (user && user.nickname) {
        document.getElementById("userInfo").textContent = `Focus for ${user.nickname}`;
      }

      // Access storage (requires storage permission)
      const savedTime = await OnicordWidgetAPI.storage.get("pomodoro_time");
      if (savedTime) {
        time = parseInt(savedTime, 10);
        updateDisplay();
      }
    });

    function updateDisplay() {
      const m = String(Math.floor(time / 60)).padStart(2, "0");
      const s = String(time % 60).padStart(2, "0");
      document.getElementById("display").textContent = `${m}:${s}`;
    }

    document.getElementById("toggleBtn").onclick = () => {
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
        document.getElementById("toggleBtn").textContent = "Reanudar";
      } else {
        document.getElementById("toggleBtn").textContent = "Pausar";
        timerId = setInterval(() => {
          if (time > 0) {
            time--;
            updateDisplay();
            OnicordWidgetAPI.storage.set("pomodoro_time", time);
          } else {
            clearInterval(timerId);
            timerId = null;
          }
        }, 1000);
      }
    };
  </script>
</body>
</html>
```

---

### 6.4 Packaging Options (`.onipkg`)

Once your addon files are written, you can package your development folder into a `.onipkg` bundle using either the in-app graphical tool or the command-line compiler:

#### Method A: In-App Packaging Tool (Recommended for Local Dev)
1. Open **Onicord** and navigate to **Settings > Addons**.
2. Click the **"Package addon folder"** button (`Empaquetar carpeta de complemento`).
3. Select your local addon directory (must contain a valid `manifest.json`).
4. Onicord will validate your manifest, bundle and compress all source files, and generate `<plugin-id>.onipkg` directly inside the selected folder.

#### Method B: Command-Line Compiler (`node build.js`)
To validate, package, and update the central catalog (`index.json`) for multiple addons or official repository submissions:

```bash
node build.js
```

The compiler will automatically:
1. Validate manifest syntax, scope metadata, and source code integrity.
2. Generate binary bundles inside `plugins/<plugin-id>/package.onipkg`.
3. Update versioning and catalog entries with scope badges in `index.json`.

---

## 7. Addon Repository Structure & Official Packages

- `index.json`: Central catalog registry listing available downloadable addons and their scopes.
- `build.js`: Official compiler script that packages source directories into `.onipkg` bundles.
- `plugins/`: Directory containing compiled binary packages (`.onipkg`) categorized by plugin ID.
- `demo_dashboard_addon/`: Official demo source code for local and P2P collaborative Bento widgets (`scope: "hybrid"`, version `0.1.0`).
- `onicord-arcade/`: Official Arcade retro and web gaming stage runner for voice channels with multiplayer lobby discovery (`/arcade`, `scope: "hybrid"`, version `0.2.0`).
- `onicord-soundboard/`: Official collaborative P2P Soundboard for the Addon Island with voice channel scoping, local private preview, inline renaming, audio uploading, and dynamic marquee text (`scope: "hybrid"`, version `0.1.0`).
- `onicord-polls/`: Official Quick Polls chat addon (`/p`, `scope: "server"`, version `0.1.0`).
- `onicord-dice/`: Official collaborative dice roller addon for the Addon Island with real-time P2P synchronization and `/roll` command (`scope: "server"`, version `0.1.0`).
- `youtube-search/`: Official YouTube Search addon (`/y`, `scope: "server"`, version `0.1.0`).
- `google-search/`: Official Google Search addon (`/g`, `scope: "server"`, version `0.1.0`).

---

## 8. Distribution and Publishing Workflows

Developers have two distinct avenues for distributing Onicord addons: **Direct Distribution & Self-Hosting** (decentralized, immediate, zero approval needed) and **Publishing to the Official In-App Catalog** (via GitHub Pull Request and security review).

---

### Option 1: Direct Distribution & Self-Hosting (Zero Approval Needed)

Because Onicord is an open, decentralized platform, developers are never required to seek permission or approval to distribute addons:

1. **Compile the Package**: Package your addon directory into `.onipkg` using either the in-app tool (**Settings > Addons > Package addon folder**) or via the CLI compiler (`node build.js`).
2. **Distribute Freely**:
   - **Direct In-Chat Transfer**: Send the `package.onipkg` file directly into any Onicord chat channel or room. Peers can install it directly into their library with a single click.
   - **Host Independently**: Host the `.onipkg` on your personal GitHub Releases, website, or community discord/forums.
3. **User Installation**:
   - End users install third-party addons by opening **Settings > Addons > Import .onipkg** or dragging and dropping the `.onipkg` file into the Onicord app window.
   - Once imported, users can activate the addon globally or link it to specific rooms.

---

### Option 2: Publishing to the Official In-App Store Catalog (Fork & Pull Request)

To make your addon discoverable by the entire Onicord community directly inside the in-app Store (**Settings > Addons**):

Third-party developers do not have direct push access to `OniverseDesign/onicord-addons`. All submissions must be submitted through GitHub Forks and Pull Requests.

#### Step 1: Fork and Clone the Repository
1. Fork the [OniverseDesign/onicord-addons](https://github.com/OniverseDesign/onicord-addons) repository on GitHub.
2. Clone your fork locally:
   ```bash
   git clone https://github.com/<your-username>/onicord-addons.git
   cd onicord-addons
   ```

#### Step 2: Add Your Addon Source Directory
Create your addon directory in the root of the repository matching your addon ID (e.g., `my-custom-addon/`):
```text
my-custom-addon/
├── manifest.json
├── index.js
├── widgets/
│   └── main.html
└── assets/
    └── icon.png
```

#### Step 3: Run the Catalog Compiler
Execute the build script:
```bash
node build.js
```

The compiler will automatically:
1. Validate manifest syntax, scope metadata, and declared permissions.
2. Package the source directory into a compressed `.onipkg` bundle at `plugins/<plugin-id>/package.onipkg`.
3. Extract and register metadata, version, scope badges, and repository paths in `index.json`.

#### Step 4: Submit a Pull Request
1. Commit your changes:
   ```bash
   git add .
   git commit -m "Add my-custom-addon to official catalog"
   git push origin main
   ```
2. Open a Pull Request from your fork against `OniverseDesign/onicord-addons:main`.

#### Security & Sandbox Review Process
Because addons execute JavaScript code within user clients, all submissions to the official catalog undergo a thorough security audit by the Oniverse core maintainers:

- **Permission Principle of Least Privilege**: Addons must only request permissions strictly required for their functionality. Requests for unnecessary sensitive permissions (`audio.state`, `user.profile`, `network.outbound`) will be flagged for justification.
- **V8 Sandbox Integrity**: Scripts must run safely inside Onicord's isolated V8 `vm` sandbox (`pluginSandboxService.cjs`). Any attempts to bypass sandboxing, probe Node.js internals, access forbidden file system paths, or spawn processes will cause immediate rejection.
- **Code Transparency & Maintainability**: Source code must be readable, well-structured, and unobfuscated. Minified bundles without verifiable original sources are prohibited.
- **Network & P2P Etiquette**: Addons utilizing `p2p.broadcast` must handle data cleanly, adhere to message scoping, avoid high-frequency flooding, and implement the standard state-handshake protocol.

Once reviewed and merged by a maintainer, your addon is automatically listed in the in-app Store for all Onicord users.