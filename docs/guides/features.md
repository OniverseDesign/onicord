# Onicord Features & Capabilities

## Privacy, Discovery & Networking

- **Public P2P Server Discovery (Discover)**: Decentralized community exploration over the DHT swarm with zero central servers. Supports categories, tags, custom banners, and a rate-limited "Knock to Join" approval workflow.
- **Unlimited P2P File Sharing**: Multi-source swarm block downloading and direct encrypted streaming with zero artificial file size limits. Supports optional background auto-downloading with configurable size caps and custom directories.
- **Streamer Mode & Broadcast Privacy**: Automatic detection of OBS Studio, Twitch Studio, and Streamlabs alongside manual toggle. Obfuscates room codes, invite links, and keys with click-to-reveal protection, suppresses message toast popups, and sets a purple streaming status indicator.
- **Do Not Disturb (DND) Suppression**: Suppresses desktop notifications, incoming message toasts, and mention/message sound cues when status is set to `dnd`.
- **Privacy-First Activity Scanner & Grouping**: Detects running games and software locally against an offline dictionary (`games.json`) with zero telemetry leaving your device. Automatically clusters members sharing the same game, cinema, music, or app in the members sidebar.
- **Local RPC Server & Playtime Tracker**: Discord-compatible local IPC pipe (`onicord-ipc-0` / `discord-ipc-0`) for external games and emulators (RPCS3, PCSX2, Dolphin, Yuzu, etc.), paired with local per-game playtime tracking.
- **Built-in Ad & Tracker Blocker**: Blocks ad networks and tracking domains across the internal browser, webviews, game iframes, and embedded media.
- **1-on-1 Direct Messages & Streaks**: Encrypted private DMs with daily interaction streaks and server-wide cumulative flame streaks.

## Audio, Video & Media Streaming

- **Crystal-Clear WebRTC Voice**: Ultra-low latency Opus voice mesh with dynamic bitrate scaling (128 kbps / 96 kbps / 64 kbps), noise reduction, master anti-clipping limiter, and voice-aware AFK protection.
- **Per-User Voice Volume Control**: Individual peer volume adjustment (0%–200%) directly from voice channel user menus.
- **In-Game & Desktop Overlay**: Transparent always-on-top voice overlay with 8 screen anchor zones, configurable opacity, avatar-only and speaking-only modes, and automatic game detection triggers.
- **Server AFK Voice Channels & DND Moderation**: Automated inactivity tracking moves idle voice users to designated AFK channels. Administrators can drag-and-drop members across voice channels with signed authorization checks.
- **60 FPS Screen Sharing & Loopback AEC**: Multi-resolution (up to Original / 60 FPS) window and desktop streaming with an AudioWorklet loopback echo canceller (`loopback-aec-worklet.js`) that removes self-echo from desktop audio capture.
- **Webcam Streaming & Live PiP Compositor**: Standalone camera broadcasting and real-time screen-plus-webcam compositing (`WebcamStreamCompositor`) with 4-corner placement, mirroring, and background-safe timers.
- **Multi-Stream Channel Grid**: Watch multiple concurrent voice-channel streams in an adaptive grid with per-tile audio focus, inline, floating GPU-accelerated PiP, and fullscreen modes.
- **Synchronized Watch Party & P2P Cinema**: Watch YouTube, web videos, or P2P torrent/magnet streams in sync with peers. Includes local HTTP range chunking, on-the-fly FFmpeg remuxing/stereo downmixing, multi-audio track & subtitle switching, and intelligent audio ducking when peers speak.
- **Synchronized Jukebox & Music Island**: Embedded `yt-dlp` streaming from YouTube and SoundCloud synchronized across the room.

## Chat, Forums & Expressive Freedom

