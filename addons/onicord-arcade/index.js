// =========================================================================
// Complemento Oficial: Arcade (Launcher de Juegos Web y Emuladores)
// =========================================================================
// Plataforma extensible para catálogo de juegos, multijugador P2P, lobbies y PiP.

// ==========================================
// 1. REGISTRO EXTENSIBLE DE JUEGOS Y HOOKS
// ==========================================
const GAMES_REGISTRY = {
  pes6: {
    id: "pes6",
    title: "Pro Evolution Soccer 6",
    icon: "sports_soccer",
    url: "https://pes6.optijuegos.net/",
    cover: "https://thumbnails.libretro.com/Sony%20-%20PlayStation%202/Named_Boxarts/Pro%20Evolution%20Soccer%206%20(Europe).png",
    shareCapture: {
      triggerSelector: "#roomsShare",
      windowProperty: "_onicordRoomLink",
      queryParam: "sala",
    },
    frameScripts: [
      `
        (() => {
          try {
            window.PES6 = window.PES6 || {};
            if (!window.PES6.Ads) window.PES6.Ads = { load: () => {} };
            window.adsbygoogle = window.adsbygoogle || [];

            const getNick = () => {
              const raw = window._onicordUserNick;
              if (!raw || raw === 'PLAYER' || raw === 'Jugador') return '';
              return String(raw).replace(/[\\u0000-\\u001f\\u007f]/g, ' ').replace(/\\s+/g, ' ').trim().slice(0, 20);
            };

            const targetNick = getNick();

            // 1. Interceptar prompt de JS por si el motor o player_name.js pregunta el nombre
            if (targetNick) {
              const origPrompt = window.prompt;
              window.prompt = function(msg, def) {
                if (msg && typeof msg === 'string' && msg.toLowerCase().includes('player name')) {
                  return targetNick;
                }
                return origPrompt ? origPrompt.apply(this, arguments) : (targetNick || def);
              };
            }

            // 2. Interceptar copiado de enlaces para capturar la sala activa
            if (window.PES6.Core && !window.PES6.Core._onicordHooked) {
              const origCopy = window.PES6.Core.copyText;
              window.PES6.Core.copyText = function(text, button, label) {
                if (typeof text === 'string' && text.includes('sala=')) {
                  window._onicordRoomLink = text.trim();
                }
                return origCopy.apply(this, arguments);
              };
              window.PES6.Core._onicordHooked = true;
            }

            if (navigator.clipboard && !navigator.clipboard._onicordHooked) {
              const origWrite = navigator.clipboard.writeText;
              navigator.clipboard.writeText = function(text) {
                if (typeof text === 'string' && text.includes('sala=')) {
                  window._onicordRoomLink = text.trim();
                }
                return origWrite.apply(this, arguments);
              };
              navigator.clipboard._onicordHooked = true;
            }

            // 3. Hook al socket de salas PES6.Rooms.Link
            const hookRoomsLink = () => {
              if (window.PES6?.Rooms?.Link && !window.PES6.Rooms._onicordLiveHooked) {
                window.PES6.Rooms._onicordLiveHooked = true;

                const updateFromGame = (game) => {
                  if (game && game.room && game.room !== 'default' && game.room !== 'wait') {
                    const base = (window.PES6?.Config?.roomShareBase) || window.location.href;
                    const url = new URL(base, window.location.href);
                    url.searchParams.set('sala', game.room);
                    if (game.invite) url.searchParams.set('invite', game.invite);
                    window._onicordRoomLink = url.href;
                  } else if (game && !game.room) {
                    window._onicordRoomLink = null;
                  }
                };

                window.PES6.Rooms.Link.on('rooms', (msg) => {
                  try {
                    if (msg && msg.game) {
                      updateFromGame(msg.game);
                    }
                  } catch (_) {}
                });

                window.PES6.Rooms.Link.on('room-result', (msg) => {
                  try {
                    if (msg && msg.ok && (msg.action === 'create' || msg.action === 'join') && msg.room) {
                      const base = (window.PES6?.Config?.roomShareBase) || window.location.href;
                      const url = new URL(base, window.location.href);
                      url.searchParams.set('sala', msg.room);
                      if (msg.invite) url.searchParams.set('invite', msg.invite);
                      window._onicordRoomLink = url.href;
                    } else if (msg && (msg.action === 'leave' || (msg.action === 'join' && !msg.ok))) {
                      window._onicordRoomLink = null;
                    }
                  } catch (_) {}
                });

                window.PES6.Rooms.Link.on('open', () => {
                  const n = getNick();
                  if (n) {
                    try { window.PES6.Rooms.Link.send({ type: 'room-nick', nick: n }); } catch (_) {}
                  }
                });
              }
            };

            hookRoomsLink();
            setInterval(hookRoomsLink, 1000);

            // 4. Aplicar apodo en localStorage, inputs del DOM y PES6.Rooms.PlayerName
            const applyNick = () => {
              const nick = getNick();
              if (!nick) return;

              try {
                localStorage.setItem('pes6-player-name', nick);
                localStorage.setItem('player-name', nick);
              } catch (_) {}

              if (window.PES6?.Rooms?.PlayerName) {
                window.PES6.Rooms.PlayerName.ask = () => nick;
              }

              try {
                const nameInputs = document.querySelectorAll('input#player-name, input#playerName, input[name="player"], input#nick');
                nameInputs.forEach((inp) => {
                  if (inp && inp.value !== nick) {
                    inp.value = nick;
                    inp.dispatchEvent(new Event('input', { bubbles: true }));
                    inp.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                });
              } catch (_) {}

              if (window.PES6?.Rooms?.Link) {
                const Link = window.PES6.Rooms.Link;
                if (typeof Link.send === 'function' && typeof Link.isOpen === 'function' && Link.isOpen()) {
                  try {
                    Link.send({ type: 'room-nick', nick: nick });
                  } catch (_) {}
                }
              }
            };

            applyNick();
            const nickInterval = setInterval(applyNick, 1000);
            setTimeout(() => clearInterval(nickInterval), 45000);

            // 5. Helper ejecutable para forzar lectura o refresco de sala
            window._onicordGetActiveRoomLink = function() {
              if (window._onicordRoomLink && window._onicordRoomLink.includes('sala=')) {
                return window._onicordRoomLink;
              }
              const shareBtn = document.getElementById('roomsShare');
              if (shareBtn && typeof shareBtn.onclick === 'function') {
                try {
                  shareBtn.onclick();
                  if (window._onicordRoomLink && window._onicordRoomLink.includes('sala=')) {
                    return window._onicordRoomLink;
                  }
                } catch (_) {}
              }
              if (window.PES6?.Rooms?.Link?.isOpen && window.PES6.Rooms.Link.isOpen()) {
                try { window.PES6.Rooms.Link.send({ type: 'room-list' }); } catch (_) {}
              }
              return window._onicordRoomLink || null;
            };
          } catch (e) {
            console.error('[PES6 Hook Error]', e);
          }
        })()
      `
    ]
  },
  dbzbt3: {
    id: "dbzbt3",
    title: "Dragon Ball Z: Budokai Tenkaichi 3",
    icon: "sports_kabaddi",
    url: "https://dragonballbt3.online/",
    cover: "https://thumbnails.libretro.com/Sony%20-%20PlayStation%202/Named_Boxarts/Dragon%20Ball%20Z%20-%20Budokai%20Tenkaichi%203%20(USA)%20(En,Ja).png",
  },
  nfsu2: {
    id: "nfsu2",
    title: "Need for Speed: Underground 2",
    icon: "sports_motorsports",
    url: "https://nfsunderground2.site/",
    cover: "https://thumbnails.libretro.com/Sony%20-%20PlayStation%202/Named_Boxarts/Need%20for%20Speed%20-%20Underground%202%20(USA).png",
  },
  doom: {
    id: "doom",
    title: "DOOM (Silent Space Marine)",
    icon: "crosshairs",
    url: "https://silentspacemarine.com/",
    cover: "https://thumbnails.libretro.com/DOS/Named_Boxarts/DOOM%20(1993).png",
  },
  tboi: {
    id: "tboi",
    title: "The Binding of Isaac: Repentance",
    icon: "skull",
    url: "https://tboi.online/",
    cover: "https://tboi.online/og.jpg",
    frameScripts: [
      `
        (() => {
          console.warn("[OniDiag][TBOI] Hook de control e inicialización activado en " + window.location.href);

          // Auto-enfocar el canvas para que Chromium y el motor capturen entradas
          const focusCanvas = () => {
            const canvas = document.getElementById("canvas") || document.querySelector("canvas");
            if (canvas) {
              canvas.tabIndex = 0;
              canvas.focus();
              console.warn("[OniDiag][TBOI] Canvas enfocado exitosamente");
            }
          };

          focusCanvas();
          window.addEventListener("load", focusCanvas);
          setTimeout(focusCanvas, 500);
          setTimeout(focusCanvas, 1500);
          setTimeout(focusCanvas, 3000);

          // Escuchar eventos de gamepad nativo y sincronizado
          window.addEventListener("gamepadconnected", (e) => {
            console.warn("[OniDiag][TBOI] Gamepad conectado detectado:", e.gamepad ? e.gamepad.id : "mando");
            if (window.isaacPadReader && typeof window.isaacPadReader.wake === "function") {
              window.isaacPadReader.wake();
            }
          });

          // Si el lector de mandos ya fue instanciado por boot_web.mjs, despertarlo
          if (window.isaacPadReader && typeof window.isaacPadReader.wake === "function") {
            window.isaacPadReader.wake();
          }
        })();
      `,
    ],
  },
  minecraft: {
    id: "minecraft",
    title: "Minecraft (Web Edition)",
    icon: "view_in_ar",
    url: "https://mcraft.fun/",
    cover: "https://mcraft.fun/loading-bg.jpg",
  },
  garticphone: {
    id: "garticphone",
    title: "Gartic Phone",
    icon: "draw",
    url: "https://garticphone.com/es/",
    cover: "https://garticphone.com/images/thumb.png",
    shareCapture: {
      triggerSelector: "button.btLobby, button[class*='invite' i], button[class*='btLobby' i], [class*='btLobby' i], [class*='invite' i], [aria-label*='invit' i]",
      windowProperty: "_onicordRoomLink",
      urlPattern: "garticphone\\.com/(?:[a-zA-Z]{2}/)?([a-zA-Z0-9]{6,12})|garticphone\\.com/.*[?&]c="
    },
    frameScripts: [
      `
        (() => {
          try {
            // 1. Prevención de excepciones por Permissions Policy en WakeLock
            if (navigator.wakeLock && typeof navigator.wakeLock.request === 'function') {
              const origWake = navigator.wakeLock.request.bind(navigator.wakeLock);
              navigator.wakeLock.request = function(type) {
                return origWake(type).catch(() => ({ release: () => Promise.resolve() }));
              };
            }

            const isGarticRoom = (url) => {
              if (!url || typeof url !== 'string') return false;
              const t = url.trim();
              if (!t.includes('garticphone.com')) return false;
              if (t.includes('/_next') || t.includes('/images/') || t.includes('/privacy') || t.includes('/terms')) return false;
              if (t.endsWith('/lobby') || t.includes('/lobby/') || t.includes('/lobby?')) return false;
              return /garticphone\\.com\\/(?:[a-zA-Z]{2}\\/)?([-_a-zA-Z0-9]{6,16})(?:\\/|\\?|#|$)/i.test(t) ||
                     /garticphone\\.com\\/.*[?&]c=([a-zA-Z0-9]+)/i.test(t);
            };

            const normalizeLink = (s) => {
              if (!s || typeof s !== 'string') return null;
              let t = s.trim();
              if (t.startsWith('garticphone.com')) t = 'https://' + t;
              if (!t.startsWith('http://') && !t.startsWith('https://')) {
                if (t.match(/^(?:\\/?[a-zA-Z]{2}\\/)?([-_a-zA-Z0-9]{6,16})$/)) {
                  t = 'https://garticphone.com/' + t.replace(/^\\//, '');
                } else if (t.includes('c=')) {
                  t = 'https://garticphone.com/?' + (t.startsWith('?') ? t.slice(1) : t);
                } else {
                  return null;
                }
              }
              return isGarticRoom(t) ? t : null;
            };

            const getNick = () => {
              const raw = window._onicordUserNick;
              if (!raw || raw === 'PLAYER' || raw === 'Jugador') return '';
              return String(raw).replace(/[\\u0000-\\u001f\\u007f]/g, ' ').replace(/\\s+/g, ' ').trim().slice(0, 20);
            };

            const targetNick = getNick();

            // 2. Interceptar copiado de enlaces por Clipboard API, execCommand y DataTransfer
            if (navigator.clipboard && !navigator.clipboard._onicordHooked) {
              const origWrite = navigator.clipboard.writeText;
              navigator.clipboard.writeText = function(text) {
                if (typeof text === 'string') {
                  const norm = normalizeLink(text);
                  if (norm) window._onicordRoomLink = norm;
                }
                return origWrite.apply(this, arguments);
              };
              navigator.clipboard._onicordHooked = true;
            }

            if (document.execCommand && !document._onicordExecHooked) {
              const origExec = document.execCommand;
              document.execCommand = function(cmd) {
                if (String(cmd).toLowerCase() === 'copy') {
                  try {
                    const active = document.activeElement;
                    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && active.value) {
                      const norm = normalizeLink(active.value);
                      if (norm) window._onicordRoomLink = norm;
                    }
                    const sel = window.getSelection ? window.getSelection().toString() : '';
                    if (sel) {
                      const norm = normalizeLink(sel);
                      if (norm) window._onicordRoomLink = norm;
                    }
                  } catch (_) {}
                }
                return origExec.apply(this, arguments);
              };
              document._onicordExecHooked = true;
            }

            if (typeof DataTransfer !== 'undefined' && DataTransfer.prototype.setData && !DataTransfer.prototype._onicordHooked) {
              const origSetData = DataTransfer.prototype.setData;
              DataTransfer.prototype.setData = function(format, data) {
                if (typeof data === 'string') {
                  const norm = normalizeLink(data);
                  if (norm) window._onicordRoomLink = norm;
                }
                return origSetData.apply(this, arguments);
              };
              DataTransfer.prototype._onicordHooked = true;
            }

            if (!document._onicordCopyHooked) {
              document.addEventListener('copy', (e) => {
                try {
                  const active = document.activeElement;
                  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && active.value) {
                    const norm = normalizeLink(active.value);
                    if (norm) window._onicordRoomLink = norm;
                  }
                  if (e.clipboardData) {
                    const data = e.clipboardData.getData('text/plain');
                    if (data) {
                      const norm = normalizeLink(data);
                      if (norm) window._onicordRoomLink = norm;
                    }
                  }
                } catch (_) {}
              }, true);
              document._onicordCopyHooked = true;
            }

            // 3. Monitoreo pasivo de la URL y navegación por history
            const checkUrl = () => {
              try {
                if (window.location && window.location.href && isGarticRoom(window.location.href)) {
                  window._onicordRoomLink = window.location.href;
                }
              } catch (_) {}
            };
            checkUrl();
            setInterval(checkUrl, 500);

            if (window.history && !window.history._onicordHooked) {
              const origPush = history.pushState;
              history.pushState = function(state, title, url) {
                if (url && typeof url === 'string') {
                  const full = url.startsWith('http') ? url : new URL(url, window.location.href).href;
                  if (isGarticRoom(full)) window._onicordRoomLink = full;
                }
                return origPush.apply(this, arguments);
              };
              const origReplace = history.replaceState;
              history.replaceState = function(state, title, url) {
                if (url && typeof url === 'string') {
                  const full = url.startsWith('http') ? url : new URL(url, window.location.href).href;
                  if (isGarticRoom(full)) window._onicordRoomLink = full;
                }
                return origReplace.apply(this, arguments);
              };
              window.history._onicordHooked = true;
            }

            // 4. Sniffer pasivo de WebSocket para capturar código de sala al entrar a partida
            if (window.WebSocket && !window.WebSocket._onicordHooked) {
              const origWS = window.WebSocket;
              window.WebSocket = function(url, protocols) {
                const ws = new origWS(url, protocols);
                try {
                  const urlStr = String(url);
                  const match = urlStr.match(/[?&]c=([a-zA-Z0-9]+)/) || urlStr.match(/\\/([a-zA-Z0-9]{6,12})/);
                  if (match) {
                    const code = match[1];
                    const lang = (window.location && window.location.pathname && window.location.pathname.match(/^\\/([a-zA-Z]{2})/)) ? window.location.pathname.match(/^\\/([a-zA-Z]{2})/)[1] : 'es';
                    window._onicordRoomLink = `https://garticphone.com/${lang}/${code}`;
                  }
                } catch (_) {}
                ws.addEventListener('message', function(ev) {
                  try {
                    if (typeof ev.data === 'string') {
                      const m = ev.data.match(/https?:\\/\\/(?:www\\.)?garticphone\\.com\\/(?:[a-zA-Z]{2}\\/)?([a-zA-Z0-9]{6,12})/i);
                      if (m && isGarticRoom(m[0])) {
                        window._onicordRoomLink = m[0];
                      }
                    }
                  } catch (_) {}
                });
                return ws;
              };
              window.WebSocket.prototype = origWS.prototype;
              window.WebSocket._onicordHooked = true;
            }

            // 5. Sincronización robusta del apodo con componentes React/Next.js
            const setReactInputValue = (input, val) => {
              try {
                const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
                if (descriptor && descriptor.set) {
                  descriptor.set.call(input, val);
                } else {
                  input.value = val;
                }
                input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
                input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
              } catch (_) {}
            };

            const applyNick = () => {
              const nick = getNick();
              if (!nick) return;

              try {
                localStorage.setItem('name', nick);
                localStorage.setItem('nick', nick);
                localStorage.setItem('nickname', nick);
                localStorage.setItem('user', JSON.stringify({ name: nick }));
                sessionStorage.setItem('nick', nick);
                sessionStorage.setItem('name', nick);
              } catch (_) {}

              try {
                const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])'));
                inputs.forEach((inp) => {
                  if (!inp.type || inp.type === 'text') {
                    if (inp.value !== nick) {
                      setReactInputValue(inp, nick);
                    }
                  }
                });
              } catch (_) {}
            };

            applyNick();
            const nickInterval = setInterval(applyNick, 600);
            setTimeout(() => clearInterval(nickInterval), 45000);

            // 6. Neutralización de motores de publicidad (AdinPlay, Google Ads, GPT)
            try {
              window.aiptag = window.aiptag || {};
              window.aiptag.cmd = window.aiptag.cmd || [];
              window.aiptag.cmd.display = [];
              window.aiptag.cmd.player = [];
              window.aiptag.display = () => {};
              window.aiptag.player = () => {};
              window.aiptag.showDisplay = () => {};
              window.aiptag.showPlayer = (opts) => {
                if (opts && typeof opts.onComplete === 'function') opts.onComplete();
              };

              window.adsbygoogle = window.adsbygoogle || [];
              window.adsbygoogle.push = function() {};

              window.googletag = window.googletag || {
                cmd: [],
                display: () => {},
                enableServices: () => {},
                pubads: () => ({
                  setTargeting: () => {},
                  clearTargeting: () => {},
                  enableSingleRequest: () => {},
                  collapseEmptyDivs: () => {},
                  refresh: () => {}
                })
              };
            } catch (_) {}

            // 7. Inyección de reglas CSS globales para eliminar al 100% todos los contenedores de anuncios
            try {
              const styleId = "onicord-clean-ads-style";
              if (!document.getElementById(styleId)) {
                const style = document.createElement("style");
                style.id = styleId;
                style.textContent = [
                  'ins.adsbygoogle,',
                  '.adsbygoogle,',
                  '[id*="google_ads"],',
                  '[id^="ad-"],',
                  '[id*="ad-"],',
                  '[id*="adinplay"],',
                  '[id*="nitropay"],',
                  '[id*="playwire"],',
                  '[id*="banner"],',
                  '.ad-banner,',
                  '.publi,',
                  '.anuncio,',
                  '.advertisement,',
                  '.ad-container,',
                  '.ad-wrapper,',
                  '.lateralAd,',
                  '.ad,',
                  '.ads,',
                  'aside[class*="ad"],',
                  'iframe[src*="adinplay"],',
                  'iframe[src*="doubleclick"],',
                  'iframe[src*="google"],',
                  'iframe[id*="ad"],',
                  'div[class*="publi"],',
                  'div[class*="bannerAd"] {',
                  '  display: none !important;',
                  '  visibility: hidden !important;',
                  '  height: 0 !important;',
                  '  width: 0 !important;',
                  '  min-height: 0 !important;',
                  '  min-width: 0 !important;',
                  '  opacity: 0 !important;',
                  '  pointer-events: none !important;',
                  '}'
                ].join('\\n');
                (document.head || document.documentElement).appendChild(style);
              }
            } catch (_) {}

            const hideAds = () => {
              try {
                const ads = document.querySelectorAll(
                  'ins.adsbygoogle, [id*="google_ads"], .ad-banner, .adsbygoogle, #ad-top, #ad-bottom, .publi, [id*="adinplay"], iframe[src*="adinplay"], iframe[id*="ad"]'
                );
                ads.forEach(ad => {
                  ad.style.setProperty('display', 'none', 'important');
                  if (ad.parentElement && (ad.parentElement.tagName === 'ASIDE' || ad.parentElement.className.includes('lateral'))) {
                    ad.parentElement.style.setProperty('display', 'none', 'important');
                  }
                });
              } catch (_) {}
            };
            hideAds();
            setInterval(hideAds, 1000);

            // 8. Helper asíncrono robusto para obtener el enlace activo de la sala
            window._onicordGetActiveRoomLink = async function() {
              if (window._onicordRoomLink && isGarticRoom(window._onicordRoomLink)) {
                return window._onicordRoomLink;
              }
              if (window.location && window.location.href && isGarticRoom(window.location.href)) {
                window._onicordRoomLink = window.location.href;
                return window.location.href;
              }

              // Si el usuario está en la pantalla inicial de Gartic Phone (antes de iniciar la sala)
              try {
                const pathname = (window.location && window.location.pathname) || '';
                if (!pathname.includes('/lobby') && !isGarticRoom(window.location.href)) {
                  const startBtns = Array.from(document.querySelectorAll('button, [role="button"], a, input[type="button"], div, span'));
                  const startBtn = startBtns.find(b => {
                    if (b.children.length > 3) return false;
                    const t = (b.textContent || '').trim().toLowerCase();
                    return t === 'iniciar' || t === 'start' || t === 'começar' || t === 'crear sala' || t === 'create room';
                  });
                  if (startBtn) {
                    try {
                      startBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
                      startBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                      startBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
                      startBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                    } catch (_) {}
                    if (typeof startBtn.click === 'function') startBtn.click();

                    // Esperar a entrar a la sala/lobby
                    for (let w = 0; w < 14; w++) {
                      await new Promise(r => setTimeout(r, 120));
                      if ((window.location && window.location.pathname.includes('/lobby')) || isGarticRoom(window.location.href)) break;
                    }
                  }
                }
              } catch (_) {}

              // Buscar en storage
              try {
                for (let i = 0; i < localStorage.length; i++) {
                  const val = localStorage.getItem(localStorage.key(i));
                  if (val && typeof val === 'string') {
                    const m = val.match(/https?:\\/\\/(?:www\\.)?garticphone\\.com\\/(?:[a-zA-Z]{2}\\/)?([a-zA-Z0-9]{6,12})/i);
                    if (m && isGarticRoom(m[0])) {
                      window._onicordRoomLink = m[0];
                      return m[0];
                    }
                  }
                }
              } catch (_) {}

              // Buscar en inputs o elementos que muestren el link de invitación
              try {
                const elements = Array.from(document.querySelectorAll('input, a, div, span, textarea, [data-link], [data-url]'));
                for (const el of elements) {
                  const val = el.value || el.href || el.getAttribute('data-link') || el.getAttribute('data-url') || '';
                  if (isGarticRoom(val)) {
                    const found = normalizeLink(val);
                    if (found) {
                      window._onicordRoomLink = found;
                      return found;
                    }
                  }
                  const txt = (el.textContent || '').trim();
                  if (txt.includes('garticphone.com')) {
                    const m = txt.match(/https?:\\/\\/(?:www\\.)?garticphone\\.com\\/(?:[a-zA-Z]{2}\\/)?([a-zA-Z0-9]{6,12})/i);
                    if (m && isGarticRoom(m[0])) {
                      window._onicordRoomLink = m[0];
                      return m[0];
                    }
                  }
                }
              } catch (_) {}

              // Pulsar el botón de invitar del lobby para disparar el copiado o desplegar el modal
              const candidates = Array.from(document.querySelectorAll('button, [role="button"], a, input[type="button"], div, span'));
              const invBtn = candidates.find(b => {
                if (b.children.length > 3) return false;
                const txt = (b.textContent || '').trim().toLowerCase();
                const aria = (b.getAttribute('aria-label') || '').toLowerCase();
                const title = (b.getAttribute('title') || '').toLowerCase();
                const cls = (b.className || '').toString().toLowerCase();
                const id = (b.id || '').toLowerCase();
                return (
                  txt === 'invitar' || txt === 'invite' || txt === 'copiar' || txt === 'convidar' ||
                  txt.includes('invitar') || txt.includes('invite') || txt.includes('copiar enlace') || txt.includes('copy link') || txt.includes('convidar') ||
                  aria.includes('invit') || aria.includes('share') || aria.includes('copiar') ||
                  cls.includes('invite') || cls.includes('share') || cls.includes('btlobby') || cls.includes('btinvite') ||
                  id.includes('invite') || id.includes('share')
                );
              });

              if (invBtn) {
                try {
                  invBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
                  invBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                  invBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
                  invBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
                } catch (_) {}
                if (typeof invBtn.click === 'function') {
                  try { invBtn.click(); } catch (_) {}
                }

                // Esperar un instante para que el copiado asíncrono o modal de invitación ocurra
                await new Promise(r => setTimeout(r, 220));

                if (window._onicordRoomLink && isGarticRoom(window._onicordRoomLink)) {
                  return window._onicordRoomLink;
                }

                // Si abrió un modal de invitación, buscar input o botón secundario de "COPIAR"
                try {
                  const modalInputs = Array.from(document.querySelectorAll('input, textarea'));
                  const foundInput = modalInputs.find(i => isGarticRoom(i.value || ''));
                  if (foundInput) {
                    const norm = normalizeLink(foundInput.value);
                    if (norm) {
                      window._onicordRoomLink = norm;
                      return norm;
                    }
                  }

                  const copyBtn = Array.from(document.querySelectorAll('button, [role="button"], div, span')).find(b => {
                    if (b.children.length > 2) return false;
                    const t = (b.textContent || '').trim().toLowerCase();
                    return t === 'copiar' || t === 'copy' || t.includes('copiar') || t.includes('copy') || t.includes('enlace');
                  });
                  if (copyBtn) {
                    try {
                      copyBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
                      copyBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                    } catch (_) {}
                    if (typeof copyBtn.click === 'function') copyBtn.click();
                    await new Promise(r => setTimeout(r, 150));
                  }
                } catch (_) {}
              }

              return (window._onicordRoomLink && isGarticRoom(window._onicordRoomLink)) ? window._onicordRoomLink :
                     (window.location && window.location.href && isGarticRoom(window.location.href)) ? window.location.href : null;
            };
          } catch (e) {
            console.error('[Gartic Phone Hook Error]', e);
          }
        })()
      `
    ]
  },
  skribbl: {
    id: "skribbl",
    title: "Skribbl.io",
    icon: "palette",
    url: "https://skribbl.io/",
    cover: "https://skribbl.io/img/thumbnail.png",
    shareCapture: {
      triggerSelector: "#copy-invite, .copy-invite, #button-lobby-create",
      windowProperty: "_onicordRoomLink",
      queryParam: "skribbl.io/?"
    },
    frameScripts: [
      `
        (() => {
          try {
            const getNick = () => {
              const raw = window._onicordUserNick;
              if (!raw || raw === 'PLAYER') return '';
              return String(raw).replace(/[\\u0000-\\u001f\\u007f]/g, ' ').replace(/\\s+/g, ' ').trim().slice(0, 20);
            };

            const targetNick = getNick();

            if (navigator.clipboard && !navigator.clipboard._onicordHooked) {
              const origWrite = navigator.clipboard.writeText;
              navigator.clipboard.writeText = function(text) {
                if (typeof text === 'string' && text.includes('skribbl.io/?')) {
                  window._onicordRoomLink = text.trim();
                }
                return origWrite.apply(this, arguments);
              };
              navigator.clipboard._onicordHooked = true;
            }

            const checkRoom = () => {
              try {
                const inviteInput = document.querySelector('#input-invite');
                if (inviteInput && inviteInput.value && inviteInput.value.includes('skribbl.io/?')) {
                  window._onicordRoomLink = inviteInput.value.trim();
                } else if (window.location && window.location.search && window.location.search.length > 2 && window.location.href.includes('skribbl.io/?')) {
                  window._onicordRoomLink = window.location.href;
                }
              } catch (_) {}
            };
            checkRoom();
            setInterval(checkRoom, 1000);

            const applyNick = () => {
              const nick = getNick();
              if (!nick) return;
              try {
                localStorage.setItem('name', nick);
                localStorage.setItem('player-name', nick);
              } catch (_) {}

              try {
                const inputs = document.querySelectorAll('#input-name, input[name="name"], .input-name, input[placeholder*="Name" i], input[placeholder*="nombre" i]');
                inputs.forEach((inp) => {
                  if (inp && inp.value !== nick) {
                    inp.value = nick;
                    inp.dispatchEvent(new Event('input', { bubbles: true }));
                    inp.dispatchEvent(new Event('change', { bubbles: true }));
                  }
                });
              } catch (_) {}
            };

            applyNick();
            const nickInterval = setInterval(applyNick, 1000);
            setTimeout(() => clearInterval(nickInterval), 45000);

            // 4. Neutralización de motores de publicidad (AdinPlay, Google Ads, GPT)
            try {
              window.aiptag = window.aiptag || {};
              window.aiptag.cmd = window.aiptag.cmd || [];
              window.aiptag.cmd.display = [];
              window.aiptag.cmd.player = [];
              window.aiptag.display = () => {};
              window.aiptag.player = () => {};
              window.aiptag.showDisplay = () => {};
              window.aiptag.showPlayer = (opts) => {
                if (opts && typeof opts.onComplete === 'function') opts.onComplete();
              };

              window.adsbygoogle = window.adsbygoogle || [];
              window.adsbygoogle.push = function() {};

              window.googletag = window.googletag || {
                cmd: [],
                display: () => {},
                enableServices: () => {},
                pubads: () => ({
                  setTargeting: () => {},
                  clearTargeting: () => {},
                  enableSingleRequest: () => {},
                  collapseEmptyDivs: () => {},
                  refresh: () => {}
                })
              };
            } catch (_) {}

            // 5. Inyección de reglas CSS para eliminar contenedores y banners en Skribbl
            try {
              const styleId = "onicord-skribbl-ads-style";
              if (!document.getElementById(styleId)) {
                const style = document.createElement("style");
                style.id = styleId;
                style.textContent = [
                  '.ad-2,',
                  'ins.adsbygoogle,',
                  '.adsbygoogle,',
                  '[id*="ad-"],',
                  '[id^="ad-"],',
                  '[id*="adinplay"],',
                  '#banner-left,',
                  '#banner-right,',
                  'iframe[src*="adinplay"],',
                  'iframe[src*="doubleclick"] {',
                  '  display: none !important;',
                  '  visibility: hidden !important;',
                  '  height: 0 !important;',
                  '  width: 0 !important;',
                  '  opacity: 0 !important;',
                  '  pointer-events: none !important;',
                  '}'
                ].join('\\n');
                (document.head || document.documentElement).appendChild(style);
              }
            } catch (_) {}

            const hideAds = () => {
              try {
                const ads = document.querySelectorAll(
                  '.ad-2, ins.adsbygoogle, [id*="ad-"], .adsbygoogle, #banner-left, #banner-right, [id*="adinplay"], iframe[src*="adinplay"]'
                );
                ads.forEach(ad => ad.style.setProperty('display', 'none', 'important'));
              } catch (_) {}
            };
            hideAds();
            setInterval(hideAds, 1000);

            window._onicordGetActiveRoomLink = function() {
              const inviteInput = document.querySelector('#input-invite');
              if (inviteInput && inviteInput.value && inviteInput.value.includes('skribbl.io/?')) {
                return inviteInput.value.trim();
              }
              if (window._onicordRoomLink && window._onicordRoomLink.includes('skribbl.io/?')) {
                return window._onicordRoomLink;
              }
              if (window.location && window.location.search && window.location.search.length > 2 && window.location.href.includes('skribbl.io/?')) {
                return window.location.href;
              }
              const copyBtn = document.querySelector('#copy-invite, .copy-invite');
              if (copyBtn && typeof copyBtn.click === 'function') {
                try { copyBtn.click(); } catch (_) {}
              }
              return window._onicordRoomLink || null;
            };
          } catch (e) {
            console.error('[Skribbl Hook Error]', e);
          }
        })()
      `
    ]
  }
};

// ==========================================
// 2. APERTURA DEL CATÁLOGO LAUNCHER
// ==========================================
function openArcadeLauncher() {
  const user = Onicord.user?.getProfile?.() || {};
  const nick = user.nickname || user.username || "Jugador";

  const stageDef = {
    pluginId: "onicord-arcade",
    title: "Arcade",
    icon: "sports_esports",
    entryPoint: "widgets/launcher.html",
    authorName: nick,
    userNick: nick,
    activity: {
      name: "Arcade",
      details: "Catálogo de Juegos",
      state: null,
      cover: null,
      type: "launcher",
      isCatalog: true,
      startTime: Date.now(),
    },
  };

  if (Onicord.ui?.openStageView) {
    Onicord.ui.openStageView(stageDef);
  }

  if (Onicord.gaming?.setActivity) {
    Onicord.gaming.setActivity(stageDef.activity);
  }
}

// ==========================================
// 3. MOTOR GENÉRICO DE LANZAMIENTO DE JUEGOS
// ==========================================
function launchGame(gameConfig = {}, overrides = {}) {
  const user = Onicord.user?.getProfile?.() || {};
  const nick = overrides.userNick || user.nickname || user.username || "Jugador";
  const roomCode = overrides.roomCode || null;

  const stageDef = {
    pluginId: "onicord-arcade",
    title: gameConfig.title || "Juego Arcade",
    icon: gameConfig.icon || "sports_esports",
    url: overrides.url || gameConfig.url,
    authorName: nick,
    userNick: nick,
    shareCapture: gameConfig.shareCapture || null,
    frameScripts: gameConfig.frameScripts || [],
    activity: {
      name: gameConfig.title || "Juego Arcade",
      details: "Arcade",
      state: roomCode ? `En sala #${roomCode}` : (gameConfig.state || "Jugando"),
      cover: gameConfig.cover || null,
      party: roomCode ? (gameConfig.party || { size: 1, max: 2 }) : null,
      type: "game",
      isCatalog: false,
      startTime: Date.now(),
    },
    ...overrides,
  };

  if (Onicord.ui?.openStageView) {
    Onicord.ui.openStageView(stageDef);
  }

  if (Onicord.gaming?.setActivity) {
    Onicord.gaming.setActivity(stageDef.activity);
  }
}

