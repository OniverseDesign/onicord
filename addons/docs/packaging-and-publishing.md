# Addon Packaging and Publishing

Guide to structuring, compiling `.onipkg` bundles, testing locally, and distributing addons to the community or official catalog.

---

## 1. Directory Structure

Every addon resides inside its own folder matching its clean plugin ID:

```text
my-custom-addon/
├── manifest.json                  # Manifest, metadata, permissions, and entry points
├── index.js                       # Background V8 Sandbox script (commands, button listeners)
├── assets/
│   └── icon.png                   # Addon avatar/icon (PNG, SVG, or WebP)
└── widgets/
    └── main.html                  # Sandboxed UI widget (Dashboard, Island, or Stage)
```

---

## 2. Complete `manifest.json` Example

```json
{
  "id": "my-custom-addon",
  "name": "My Custom Addon",
  "version": "0.2.0",
  "scope": "hybrid",
  "author": "Your Name",
  "description": "Collaborative room widgets and custom slash commands",
  "main": "index.js",
  "icon": "assets/icon.png",
  "permissions": [
    "user.profile",
    "server.info",
    "p2p.network",
    "storage",
    "chat.read",
    "chat.send"
  ],
  "dashboardWidgets": [
    {
      "id": "main_widget",
      "title": "Room Tool",
      "badgeText": "Live",
      "type": "collaborative",
      "bgVariant": "sapphire",
      "entryPoint": "widgets/main.html",
      "defaultGeo": { "x": 1, "y": 1, "w": 2, "h": 2 }
    }
  ]
}
```

---

## 3. Compilation Methods (`.onipkg`)

An `.onipkg` package is a compressed gzip bundle combining `manifest.json` with all source assets in a unified archive.

### Method A: In-App Packaging Tool
1. Open Onicord and navigate to **Settings > Addons**.
2. Click **Package addon folder** (`Empaquetar carpeta de complemento`).
3. Select your local addon directory.
4. Onicord validates the manifest, compresses source files, and produces `<plugin-id>.onipkg` directly inside the folder.

### Method B: Command-Line Compiler (`node build.js`)
From the `addons/` directory:

```bash
node build.js
```

The script will:
1. Scan all addon folders in `addons/`.
2. Validate `manifest.json` syntax, declared permissions, and scopes.
3. Generate compressed packages at `plugins/<plugin-id>/package.onipkg`.
4. Update `index.json` with the latest version metadata.

---

## 4. Distribution Channels

### Option 1: Direct Decentralized Distribution (Zero Approval Needed)
Because Onicord is decentralized, developers can distribute `.onipkg` files directly:
- **Direct File Transfer**: Send the `package.onipkg` file directly inside any Onicord chat room. Peers can install it into their local library with one click.
- **Self-Hosting**: Host `.onipkg` packages on GitHub Releases, community websites, or personal servers.
- **Importing**: Users install packages via **Settings > Addons > Import .onipkg** or by dragging and dropping `.onipkg` files into the app.

### Option 2: Publishing to the Official In-App Store Catalog
To have your addon listed in the official In-App Store (**Settings > Addons**):

1. Fork the `OniverseDesign/onicord` repository on GitHub.
2. Place your addon source folder in `addons/<addon-id>/`.
3. Run `node addons/build.js` to compile the package and update `index.json`.
4. Commit your changes and open a Pull Request.

#### Review Guidelines
Official catalog submissions undergo a security and architecture audit:
- **Principle of Least Privilege**: Addons must only request permissions strictly necessary for their features.
- **Sandbox Compliance**: Scripts must operate purely inside the V8 sandbox and iframe boundaries without attempting host probes.
- **Code Clarity**: Code must be readable, well-structured, and unobfuscated.
- **Protocol Safety**: URLs and media sources must use secure schemes (`https:`, `http:` local proxy, `onicord-media:`).

---

## 5. Navigation and Cross-References

- [Architecture Overview](architecture.md) - Host isolation and sandboxing models.
- [Scopes and Lifecycle](scopes-and-lifecycle.md) - Scope taxonomy and room binding lifecycles.
- [API Reference](api-reference.md) - Complete documentation of the 14 runtime interaction vectors.
- [Permissions and Security](permissions-and-security.md) - Complete permissions matrix and security policies.

