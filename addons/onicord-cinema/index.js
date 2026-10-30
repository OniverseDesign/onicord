// =========================================================================
// Complemento Oficial: Onicord Cinema (Stremio & Watch Party)
// =========================================================================
// Plataforma extensible para catálogo de películas, series, favoritos P2P y cine compartido.

const CINEMA_HOST_STRINGS = {
  es: {
    userFallback: "Cinéfilo",
    exploring: "Explorando Películas y Series",
    movieFallback: "Película",
    watchingGroup: "Viendo en grupo",
    tooltip: "Cinema (Películas y Series)",
  },
  en: {
    userFallback: "Movie Buff",
    exploring: "Exploring Movies & Series",
    movieFallback: "Movie",
    watchingGroup: "Watching together",
    tooltip: "Cinema (Movies & Series)",
  },
  pt: {
    userFallback: "Cinéfilo",
    exploring: "Explorando Filmes e Séries",
    movieFallback: "Filme",
    watchingGroup: "Assistindo em grupo",
    tooltip: "Cinema (Filmes e Séries)",
  },
};

function getCinemaHostStrings(langHint) {
  const raw = langHint || (typeof Onicord !== "undefined" && Onicord.getLanguage?.()) || "es";
  const code = String(raw).split("-")[0].toLowerCase();
  return CINEMA_HOST_STRINGS[code] || CINEMA_HOST_STRINGS.es;
}

// ==========================================
// 1. APERTURA DEL CATÁLOGO LAUNCHER
// ==========================================
function openCinemaLauncher(data = null) {
  const L = getCinemaHostStrings(data?.language);
  const user = (typeof Onicord !== "undefined" && Onicord.user?.getProfile?.()) || {};
  const nick = user.nickname || user.username || L.userFallback;

  const stageDef = {
    pluginId: "onicord-cinema",
    title: "Cinema",
    icon: "movie",
    entryPoint: "widgets/launcher.html",
    authorName: nick,
    userNick: nick,
    activity: {
      name: "Cinema",
      details: L.exploring,
      state: null,
      cover: null,
      type: "movie",
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
// 2. REGISTRO DEL BOTÓN DE LA BARRA DE VOZ
// ==========================================
if (typeof Onicord !== "undefined" && Onicord.ui?.registerVoiceControlButton) {
  const initL = getCinemaHostStrings();
  Onicord.ui.registerVoiceControlButton({
    id: "cinema_clapperboard",
    icon: "movie",
    tooltip: initL.tooltip,
    action: "TOGGLE_CINEMA_STAGE",
    onClick: (data) => {
      openCinemaLauncher(data);
    },
  });
}

// ==========================================
// 3. COMANDOS DE CHAT
// ==========================================
if (typeof Onicord !== "undefined" && Onicord.chat?.onCommand) {
  Onicord.chat.onCommand("cinema", async () => {
    openCinemaLauncher();
  });
}

