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
