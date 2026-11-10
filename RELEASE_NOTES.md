# Onicord v0.2.5

## Changes

- **Virtual Chat Rendering & Feed Virtualization**: Integrated `@tanstack/react-virtual` for 60 FPS message feed scrolling, smooth jump-to-message transitions, and O(M) single-pass thread participant precomputations.
- **Zustand State Architecture & Voice Isolation**: Decoupled voice telemetry and speaking indicators into atomic Zustand selectors (`useVoiceStore`), eliminating whole-tree re-renders, while centralizing application state (`useAppStore`).
- **Modular Room & P2P Packet Architecture**: Decomposed monolithic `RoomView` and `RoomManager` packet routers into dedicated domain submodules (`RoomHeader`, `RoomOverlays`, `RoomRightSidebar`, and modular P2P packet handlers).
- **Swarm P2P File Distribution & Streaming**: Multi-source block downloading with dynamic seeder scheduling, automated local database seeding, file handle pooling, and executable permission safeguards.
- **Unified Sandboxed Plugin Host**: Consolidated iframe runtime into `SandboxedPluginFrame` with strict permission checking, isolated storage, and collaborative P2P sync.
- **Asset Diet, WOFF2 Fonts & Bundling Optimization**: Replaced the 10.5 MB TTF icon font with compressed WOFF2, removed external Google Fonts dependencies, added dynamic on-demand i18n locale loading, and optimized Vite vendor chunking.
- **WebRTC Voice Engine & Audio Resource Cleanup**: Plugged audio node leaks, ensured complete camera/screen track deallocation on disconnect, and guarded against duplicate remote stream attachments.
- **Automated yt-dlp Multi-Platform Binary Tooling**: Introduced automated per-platform binary provisioning (`ensure-ytdlp.cjs`), offloading binaries from the main asar package to reduce installer overhead.
- **Security & Media Protocol Hardening**: Enforced strict origin guards on hardware/media capture and blocked unauthorized access to local database and credential files via internal media protocols.
- **Dead Code & Legacy Deprecation Cleanup**: Purged obsolete components (`WelcomeScreen`, `JoinModal`, `e2ee.js`, `CloudBackupTab`), stripping over 2,500 lines of technical debt.

# Onicord v0.2.4

## Changes

- **Desktop & In-App Notification Author Sanitization**: Enhanced notification author resolution across webhooks, addons, bots, and members, eliminating raw hashes and ambiguous placeholders while formatting clean contextual titles for channels, DMs, and threads.
- **Robust In-App Changelog & Markdown Formatting**: Added HTML-to-markdown normalization for update feeds, native link support in `ChangelogModal`, and prioritized GitHub Release notes fetching with seamless cache fallbacks.
- **UI Zoom Scaling & Settings Reversion Safeguards**: Standardized display scaling on the document root element to eliminate layout shifts, and added automatic reversion of zoom and language tweaks when exiting settings without saving.
- **Voice Shortcut & Mute State Reactivity**: Fixed stale hook references in global voice shortcut listeners to guarantee instant mute toggling, backed by channel speak-permission guards.
- **Plugin Toast Internationalization**: Extended the sandbox toast API to support localized titles, message keys, and dynamic translation parameters for third-party addons.

# Onicord v0.2.3

## Changes

- **SQLite & Content-Addressed Storage (CAS) Database Architecture**: Migrated core storage from flat JSON files to high-performance `better-sqlite3` relational databases in WAL mode, coupled with a Content-Addressed Storage engine for SHA-256 media deduplication and automated legacy data migration.
- **Interactive Server Moderation & Eviction Engine**: Added native confirmation dialogs for kicking and banning members, real-time ban/kick propagation across peer swarms, instant unbanning, and graceful eviction modals replacing browser alert popups.
- **Rich Server Invites & Direct TCP Connection Links**: Full chat integration for server invites with live P2P metadata resolution (server icon, name, member count), one-click joining, and support for direct TCP deep links (`onicord://direct:<IP>:<PORT>/<CODE>`).
- **Permission-Aware Unread Tracker & Server Read State**: Isolated unread badge tracking enforcing role-based channel visibility (`hasChannelAccess`) and direct message recipient verification, alongside one-click "Mark as Read" actions for channels and servers.
- **Message Grouping & Server-Scoped Identity Polish**: Hardened message grouping logic preventing improper clustering between local users, remote peers, and webhooks, with full propagation of server-specific profiles across reply previews and reaction bars.
- **P2P Media Streaming & Engine Optimization**: Streamlined background torrent engine prioritization, enhanced on-the-fly FFmpeg audio/video remuxing and transcoding fallbacks, and updated bundled `yt-dlp` binary.

