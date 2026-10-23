# Onicord v0.1.7

## Changes

- **Intelligent Auto-Ducking & Master Audio Limiter**:
  - Real-time active speaker tracking across voice channels (`activeSpeakers`).
  - Dynamic, smooth audio ducking of remote screen shares (`StreamDisplay`) and interactive addon games (`AddonStageDisplay`) whenever someone in the room speaks, guaranteeing crystal-clear voice clarity.
  - Configurable ducking attenuation percentage in Audio Settings (`autoDuckingAmount`, default 50%).
  - Dedicated master output bus equipped with a transparent anti-clipping limiter (`DynamicsCompressorNode` at -1.5dB threshold, 12.0 ratio) to eliminate digital audio distortion during loud or overlapping speech.
  - Hardware-direct audio playback via Web Audio API, bypassing DOM `<audio>` element autoplay throttling.
- **Screen Share & Video Transmission Enhancements**:
  - **System Audio Toggle**: Independently enable or disable desktop and application audio transmission with built-in headphone recommendations to prevent feedback loops.
  - **Game Mode Toggle**: Dedicated toggle optimizing screen capture for 60 FPS smooth motion and stereo audio fidelity for video games, alongside standard 30 FPS mode for CPU efficiency during coding and desktop presentations.
  - **Resolution Selector**: Streamlined dropdown selector supporting Original (native), 1080p, 720p, and 480p streams.
  - Proper resource deallocation and stream detachment preventing ghost tracks and memory leaks on disconnect.
- **Gradual Audio SFX Selector**:
  - Overhauled sound settings in the Audio configuration tab, replacing confusing individual toggles with an intuitive 4-tier button selector (`none`, `essential`, `chat`, `all`).
  - Tier `none`: Complete UI silence.
  - Tier `essential`: Voice state audio cues (mute/unmute, deafen/undeafen, connect/disconnect, stream start/stop, and incoming notifications).
  - Tier `chat`: Essential audio plus incoming/outgoing chat messages and typing sound effects.
  - Tier `all`: Full soundscape with all UI interactions enabled.
  - Complete localization across Spanish (`es`), English (`en`), and Portuguese (`pt`).
- **Arcade Stage & Dynamic Room Invitation Capture**:
  - Universal stage invite link capture supporting both query parameter games (`?c=...`, `?sala=...`) and path-based URLs (e.g. `https://garticphone.com/es/001C5257`).
  - Automated room creation: clicking "Invitar al chat" while on the home screen of games like Gartic Phone automatically starts the room, waits for lobby initialization, triggers the invite action, and shares the room link directly to chat.
  - Eliminated `NotAllowedError: Wake Lock permission request denied` by granting explicit `screen-wake-lock` and `wake-lock` permissions in Electron main process and sandboxed stage iframes.
  - Fixed subframe frame collection (`collectFrames`) in Electron IPC to ensure zero silent failures when extracting game rooms.
  - Enhanced chat room cards (`MessageEmbedCard`) displaying clean room IDs (`#001C5257`), direct join buttons, and copy-to-clipboard actions.
- **P2P Encrypted Full-Text Search Engine**:
  - Integrated `searchStore.cjs` providing fast, tokenized full-text search across encrypted chat messages.
  - Advanced search operators: `from:<user>`, `in:<channel>`, `has:file`, `has:image`, `has:link`, and exact phrase matching `"..."`.
  - Incremental, synchronized indexing alongside persistent chat stores.
- **Voice & WebRTC P2P Stability**:
  - Refined `VoiceAudioEngine` and `VoicePeerManager` stream lifecycle and collision resolution during Perfect Negotiation.

# Onicord v0.1.6

## Changes

- **Activity & Application Tracking (RPC)**: Renamed "Actividad de Juegos" to "Actividad" across settings, dashboard, and members sidebar to naturally support desktop software (Photoshop, Blender, IDEs, etc.) alongside games. Non-game applications now display contextually as "En [Software]" or "Usando [Software]" instead of "Jugando a [Software]".
- **Activity Dashboard Widget**: Renamed widget script and components to `ActivityWidget` with an explicit "RPC" badge, displaying active software and real-time playtime tracker integration.
- **Robust Update Notification Engine**: Overhauled startup and background update checker with GitHub Releases API fallbacks, strict cache busting, automatic 4-hour periodic checks, persistent actionable toast notifications, and manual "Buscar actualizaciones" button in the About tab.
- **Interactive Addon Stage & Sandbox Runtime**:
  - Full Gamepad API and WebHID controller bridging into sandboxed subframe games.
  - Seamless return to catalog from web games cleanly remounting the frame without losing stage session.
  - Agnostic nickname synchronization and real-time room link detection for web games (Gartic Phone, Skribbl, PES6).
  - Built-in adblocker service hardened against AdinPlay, Google Publisher Tag (GPT), and gaming ad networks.
