# Onicord Addons API Reference

Detailed technical specification of all runtime interaction vectors available to Onicord addons, background scripts, and visual UI widgets.

---

## 1. Overview of Interaction Vectors

Addons interact with the host, chat, user interface, Bento Dashboard, voice rooms, and P2P network through 14 primary vectors grouped into 4 categories:

| Category | Vectors Included | Focus |
| :--- | :--- | :--- |
| **Chat and Slash Commands** | **2.1** Slash Commands · **2.3** Interactive Embeds · **2.4** Action Callbacks · **2.9** Message Purging | Text-based workflows, slash triggers (`/p`, `/roll`, `/g`), and interactive chat cards. |
| **UI Canvases and Mounting** | **2.2** Bento Dashboard · **2.6** Dynamic Plugin Island · **2.10** Voice Stage Display · **2.11** Voice Control Buttons | Embedding visual widgets into home dashboards, sidebar capsule, voice bar buttons, and full stages. |
| **P2P Network and Persistence** | **2.5** Real-Time P2P Data · **2.7** Scoped Local Storage · **2.8** External Network `fetch` | Decentralized peer synchronization, persistent JSON key-value store, and external web APIs. |
| **Voice and Media Runtime** | **2.12** Voice Scoping API · **2.13** Audio Auto-Ducking · **2.14** Media Playback and Streaming | Call state inspection, peer vocal ducking attenuation, and local/torrent audio and video streaming. |

---

## 2. Detailed Vector Specifications

### 2.1 Slash Command Registration (`Onicord.chat.onCommand`)
Allows background sandbox scripts (`index.js`) to register slash commands that execute from the chat input.
- **Permission Required**: `chat.read`
- **Context**: V8 Sandbox (`index.js`)

```javascript
Onicord.chat.onCommand('p', (args) => {
  const query = args.join(' ');
  console.log('Command executed with args:', query);
});
```

---

### 2.2 Bento Dashboard Widgets (`dashboardWidgets`)
Plugins can declare local or collaborative Bento widgets displayed in Onicord's personal Home Dashboard grid.
- **Permission Required**: Declared in `manifest.json` under `dashboardWidgets`
- **Context**: Sandboxed Iframe

```json
"dashboardWidgets": [
  {
    "id": "pomodoro_timer",
    "title": "Pomodoro Timer",
    "badgeText": "Local",
    "type": "local",
    "bgVariant": "dark",
    "entryPoint": "widgets/pomodoro.html",
    "defaultGeo": { "x": 1, "y": 1, "w": 2, "h": 2 }
  }
]
```

Inside the widget HTML entry file, access the injected `window.OnicordWidgetAPI`:

```javascript
window.addEventListener("onicord:widget-ready", async () => {
  const user = OnicordWidgetAPI.user.getProfile();
  const saved = await OnicordWidgetAPI.storage.get("saved_key");
});
```

---

### 2.3 Chat Messages and Interactive Cards (`[PLUGIN_EMBED]`)
Plugins can publish chat messages under their addon identity (`isComplement: true`). To render rich interactive cards (polls, search results, dice rolls), format the message text with a `[PLUGIN_EMBED]` prefix.
- **Permission Required**: `chat.send`
- **Context**: V8 Sandbox (`index.js`) or Iframe Widget via `OnicordWidgetAPI.chat.send`

```javascript
const embedPayload = {
  pluginId: 'onicord-polls',
  type: 'poll',
  data: {
    pollId: 'poll_123456',
    question: 'What game should we play tonight?',
    options: [
      { id: 'opt_0', text: 'Gartic Phone', voters: [] },
      { id: 'opt_1', text: 'Retro Arcade', voters: [] }
    ],
    createdAt: Date.now()
  }
};

Onicord.chat.sendMessage({
  text: `[PLUGIN_EMBED]:${JSON.stringify(embedPayload)}`
});
```

---

### 2.4 Real-Time User Interactions (`[PLUGIN_ACTION]`)
Captures user actions on plugin cards (such as clicking a poll option or button) and transmits them to all room participants without polluting visible chat history.
- **Permission Required**: `chat.send`
- **Context**: Iframe Widget or Embedded Chat Card

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