# Onicord v0.2.2

## Changes

- **Enhanced Auto-Updater & Native Changelog System**: Integrated silent background downloads for packaged installer updates, automatic installation upon app quit, and a dedicated `ChangelogModal` with live markdown formatting accessible from the About tab for both current and incoming versions. Added automated update verification, hot-reloading in the sandbox, and update notifications for installed community addons.
- **Public P2P Server Discovery & Community Exploration (Discover)**: Introduced a decentralized peer-to-peer discovery engine with zero central servers, allowing public communities to advertise across the DHT swarm with custom tags, categories, descriptions, and banners, complete with a "Knock to Join" approval and rate-limiting system.
- **Dedicated Forum Channels & Thread Discussion System**: Native forum channel architecture (`type: "forum"`) with structured `ForumPostCard` layouts, interactive `ForumTagsBar` topic filtering, expandable post composer with title and `#tag` extraction, top-anchored descending scroll, and deep thread panel integration.
- **Native Backup & Vault System (.onipkg / .onibackup)**: Comprehensive local archive vault engine enabling encrypted, category-granular export and restoration (profile, servers, chats, plugins, and stickers), automated scheduled vault backups with retention policies, and first-run restoration directly on the Profile Setup onboarding screen.
- **Per-Server Profiles & Custom Identity**: Full support for server-specific identities, allowing members to customize their nickname, avatar, banner color, status, and custom link per server without altering their global profile, synchronized in real time across peer swarms.
- **Discord-Style Mosaic Media Gallery & Multi-File Uploads**: Dynamic responsive image grids for multi-attachment messages (1-image, 2-column, 3-tile mosaic, and 4+ 2x2 grids with remaining counters), combined with multi-file composition staging and interactive lightbox carousel navigation.
- **Contextual Skeleton Loading & Anti-Flicker Transitions**: Staggered breathing wireframe animations (`onicord-skeleton-breath`) tailored for both text and forum channels, featuring smooth cross-fade exits that eliminate layout shifts during message hydration while respecting reduced-motion accessibility preferences.
- **Automated Server Welcomes & Default Role Assignment**: Configurable server welcome system dispatching localized greetings to designated channels upon peer arrival with dynamic translation of default templates, alongside automated assignment of base member roles.
- **Granular Channel Communication & Read-Only Restrictions**: Configurable channel-level speak/write permissions for text and forum channels, allowing administrators to establish read-only announcement channels and restrict messaging by role, backed by real-time audit log tracking.
- **Background Auto-Download of Shared Media & Custom Download Directory**: Optional background downloading of shared media attachments with configurable file size limits (10 MB to 10 GB or unlimited), custom download directory selection, and local deduplication against existing files.
- **Server Rail & Database Stability Polish**: Active voice indicators with green glow on collapsed server folders, standardized z-index design tokens, serialized database write queues, and automatic recovery of corrupted or missing servers from `room-meta` archives.

# Onicord v0.2.1

## Changes

- **Native P2P Media Streaming Engine**: Integrated local HTTP chunking server for peer-to-peer torrent and magnet streams with native range-request buffering, automatic audio/video codec probing, and real-time transcoding fallbacks for browser-incompatible media formats.
- **Agnostic Addon Stage Framework**: Standardized plugin host lifecycle protocols, resume-time synchronization, and isolated per-addon stage progression storage, enabling seamless theater and Picture-in-Picture modes for third-party media and game addons.
- **Chat Input & Text Caret Stability**: Resolved text caret position jumps and selection offset loss during markdown formatting, emoji insertion, and text composition within the chat input area.
- **Reply Formatting & Quote Sanitization**: Cleaned up message reply previews by eliminating raw system placeholders, binary attachment flags, and formatting artifacts across quoted message bubbles and thread cards.
- **Keybinding Collision Safeguards**: Added strict input-focus guards to the global and local keybinding engines, preventing accidental triggers of Push-to-Talk, deafen, mute, or search shortcuts while typing in message fields or textareas.
- **Continuous Animation Freezing**: Full integration of the reduced-motion and continuous-animation accessibility toggles, freezing infinite CSS keyframe loops and pausing animated avatars, stickers, and brand icons to eliminate background CPU and GPU overhead.
- **Interactive Chat Embed Theming**: Aligned interactive addon card action buttons with the atomic dark-accent contrast standards, ensuring readability and visual consistency across all active themes.
- **PiP Stage Layout Decoupling**: Fixed chat room visibility being suppressed when an active video or game addon stage transitions into floating Picture-in-Picture mode.

