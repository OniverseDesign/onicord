const { BrowserWindow, app } = require("electron");
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

// ─── CREDENTIALS & PKCE (RFC 7636) ───────────────────────────────────────────
// Las credenciales de Google OAuth se leen exclusivamente desde variables de entorno o .env local
const DEFAULT_CLIENT_ID = "";

function getGoogleCredentials() {
  let clientId = process.env.GOOGLE_CLIENT_ID || "";
  let clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";

  if (clientId) {
    return { clientId, clientSecret };
  }

  const candidatePaths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(__dirname, "../../.env"),
    typeof app?.getAppPath === "function" ? path.resolve(app.getAppPath(), ".env") : "",
    typeof app?.getPath === "function" ? path.resolve(app.getPath("userData"), ".env") : ""
  ].filter(Boolean);

  for (const envPath of candidatePaths) {
    try {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
            if (key === "GOOGLE_CLIENT_ID" && !clientId) clientId = val;
            if (key === "GOOGLE_CLIENT_SECRET" && !clientSecret) clientSecret = val;
          }
        }
        if (clientId) break;
      }
    } catch {}
  }

  return {
    clientId: clientId || DEFAULT_CLIENT_ID,
    clientSecret: clientSecret || ""
  };
}

function generateCodeVerifier() {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

const REDIRECT_PORT = 42800;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;
const SCOPES = "https://www.googleapis.com/auth/drive.appdata";
const TOKEN_FILENAME = "drive-tokens.enc";

// ─── ENCRYPTION (AES-256-GCM keyed by machine path) ──────────────────────────
function getDerivedKey() {
  const seed = `${app.getName()}::${app.getPath("userData")}`;
  return crypto.createHash("sha256").update(seed).digest();
}

function encryptTokens(tokenObj) {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plain = JSON.stringify(tokenObj);
  let enc = cipher.update(plain, "utf8", "hex");
  enc += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${enc}:${tag}`;
}

function decryptTokens(raw) {
  try {
    const key = getDerivedKey();
    const parts = raw.split(":");
    if (parts.length !== 3) return null;
    const iv = Buffer.from(parts[0], "hex");
    const enc = Buffer.from(parts[1], "hex");
    const tag = Buffer.from(parts[2], "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    let dec = decipher.update(enc, "hex", "utf8");
    dec += decipher.final("utf8");
    return JSON.parse(dec);
  } catch {
    return null;
  }
}

function getTokenPath() {
  return path.join(app.getPath("userData"), TOKEN_FILENAME);
}

function saveTokens(tokenObj) {
  const enc = encryptTokens(tokenObj);
  fs.writeFileSync(getTokenPath(), enc, "utf8");
}

function loadTokens() {
  try {
    const raw = fs.readFileSync(getTokenPath(), "utf8");
    return decryptTokens(raw);
  } catch {
    return null;
  }
}

function deleteTokens() {
  try { fs.unlinkSync(getTokenPath()); } catch {}
}

// ─── TOKEN EXCHANGE (PKCE) ────────────────────────────────────────────────────
async function exchangeCodeForTokens(code, codeVerifier) {
  const { clientId, clientSecret } = getGoogleCredentials();
  if (!clientId) {
    throw new Error("Client ID de Google no configurado.");
  }

  const params = {
    code,
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
  };
  if (codeVerifier) {
    params.code_verifier = codeVerifier;
  }
  if (clientSecret) {
    params.client_secret = clientSecret;
  }

  const body = new URLSearchParams(params);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const data = await res.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expiry: Date.now() + (data.expires_in - 60) * 1000,
    email: null,
  };
}

async function refreshAccessToken(tokens) {
  const { clientId, clientSecret } = getGoogleCredentials();
  if (!clientId) {
    throw new Error("Client ID de Google no configurado.");
  }

  const params = {
    client_id: clientId,
    refresh_token: tokens.refresh_token,
    grant_type: "refresh_token",
  };
  if (clientSecret) {
    params.client_secret = clientSecret;
  }

  const body = new URLSearchParams(params);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[driveAuthService] Token refresh failed:", res.status, errText);
    // Si el refresh token caducó o fue revocado (invalid_grant), eliminamos las credenciales obsoletas
    if (res.status === 400 || res.status === 401) {
      deleteTokens();
    }
    throw new Error(`Token refresh failed: ${errText || res.statusText}`);
  }
  const data = await res.json();
  const updated = {
    ...tokens,
    access_token: data.access_token,
    expiry: Date.now() + (data.expires_in - 60) * 1000,
  };
  saveTokens(updated);
  return updated;
}

async function fetchUserInfo(accessToken) {
  try {
    const res = await fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      console.error(`[driveAuthService] Drive about GET failed: ${res.status}`);
      return null;
    }
    const data = await res.json();
    const u = data.user;
    if (!u) return null;

    let photo = u.photoLink || null;
    if (photo && photo.startsWith("//")) {
      photo = `https:${photo}`;
    }

    return {
      email: u.emailAddress || null,
      picture: photo,
      name: u.displayName || null,
    };
  } catch (err) {
    console.error("[driveAuthService] Error fetching Drive user info:", err);
    return null;
  }
}

// ─── PUBLIC API ───────────────────────────────────────────────────────────────
function isConnected() {
  return fs.existsSync(getTokenPath());
}

function getConnectedEmail() {
  const tokens = loadTokens();
  return tokens?.email || null;
}

async function getConnectedUser() {
  let tokens = loadTokens();
  if (!tokens) return null;

  // If picture or name is missing, fetch fresh user info from Drive API
  if ((!tokens.picture || !tokens.name) && (tokens.access_token || tokens.refresh_token)) {
    try {
      const token = await getValidToken();
      const info = await fetchUserInfo(token);
      if (info) {
        tokens = {
          ...tokens,
          email: info.email || tokens.email,
          picture: info.picture || tokens.picture,
          name: info.name || tokens.name,
        };
        saveTokens(tokens);
      }
    } catch (err) {
      console.error("[driveAuthService] Error in getConnectedUser update:", err);
    }
  }

  return {
    email: tokens.email || null,
    picture: tokens.picture || null,
    name: tokens.name || null,
  };
}

async function getValidToken() {
  let tokens = loadTokens();
  if (!tokens) throw new Error("Not connected to Google Drive");
  if (Date.now() > tokens.expiry) {
    tokens = await refreshAccessToken(tokens);
  }
  return tokens.access_token;
}

async function authorize() {
  const { clientId } = getGoogleCredentials();
  if (!clientId) {
    throw new Error("Client ID de Google no configurado.");
  }

  return new Promise((resolve, reject) => {
    const state = crypto.randomBytes(16).toString("hex");
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", clientId);
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", SCOPES);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("code_challenge", codeChallenge);
    authUrl.searchParams.set("code_challenge_method", "S256");

    let authWindow = null;
    let server = null;
    let settled = false;

    const settle = (err, result) => {
      if (settled) return;
      settled = true;
      try { server?.close(); } catch {}
      try { if (authWindow && !authWindow.isDestroyed()) authWindow.close(); } catch {}
      if (err) reject(err);
      else resolve(result);
    };

    server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
        if (reqUrl.pathname !== "/oauth2callback") {
          res.writeHead(404); res.end(); return;
        }

        const returnedState = reqUrl.searchParams.get("state");
        const code = reqUrl.searchParams.get("code");
        const error = reqUrl.searchParams.get("error");

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<!DOCTYPE html><html><body style="font-family:sans-serif;background:#1e1e2e;color:#cdd6f4;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center"><h2 style="color:#89b4fa">&#10003; Onicord conectado</h2><p>Podés cerrar esta ventana y volver a Onicord.</p></body></html>`);

        if (error) { settle(new Error(`Google auth error: ${error}`)); return; }
        if (returnedState !== state) { settle(new Error("State mismatch — possible CSRF")); return; }
        if (!code) { settle(new Error("No authorization code received")); return; }

        const tokens = await exchangeCodeForTokens(code, codeVerifier);
        const userInfo = await fetchUserInfo(tokens.access_token);
        if (userInfo) {
          tokens.email = userInfo.email;
          tokens.picture = userInfo.picture;
          tokens.name = userInfo.name;
        }
        saveTokens(tokens);
        settle(null, { connected: true, user: userInfo, email: tokens.email });
      } catch (err) {
        settle(err);
      }
    });

    server.listen(REDIRECT_PORT, "127.0.0.1", () => {
      authWindow = new BrowserWindow({
        width: 520,
        height: 680,
        title: "Conectar Google Drive — Onicord",
        webPreferences: { nodeIntegration: false, contextIsolation: true },
        autoHideMenuBar: true,
        resizable: false,
        parent: global.mainWindow || null,
        modal: false,
      });

      authWindow.loadURL(authUrl.toString());
      authWindow.on("closed", () => {
        settle(new Error("Ventana de autenticación cerrada por el usuario."));
      });
    });

    server.on("error", (err) => settle(err));
  });
}

async function disconnect() {
  try {
    const tokens = loadTokens();
    if (tokens?.access_token) {
      fetch(`https://oauth2.googleapis.com/revoke?token=${tokens.access_token}`, {
        method: "POST",
      }).catch(() => {});
    }
  } catch {}
  deleteTokens();
  return { disconnected: true };
}

module.exports = {
  isConnected,
  getConnectedEmail,
  getConnectedUser,
  getValidToken,
  authorize,
  disconnect,
  getGoogleCredentials,
};
