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

export function resolveDemoLanguage() {
  if (typeof window === "undefined") return "es";
  const param = new URLSearchParams(window.location.search).get("lang");
  const candidate = (
    param ||
    localStorage.getItem("onicord_lang") ||
    localStorage.getItem("onicord_language") ||
    navigator.language ||
    "es"
  )
    .toLowerCase()
    .split("-")[0];
  return candidate === "en" || candidate === "pt" || candidate === "es" ? candidate : "es";
}

const DEMO_COPY = {
  es: {
    meStatus: "Probando Onicord P2P ✨",
    meBio: "Creador de Onicord. 100% P2P, cifrado de extremo a extremo y sin servidores centrales.",
    lunaStatus: "Escuchando Synthwave 🎧",
    lunaBio: "Diseñadora de interfaces & amante del audio lossless.",
    kairoStatus: "Pantalla compartida a 60 FPS 🚀",
    kairoBio: "Ingeniero de redes P2P. Hyperswarm + WebRTC.",
    vexStatus: "En Watch Party 🍿",
    vexBio: "Probando addons y temas personalizados.",
    novaStatus: "AFK por un café ☕",
    novaBio: "Moderadora de la comunidad.",
    catCommunity: "Comunidad",
    catVoice: "Canales de Voz & Música",
    catProjects: "Proyectos",
    catRooms: "Salas",
    catMusic: "Música",
    chGeneralTopic: "Bienvenido a la demo interactiva de Onicord — 100% P2P",
    chDevName: "desarrollo",
    chDevTopic: "Cifrado Noise XX, WebRTC 60 FPS y plugins .onipkg",
    chMusicName: "música-y-clips",
    chMusicTopic: "Comparte temas para el Jukebox sincronizado",
    chShowcaseTopic: "Muestra tus avances y prototipos",
    chResourcesName: "recursos",
    chResourcesTopic: "Shaders, UI kits y herramientas open-source",
    chPlaylistsTopic: "Playlists colaborativas para programar",
    msg1: "¡Bienvenidos a **Onicord**! Todo lo que ves aquí corre de forma descentralizada sobre **Hyperswarm DHT** y **WebRTC**, sin servidores centrales ni cuentas. 🚀",
    msg2: "Acabo de activar el **Jukebox sincronizado** en `Lounge P2P` y compartir pantalla a **60 FPS** con eco cancelado. ¿Se escucha limpio?",
    msg2Reply: "¡Bienvenidos a Onicord! Todo lo que ves aquí corre de forma descentralizada...",
    msg3: "Cristalino 👌 Además probé cambiar el tema adaptable a modo claro y los plugins `.onipkg` se sincronizaron al instante.",
    msg4: "¡Escribe un mensaje abajo, haz clic en los perfiles de la derecha o cambia de canal para explorar la interfaz!",
    msgDev: "Cada sala separa su secreto de enrutamiento DHT de las claves de cifrado por época (`[E2EE2:eN]:` con HKDF-SHA256 + AES-256-GCM).\n```js\nconst roomKey = hkdfSha256(epochSecret, 'onicord-e2ee2');\n```",
    msgMusic: "Sonando ahora en el canal de voz **Lounge P2P**: *Midnight City (P2P Synthwave Mix)* 🎶",
    msgIndie: "Subí un nuevo widget interactivo en `.onipkg` con sincronización P2P en tiempo real.",
    msgChill: "Lo-Fi & Synthwave 24/7 para sesiones largas de código 🌙☕",
    autoReply: "¡Mensaje recibido en la demo interactiva! ✨",
  },
  en: {
    meStatus: "Testing Onicord P2P ✨",
    meBio: "Creator of Onicord. 100% P2P, end-to-end encrypted with zero central servers.",
    lunaStatus: "Listening to Synthwave 🎧",
    lunaBio: "UI designer & lossless audio enthusiast.",
    kairoStatus: "60 FPS Screen Share 🚀",
    kairoBio: "P2P networking engineer. Hyperswarm + WebRTC.",
    vexStatus: "In Watch Party 🍿",
    vexBio: "Testing addons and custom themes.",
    novaStatus: "AFK for coffee ☕",
    novaBio: "Community moderator.",
    catCommunity: "Community",
    catVoice: "Voice & Music Channels",
    catProjects: "Projects",
    catRooms: "Rooms",
    catMusic: "Music",
    chGeneralTopic: "Welcome to the interactive Onicord demo — 100% P2P",
    chDevName: "development",
    chDevTopic: "Noise XX encryption, 60 FPS WebRTC and .onipkg plugins",
    chMusicName: "music-and-clips",
    chMusicTopic: "Share tracks for the synced Jukebox",
    chShowcaseTopic: "Show off your builds and prototypes",
    chResourcesName: "resources",
    chResourcesTopic: "Shaders, UI kits and open-source tools",
    chPlaylistsTopic: "Collaborative playlists for coding",
    msg1: "Welcome to **Onicord**! Everything here runs decentralized over **Hyperswarm DHT** and **WebRTC**, with no central servers or accounts. 🚀",
    msg2: "Just started the **synced Jukebox** in `Lounge P2P` and **60 FPS** screen sharing with echo cancellation. Sounds clean?",
    msg2Reply: "Welcome to Onicord! Everything here runs decentralized...",
    msg3: "Crystal clear 👌 Also tried switching to adaptive light mode and `.onipkg` plugins synced instantly.",
    msg4: "Send a message below, click user profiles on the right, or switch channels to explore the interface!",
    msgDev: "Each room separates its DHT routing secret from per-epoch encryption keys (`[E2EE2:eN]:` with HKDF-SHA256 + AES-256-GCM).\n```js\nconst roomKey = hkdfSha256(epochSecret, 'onicord-e2ee2');\n```",
    msgMusic: "Now playing in **Lounge P2P** voice channel: *Midnight City (P2P Synthwave Mix)* 🎶",
    msgIndie: "Just published a new interactive `.onipkg` widget with real-time P2P sync.",
    msgChill: "24/7 Lo-Fi & Synthwave for long coding sessions 🌙☕",
    autoReply: "Message received in the interactive demo! ✨",
  },
  pt: {
    meStatus: "Testando Onicord P2P ✨",
    meBio: "Criador do Onicord. 100% P2P, criptografado de ponta a ponta e sem servidores centrais.",
    lunaStatus: "Ouvindo Synthwave 🎧",
    lunaBio: "Designer de interfaces & apaixonada por áudio lossless.",
    kairoStatus: "Tela compartilhada a 60 FPS 🚀",
    kairoBio: "Engenheiro de redes P2P. Hyperswarm + WebRTC.",
    vexStatus: "Em Watch Party 🍿",
    vexBio: "Testando addons e temas personalizados.",
    novaStatus: "AFK para um café ☕",
    novaBio: "Moderadora da comunidade.",
    catCommunity: "Comunidade",
    catVoice: "Canais de Voz e Música",
    catProjects: "Projetos",
    catRooms: "Salas",
    catMusic: "Música",
    chGeneralTopic: "Bem-vindo à demo interativa do Onicord — 100% P2P",
    chDevName: "desenvolvimento",
    chDevTopic: "Criptografia Noise XX, WebRTC 60 FPS e plugins .onipkg",
    chMusicName: "música-e-clipes",
    chMusicTopic: "Compartilhe faixas para a Jukebox sincronizada",
    chShowcaseTopic: "Mostre seus projetos e protótipos",
    chResourcesName: "recursos",
    chResourcesTopic: "Shaders, UI kits e ferramentas open-source",
    chPlaylistsTopic: "Playlists colaborativas para programar",
    msg1: "Bem-vindos ao **Onicord**! Tudo aqui roda de forma descentralizada sobre **Hyperswarm DHT** e **WebRTC**, sem servidores centrais nem contas. 🚀",
    msg2: "Acabei de ativar a **Jukebox sincronizada** no `Lounge P2P` e transmissão de tela a **60 FPS** com cancelamento de eco. Está limpo?",
    msg2Reply: "Bem-vindos ao Onicord! Tudo aqui roda de forma descentralizada...",
    msg3: "Cristalino 👌 Também testei o tema adaptável claro e os plugins `.onipkg` sincronizaram na hora.",
    msg4: "Envie uma mensagem abaixo, clique nos perfis à direita ou troque de canal para explorar a interface!",
    msgDev: "Cada sala separa seu segredo de roteamento DHT das chaves de criptografia por época (`[E2EE2:eN]:` com HKDF-SHA256 + AES-256-GCM).\n```js\nconst roomKey = hkdfSha256(epochSecret, 'onicord-e2ee2');\n```",
    msgMusic: "Tocando agora no canal de voz **Lounge P2P**: *Midnight City (P2P Synthwave Mix)* 🎶",
    msgIndie: "Publiquei um novo widget interativo em `.onipkg` com sincronização P2P em tempo real.",
    msgChill: "Lo-Fi & Synthwave 24/7 para longas sessões de código 🌙☕",
    autoReply: "Mensagem recebida na demo interativa! ✨",
  },
};