# Onicord v0.2.0

## Changes

- **Synchronized P2P Watch Party**: Watch synchronized YouTube and web videos directly in voice lounges with dual Theatre and GPU-accelerated PiP floating mini-player modes, drift compensation, subtitle selection, and contextual right-click chat integration.
- **Streamer Mode & Broadcast Privacy**: Automatic detection of active streaming software (OBS, Twitch Studio, Streamlabs) or manual toggle, with instant masking of room codes, invite links, and server keys, suppression of message popups, and a purple avatar streaming status.
- **Autonomous Server Webhooks & Feed Ingress**: Push alerts directly into channels with Discord-compatible JSON payloads via a built-in local HTTP ingress server, or configure autonomous RSS/Atom/JSON feed polling over the P2P swarm without cloud dependencies.
- **Universal Settings Search & Flash Navigation**: Instant real-time search across all application and server settings tabs with automated tab switching, smooth scrolling, and visual pulse highlight (flash navigation) on target preference cards.
- **Standardized Floating Media Bar**: Unified, distraction-free floating media controls shared across Watch Party, Screen Sharing, and Arcade stages with volume sliders, audio ducking, and theatre toggle adhering to the Catppuccin Mocha palette.
- **Intelligent Media Audio Ducking**: Integrated audio ducking for Watch Party video streams, automatically attenuating playback volume whenever a peer speaks in the voice lounge for crystal-clear conversations.
- **Screen Share Full-Area Stage**: Expanded video streaming display to occupy 100% full-area stage layout, matching the dimensions of the Arcade and Watch Party interfaces.
- **Modular P2P Soundboard Addon**: Official `.onipkg` Soundboard addon for the Plugin Island, enabling participants to drop custom audio clips (`.mp3`, `.wav`, `.ogg`), sync them in real time across peers, and play soundboard effects in voice calls.
- **Multi-Language Localization Parity**: Complete translations across Spanish (`es`), English (`en`), and Portuguese (`pt`) for all new settings, search, streamer mode, and watch party features.

# Onicord v0.1.9

## Changes

- **Interactive Toast Notifications**: Toasts are now fully interactive with contextual click actions—clicking message notifications navigates straight to the active server/channel, while update alerts open Settings directly to the About tab.
- **Dynamic Accent Glow & Sender Avatars**: Info toasts dynamically inherit the user's selected theme accent color for borders and ambient glows, and message notifications display the sender's avatar or initial letter badge.
- **Ultra-Fluid PiP Floating Windows**: Dragging floating PiP windows (screen shares and addon stage games) is now hardware-accelerated with GPU transforms (`translate3d`) and `requestAnimationFrame`, eliminating stutter and mouse lag.
- **Profile Popout Toggle & Exit Animations**: Clicking a member's card now toggles the profile smoothly without re-opening glitches, featuring a fluid scale-out exit animation before unmounting.
- **Centralized & Standardized Motion System**: Unified animation tokens, natural bezier curves, and exit transitions across all modal dialogs, popovers, context menus, and select dropdowns.
- **User Panel & Audio Control Ergonomics**: Persistent mute and deafen toggles in the bottom user panel, allowing microphone and headphone adjustments before connecting to voice lounges.
- **Chat & Navigation UI Polish**: Added an animated floating "Jump to present" button when scrolling message history, smooth slide transitions for reply bars and pending attachments, and rotating category chevrons.
- **Chat & Thread Reply System**: Resolved duplicate reply rendering and enabled full quoted reply previews in the thread panel instead of inserting plain text mentions.

# Onicord v0.1.8

## Changes