- **Zero Paywalls Customization**: Native animated GIF/WebP avatars and banners, per-server custom profiles (nickname, avatar, banner color, custom link), custom emoji packs with remote catalog syncing, and community `.onipkg` sticker packs.
- **Collaborative Real-Time Whiteboard**: P2P-synchronized canvas with live cursors, pen/highlighter, eraser, sticky notes, shapes, smart-routed connectors, text, sections, stamps, snap guides, and PNG export.
- **Forum Channels & Threads**: Dedicated forum channels (`type: "forum"`) with structured post cards, `#tag` filtering, and isolated thread side panels.
- **Message Forwarding, Pinning & Activity Invites**: Cross-channel message forwarding, a pinned messages modal with jump-to-message highlighting, emoji reactions, and interactive activity invite cards.
- **Ephemeral Self-Destructing Messages**: Timed messages synchronized across P2P peers with clock-skew guards, live countdown badges, and automatic deletion.
- **NSFW (+18) Channel & Attachment Policies**: Per-channel NSFW flags, attachment-level tagging, global auto-blur, and click-to-reveal overlays.
- **Virtualized Feed, Mosaic Galleries & Rich Embeds**: 60 FPS virtualized chat scrolling, responsive mosaic media grids, HiDPI virtualized PDF viewer with native text selection, and Spotify/Pinterest/OpenGraph embed cards.
- **Floating WYSIWYG Bar & Slash Commands**: Selection-anchored formatting toolbar, keyboard shortcuts (`Ctrl+B`, `Ctrl+I`, `Ctrl+Shift+S`, `Ctrl+E`), `@mentions` / `/commands` keyboard navigation, and rich P2P invite cards.
- **Autonomous Webhooks & Feed Ingress**: Local Discord-compatible HTTP webhook server and autonomous RSS/Atom/JSON feed polling over the P2P swarm.

## Roles, Moderation & Migration

- **Role Hierarchy, Granular Permissions & Audit Log**: Drag-and-drop role ordering, custom colors, auto-assigned default roles, per-channel role permissions, and a real-time Server Audit Log.
- **Discord Server Template Import**: One-click server structure migration from `discord.new` / `discord.com/template` links, mapping categories, channels, roles, and permission bitflags.
- **Server Storage & Media Explorer**: Categorized browser for shared server files and media with inline previews and cache cleanup controls.

## Settings, Themes, Backups & Plugins

- **Adaptive Light/Dark Themes, Custom CSS & Server Rail DND**: Full semantic token system supporting Light and Dark modes, custom backgrounds, live runtime CSS injection, dynamic saturation/lightness tuning, and pointer-events drag-and-drop server folders.
- **Global Keybindings & Mouse Shortcuts**: System-wide hotkeys via `uiohook-napi` (supporting keyboard and mouse buttons) for mute, deafen, voice disconnect, server switching, search, and whiteboard tools.
- **Multi-Language Support (i18n)**: Dynamic localization for Spanish, English, and Portuguese.
- **Universal Settings Search & Flash Navigation**: Real-time keyword search across all app and server settings with auto-scroll and visual flash highlights.
- **Native Backup & Vault System (`.onipkg` / `.onibackup`)**: Category-granular encrypted export and restoration (profile, servers, chats, plugins, stickers) with scheduled automatic backups and retention policies.
- **Auto-Updater, Deep Links & Developer Tools**: GitHub Releases auto-updater with in-app changelog, `onicord://` URI protocol & `.onipkg` file associations, local HTTP MCP Bridge (`127.0.0.1:42884`), and a Dev Sandbox for diagnostics and log export.
- **Sandboxed Plugin Ecosystem & Dashboard Widgets**: Drag-and-drop `.onipkg` addons executing in isolated V8/iframe sandboxes (`SandboxedPluginFrame`) with real-time CSS theme synchronization (`window.onicord.theme`), plus built-in Bento Dashboard widgets (Music Jukebox, Gaming & Activity, P2P Diagnostics, Hardware Monitor, Shared Files, Weather Forecast, World Clock, and Sketchpad).

---

[Back to README](../../README.md)
