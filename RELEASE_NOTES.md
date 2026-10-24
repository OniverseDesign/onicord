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