### 2.5 Direct P2P Data Broadcasting (`Onicord.p2p` / `OnicordWidgetAPI.p2p`)
For applications and collaborative widgets requiring direct, low-latency peer-to-peer data exchange without creating chat records.
- **Permission Required**: `p2p.network`
- **Context**: V8 Sandbox and Iframe Widgets

#### Automatic Scoping
All data transmitted through `p2p.broadcast` is automatically scoped by `pluginId` and `widgetId` by the host, preventing interference across addons.

```javascript
// 1. Broadcast JavaScript object to room peers
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

#### Decentralized State Handshake Pattern
Because persistent storage is local to each peer, a peer opening a widget for the first time starts with empty local data. Collaborative widgets implement the Request-Response Handshake:

```javascript
// Request current state from active peers
function requestRoomState() {
  window.OnicordWidgetAPI?.p2p?.broadcast({
    type: 'ROOM_STATE_REQUEST'
  });
}

// In the onMessage listener:
window.OnicordWidgetAPI.p2p.onMessage((data, senderPeerId) => {
  if (data.type === 'ROOM_STATE_REQUEST') {
    if (state.configured) {
      window.OnicordWidgetAPI.p2p.broadcast({
        type: 'ROOM_STATE_RESPONSE',
        state: state
      });
    }
  } else if (data.type === 'ROOM_STATE_RESPONSE') {
    applyRemoteState(data.state);
  }
});

requestRoomState();
```

---

### 2.6 Plugin Island Widgets (`Onicord.ui.registerPluginIslandWidget`)
The **Plugin Island** is Onicord's dedicated sidebar canvas situated above the room members list.
- **Permission Required**: `ui.plugin_island`
- **Context**: V8 Sandbox (`index.js`)

```javascript
if (typeof Onicord !== "undefined" && Onicord.ui?.registerPluginIslandWidget) {
  Onicord.ui.registerPluginIslandWidget({
    id: "dice-island-widget",
    title: "Dice",
    entryPoint: "widgets/dice_island.html",
    height: 275
  });
}
```

#### Capsule Status Text
Addons update the compact 56px capsule status line and trigger auto-expansion using:
1. `window.OnicordWidgetAPI.island.setSummary("Alex rolled d6 -> 6")`
2. Setting `data.summary` in any P2P broadcast packet.

---

### 2.7 Scoped Local Storage (`Onicord.storage` / `OnicordWidgetAPI.storage`)
Store and retrieve persistent JSON data scoped strictly to the addon directory.
- **Permission Required**: `storage`
- **Context**: V8 Sandbox and Iframe Widgets

```javascript
// Save data
await OnicordWidgetAPI.storage.set("preferences", { volume: 80, theme: "dark" });

// Read data
const prefs = await OnicordWidgetAPI.storage.get("preferences");
```

---

### 2.8 Outbound Network Requests (`fetch`)
Make standard HTTP/HTTPS REST requests to external web APIs.
- **Permission Required**: `network.outbound`
- **Context**: V8 Sandbox and Iframe Widgets

```javascript
fetch('https://api.example.com/v1/data')
  .then((res) => res.json())
  .then((data) => console.log('Data:', data))
  .catch((err) => console.error('Error:', err));
