/**
 * adBlockerService.cjs
 * Bloqueador de anuncios de alto rendimiento para el navegador interno de Onicord
 * (iframes de juegos, webviews y multimedia).
 */

const BLOCKED_DOMAINS = new Set([
  // Google Ads & Analytics
  "pagead2.googlesyndication.com",
  "googleads.g.doubleclick.net",
  "adservice.google.com",
  "adservice.google.es",
  "adservice.google.com.ar",
  "securepubads.g.doubleclick.net",
  "stats.g.doubleclick.net",
  "www.google-analytics.com",
  "google-analytics.com",
  "analytics.google.com",
  "googletagservices.com",
  "www.googletagservices.com",
  "googletagmanager.com",
  "www.googletagmanager.com",

  // Redes publicitarias y trackers comunes en portales de juegos web
  "adnxs.com",
  "ib.adnxs.com",
  "adroll.com",
  "criteo.com",
  "criteo.net",
  "static.criteo.net",
  "outbrain.com",
  "taboola.com",
  "popads.net",
  "propellerads.com",
  "adsterra.com",
  "monetag.com",
  "amazon-adsystem.com",
  "aax.amazon-adsystem.com",
  "pubmatic.com",
  "rubiconproject.com",
  "openx.net",
  "casalemedia.com",
  "adcolony.com",
  "unityads.unity3d.com",
  "applovin.com",
  "aniview.com",
  "bidswitch.net",
  "smartadserver.com",
  "inmobi.com",
  "vungle.com",
  "chartboost.com",
  "moatads.com",
  "serving-sys.com",
  "scorecardresearch.com",
  "quantserve.com",
  "media.net",
  "contextweb.com",
  "sovrn.com",
  "lijit.com",
  "revcontent.com",
  "mgid.com",
  "yadro.ru",

  // Redes publicitarias de juegos web (AdinPlay, NitroPay, Playwire, Venatus, etc.)
  "adinplay.com",
  "api.adinplay.com",
  "delivery.adinplay.com",
  "a.pub.network",
  "ad4m.at",
  "nitropay.com",
  "api.nitropay.com",
  "s.nitropay.com",
  "playwire.com",
  "cdn.intergi.com",
  "intergi.com",
  "ramp.alocdn.com",
  "venatus.com",
  "vntsm.com",
  "cdn.vntsm.com",
  "gamedistribution.com",
  "gamepix.com",
]);

const BLOCKED_PATH_PATTERNS = [
  /\/adsbygoogle(\.min)?\.js/i,
  /\/pagead\//i,
  /\/prebid(\.min)?\.js/i,
  /beacon\.min\.js/i,
  /\/adinplay/i,
  /\/tag\/js\/gpt\.js/i,
  /\/gpt\/pubads/i,
  /\/ad-delivery/i,
];

function isAdUrl(urlStr) {
  if (!urlStr || typeof urlStr !== "string") return false;
  try {
    const parsed = new URL(urlStr);
    const hostname = parsed.hostname.toLowerCase();

    // Comprobar dominio exacto o subdominios
    if (BLOCKED_DOMAINS.has(hostname)) return true;
    for (const domain of BLOCKED_DOMAINS) {
      if (hostname.endsWith("." + domain)) return true;
    }

    // Comprobar patrones de ruta de anuncios
    const fullPath = parsed.pathname + parsed.search;
    for (const pattern of BLOCKED_PATH_PATTERNS) {
      if (pattern.test(fullPath)) return true;
    }

    return false;
  } catch (_) {
    return false;
  }
}

function initAdBlocker(sessionInstance) {
  if (!sessionInstance || !sessionInstance.webRequest) {
    console.warn("[AdBlocker] sessionInstance inválida para iniciar el bloqueador.");
    return;
  }

  try {
    sessionInstance.webRequest.onBeforeRequest((details, callback) => {
      const url = details.url || "";
      if (isAdUrl(url)) {
        // Bloqueo transparente y silencioso del anuncio
        return callback({ cancel: true });
      }
      return callback({ cancel: false });
    });

    console.log("[AdBlocker] Filtro de anuncios integrado y activo en Electron session.");
  } catch (err) {
    console.error("[AdBlocker Error] No se pudo inicializar el interceptor:", err.message);
  }
}

module.exports = {
  initAdBlocker,
  isAdUrl,
  BLOCKED_DOMAINS,
};
