// In-memory demo bridge for running the Onicord UI shell in a web browser (GitHub Pages).
// Only loaded in demo builds (VITE_DEMO=true) or when ?demo=1 is present without Electron.

function svgAvatar(bg1, bg2, initials) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${bg1}"/><stop offset="100%" stop-color="${bg2}"/></linearGradient></defs><rect width="128" height="128" rx="64" fill="url(#g)"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#11111b" font-family="system-ui,sans-serif" font-weight="800" font-size="48">${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function svgBanner(c1, c2) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200" viewBox="0 0 600 200"><defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect width="600" height="200" fill="url(#b)"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function svgSticker(bg, emoji, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><rect x="8" y="8" width="144" height="144" rx="28" fill="${bg}"/><text x="80" y="82" dominant-baseline="middle" text-anchor="middle" font-size="64">${emoji}</text><text x="80" y="132" text-anchor="middle" fill="#cdd6f4" font-family="system-ui,sans-serif" font-weight="700" font-size="14">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const DEMO_USERS = {
  me: {
    id: "demo-me",
    userId: "demo-me",
    peerId: "demo-me",
    nickname: "Criss",
    status: "online",
    online: true,
    customStatus: "Probando Onicord P2P ✨",
    bio: "Creador de Onicord. 100% P2P, cifrado de extremo a extremo y sin servidores centrales.",
    avatar: svgAvatar("#cba6f7", "#89b4fa", "CR"),
    bannerColor: "#cba6f7",
    banner: svgBanner("#313244", "#cba6f7"),
    roleId: "role-founder",
    roles: ["role-founder", "role-dev"],
  },
  luna: {
    id: "demo-luna",
    userId: "demo-luna",
    peerId: "demo-luna",
    nickname: "Luna",
    status: "online",
    online: true,
    customStatus: "Escuchando Synthwave 🎧",
    bio: "Diseñadora de interfaces & amante del audio lossless.",
    avatar: svgAvatar("#f5c2e7", "#cba6f7", "LU"),
    banner: svgBanner("#45475a", "#f5c2e7"),
    roleId: "role-dev",
    roles: ["role-dev"],
    activity: { name: "Onicord Jukebox", type: "listening" },
  },
  kairo: {
    id: "demo-kairo",
    userId: "demo-kairo",
    peerId: "demo-kairo",
    nickname: "Kairo",
    status: "online",
    online: true,
    customStatus: "60 FPS Screen Share 🚀",
    bio: "Ingeniero de redes P2P. Hyperswarm + WebRTC.",
    avatar: svgAvatar("#89b4fa", "#74c7ec", "KA"),
    banner: svgBanner("#1e1e2e", "#89b4fa"),
    roleId: "role-dev",
    roles: ["role-dev"],
    activity: { name: "Hollow Knight: Silksong", type: "playing" },
  },
  vex: {
    id: "demo-vex",
    userId: "demo-vex",
    peerId: "demo-vex",
    nickname: "Vex",
    status: "dnd",
    online: true,
    customStatus: "En Watch Party 🍿",
    bio: "Probando addons y temas personalizados.",
    avatar: svgAvatar("#a6e3a1", "#94e2d5", "VX"),
    banner: svgBanner("#1e1e2e", "#a6e3a1"),
    roleId: "role-supporter",
    roles: ["role-supporter"],
  },
  nova: {
    id: "demo-nova",
    userId: "demo-nova",
    peerId: "demo-nova",
    nickname: "Nova",
    status: "idle",
    online: true,
    customStatus: "AFK por un café ☕",
    bio: "Moderadora de la comunidad.",
    avatar: svgAvatar("#fab387", "#f9e2af", "NV"),
    banner: svgBanner("#313244", "#fab387"),
    roleId: "role-supporter",
    roles: ["role-supporter"],
  },
};

const DEMO_ROLES = [
  { id: "role-founder", name: "Founder", color: "#cba6f7", hoist: true, position: 3, permissions: ["administrator"] },
  { id: "role-dev", name: "Core Dev", color: "#89b4fa", hoist: true, position: 2, permissions: ["manage_channels", "send_messages"] },
  { id: "role-supporter", name: "Supporter", color: "#a6e3a1", hoist: true, position: 1, permissions: ["send_messages"] },
];