```

---

### 2.9 Purging Plugin Messages (`Onicord.chat.clearPluginMessages`)
Allows an addon to purge its previously posted messages in the current room.
- **Permission Required**: `chat.send`
- **Context**: V8 Sandbox (`index.js`)

```javascript
Onicord.chat.clearPluginMessages();
```

---

### 2.10 Voice Channel Addon Stage Display (`Onicord.ui.openStageView` / `closeStageView`)
The **Addon Stage** provides a full-canvas presentation, gaming, or media streaming view embedded directly inside voice calls.
- **Permission Required**: `ui.stage_view`
- **Context**: V8 Sandbox and Iframe Stage Frames

#### Launching an Interactive Web Game Stage:
```javascript
Onicord.ui.openStageView({
  pluginId: "onicord-arcade",
  title: "Arcade",
  icon: "sports_esports",
  entryPoint: "widgets/launcher.html",
  url: "https://example.com/game",
  isFloating: false
});
```

#### Launching a Video Media Player Stage:
When `mediaType: "video"` or `type: "movie"` is passed, Onicord replaces the webview with a native hardware-accelerated video player:

```javascript
window.parent.postMessage({
  type: "ONICORD_STAGE_LAUNCH_GAME",
  game: {
    id: "movie_123",
    title: "Example Film",
    mediaType: "video",
    type: "movie",
    streamUrl: "http://127.0.0.1:42883/torrent/infohash/0",
    cover: "https://example.com/poster.jpg",
    logo: "https://example.com/logo.png",
    duration: 5400,
    subtitles: [{ label: "EN", lang: "en", url: "https://example.com/sub.vtt" }],
    activity: {
      name: "Example Film",
      details: "Cinema",
      state: "Watching with group",
      type: "movie",
      isCatalog: false
    }
  }
}, "*");
```

#### Dynamic Header Actions Protocol (`ONICORD_STAGE_SET_ACTIONS`):
Embedded launcher widgets can declare custom header buttons in the native stage toolbar:

```javascript
window.parent.postMessage({
  type: "ONICORD_STAGE_SET_ACTIONS",
  actions: [
    { id: "refresh_catalog", label: "Refresh", icon: "refresh" },
    { id: "favorites", label: "Favorites", icon: "star" }
  ]
}, "*");
```

#### Native Confirmation Bridge (`window.onicord.confirm`):
```javascript
const confirmed = await window.onicord.confirm({
  title: "Clear Saved Game Data?",
  message: "This will remove your local save files from storage.",
  confirmText: "Clear Data",
  cancelText: "Cancel",
  isDestructive: true
});
```

---

### 2.11 Voice Control Buttons (`Onicord.ui.registerVoiceControlButton`)
Injects action buttons directly into Onicord's voice control bar in `UserPanel`.
- **Permission Required**: `ui.voice_control_button`
- **Context**: V8 Sandbox (`index.js`) or declaratively in `manifest.json: "voiceControlButtons"`

```javascript
Onicord.ui.registerVoiceControlButton({
  id: "arcade_button",
  icon: "sports_esports",
  tooltip: "Arcade Games",
  action: "TOGGLE_ARCADE_STAGE",
  onClick: () => {
    openArcadeLauncher();
  }
});
```

---

### 2.12 Voice Channel State & Scoping API (`OnicordWidgetAPI.voice`)
Inspects active voice connection status and receives real-time channel change notifications.
- **Permission Required**: `audio.state`
- **Context**: Iframe Widgets

- `window.OnicordWidgetAPI.voice.isInVoice()`: Returns `boolean`.
- `window.OnicordWidgetAPI.voice.getChannelId()`: Returns `string | null`.
- `window.OnicordWidgetAPI.voice.getChannelName()`: Returns `string | null`.

```javascript
// Listen for reactive voice channel changes
window.addEventListener("message", (event) => {
  if (event.data?.type === "ONICORD_VOICE_STATE") {
    const { inVoice, channelId } = event.data;
    console.log("Voice channel updated:", inVoice, channelId);
  }
});
```

---

### 2.13 Audio Auto-Ducking System (`VOICE_DUCKING`)
When members speak inside an active voice channel, Onicord notifies all running widget frames with a `VOICE_DUCKING` event:

```javascript
window.addEventListener("message", (event) => {
  if (event.data?.type === "VOICE_DUCKING") {
    // duckMultiplier ranges from 0.3 (attenuated during vocal bursts) to 1.0 (normal)
    const multiplier = event.data.duckMultiplier ?? 1.0;
    activeAudioElement.volume = configuredVolume * multiplier;
  }
});
```

---

### 2.14 Media Playback and Content Security Policy (`media-src`)
Onicord permits local media sources without CSP violations:
- `blob:` URLs generated via `URL.createObjectURL(blob)`.
- `data:` URIs (Base64-encoded audio/video).
- `mediastream:` for real-time WebRTC streams.
- Local HTTP proxy streams (`http://127.0.0.1:42883/...`).

---

## 3. Navigation and Cross-References

- [Architecture Overview](architecture.md) - Host isolation and sandboxing models.
- [Scopes and Lifecycle](scopes-and-lifecycle.md) - Scope taxonomy and room binding lifecycles.
- [Permissions and Security](permissions-and-security.md) - Complete permissions matrix and security policies.
- [Packaging and Publishing](packaging-and-publishing.md) - Compiling `.onipkg` bundles and catalog distribution.

