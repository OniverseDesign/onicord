// =========================================================================
// Complemento Oficial: Arcade (Launcher de Juegos Web y Emuladores)
// =========================================================================
// Plataforma extensible para catálogo de juegos, multijugador P2P, lobbies y PiP.

const ARCADE_HOST_STRINGS = {
  es: {
    playerFallback: "Jugador",
    catalogDetails: "Catálogo de Juegos",
    playing: "Jugando",
    inRoom: "En sala",
    tooltip: "Arcade (Catálogo de Juegos)",
  },
  en: {
    playerFallback: "Player",
    catalogDetails: "Game Catalog",
    playing: "Playing",
    inRoom: "In room",
    tooltip: "Arcade (Game Catalog)",
  },
  pt: {
    playerFallback: "Jogador",
    catalogDetails: "Catálogo de Jogos",
    playing: "Jogando",
    inRoom: "Na sala",
    tooltip: "Arcade (Catálogo de Jogos)",
  },
};

function getArcadeHostStrings(langHint) {
  const raw = langHint || (typeof Onicord !== "undefined" && (Onicord.language || Onicord.getLanguage?.())) || "es";
  const code = String(raw).split("-")[0].toLowerCase();
  return ARCADE_HOST_STRINGS[code] || ARCADE_HOST_STRINGS.es;
}

// ==========================================
// 1. APERTURA DEL CATÁLOGO LAUNCHER
// ==========================================
function openArcadeLauncher(data = null) {
  const L = getArcadeHostStrings(data?.language);
  const user = (typeof Onicord !== "undefined" && Onicord.user?.getProfile?.()) || {};
  const nick = user.nickname || user.username || L.playerFallback;

  const stageDef = {
    pluginId: "onicord-arcade",
    title: "Arcade",
    icon: "sports_esports",
    entryPoint: "widgets/launcher.html",
    authorName: nick,
    userNick: nick,
    activity: {
      name: "Arcade",
      details: L.catalogDetails,
      state: null,
      cover: null,
      type: "launcher",
      isCatalog: true,
      startTime: Date.now(),
    },
  };

  if (typeof Onicord !== "undefined" && Onicord.ui?.openStageView) {
    Onicord.ui.openStageView(stageDef);
  }

  if (typeof Onicord !== "undefined" && Onicord.gaming?.setActivity) {
    Onicord.gaming.setActivity(stageDef.activity);
  }
}

// ==========================================
// 2. REGISTRO DE CONTROLES E INTERFAZ
// ==========================================
if (typeof Onicord !== "undefined" && Onicord.ui?.registerVoiceControlButton) {
  const initL = getArcadeHostStrings();
  Onicord.ui.registerVoiceControlButton({
    id: "arcade_joystick",
    icon: "sports_esports",
    tooltip: initL.tooltip,
    action: "TOGGLE_ARCADE_STAGE",
    onClick: (data) => {
      openArcadeLauncher(data);
    },
  });
}

// ==========================================
// 3. COMANDOS DE CHAT
// ==========================================
if (typeof Onicord !== "undefined" && Onicord.chat?.onCommand) {
  Onicord.chat.onCommand("arcade", async () => {
    openArcadeLauncher();
  });
}

// ==========================================
// 4. RESOLVEDOR AGNÓSTICO DE ETAPAS (STAGE RESOLVER)
// ==========================================
const KNOWN_GAMES = {
  pes6: { title: "Pro Evolution Soccer 6", icon: "sports_soccer", url: "https://pes6.optijuegos.net/" },
  dbzbt3: { title: "Dragon Ball Z: Budokai Tenkaichi 3", icon: "sports_martial_arts", url: "https://tenkaichi3.optijuegos.net/" },
  nfsu2: { title: "Need for Speed: Underground 2", icon: "directions_car", url: "https://nfsu2.optijuegos.net/" },
  doom: { title: "DOOM (1993)", icon: "local_fire_department", url: "https://silentspacemarine.com/" },
  tboi: { title: "The Binding of Isaac: Repentance", icon: "skull", url: "https://tboi.online/" },
  minecraft: { title: "Minecraft (Web Edition)", icon: "view_in_ar", url: "https://mcraft.fun/" },
  garticphone: { title: "Gartic Phone", icon: "draw", url: "https://garticphone.com/" },
  skribbl: { title: "Skribbl.io", icon: "brush", url: "https://skribbl.io/" },
  krunker: { title: "Krunker.io", icon: "crosshairs", url: "https://krunker.io/" },
};

if (typeof Onicord !== "undefined" && Onicord.stage?.onResolveStage) {
  Onicord.stage.onResolveStage((stageReq) => {
    if (!stageReq) return null;
    const reqUrl = stageReq.url ? String(stageReq.url).toLowerCase() : "";
    const reqHost = reqUrl.replace(/^https?:\/\//, "").split("/")[0];
    for (const [id, game] of Object.entries(KNOWN_GAMES)) {
      const gameHost = game.url.replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
      if ((reqHost && reqHost === gameHost) || (stageReq.id && stageReq.id === id)) {
        return {
          title: game.title,
          icon: game.icon || "sports_esports",
          cover: game.cover || null,
        };
      }
    }
    return null;
  });
}