- **P2P & Room Sync Reliability**: Fixed edge cases in room state replication, channel member resolution, and connection cleanup.
- **Core Binary Updates**: Updated bundled `yt-dlp` binary to ensure reliable media audio extraction and playback.

# Onicord v0.1.5

## Changes

- **Activity & Game Detection**: Full game and desktop application activity tracking, custom executable registration, allowlist management, and continuous playtime tracking.
- **Discord RPC Socket Server**: Built-in Discord-compatible IPC socket server enabling emulators and games to broadcast rich presence metadata and high-resolution cover art.
- **Interactive Addon Stage & Sandbox Runtime**: Added voice channel Stage display for interactive addons and embedded web apps, featuring sandboxed execution, built-in ad/tracker protection, automated session teardown on voice disconnect, fullscreen capability, and isolated storage/cache clearing utilities.
- **Windows Package Manager (WinGet)**: Added automated WinGet manifest deployment workflow and quick CLI installation commands (`winget install Oniverse.Onicord`).
- **Technical SEO & Landing Page Polish**: Complete technical SEO overhaul with dynamic robots.txt, sitemap.xml, Schema.org JSON-LD schemas, and optimized download bridges.
- **Modal Overflow & Layout Refinements**: Fixed infinite vertical stretching on long message previews, constrained server avatar proportions in deletion prompts, and unified modal z-index stacking.
- **P2P Data Integrity & Tombstones**: Implemented cryptographic tombstone tracking (`_tombstones.json`) to prevent deleted messages from resurrecting during peer sync, and automated cleanup of local server chat stores.

# Onicord v0.1.4

## Changes

- **Automatic Startup Update Checker**: Checks for new versions on startup and notifies the user via an in-app toast notification.
- **Native OS Background Notification**: Alerts users with native system notifications when an update is available while the app is minimized or running in the background.
- **Custom Select Component**: Replaced all native `<select>` dropdowns across the application with a unified, keyboard-accessible, and dark-theme styled Select component.
- **Standardized UI Control Heights**: Unified control heights (`sm: 32px`, `md: 36px`, `lg: 44px`) and corner radiuses across buttons, inputs, and selects.
- **Streamlined Deeplinks & Landing Bridge**: Simplified invitation URLs (`?code=ROOMCODE`) and redesigned the web launcher fallback screen and download section.
- **Screen Share Modal Polish**: Refined the screen share interface with segmented pill tabs, 1080p default resolution, seamless borders, and cleaner typography.
- **Micro-interactions & Stability**: Fixed backdrop overlay glitches, converted hardware error banners to toasts, and improved server rail alignment.

# Onicord v0.1.3

## Changes

- **Cross-Platform Release Builds**: Added automated CI workflows and packaging configuration for Linux (AppImage, deb) and macOS (dmg, zip) alongside Windows (NSIS installer, portable executable).
- **Cryptographic Release Verification**: Automated generation and attachment of SHA-256 checksums (`SHA256SUMS.txt`) to all published release assets.
- **Portuguese Language Localization**: Added full Portuguese (`pt`) translation dictionary with 1,042 localized keys and complete feature coverage.
- **Dynamic Multi-Language Architecture**: Refactored language management into an extensible registry supporting runtime language additions and community translations.
- **Settings & SFX Localization**: Audited and extracted all hardcoded strings across all settings tabs and audio configuration menus, establishing Spanish as the canonical reference.
- **Community Health & Contribution Templates**: Introduced GitHub issue templates, security policy (`SECURITY.md`), and community contribution guidelines (`CONTRIBUTING.md`).

# Onicord v0.1.2

## Changes

- **Unified Package Format**: Addons and sticker packs now both use the `.onipkg` format, deprecating legacy `.onimod` and `.opk` extensions.
- **Sticker Management System**: Overhauled sticker pack import/export, metadata extraction, and deduplication for shared assets.
- **Native OS Notifications**: Configured `AppUserModelId` and added an Electron IPC bridge to ensure desktop notifications display reliably on Windows.
- **Modal Scrollbar & Layout Stability**: Resolved layout shifts in settings modals by implementing `scrollbar-gutter: stable` and introducing an 8px minimal scrollbar.
- **Direct Messaging Reliability**: Fixed private message initialization, channel routing, and member resolution when opening direct chats.
- **Member List & Profile Polish**: Removed redundant actions from user profile popouts and added fluid transition animations for member hover actions and flame streak badges.
- **Community Contribution Guides**: Added detailed step-by-step contribution guides for addons and sticker packs, and updated links to official community repositories.
