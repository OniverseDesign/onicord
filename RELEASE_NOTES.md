# Onicord v0.1.5

## Changes

- **Activity & Game Detection**: Full game and desktop application activity tracking, custom executable registration, allowlist management, and continuous playtime tracking.
- **Discord RPC Socket Server**: Built-in Discord-compatible IPC socket server enabling emulators and games to broadcast rich presence metadata and high-resolution cover art.
- **Official Arcade Addon & Stage**: Added official Arcade gaming addon (`/arcade`) with built-in ad/tracker protection, voice channel stage view, automated session teardown upon exit, and cache management.
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