- **Taskbar Unread Notification Badges**:
  - Native Windows taskbar overlay badges via `win.setOverlayIcon` and macOS Dock badge support.
  - Dynamic 32x32px Canvas generator with official `onicord-danger` background (`#f38ba8`) and bold white typography (`22px` for 1–9, `19px` for +9).
  - Real-time unread calculation via `useUnreadTracker` respecting muted servers; automatic startup cleanup eliminating ghost badges.
  - Disabled Chromium default Windows Badging API to prevent generic black circles from overriding custom icons.
  - Developer Sandbox test card in Settings for instant badge testing and cache clearing.
- **Packaging & Bundle Size Optimization**:
  - Moved `uisfx` and frontend UI runtime libraries to `devDependencies`, preventing `electron-builder` from packing `node_modules/uisfx/sounds/` into `app.asar`.
  - Direct elimination of 936 redundant static audio files (`.mp3` & `.ogg`), stripping ~8.8 MB of dead weight from installers and portable builds.
  - Purged obsolete dependencies (`react-icons`, `find-process`) in favor of native SVG icons and optimized OS process scanners.
- **Real-Time Theme Preview Redesign**:
  - Modern two-column layout in Appearance Settings: `# general` realistic chat mockup on the left, and interactive Controls & Status on the right.
  - Locked container heights (`min-h-[250px]`) preventing UI layout shifts and jumps when switching accent colors with variable length names.
- **Voice Architecture & WebRTC State Isolation**:
  - Decoupled `VoiceChannelContext` from `VoiceContext`, isolating speaking and volume state updates to eliminate unnecessary application-wide re-renders.
  - Mutable reference hooks for global voice shortcuts (`toggle_mute`, `toggle_deafen`, `disconnect_voice`), removing volatile window listener re-subscriptions.
  - Modularized `VoicePeerManager` architecture into dedicated submodules.
- **Rich Text & Markdown Formatting Engine**:
  - Centralized `applyMarkdownFormat` engine supporting smart wrapping and toggle-unwrapping of inline and block markdown styles (bold, italic, strikethrough, inline code, quotes, headings, and multi-line code blocks).
  - Native support for combined bold + italic markdown syntax (`***...***` and `___...___`) across messages and real-time input preview.
  - Keyboard formatting shortcuts in chat input: `Ctrl+B` / `Cmd+B` (bold), `Ctrl+I` / `Cmd+I` (italic), `Ctrl+Shift+S` (strikethrough), and `Ctrl+E` (inline code).
  - Synchronized selection restoration and syntax highlighting in the chat input bar.
- **Chat, Threads & Client Search Improvements**:
  - Unified `ThreadSidePanel` with standard `ChatInputArea` for consistent emoji, sticker, attachment, and markdown handling.
  - Centralized message normalization (`normalizeChatMessage`) across threads, nudges, optimistic feeds, and complement bots.
  - Indexed caching for local media attachment paths (`checkedAttachmentIdsRef`), preventing redundant IPC file path resolutions.
  - Enhanced client-side search query parser supporting operators (`from:`, `in:`, `has:file`, `has:image`, `has:link`) and exact phrases.
- **Music Player & Island Direct Dispatch**:
  - Migrated `MusicPlayerWidget` and `MusicIsland` from global DOM event dispatchers to direct context methods, improving responsiveness and reducing event overhead.
- **UI & Modal Polish**:
  - Fixed toast notification stacking context with explicit `zIndex: 999999999`, ensuring toast alerts always render above modal backdrops.
  - Optimized role grouping in `MembersSidebar` with O(1) Map lookups for large member lists.
  - Full i18n dictionary updates across English, Spanish, and Portuguese.
  - Updated bundled `yt-dlp` executable to the latest stable release.

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
- **Rich Open Graph & Media Embed Cards**:
  - **Spotify Embed Cards**: Dedicated media card featuring Spotify branding, album/track artwork, equalizer badge, title, artist description, and direct play action.
  - **Pinterest Embed Cards**: Vertical layout cards preserving natural pin aspect ratios (up to 420px height) with full descriptions and high-resolution image containment.
  - **GIF & Animation Streaming**: Native inline auto-play, looping, and muted playback for Tenor, GIPHY, and MP4 video GIFs without controls or awkward letterboxing.
  - **YouTube & Video Optimization**: High-resolution thumbnail fallback (`hqdefault.jpg`) and aspect ratio preservation for horizontal 16:9 and vertical 9:16 reels/shorts.
  - **Robust Link & Markdown Parser**: URLs and links are now parsed before italic and bold styles, preventing underscores `_` and asterisks `*` inside links from corrupting URLs or breaking markdown text.
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