const DEMO_SERVERS = [
  {
    id: "srv-onicord",
    name: "Onicord HQ",
    roomCode: "ONICORD1",
    isOwner: true,
    icon: svgAvatar("#cba6f7", "#89b4fa", "OH"),
    banner: svgBanner("#1e1e2e", "#cba6f7"),
    lastChannelId: "general",
    roles: DEMO_ROLES,
    categories: [
      { id: "cat-text", name: "Comunidad", position: 0 },
      { id: "cat-voice", name: "Canales de Voz & Música", position: 1 },
    ],
    channels: [
      { id: "general", name: "general", type: "text", categoryId: "cat-text", topic: "Bienvenido a la demo interactiva de Onicord — 100% P2P" },
      { id: "desarrollo", name: "desarrollo", type: "text", categoryId: "cat-text", topic: "Cifrado Noise XX, WebRTC 60 FPS y plugins .onipkg" },
      { id: "musica-clips", name: "música-y-clips", type: "text", categoryId: "cat-text", topic: "Comparte temas para el Jukebox sincronizado" },
      { id: "lounge-p2p", name: "Lounge P2P", type: "voice", categoryId: "cat-voice" },
      { id: "gaming-60fps", name: "Gaming 60FPS", type: "voice", categoryId: "cat-voice" },
    ],
    savedMembers: Object.values(DEMO_USERS),
  },
  {
    id: "srv-indie",
    name: "Indie Dev Lab",
    roomCode: "INDIELAB",
    isOwner: false,
    icon: svgAvatar("#a6e3a1", "#74c7ec", "ID"),
    banner: svgBanner("#181825", "#a6e3a1"),
    lastChannelId: "showcase",
    roles: DEMO_ROLES,
    categories: [
      { id: "cat-indie-1", name: "Proyectos", position: 0 },
      { id: "cat-indie-2", name: "Salas", position: 1 },
    ],
    channels: [
      { id: "showcase", name: "showcase", type: "text", categoryId: "cat-indie-1", topic: "Muestra tus avances y prototipos" },
      { id: "recursos", name: "recursos", type: "text", categoryId: "cat-indie-1", topic: "Shaders, UI kits y herramientas open-source" },
      { id: "coworking", name: "Coworking", type: "voice", categoryId: "cat-indie-2" },
    ],
    savedMembers: [DEMO_USERS.me, DEMO_USERS.kairo, DEMO_USERS.luna],
  },
  {
    id: "srv-chill",
    name: "Chill & Lo-Fi",
    roomCode: "CHILLFM1",
    isOwner: false,
    icon: svgAvatar("#f5c2e7", "#fab387", "CF"),
    banner: svgBanner("#1e1e2e", "#f5c2e7"),
    lastChannelId: "playlists",
    roles: DEMO_ROLES,
    categories: [{ id: "cat-chill-1", name: "Música", position: 0 }],
    channels: [
      { id: "playlists", name: "playlists", type: "text", categoryId: "cat-chill-1", topic: "Playlists colaborativas para programar" },
      { id: "radio-247", name: "Radio 24/7", type: "voice", categoryId: "cat-chill-1" },
    ],
    savedMembers: [DEMO_USERS.me, DEMO_USERS.luna, DEMO_USERS.vex, DEMO_USERS.nova],
  },
];

const now = Date.now();
const min = 60 * 1000;