// ==========================================
// 4. COMPARTIR SALAS EN EL CHAT (TARJETA INTERACTIVA)
// ==========================================
async function shareGameLobby(gameKey, roomCode, context = null) {
  const game = GAMES_REGISTRY[gameKey] || {
    id: gameKey,
    title: gameKey.toUpperCase(),
    icon: "sports_esports",
    url: ""
  };
  const user = context?.author || Onicord.user?.getProfile?.() || { nickname: "Jugador" };
  const nick = user.nickname || user.username || "Jugador";
  const finalRoomCode = roomCode || String(Math.floor(100 + Math.random() * 900));

  let joinUrl = game.url;
  if (game.url && finalRoomCode) {
    try {
      const u = new URL(game.url);
      if (game.id === "skribbl") {
        u.search = `?${finalRoomCode}`;
      } else {
        u.searchParams.set(game.shareCapture?.queryParam?.replace("=", "") || "sala", finalRoomCode);
      }
      joinUrl = u.href;
    } catch (_) {
      joinUrl = game.id === "skribbl" ? `${game.url}?${finalRoomCode}` : `${game.url}?sala=${finalRoomCode}`;
    }
  }

  const embedPayload = {
    pluginId: "onicord-arcade",
    type: "game_lobby",
    data: {
      gameTitle: game.title,
      gameIcon: game.icon || "sports_esports",
      coverUrl: game.cover || null,
      roomCode: finalRoomCode,
      authorName: nick,
      userNick: nick,
      joinUrl: joinUrl,
      activity: {
        name: game.title,
        details: "Arcade",
        state: `En sala #${finalRoomCode}`,
        cover: game.cover || null,
        party: { size: 1, max: 2 },
      },
      shareCapture: game.shareCapture || null,
    },
  };

  await Onicord.chat.sendMessage({
    text: `[PLUGIN_EMBED]:${JSON.stringify(embedPayload)}`,
  });
}

