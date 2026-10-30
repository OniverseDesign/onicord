# Addon Scopes and Lifecycle Model

Comprehensive guide to Onicord addon classifications, execution scopes, automatic capability detection, and room binding lifecycles.

---

## 1. Scope Classification Taxonomy

Every Onicord addon declares an explicit execution scope in `manifest.json`. The scope defines where the addon can be installed, who can activate it, and which interfaces it targets.

| Scope | Manifest Identifier | Target Environment | Purpose and Typical Capabilities |
| :--- | :---: | :--- | :--- |
| **Server / Collaborative** | `"server"` | P2P Servers and Shared Channels | Collaborative room tools, chat slash commands (`/p`, `/roll`, `/g`), Plugin Island sidebar cards, and group interactions. Requires room host or admin activation. |
| **Personal / Dashboard** | `"client"` | Local User Client | Local productivity and personal tools running 100% on the user device without needing an active room. Bento Dashboard widgets (Pomodoro timers, calculators, notes). |
| **Hybrid** | `"hybrid"` | Both Server and Dashboard | Combines personal Dashboard widgets with collaborative room tools, voice channel stages, or multiplayer activities (Arcade, Cinema, Soundboard). |

---

## 2. Intelligent Scope Auto-Detection

If an existing or legacy addon omits the explicit `"scope"` field in `manifest.json`, the Onicord host inspects its declared properties and permissions dynamically:

1. **Hybrid Match**: If it defines both `dashboardWidgets` and collaborative permissions (`ui.plugin_island`, `p2p.network`, `ui.stage_view`, or chat commands) -> Assigned `"hybrid"`.
2. **Server Match**: If it defines chat commands or collaborative vectors (`p2p.network`, `ui.plugin_island`, `chat.send`, `chat.read`) without dashboard widgets -> Assigned `"server"`.
3. **Client Match**: If it only provides `dashboardWidgets` or `ui.custom_widget` without collaborative vectors -> Assigned `"client"`.
4. **Default Fallback**: Assigned `"client"`.

---

## 3. Two-Level Addon Lifecycle Architecture

Onicord strictly decouples physical file installation on the computer from logical activation inside specific servers and rooms.

```text
+--------------------------------------------------------------------------+
| Level 1: Global / Application Library (Settings > Addons)                |
| - Physical storage on disk: <userData>/plugins/<addon-id>/               |
| - Download, install, update, and uninstall addon packages                |
| - Enable or disable addons globally for the current client               |
+--------------------------------------------------------------------------+
                                    |
                                    v
+--------------------------------------------------------------------------+
| Level 2: Server / Room Binding (Server Settings > Addons)                |
| - Logical reference in room metadata: server.plugins                     |
| - Enables slash commands, Island cards, and room tools for members       |
| - Zero file duplication: links directly to the local library             |
| - Unlinking removes room access without deleting files from disk         |
+--------------------------------------------------------------------------+
```

### 3.1 Level 1: Global Client Storage
- **Physical Disk Management**: Addon files reside in the user data directory (`<userData>/plugins/`). Installing or removing an addon here modifies the physical files on disk.
- **Central Addon Store**: Users browse, download, and update addons from the official catalog or import third-party `.onipkg` packages.
- **Filtering**: Addons can be filtered in the library by scope (`All`, `Server`, `Personal`, `Hybrid`).

### 3.2 Level 2: Server and Room Level
- **Decoupled Activation**: A server administrator links an installed addon to activate its commands or sidebar cards for all room peers.
- **Instant Toggling**: Linking or unlinking requires zero network requests to download files; it updates the server metadata instantaneously.
- **Safe Unlinking**: Unlinking an addon from a room never deletes its underlying code from the user's hard drive.

---

## 4. Voice Call and Stage Lifecycle

Interactive canvases and media players embedded inside voice calls adhere to the voice session state:
- **Automatic Mount**: Launching an addon via voice control buttons (`Onicord.ui.registerVoiceControlButton`) or stage commands mounts the stage view for active call participants.
- **Clean Teardown**: When the user disconnects from or leaves the voice channel, Onicord automatically terminates active iframe processes, resets media players, frees network sockets, and clears temporary stage memory.

---

## 5. Navigation and Cross-References

- [Architecture Overview](architecture.md) - Host isolation and sandboxing models.
- [API Reference](api-reference.md) - Complete documentation of the 14 runtime interaction vectors.
- [Permissions and Security](permissions-and-security.md) - Security policies and permission matrix.
- [Packaging and Publishing](packaging-and-publishing.md) - Compiling `.onipkg` bundles and catalog distribution.