function buildDemoData(lang) {
  const c = DEMO_COPY[lang] || DEMO_COPY.es;

  const users = {
    me: {
      id: "demo-me",
      userId: "demo-me",
      peerId: "demo-me",
      nickname: "Criss",
      status: "online",
      online: true,
      customStatus: c.meStatus,
      bio: c.meBio,
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
      customStatus: c.lunaStatus,
      bio: c.lunaBio,
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
      customStatus: c.kairoStatus,
      bio: c.kairoBio,
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
      customStatus: c.vexStatus,
      bio: c.vexBio,
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
      customStatus: c.novaStatus,
      bio: c.novaBio,
      avatar: svgAvatar("#fab387", "#f9e2af", "NV"),
      banner: svgBanner("#313244", "#fab387"),
      roleId: "role-supporter",
      roles: ["role-supporter"],
    },
  };

  const roles = [
    { id: "role-founder", name: "Founder", color: "#cba6f7", hoist: true, position: 3, permissions: ["administrator"] },
    { id: "role-dev", name: "Core Dev", color: "#89b4fa", hoist: true, position: 2, permissions: ["manage_channels", "send_messages"] },
    { id: "role-supporter", name: "Supporter", color: "#a6e3a1", hoist: true, position: 1, permissions: ["send_messages"] },
  ];

  const servers = [
    {
      id: "srv-onicord",
      name: "Onicord HQ",
      roomCode: "ONICORD1",
      isOwner: true,
      icon: svgAvatar("#cba6f7", "#89b4fa", "OH"),
      banner: svgBanner("#1e1e2e", "#cba6f7"),
      lastChannelId: "general",
      roles,
      categories: [
        { id: "cat-text", name: c.catCommunity, position: 0 },
        { id: "cat-voice", name: c.catVoice, position: 1 },
      ],
      channels: [
        { id: "general", name: "general", type: "text", categoryId: "cat-text", topic: c.chGeneralTopic },
        { id: "desarrollo", name: c.chDevName, type: "text", categoryId: "cat-text", topic: c.chDevTopic },
        { id: "musica-clips", name: c.chMusicName, type: "text", categoryId: "cat-text", topic: c.chMusicTopic },
        { id: "lounge-p2p", name: "Lounge P2P", type: "voice", categoryId: "cat-voice" },
        { id: "gaming-60fps", name: "Gaming 60FPS", type: "voice", categoryId: "cat-voice" },
      ],
      savedMembers: Object.values(users),
    },
    {
      id: "srv-indie",
      name: "Indie Dev Lab",
      roomCode: "INDIELAB",
      isOwner: false,
      icon: svgAvatar("#a6e3a1", "#74c7ec", "ID"),
      banner: svgBanner("#181825", "#a6e3a1"),
      lastChannelId: "showcase",
      roles,
      categories: [
        { id: "cat-indie-1", name: c.catProjects, position: 0 },
        { id: "cat-indie-2", name: c.catRooms, position: 1 },
      ],
      channels: [
        { id: "showcase", name: "showcase", type: "text", categoryId: "cat-indie-1", topic: c.chShowcaseTopic },
        { id: "recursos", name: c.chResourcesName, type: "text", categoryId: "cat-indie-1", topic: c.chResourcesTopic },
        { id: "coworking", name: "Coworking", type: "voice", categoryId: "cat-indie-2" },
      ],
      savedMembers: [users.me, users.kairo, users.luna],
    },
    {
      id: "srv-chill",
      name: "Chill & Lo-Fi",
      roomCode: "CHILLFM1",
      isOwner: false,
      icon: svgAvatar("#f5c2e7", "#fab387", "CF"),
      banner: svgBanner("#1e1e2e", "#f5c2e7"),
      lastChannelId: "playlists",
      roles,
      categories: [{ id: "cat-chill-1", name: c.catMusic, position: 0 }],
      channels: [
        { id: "playlists", name: "playlists", type: "text", categoryId: "cat-chill-1", topic: c.chPlaylistsTopic },
        { id: "radio-247", name: "Radio 24/7", type: "voice", categoryId: "cat-chill-1" },
      ],
      savedMembers: [users.me, users.luna, users.vex, users.nova],
    },
  ];

  const now = Date.now();
  const min = 60 * 1000;

  const initialMessages = {
    "ONICORD1:general": [
      {
        id: "msg-1",
        channelId: "general",
        userId: users.luna.id,
        nickname: users.luna.nickname,
        avatar: users.luna.avatar,
        timestamp: now - 18 * min,
        text: c.msg1,
        reactions: { "🚀": [users.me.id, users.kairo.id], "💜": [users.vex.id, users.nova.id] },
      },
      {
        id: "msg-2",
        channelId: "general",
        userId: users.kairo.id,
        nickname: users.kairo.nickname,
        avatar: users.kairo.avatar,
        timestamp: now - 12 * min,
        text: c.msg2,
        replyTo: { id: "msg-1", nickname: users.luna.nickname, text: c.msg2Reply },
        reactions: { "🔥": [users.me.id, users.luna.id] },
      },
      {
        id: "msg-3",
        channelId: "general",
        userId: users.vex.id,
        nickname: users.vex.nickname,
        avatar: users.vex.avatar,
        timestamp: now - 7 * min,
        text: c.msg3,
        reactions: { "✨": [users.luna.id] },
      },
      {
        id: "msg-4",
        channelId: "general",
        userId: users.me.id,
        nickname: users.me.nickname,
        avatar: users.me.avatar,
        timestamp: now - 3 * min,
        text: c.msg4,
        reactions: { "👀": [users.luna.id, users.kairo.id, users.vex.id] },
      },
    ],
    "ONICORD1:desarrollo": [
      {
        id: "msg-dev-1",
        channelId: "desarrollo",
        userId: users.kairo.id,
        nickname: users.kairo.nickname,
        avatar: users.kairo.avatar,
        timestamp: now - 25 * min,
        text: c.msgDev,
        reactions: { "🔐": [users.me.id, users.luna.id] },
      },
    ],
    "ONICORD1:musica-clips": [
      {
        id: "msg-mus-1",
        channelId: "musica-clips",
        userId: users.luna.id,
        nickname: users.luna.nickname,
        avatar: users.luna.avatar,
        timestamp: now - 9 * min,
        text: c.msgMusic,
        reactions: { "🎧": [users.me.id, users.vex.id] },
      },
    ],
    "INDIELAB:showcase": [
      {
        id: "msg-ind-1",
        channelId: "showcase",
        userId: users.kairo.id,
        nickname: users.kairo.nickname,
        avatar: users.kairo.avatar,
        timestamp: now - 15 * min,
        text: c.msgIndie,
      },
    ],
    "CHILLFM1:playlists": [
      {
        id: "msg-ch-1",
        channelId: "playlists",
        userId: users.luna.id,
        nickname: users.luna.nickname,
        avatar: users.luna.avatar,
        timestamp: now - 20 * min,
        text: c.msgChill,
      },
    ],
  };

  return { c, users, servers, initialMessages };
}