// ==========================================
// 5. REGISTRO DE CONTROLES E INTERFAZ
// ==========================================

// Botón de la barra de controles de voz (Icono de Joystick abre el Catálogo)
if (typeof Onicord !== "undefined" && Onicord.ui?.registerVoiceControlButton) {
  Onicord.ui.registerVoiceControlButton({
    id: "arcade_joystick",
    icon: "sports_esports",
    tooltip: "Arcade (Catálogo de Juegos)",
    action: "TOGGLE_ARCADE_STAGE",
    onClick: () => {
      openArcadeLauncher();
    },
  });
}

// ==========================================
// 6. COMANDOS DE CHAT
// ==========================================
if (typeof Onicord !== "undefined" && Onicord.chat?.onCommand) {
  // Comando para abrir el catálogo general
  Onicord.chat.onCommand("arcade", async () => {
    openArcadeLauncher();
  });
}

// ==========================================
// 7. RESOLVEDOR AGNÓSTICO DE ETAPAS (STAGE RESOLVER)
// ==========================================
// Permite que cuando un compañero se una desde el chat a una partida de Arcade,
// Onicord consulte de forma agnóstica a este complemento los scripts y hooks locales confiables.
if (typeof Onicord !== "undefined" && Onicord.stage?.onResolveStage) {
  Onicord.stage.onResolveStage((stageReq) => {
    if (!stageReq) return null;
    const reqUrl = stageReq.url ? String(stageReq.url).toLowerCase() : "";
    const reqHost = reqUrl.replace(/^https?:\/\//, "").split("/")[0];
    for (const game of Object.values(GAMES_REGISTRY)) {
      if (!game.url) continue;
      const baseUrl = game.url.split("?")[0].toLowerCase().replace(/\/+$/, "");
      const gameHost = game.url.replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
      if ((reqHost && reqHost === gameHost) || reqUrl.startsWith(baseUrl) || (stageReq.id && stageReq.id === game.id)) {
        return {
          title: game.title,
          icon: game.icon || "sports_esports",
          cover: game.cover || null,
          shareCapture: game.shareCapture || null,
          frameScripts: game.frameScripts || [],
        };
      }
    }
    return null;
  });
}