const INITIAL_MESSAGES = {
  "ONICORD1:general": [
    {
      id: "msg-1",
      channelId: "general",
      userId: DEMO_USERS.luna.id,
      nickname: DEMO_USERS.luna.nickname,
      avatar: DEMO_USERS.luna.avatar,
      timestamp: now - 18 * min,
      text: "¡Bienvenidos a **Onicord**! Todo lo que ves aquí corre de forma descentralizada sobre **Hyperswarm DHT** y **WebRTC**, sin servidores centrales ni cuentas. 🚀",
      reactions: { "🚀": [DEMO_USERS.me.id, DEMO_USERS.kairo.id], "💜": [DEMO_USERS.vex.id, DEMO_USERS.nova.id] },
    },
    {
      id: "msg-2",
      channelId: "general",
      userId: DEMO_USERS.kairo.id,
      nickname: DEMO_USERS.kairo.nickname,
      avatar: DEMO_USERS.kairo.avatar,
      timestamp: now - 12 * min,
      text: "Acabo de activar el **Jukebox sincronizado** en `Lounge P2P` y compartir pantalla a **60 FPS** con eco cancelado. ¿Se escucha limpio?",
      replyTo: {
        id: "msg-1",
        nickname: DEMO_USERS.luna.nickname,
        text: "¡Bienvenidos a Onicord! Todo lo que ves aquí corre de forma descentralizada...",
      },
      reactions: { "🔥": [DEMO_USERS.me.id, DEMO_USERS.luna.id] },
    },
    {
      id: "msg-3",
      channelId: "general",
      userId: DEMO_USERS.vex.id,
      nickname: DEMO_USERS.vex.nickname,
      avatar: DEMO_USERS.vex.avatar,
      timestamp: now - 7 * min,
      text: "Cristalino 👌 Además probé cambiar el tema adaptable a modo claro y los plugins `.onipkg` se sincronizaron al instante.",
      reactions: { "✨": [DEMO_USERS.luna.id] },
    },
    {
      id: "msg-4",
      channelId: "general",
      userId: DEMO_USERS.me.id,
      nickname: DEMO_USERS.me.nickname,
      avatar: DEMO_USERS.me.avatar,
      timestamp: now - 3 * min,
      text: "¡Escribe un mensaje abajo, haz clic en los perfiles de la derecha o cambia de canal para explorar la interfaz!",
      reactions: { "👀": [DEMO_USERS.luna.id, DEMO_USERS.kairo.id, DEMO_USERS.vex.id] },
    },
  ],
  "ONICORD1:desarrollo": [
    {
      id: "msg-dev-1",
      channelId: "desarrollo",
      userId: DEMO_USERS.kairo.id,
      nickname: DEMO_USERS.kairo.nickname,
      avatar: DEMO_USERS.kairo.avatar,
      timestamp: now - 25 * min,
      text: "Cada sala separa su secreto de enrutamiento DHT de las claves de cifrado por época (`[E2EE2:eN]:` con HKDF-SHA256 + AES-256-GCM).\n```js\nconst roomKey = hkdfSha256(epochSecret, 'onicord-e2ee2');\n```",
      reactions: { "🔐": [DEMO_USERS.me.id, DEMO_USERS.luna.id] },
    },
  ],
  "ONICORD1:musica-clips": [
    {
      id: "msg-mus-1",
      channelId: "musica-clips",
      userId: DEMO_USERS.luna.id,
      nickname: DEMO_USERS.luna.nickname,
      avatar: DEMO_USERS.luna.avatar,
      timestamp: now - 9 * min,
      text: "Sonando ahora en el canal de voz **Lounge P2P**: *Midnight City (P2P Synthwave Mix)* 🎶",
      reactions: { "🎧": [DEMO_USERS.me.id, DEMO_USERS.vex.id] },
    },
  ],
  "INDIELAB:showcase": [
    {
      id: "msg-ind-1",
      channelId: "showcase",
      userId: DEMO_USERS.kairo.id,
      nickname: DEMO_USERS.kairo.nickname,
      avatar: DEMO_USERS.kairo.avatar,
      timestamp: now - 15 * min,
      text: "Subí un nuevo widget interactivo en `.onipkg` con sincronización P2P en tiempo real.",
    },
  ],
  "CHILLFM1:playlists": [
    {
      id: "msg-ch-1",
      channelId: "playlists",
      userId: DEMO_USERS.luna.id,
      nickname: DEMO_USERS.luna.nickname,
      avatar: DEMO_USERS.luna.avatar,
      timestamp: now - 20 * min,
      text: "Lo-Fi & Synthwave 24/7 para sesiones largas de código 🌙☕",
    },
  ],
};

const DEMO_EMOJIS = [
  { id: "emo-onicord", shortcode: "onicord", name: "onicord", ext: "svg", url: svgAvatar("#cba6f7", "#89b4fa", "O"), packName: "Onicord Demo" },
  { id: "emo-p2p", shortcode: "p2p_mesh", name: "p2p_mesh", ext: "svg", url: svgAvatar("#a6e3a1", "#94e2d5", "P2P"), packName: "Onicord Demo" },
  { id: "emo-60fps", shortcode: "60fps", name: "60fps", ext: "svg", url: svgAvatar("#fab387", "#f38ba8", "60"), packName: "Onicord Demo" },
];

const DEMO_STICKERS = [
  { id: "stk-1", name: "Hype!", packName: "Onicord Pack", url: svgSticker("#313244", "🚀", "HYPE") },
  { id: "stk-2", name: "Comfy", packName: "Onicord Pack", url: svgSticker("#313244", "☕", "COMFY") },
  { id: "stk-3", name: "GGWP", packName: "Onicord Pack", url: svgSticker("#313244", "🎮", "GGWP") },
  { id: "stk-4", name: "P2P", packName: "Onicord Pack", url: svgSticker("#313244", "🛡️", "E2EE") },
];