const DEMO_STICKERS = [
  { id: "stk-1", name: "Hype!", packName: "Onicord Pack", url: svgSticker("#313244", "🚀", "HYPE") },
  { id: "stk-2", name: "Comfy", packName: "Onicord Pack", url: svgSticker("#313244", "☕", "COMFY") },
  { id: "stk-3", name: "GGWP", packName: "Onicord Pack", url: svgSticker("#313244", "🎮", "GGWP") },
  { id: "stk-4", name: "P2P", packName: "Onicord Pack", url: svgSticker("#313244", "🛡️", "E2EE") },
];

export function initDemoBridge() {
  if (typeof window === "undefined" || window.electronAPI) return;
  window.__ONICORD_DEMO__ = true;

  const lang = resolveDemoLanguage();
  try {
    localStorage.setItem("onicord_language", lang);
  } catch (_) {}

  const { c, users, servers, initialMessages } = buildDemoData(lang);
  let myProfile = { ...users.me };
  const messagesStore = new Map(Object.entries(initialMessages));
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
    listServers: async () => servers,
    getLastServer: async () => servers[0].id,
    setLastServer: async () => true,
    enterServer: async (serverId) => {
      return servers.find((s) => s.id === serverId || s.roomCode === serverId) || servers[0];
    },
    getRoomState: async (roomCode) => {
      const srv = servers.find((s) => s.roomCode === roomCode) || servers[0];
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

      if (typeof msg.text === "string" && !msg.text.startsWith("[")) {
        setTimeout(() => {
          const reply = {
            id: `demo-reply-${Date.now()}`,
            channelId,
            roomCode,
            userId: users.luna.id,
            nickname: users.luna.nickname,
            avatar: users.luna.avatar,
            timestamp: Date.now(),
            text: c.autoReply,
            replyTo: { id: msg.id, nickname: myProfile.nickname, text: msg.text.slice(0, 80) },
          };
          arr.push(reply);
          chatListeners.forEach((cb) => { try { cb(reply); } catch {} });
        }, 900);
      }
      return msg;
    },
    listLocalEmojis: async () => [],
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
            djUserId: users.luna.id,
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
          servers[0].savedMembers.forEach((m) => emit("peer:updated", m));
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
