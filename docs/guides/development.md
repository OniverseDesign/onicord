# Development & Packaging Guide

## Prerequisites

- **Node.js**: v20.0.0 or higher (v22 LTS recommended)
- **npm**: v8 or higher

## Getting Started

1. **Clone the repository:**
   ```bash
   git clone https://github.com/OniverseDesign/onicord.git
   cd onicord
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```
   *(This runs `postinstall` to configure `better-sqlite3` for Electron.)*

3. **Start the development environment:**
   ```bash
   npm run start
   ```
   Launches the Vite development server and the native Electron application concurrently.

## Useful Development Scripts

```bash
# Build frontend production bundle (Vite)
npm run build

# Verify localization parity across English, Spanish, and Portuguese
npm run check:i18n

# Scan UI components for untokenized or hardcoded color classes
node scripts/audit-theme-classes.cjs

# Ensure platform-specific yt-dlp binary is present
npm run ensure-ytdlp
```

## Packaging & Releases

Compile standalone installers and binaries with `electron-builder`:

```bash
# Windows (NSIS installer & standalone portable executable)
npm run pack
npm run pack:portable

# Linux (Universal AppImage & Debian .deb package)
npm run pack:linux

# macOS (DMG installer & zipped bundle)
npm run pack:mac

# All platforms
npm run pack:all

# Export and synchronize release state to GitHub
npm run export:github
```

Compiled binaries are output to `release/`. Automated multi-platform builds and `SHA256SUMS.txt` generation also run via GitHub Actions (`.github/workflows/release.yml`) whenever a `v*` tag is pushed.

## Technology Stack

- **Desktop Runtime**: Electron 33 (CommonJS Main & Preload processes)
- **User Interface**: React 18, Vite 5, Tailwind CSS 3.4 (adaptive Light/Dark semantic tokens), Zustand 5
- **Database & Storage**: `better-sqlite3` (WAL mode) + SHA-256 Content-Addressed Storage (CAS)
- **P2P Networking**: Hyperswarm (DHT & NAT hole punching) + `simple-peer` (WebRTC mesh)
- **Media & Documents**: Embedded `yt-dlp`, `@ffmpeg-installer/ffmpeg`, `torrent-stream`, `hls.js`, `pdfjs-dist`
- **Security**: Node.js `crypto` (AES-256-GCM)
- **Internationalization**: `i18next` / `react-i18next` (English, Spanish, Portuguese)

---

[Back to README](../../README.md)