export function initDemoBridge() {
  if (typeof window === "undefined" || window.electronAPI) return;
  window.__ONICORD_DEMO__ = true;

  let myProfile = { ...DEMO_USERS.me };
  const messagesStore = new Map(Object.entries(INITIAL_MESSAGES));
  const listeners = new Map();
  const musicStateListeners = new Set();
  const chatListeners = new Set();

  const emit = (event, payload) => {
    const set = listeners.get(event);
    if (set) set.forEach((cb) => { try { cb(payload); } catch {} });
  };

  const DEMO_TRACK = {
    id: "demo-track-1",
    title: "Midnight City (P2P Synthwave Mix)",
    artist: "Oniverse Radio",
    duration: 224,
    thumbnail: svgBanner("#313244", "#cba6f7"),
    url: "https://example.com/demo-track",
  };

  const baseAPI = {
    getProfile: async () => myProfile,
    saveProfile: async (next) => {
      myProfile = { ...myProfile, ...next };
      return myProfile;
    },
    listServers: async () => DEMO_SERVERS,
    getLastServer: async () => DEMO_SERVERS[0].id,
    setLastServer: async () => true,
    enterServer: async (serverId) => {
      return DEMO_SERVERS.find((s) => s.id === serverId || s.roomCode === serverId) || DEMO_SERVERS[0];
    },
    getRoomState: async (roomCode) => {
      const srv = DEMO_SERVERS.find((s) => s.roomCode === roomCode) || DEMO_SERVERS[0];
      return {
        roomCode: srv.roomCode,
        peers: srv.savedMembers,
      };
    },
    getChatHistory: async (roomCode, channelId) => {
      const key = `${roomCode}:${channelId}`;
      return [...(messagesStore.get(key) || [])];
    },
    sendChatMessage: async (roomCode, channelId, text, extra = {}) => {
      const key = `${roomCode}:${channelId}`;
      const msg = {
        id: `demo-msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        channelId,
        roomCode,
        userId: myProfile.id,
        nickname: myProfile.nickname,
        avatar: myProfile.avatar,
        timestamp: Date.now(),
        text: typeof text === "string" ? text : String(text || ""),
        replyTo: extra?.replyTo || null,
        reactions: {},
      };
      const arr = messagesStore.get(key) || [];
      arr.push(msg);
      messagesStore.set(key, arr);
      chatListeners.forEach((cb) => { try { cb(msg); } catch {} });

      // Simular respuesta amigable en modo demo si es un mensaje normal
      if (typeof msg.text === "string" && !msg.text.startsWith("[")) {
        setTimeout(() => {
          const reply = {
            id: `demo-reply-${Date.now()}`,
            channelId,
            roomCode,
            userId: DEMO_USERS.luna.id,
            nickname: DEMO_USERS.luna.nickname,
            avatar: DEMO_USERS.luna.avatar,
            timestamp: Date.now(),
            text: "¡Mensaje recibido en la demo interactiva! ✨",
            replyTo: { id: msg.id, nickname: myProfile.nickname, text: msg.text.slice(0, 80) },
          };
          arr.push(reply);
          chatListeners.forEach((cb) => { try { cb(reply); } catch {} });
        }, 900);
      }
      return msg;
    },
    listLocalEmojis: async () => DEMO_EMOJIS,
    listLocalStickers: async () => DEMO_STICKERS,
    getStickerPath: async (id) => {
      const found = DEMO_STICKERS.find((s) => s.id === id);
      return found ? found.url : null;
    },
    loadHistory: async () => [DEMO_TRACK],
    onChatMessage: (cb) => {
      chatListeners.add(cb);
      return () => chatListeners.delete(cb);
    },
    onMusicChannelState: (cb) => {
      musicStateListeners.add(cb);
      setTimeout(() => {
        try {
          cb({
            roomCode: "ONICORD1",
            channelId: "lounge-p2p",
            currentTrack: DEMO_TRACK,
            playlist: [DEMO_TRACK],
            isPlaying: true,
            repeatMode: 1,
            currentTime: 64,
            updatedAt: Date.now(),
            djUserId: DEMO_USERS.luna.id,
          });
        } catch {}
      }, 250);
      return () => musicStateListeners.delete(cb);
    },
    on: (event, cb) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(cb);
      if (event === "peer:updated") {
        setTimeout(() => {
          DEMO_SERVERS[0].savedMembers.forEach((m) => emit("peer:updated", m));
        }, 150);
      }
      return () => listeners.get(event)?.delete(cb);
    },
    openExternalLink: (url) => {
      if (url && /^https?:\/\//i.test(url)) window.open(url, "_blank", "noopener");
    },
    openExternal: (url) => {
      if (url && /^https?:\/\//i.test(url)) window.open(url, "_blank", "noopener");
    },
  };

  window.electronAPI = new Proxy(baseAPI, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === "string" && prop.startsWith("on")) {
        return () => () => {};
      }
      return async () => null;
    },
  });
}
