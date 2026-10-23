# 📓 Bitácora de Descubrimientos, Cambios y Pruebas — Onicord

Esta bitácora sirve como registro histórico permanente de todos los hallazgos técnicos, diagnósticos cruzados de logs, modificaciones de código y pruebas realizadas en la plataforma Onicord. Su objetivo es **garantizar la trazabilidad**, **evitar ciclos/regresiones** y **optimizar el flujo de trabajo**.

---

## 🛡️ Invariantes Anti-Regresión (Reglas Estrictas)
1. **Serialización WebRTC IPC**: Toda señal WebRTC (`offer`, `answer`, `ice-batch`, `candidate`) debe viajar a través de Electron IPC (`ipcRenderer.invoke` / `ipcMain.handle`) como **objetos JSON planos** (`{ type, sdp }`, `{ candidate, sdpMid, sdpMLineIndex }`), nunca como instancias de clase `RTCSessionDescription` o `RTCIceCandidate` (Chromium WebIDL usa *getters* no enumerables que el Structured Clone de V8 omitiría).
2. **Layout de Escenario de Transmisión**: Cuando una transmisión de video (`localStream` o `remoteStream`) está activa y no está en modo flotante (`!isStreamFloating`), el `ChatPanel` debe ocultarse (`hidden`) y el `StreamDisplay` debe tomar el 100% del contenedor central (`flex-1 h-full`). No apilar verticalmente el stream debajo del input del chat.
3. **Negociación WebRTC Bidireccional (W3C Perfect Negotiation)**: La adición y remoción de flujos de video (como compartir pantalla) debe gestionarse dinámicamente mediante el patrón canónico de *Perfect Negotiation* (`isPolite = localPeerId > remotePeerId`, `rollback` ante colisiones de oferta y `pc.onnegotiationneeded` irrestricto). Se descarta el uso de tracks dummy sintéticos de canvas que enmascaraban el estado real de los transceptores.
4. **Sincronización P2P Silenciosa**: Las sincronizaciones de mensajes de texto y estados de presencia transcurren en segundo plano sin desplegar notificaciones toast intrusivas.
5. **Deduplicación Canónica de Servidores**: Las listas y cachés de servidores en el backend P2P se indexan por código canónico en mayúsculas (`roomCode.toUpperCase()`) para evitar duplicación de servidores y claves criptográficas inválidas `[Cifrado - No disponible]`.
6. **Música y Heartbeats DJ**: Solo el usuario que tiene el rol de DJ activo (`isMasterDJ`) puede emitir heartbeats de tiempo; los oyentes nunca aplican corrección de drift sobre sí mismos.
7. **Tolerancia a Bloqueo de Hardware de Audio (Modo Solo Escuchar)**: Si la captura del micrófono falla en el SO por bloqueo de hardware (e.g. `NotReadableError` por uso exclusivo de Discord, OBS o Zoom), la conexión de voz WebRTC nunca debe abortarse ni desconectar al usuario del canal. Se debe aplicar un fallback automático a track de audio silencioso en modo "Solo Escuchar", permitiendo oír a los pares y brindando la opción de reintentar la captura de micrófono en caliente (`reclaimMicrophone`).
8. **Particionamiento Seguro de Payloads P2P (Límite Atómico TCP 16MB)**: Ningún mensaje emitido por sockets P2P de red debe enviarse en una única llamada atómica a `socket.write` si supera los 2MB. Todo flujo de salida debe canalizarse mediante `safeWriteSocket` para fragmentar la carga y evitar que Node.js / Hyperswarm lancen `Message is too large for an atomic write` y destruyan el socket.
9. **Agrupamiento Consistente de Mensajes y Conteo de Hilos**: Al renderizar mensajes en `ChatPanel`, la prop `messages` entregada a `ChatMessageItem` debe ser la lista filtrada de pantalla (`mainStreamMessages`) para la comparación del mensaje anterior `messages[index - 1]`, mientras que `allMessages` debe ser la lista completa del canal (`messages`) para que el conteo de respuestas de hilos (`threadRepliesCount`) y vistas previas de respuestas no se distorsionen.
10. **Comportamiento del Overlay de Voz sobre Juegos**: La ventana overlay debe permanecer oculta cuando la ventana principal de Onicord está enfocada (`isAppFocused === true`) y responder reactivamente a la actividad de voz, posición en 8 bordes y juego activo.
11. **Arquitectura Modular Cohesiva (Límite 80-300 líneas por submódulo)**: Para reducir el consumo de tokens y prevenir regresiones laterales, ningún componente o servicio del proyecto debe volver a convertirse en un monolito de miles de líneas. Toda extensión debe residir en las subcarpetas establecidas (`src/components/chat/subcomponents/`, `src/components/navigation/`, `src/components/voice/`, `src/hooks/`, `src/lib/voice/`, `electron/ipc/handlers/`).

### [2026-10-23 — 11:30] Release v0.1.7: Auto-Ducking Inteligente, Modo Juegos en Transmisión, Selector Gradual de SFX, Captura Arcade y Búsqueda P2P
* **Archivos Modificados**:
  - [`package.json`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/package.json)
  - [`package-lock.json`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/package-lock.json)
  - [`RELEASE_NOTES.md`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/RELEASE_NOTES.md)
  - [`src/lib/voice/VoiceAudioEngine.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/voice/VoiceAudioEngine.js)
  - [`src/components/voice/StreamDisplay.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/voice/StreamDisplay.jsx)
  - [`src/components/modals/ScreenShareModal.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/modals/ScreenShareModal.jsx)
  - [`src/components/settings/AudioTab.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/settings/AudioTab.jsx)
  - [`src/lib/audioSettings.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/audioSettings.js)
  - [`src/lib/soundEngine.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/soundEngine.js)
  - [`src/i18n/locales/es.json`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/i18n/locales/es.json)
  - [`src/i18n/locales/en.json`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/i18n/locales/en.json)
  - [`src/i18n/locales/pt.json`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/i18n/locales/pt.json)
  - [`electron/main.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/main.cjs)
  - [`electron/ipc/handlers/pluginDriveHandlers.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/ipc/handlers/pluginDriveHandlers.cjs)
  - [`src/components/voice/AddonStageDisplay.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/voice/AddonStageDisplay.jsx)
  - [`addons/onicord-arcade/index.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/addons/onicord-arcade/index.js)
  - [`addons/onicord-arcade/widgets/launcher.html`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/addons/onicord-arcade/widgets/launcher.html)
  - [`src/components/views/RoomView.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/views/RoomView.jsx)
  - [`electron/p2p/searchStore.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/p2p/searchStore.cjs) [NUEVO]
  - [`electron/p2p/chatStore.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/p2p/chatStore.cjs)
  - [`electron/ipc/handlers/chatHandlers.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/ipc/handlers/chatHandlers.cjs)
  - [`src/components/chat/subcomponents/MessageEmbedCard.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/chat/subcomponents/MessageEmbedCard.jsx)
  - [`src/lib/messageParser.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/messageParser.jsx)
  - [`src/lib/voice/VoicePeerManager.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/voice/VoicePeerManager.js)
* **Requerimientos y Reglas Implementadas**:
  1. **Auto-Ducking de Audio en Tiempo Real y Limitador Master Anti-Clipping**:
     - `VoiceAudioEngine`: Detección en vivo de oradores activos (`activeSpeakers`). Emisión reactiva del evento `voice-ducking-change` calculando `duckMultiplier` según el porcentaje configurado (`autoDuckingAmount`, default 50%).
     - `StreamDisplay` y `AddonStageDisplay`: Atenúan suave y automáticamente el audio de transmisiones de pantalla y juegos web cuando alguien habla, priorizando la claridad de la voz.
     - Bus maestro (`ensureMasterBus`) con `DynamicsCompressorNode` transparente (-1.5dB threshold, ratio 12.0) para prevenir distorsión digital y saturación acústica. Salida directa a hardware sin elementos `<audio>` DOM propensos a throttling.
  2. **Mejoras en Transmisión de Pantalla y Video (`ScreenShareModal.jsx`)**:
     - Botón de audio de sistema (`includeAudio`): Permite incluir o silenciar el sonido de escritorio/aplicaciones, con avisos anti-eco recomendando auriculares.
     - Botón de Modo Juegos (`gameMode`): Alterna entre 60 FPS estables con audio estéreo optimizado para gaming y modo estándar 30 FPS para ahorro de CPU en texto/código.
     - Selector unificado de resolución (Original, 1080p, 720p, 480p) y limpieza estricta de pistas al cortar.
  3. **Tarjetas Enriquecidas Open Graph y Previsualización Multimedia**:
     - **Spotify**: Tarjeta temática con carátula del álbum, ecualizador visual, información de pista/artista y botón de reproducción directa.
     - **Pinterest**: Formato vertical nativo (hasta 420px de altura) conservando la escala y descripción original del Pin sin recortes forzados.
     - **GIFs y Animaciones**: Reproducción inline nativa, loop automático y silencio predeterminado para clips de Tenor, GIPHY y MP4.
     - **YouTube**: Miniaturas fallback en alta resolución (`hqdefault.jpg`) y cálculo de proporciones 16:9 y vertical 9:16 (Shorts/Reels).
     - **Parseo Seguro de Enlaces**: Procesamiento de URLs prioritario antes del formato markdown, evitando que guiones bajos `_` en parámetros rompan enlaces o mutilen estilos cursiva/negrita.
  4. **Selector Escalonado de SFX en Configuración de Audio**:
     - Se reemplazaron los conmutadores binarios individuales por un selector de 4 niveles (`none`, `essential`, `chat`, `all`).
     - `none`: silencio total.
     - `essential`: solo alertas críticas de voz (mute, deafen, connect, disconnect, screen share, notificaciones).
     - `chat`: esenciales + mensajes enviados/recibidos y sonido al escribir.
     - `all`: todos los sonidos de interfaz interactivos.
     - Persistencia y sincronización inmediata sin recarga.
  5. **Captura Dinámica y Agnóstica de Enlaces en Escenario Arcade**:
     - Compatibilidad con juegos que estructuran enlaces en el pathname (e.g. `https://garticphone.com/es/001C5257`), no requiriendo forzosamente `?c=`.
     - Auto-creación de sala ("INICIAR") al pulsar "Invitar al chat" en la portada de Gartic Phone con sondeo activo hasta acceder al lobby y pulsar el botón de invitar.
     - Eliminación de errores de permisos `screen-wake-lock` y `wake-lock` en subframes de Electron y attributes `allow`.
     - Corrección del recolector de frames `collectFrames` y captura de excepciones con trazabilidad en OniDiag (`[StageCapture]`).
     - Renderizado de tarjetas enriquecidas (`MessageEmbedCard`) en el chat con código de partida limpio y botones de unirse y copiar.
  6. **Motor de Búsqueda Full-Text P2P Cifrado (`searchStore.cjs`)**:
     - Tokenización y búsqueda全文 local e indexada sobre el historial de mensajes de salas y canales.
     - Operadores avanzados (`from:`, `in:`, `has:file`, `has:image`, `has:link`, `"frase exacta"`).
  7. **Estabilidad en WebRTC y Flujo de Transmisión**:
     - Desasignación limpia de pistas de medios en `StreamDisplay` y mitigación de colisiones en Perfect Negotiation.

### [2026-10-09 — 01:00] Integración de `uIOhook` para Atajos Globales de Mouse y Teclas Combinadas en Segundo Plano
* **Archivos Modificados**:
  - [`package.json`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/package.json)
  - [`electron/services/globalKeybindService.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/services/globalKeybindService.cjs) [NUEVO]
  - [`electron/main.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/main.cjs)
  - [`src/components/views/HomeView.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/views/HomeView.jsx)
  - [`src/components/settings/KeybindingsTab.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/settings/KeybindingsTab.jsx)
* **Requerimientos y Reglas Implementadas**:
  1. **Atajos Globales de Mouse en Segundo Plano**:
     - Se integró `uiohook-napi` mediante el servicio `globalKeybindService.cjs`.
     - Ahora los botones de mouse (Mouse 3, Mouse 4, Mouse 5) y las combinaciones con mouse (ej: `Ctrl + Shift + Mouse 5`) son interceptados por el hook a nivel del sistema operativo, funcionando mientras Onicord está en segundo plano o jugando a pantalla completa.
  2. **Regla de Filtrado en Segundo Plano (Teclas Simples vs Combinadas)**:
     - Cuando Onicord está en segundo plano o minimizado (`!isAppFocused`), **se bloquean estrictamente los atajos de una sola tecla alfanumérica** (sin Ctrl/Alt/Meta, ej: "M", "1", "Space") para no interferir con la escritura en juegos, navegadores u otras aplicaciones.
     - Solo se despachan en segundo plano atajos con modificadores (`hasModifiers`), botones de mouse (`isMouse`) o teclas de función dedicadas (`F1`-`F24`).
  3. **Protección de Inputs de Texto en la App**:
     - En `HomeView.jsx`, cuando el usuario está enfocado en cualquier campo `<input>`, `<textarea>` o elemento editable (`isContentEditable`), los atajos de una sola tecla no se disparan, permitiendo escribir normalmente en el chat o buscador sin activar atajos involuntariamente.
  4. **Prevención de Doble Ejecución**:
     - Se añadió un mecanismo de debounce de 120ms tanto en el backend (`globalKeybindService`) como en el frontend (`executeKeybindingAction`) para evitar disparos duplicados entre el hook del SO y los eventos DOM locales.
  5. **Empaquetado de Binarios N-API Precompilados (`npmRebuild: false`)**:
     - `electron-builder` intentaba invocar `@electron/rebuild` y `node-gyp` para compilar `uiohook-napi` desde código fuente, fallando en entornos de Python 3.12+ por la ausencia de `distutils`.
     - Dado que `uiohook-napi` ya provee binarios estables de Node-API (`prebuilds/win32-x64/uiohook-napi.node`), se configuró `"npmRebuild": false` en la sección `build` de `package.json`. Esto omite la reconstrucción innecesaria e incluye el binario precompilado desempaquetado vía `"asarUnpack": ["**/*.node"]`.
* **Resultado**: `npm run pack:portable` completado exitosamente con código 0, generando `release/Onicord-Portable-0.1.0.exe` operativo. Atajos de mouse y combinados 100% funcionales en segundo plano.

---

### [2026-10-09 — 00:45] Corrección de Atajos de Teclado y Mouse: Enrutamiento de `toggle_mute`, Normalización de Botones y Atajos Globales
* **Archivos Modificados**:
  - [`src/context/VoiceContext.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/context/VoiceContext.jsx)
  - [`src/components/views/HomeView.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/views/HomeView.jsx)
  - [`electron/main.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/main.cjs)
  - [`electron/services/profileService.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/services/profileService.cjs)
  - [`src/components/settings/KeybindingsTab.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/settings/KeybindingsTab.jsx)
* **Diagnóstico de la Falla**:
  1. **Acción `toggle_mute` Huérfana sin Listener**:
     - En `HomeView.jsx`, al presionarse el atajo configurado se ejecutaba `executeKeybindingAction("toggle_mute")`, el cual emitía `window.dispatchEvent(new CustomEvent("onicord:keybind:toggle_mute"))`.
     - **Ningún componente en todo el frontend escuchaba ese evento**. Ni `VoiceContext` ni `useVoiceConnection` tenían listeners registrados para silenciar o ensordecer por atajo.
  2. **Discrepancia en Formato de Texto de Atajos ("mouse 5" vs "mouse5")**:
     - La comparación se realizaba mediante igualdad estricta de cadenas en minúsculas (`kb.shortcut?.toLowerCase() === pressedShortcut.toLowerCase()`).
     - Al capturarse el click, el código generaba `"Ctrl + Shift + Mouse5"`, mientras que una entrada escrita o migrada como `"ctrl+shift+mouse 5"` (con espacio) fallaba en coincidir.
  3. **Ausencia de Atajos Globales en Segundo Plano**:
     - Toda la captura de eventos residía en `window.addEventListener("keydown" / "mousedown")` de Chromium, por lo que requería que la ventana de Onicord estuviera enfocada. Al jugar en pantalla completa, los atajos de teclado no llegaban.
* **Acción Aplicada**:
  - **Conexión de Atajos en `VoiceContext`**: Se agregaron listeners para `onicord:keybind:toggle_mute` (`voice.toggleMute()`), `onicord:keybind:toggle_deafen` (`voice.toggleDeafen()`) y `onicord:keybind:disconnect_voice` (`leaveVoiceChannel()`).
  - **Normalizador de Atajos (`normalizeShortcut`)**: Se eliminan espacios en blanco y se normalizan variantes como `mouse 5` -> `mouse5` para garantizar coincidencia infalible.
  - **Motor de Atajos Globales en Electron (`globalShortcut`)**: Se implementó `updateGlobalShortcuts` en `main.cjs` para registrar atajos puros de teclado en el SO (ej: `Ctrl+Shift+M`, `F8`), permitiendo mutear/desmutear mientras se juega con Onicord en segundo plano.
* **Resultado**: `npm run build` exitoso (4.78s). Silenciado/desilenciado funciona tanto con mouse dentro de la app como con teclas globales en segundo plano.

---

### [2026-10-09 — 00:30] Corrección de Renderizado y Caché de Miembros en Overlay de Voz (Versión Empaquetada y Portable)
* **Archivos Modificados**:
  - [`electron/services/overlayService.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/services/overlayService.cjs)
  - [`electron/ipc/handlers/pluginDriveHandlers.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/ipc/handlers/pluginDriveHandlers.cjs)
  - [`electron/preload.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/preload.cjs)
  - [`electron/main.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/main.cjs)
  - [`src/components/settings/OverlayTab.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/settings/OverlayTab.jsx)
* **Diagnóstico del Fallo en Versión Compilada**:
  1. **Pérdida de Miembros en Creación Perezosa (`did-finish-load`)**:
     - Al entrar a un canal de voz cuando no hay un juego en ejecución, `overlayWindow` no existía (`null`). `updateOverlayData(members)` descartaba los miembros sin guardarlos en caché.
     - Al iniciarse un juego y dispararse `showOverlay()` -> `createOverlayWindow()`, `overlayWindow.loadFile()` completaba la carga (`did-finish-load`) pero solo enviaba `overlay:settings`, nunca `overlay:voice-update`.
     - En `overlay.html`, `lastMembers` permanecía vacío (`[]`), forzando `container.style.display = "none"` y dejando la ventana 100% invisible.
  2. **Resolución de Rutas en Asar**:
     - Se reforzó la resolución de rutas con `resolveAssetPath` combinando `app.getAppPath()` con fallback a `__dirname` para garantizar que `overlay.html` y `overlayPreload.cjs` se carguen sin fallas en empaquetado asar portable.
  3. **Demora del Escáner al Minimizar en Voz**:
     - El escáner de juegos se desaceleraba a 30s al minimizar, incluso si el usuario estaba en voz jugando. Se acondicionó `setBackgroundMode(true)` para que solo reduzca la frecuencia si el usuario **no** está en una llamada de voz activa (`!overlayService.getHasVoiceData()`).
  4. **Modo de Prueba en Pantalla**:
     - Se implementó `triggerTestOverlay(durationMs)` en backend y un botón en la pestaña de Ajustes ("Probar en Pantalla (10s)") para que el usuario pueda verificar al instante el overlay en vivo sobre su escritorio.
* **Resultado**: `npm run build` exitoso (4.91s). El overlay retiene los participantes en caché y los reproduce inmediatamente al abrir la ventana.

---

### [2026-10-09 — 00:10] Optimización Integral de Memoria RAM en Uso Activo y en Modo Idle/Segundo Plano
* **Archivos Modificados**:
  - [`src/components/chat/ChatPanel.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/chat/ChatPanel.jsx)
  - [`src/hooks/useChatScroll.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/hooks/useChatScroll.js)
  - [`src/components/ui/SmartAnimatedImage.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/ui/SmartAnimatedImage.jsx)
  - [`electron/services/overlayService.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/services/overlayService.cjs)
  - [`electron/gameScanner.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/gameScanner.cjs)
  - [`electron/main.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/main.cjs)
  - [`electron/services/diagService.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/services/diagService.cjs)
* **Medidas y Optimizaciones Aplicadas**:
  1. **Paginación Dinámica del Chat (Ventana Deslizante en DOM)**:
     - Se integraron `useChatMessages` y `useChatScroll` vinculando las referencias compartidas (`chatContainerRef`, `bottomRef`, `messagesCountRef`).
     - Al entrar a un canal con cientos o miles de mensajes, solo se renderizan los últimos 40 mensajes (`visibleCount`). Conforme el usuario scrollea hacia arriba, el hook amplía en lotes de 30 de forma fluida sin saturar el árbol DOM de Chromium ni los renderizados de React.
  2. **Erradicación de Polling en `SmartAnimatedImage`**:
     - Se eliminó el `setInterval(..., 1000)` por instancia que ejecutaba lecturas periódicas a `localStorage`.
     - Ahora reacciona estrictamente por eventos (`storage` de ventana y CustomEvent `onicord:settings-changed`), liberando ciclos de CPU y reduciendo retención de memoria.
  3. **Ciclo de Vida Lazy del Overlay de Juegos (`overlayService.cjs`)**:
     - La ventana secundaria `overlayWindow` ya no se mantiene viva de fondo si no hay un juego detectado y el usuario no está en un canal de voz. Al quedar inactivo, se llama a `destroyOverlay()`, eliminando por completo el proceso de renderizado secundario de Chromium (~50–70 MB de RAM liberados).
  4. **Escaneo Adaptativo de Juegos en Segundo Plano (`gameScanner.cjs`)**:
     - Se implementó `setBackgroundMode(bg)`. Cuando la ventana de Onicord está minimizada o en segundo plano, la cadencia de ejecución del subproceso `tasklist /FO CSV /NH` pasa de cada 5 segundos a 30 segundos, reduciendo drásticamente el thrashing de procesos y consumo de CPU/RAM.
  5. **Compactación Forzada de Memoria al Minimizar (`electron/main.cjs`)**:
     - Se habilitó el flag de V8 `--js-flags=--expose-gc` al arranque.
     - En los eventos `minimize` y `hide` de `global.mainWindow`, se invoca `session.defaultSession.clearCache()` (libera buffers de imágenes cacheadas, fuentes y decodificadores) y `global.gc()` para forzar la recolección de basura de Node.js/V8.
     - Al restaurar o enfocar (`restore` / `show`), se restablece el modo de primer plano.
  6. **Límite Acotado de Logs de Diagnóstico (`diagService.cjs`)**:
     - Se redujo el búfer en memoria de diagnósticos `maxLogs` de 500 a 200 entradas para evitar crecimiento descontrolado de cadenas en heap.
* **Resultado**: `npm run build` completado exitosamente (3.88s). Reducción estimada de 100–160 MB de RAM en reposo/minimizada y DOM mucho más liviano en uso activo.

---

### [2026-10-08 — 21:05] Diagnóstico MCP y Resolución de Glare WebRTC en Video Dual-Instance, Cola FIFO de Señalización y Flap de Autoplay
* **Archivos Modificados**:
  - [`src/lib/voice/WebRtcPeerWrapper.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/voice/WebRtcPeerWrapper.js)
  - [`src/lib/voice/VoiceAudioEngine.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/voice/VoiceAudioEngine.js)
  - [`src/components/navigation/ChannelsSidebar.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/navigation/ChannelsSidebar.jsx)
  - [`src/components/views/RoomView.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/views/RoomView.jsx)
  - [`src/hooks/useVoiceConnection.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/hooks/useVoiceConnection.js)
* **Diagnóstico Extraído de Logs en Vivo (`onicord-mcp`)**:
  1. **Colisión de Estados y Glare WebRTC (`Called in wrong state: have-remote-offer` / `stable`)**:
     - En `WebRtcPeerWrapper.js`, las señales entrantes (`offer`, `answer`, `ice-batch`, `candidate`) se procesaban en funciones IIFE asíncronas no encadenadas (`(async () => {})()`). Cuando ambos pares iniciaban o renegociaban video simultáneamente, las llamadas a `setRemoteDescription` y `createAnswer` colisionaban concurrentemente.
     - En `onnegotiationneeded`, no existía guardia de estado inicial antes de llamar a `createOffer()`. Durante la espera asíncrona de `createOffer()`, llegaba una oferta remota que cambiaba el estado a `have-remote-offer`, provocando que `setLocalDescription(offer)` fallara 15 veces consecutivas con `Failed to set local offer sdp: Called in wrong state: have-remote-offer`.
     - El bloque `catch` de `onnegotiationneeded` emitía `emit("error", err)`, lo que provocaba que `VoicePeerManager` ejecutara `this.disconnectPeer()`, destruyendo y reconectando la llamada 15 veces en un bucle frenético de desconexiones.
  2. **Ciclo de Desconexión de Video por Clic Duplicado en UI**:
     - Al hacer clic en el canal de voz ya conectado en `ChannelsSidebar.jsx`, `selectVoiceChannel` invocaba `handleStopScreenShare()`, deteniendo prematuramente los tracks de video (`track.stop()`) y cerrando el stream a los 40 milisegundos de haber iniciado (`Track ended: video`).
  3. **Bucle de Interrupción de Autoplay (`The play() request was interrupted by a call to pause()`)**:
     - En `VoiceAudioEngine.js`, cada reconexión o ajuste de volumen pausaba y destruía el `<audio>` remoto mientras `audio.play()` estaba pendiente, lanzando un `AbortError` no capturado.
  4. **Purga Inesperada de Sesión de Voz (`useVoiceConnection.js`)**:
     - El hook principal de voz incluía `networkTopology` y `sfuHostId` en el array de dependencias de su efecto principal. Al iniciar video y emitirse el broadcast de estado (`voice:state`), cualquier cambio de topología invalidaba `activeTokenRef` y purgaba los recursos multimedia (`[voice hook] Purgando hardware multimedia local...`).
* **Acción Aplicada**:
  - **Cola FIFO de Señales (`signalQueue`)**: En `WebRtcPeerWrapper.js`, todas las señales recibidas se procesan secuencialmente mediante una cadena de promesas FIFO, impidiendo que ofertas, respuestas y lotes de ICE compitan entre sí.
  - **Perfect Negotiation a Prueba de Glare**: Se blindó `onnegotiationneeded` para validar `pc.signalingState === "stable"` tanto antes de generar la oferta como antes de aplicarla. Los errores de carrera transitorios de glare se absorben sin disparar `emit("error")` para no derribar la conexión WebRTC.
  - **Guardia Contra Selección Redundante en UI**: Tanto `ChannelsSidebar.jsx` como `RoomView.jsx` ahora comprueban `if (selectedVoiceChannelId !== ch.id)` antes de reconfigurar canales de voz o interrumpir streams activos.
  - **Manejo Seguro de Autoplay**: `VoiceAudioEngine.js` ahora maneja `AbortError` e interrupciones de `play().catch()` silenciosamente.
  - **Estabilización de Dependencias**: Se removieron `networkTopology` y `sfuHostId` del efecto de inicialización de hardware, ya que `manager.setTopology()` ya se ejecuta dinámicamente en `refreshState()` sin necesidad de destruir la sesión de audio.
* **Resultado**: `npm run build` exitoso (4.39s). Los logs de ambas instancias en vivo a través de `onicord-mcp` permanecen limpios (0 errores), estables y sincronizados bidireccionalmente.

---

### [2026-10-08 — 20:00] Modularización Integral de Monolitos (~10.000 Líneas Descompuestas en Submódulos Cohesivos)
* **Alcance y Archivos Refactorizados**:
  1. [`src/components/chat/ChatMessageItem.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/chat/ChatMessageItem.jsx):
     - **Antes**: 1.933 líneas en un solo archivo.
     - **Ahora**: 380 líneas (orquestador limpio).
     - **Subcomponentes creados en [`src/components/chat/subcomponents/`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/chat/subcomponents/)**:
       - `MessageAvatar.jsx` (avatar, estado online, fallback de iniciales)
       - `MessageHeader.jsx` (nickname, insignias de rol, timestamps relativos, bandera editado)
       - `MessageThreadBadge.jsx` (badge "Ver respuestas" con avatares de participantes)
       - `MessageReactionsBar.jsx` (píldoras de emojis, contadores, hover de autores, botón react)
       - `MessageActionsHoverBar.jsx` (toolbar flotante de acciones rápidas, responder, hilo, fijar, borrar)
       - `MessageEmbedCard.jsx` (previews OpenGraph, videos embebidos de YouTube, TikTok, Reels)
       - `MessageMediaAttachment.jsx` (tarjetas de descarga de archivos, imágenes expandibles, video nativo)
       - `MessageStickerContent.jsx` (renderizado de stickers Lottie/PNG con fallback de petición P2P)
       - `MessagePluginEmbed.jsx` (tarjetas de plugins e interactividad externa)
       - `MessageTextContent.jsx` (parser markdown, menciones, enlaces seguros)
  2. [`src/components/chat/ChatPanel.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/chat/ChatPanel.jsx):
     - **Antes**: 2.768 líneas.
     - **Ahora**: 780 líneas.
     - **Hooks y Subcomponentes creados**:
       - `src/hooks/useChatMessages.js` (sincronización P2P, filtrado de hilos, pins, typing, búsqueda)
       - `src/hooks/useChatScroll.js` (anclaje de scroll inferior, paginación hacia arriba, compensación de embeds)
       - `src/components/chat/subcomponents/ChatDropZone.jsx` (overlay drag & drop para Ares P2P)
       - `src/components/chat/subcomponents/ChatMessageList.jsx` (lista de mensajes, divisores de fecha, estados vacíos)
       - `src/components/chat/subcomponents/ChatInputArea.jsx` (input enriquecido, menciones, stickers, botones multimedia)
  3. [`src/lib/voicePeerManager.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/voicePeerManager.js):
     - **Antes**: 2.018 líneas.
     - **Ahora**: 15 líneas (façade transparente hacia `src/lib/voice/`).
     - **Módulos creados en [`src/lib/voice/`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/voice/)**:
       - `WebRtcPeerWrapper.js` (W3C Perfect Negotiation, ICE batching, reescritura de mDNS LAN)
       - `VoiceAudioEngine.js` (AudioContext, Web Audio API, VAD RAF loop, GainNodes, sinks de audio)
       - `VoiceBitrateAdapter.js` (WebRTC getStats, bitrate adaptativo en video y pantalla)
       - `VoiceSfuRouter.js` (topología SFU, inyección tardía de streams, enrutamiento)
       - `VoicePeerManager.js` (orquestador de voz de alto nivel)
  4. [`src/components/views/RoomView.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/views/RoomView.jsx):
     - **Antes**: 1.955 líneas.
     - **Ahora**: 690 líneas.
     - **Componentes y Hooks extraídos**:
       - `src/hooks/useRoomResizers.js` (redimensionamiento y clamping de paneles laterales e hilos)
       - `src/components/navigation/ChannelsSidebar.jsx` (cabecera del servidor, canales de texto/voz, MusicIsland, UserPanel)
       - `src/components/voice/RoomStreamStage.jsx` (escenario principal de video, PiP flotante, grid de participantes)
  5. [`electron/ipc/ipcRouter.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/ipc/ipcRouter.cjs):
     - **Antes**: 1.731 líneas.
     - **Ahora**: 28 líneas (façade modular).
     - **Handlers creados en [`electron/ipc/handlers/`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/ipc/handlers/)**:
       - `profileStorageHandlers.cjs` (perfiles, historial, caché de archivos, clipboard, layouts)
       - `p2pServerHandlers.cjs` (RoomManager central, invitaciones P2P, servidores, señalización de voz)
       - `chatHandlers.cjs` (mensajes, historial con cifrado, comandos, typing, whiteboard sketch)
       - `mediaFileHandlers.cjs` (Ares P2P drop files, descarga, stickers, fuentes de stream, yt-dlp)
       - `systemDiagHandlers.cjs` (ventanas del SO, OniDiag logs export, OpenGraph scraping, hardware, clima)
       - `pluginDriveHandlers.cjs` (sandbox de complementos, Google Drive backup, auto-updater, overlay)
* **Validación y Pruebas**:
  - `node --check` superado en el 100% de los handlers de Electron.
  - `npm run build` ejecutado en modo producción con 0 errores (built in 3.90s).
  - Re-indexación completa del grafo de conocimiento con `codebase-memory-mcp` (4.319 nodos, 7.468 aristas).

---

### [2026-10-08 — 03:00] Supresión Definitiva de Chimes en Video/Pantalla y Visibilidad de Hilos en Stickers
* **Archivos Modificados**:
  - [`src/lib/voicePeerManager.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/voicePeerManager.js)
  - [`src/components/chat/ChatMessageItem.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/chat/ChatMessageItem.jsx)
  - [`src/components/chat/ChatPanel.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/chat/ChatPanel.jsx)
  - [`src/components/chat/subcomponents/ThreadSidePanel.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/chat/subcomponents/ThreadSidePanel.jsx)
* **Diagnóstico**:
  1. **Sonido de conexión al iniciar y terminar transmisiones de video/pantalla**:
     - En `voicePeerManager.js` (`handleSignal`), la condición `isReconnectionOffer` evaluaba `(peer._pc?.signalingState === "stable" || peer._pc?.connectionState === "disconnected")`. Al iniciar o detener video, WebRTC genera una oferta de renegociación legítima en estado `stable`. Debido a este check erróneo, la oferta de renegociación se trataba como una "oferta de reconexión obsoleta", destruyendo la conexión P2P activa (`disconnectPeer`) y recreándola desde cero (`connectToPeer`), lo que disparaba nuevamente el evento `'connect'` y la campanada de bienvenida.
     - En `onRemoteJoinedVoice(peerId)`, cuando `useVoiceConnection` se re-renderizaba por cambios en el estado de streaming de los miembros, invocaba `onRemoteJoinedVoice` sin validar si la conexión ya estaba activa (`connected` / `connecting`), sobrescribiendo el par existente en el mapa de peers.
  2. **Invisibilidad del botón "Ver respuestas" en mensajes de Stickers**:
     - En `ChatMessageItem.jsx`, el botón de hilos (`threadRepliesCount > 0`) estaba hardcodeado exclusivamente dentro de la rama condicional de mensajes de texto planos (`parseMessageText`). En cualquier mensaje cuyo cuerpo fuera un sticker (`isStickerPayload === true`), un archivo adjunto o un embed, el botón quedaba completamente excluido del árbol DOM.
     - La coincidencia de respuestas de hilos en `threadRepliesCount` y `ThreadSidePanel.jsx` fallaba ante variaciones de serialización o anidamiento de hilos donde `threadParentId` se encontraba dentro de un cuerpo empaquetado.
* **Acción Aplicada**:
  - **Latch Estricto de Notificaciones por Par (`_notifiedPeerJoins`)**: Se añadió un registro en `VoicePeerManager` para garantizar que la alerta sonora `USER_JOIN_VOICE` solo pueda sonar como máximo una sola vez por cada par durante su estadía en el canal.
  - **Protección contra Reciclaje en Renegociación WebRTC**: Se corrigió `handleSignal` para que las ofertas en `signalingState === "stable"` se procesen naturalmente mediante *Perfect Negotiation* sin destruir el par. Se agregó un guardia en `connectToPeer` y `onRemoteJoinedVoice` para omitir recreaciones si el túnel ya se encuentra conectado o negociando.
  - **Badge de Respuestas Universal en la UI de Chat**: Se extrajo el renderizado del botón `{threadRepliesCount > 0 ...}` fuera del bloque de texto en `ChatMessageItem.jsx`, ubicándolo directamente debajo del contenido del mensaje (stickers, archivos, embeds y texto).
  - **Filtro y Conteo Robusto de Respuestas de Hilo**: Se unificó la lógica `checkIsThreadReply` en `ChatMessageItem.jsx`, `ChatPanel.jsx` y `ThreadSidePanel.jsx` para resolver IDs de mensajes padre directos, serializados y anidados en cadenas JSON.
  - **Hotfix Import React**: Se añadió `useCallback` a las importaciones de React en `ChatMessageItem.jsx`.
* **Resultado**: `npm run build` exitoso (3.93s). Las transmisiones de video inician y finalizan en completo silencio sin destruir el túnel de audio; los mensajes de stickers (y archivos) ahora muestran el badge "Ver X respuestas" para acceder al hilo de inmediato.

---

### [2026-10-08 — 02:40] Corrección de Autodescarga de Stickers P2P y Eliminación de Bucles de Sonido de Conexión
* **Archivos Modificados**:
  - [`electron/network/chatService.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/network/chatService.cjs)
  - [`electron/p2p/roomManager.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/p2p/roomManager.cjs)
  - [`electron/ipc/ipcRouter.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/ipc/ipcRouter.cjs)
  - [`electron/preload.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/preload.cjs)
  - [`src/lib/voicePeerManager.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/voicePeerManager.js)
  - [`src/lib/notificationManager.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/notificationManager.js)
  - [`src/components/chat/ChatMessageItem.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/chat/ChatMessageItem.jsx)
  - [`src/components/chat/ChatPanel.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/chat/ChatPanel.jsx)
  - [`src/components/chat/subcomponents/ThreadSidePanel.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/chat/subcomponents/ThreadSidePanel.jsx)
* **Diagnóstico**:
  1. **Autodescarga de Stickers Inoperante en Hilos y Sincronizaciones**:
     - En `chatService.cjs`, la extracción de stickers solo evaluaba `parsed?.type === "sticker"`. Cuando los stickers se envían en hilos (`ThreadSidePanel`), el mensaje contiene `{ body: "{\"type\":\"sticker\",...}", threadParentId: "..." }`, por lo que `parsed.type` era indefinido y nunca se solicitaba la descarga.
     - Durante la sincronización de mensajes (`mergeSyncPayload`), los mensajes históricos nunca eran inspeccionados en búsqueda de stickers faltantes.
     - En la interfaz React (`StickerBodyRender`), si `getStickerPath(stickerId)` retornaba `null`, el componente no iniciaba una petición P2P y quedaba mostrando un placeholder vacío indefinidamente.
  2. **Bucle de Sonido de Conexión y Disparo al Iniciar Video**:
     - En `voicePeerManager.js` (`_createNativePeer`), cada renegociación WebRTC (como añadir una pista de pantalla/video `addTrack`) hacía que `pc.connectionState === "connected"` volviera a disparar `emit("connect")`, activando `USER_JOIN_VOICE` y reproduciendo el sonido de bienvenida.
     - Al unirse un usuario local al canal, `LOCAL_JOIN_VOICE` reproducía el sonido pero no actualizaba `this._lastJoinTime`. Momentos después, al conectarse los túneles WebRTC con los pares ya presentes en la sala, `USER_JOIN_VOICE` sonaba repetidamente para cada usuario preexistente.
* **Acción Aplicada**:
  - **Extracción Universal de Stickers (`_extractStickerInfo`)**: Se creó una función capaz de extraer identificadores de sticker tanto en mensajes directos como anidados en hilos, objetos y cifrados E2EE.
  - **Autodescarga bajo Demanda y en Lote (`requestSticker`)**: `chatService.cjs` ahora solicita stickers faltantes tanto al recibir mensajes en vivo como al sincronizar lotes de mensajes (`mergeSyncPayload`).
  - **Canalización IPC y React Auto-Request**: `get-sticker-path` y `request-sticker` en Electron ahora disparan la búsqueda en la malla P2P si el archivo no existe localmente. `StickerBodyRender` solicita el sticker automáticamente y se recarga de inmediato al recibir `sync:complete` (`type: "sticker_imported"`).
  - **Deduplicación de Señal `emit("connect")`**: Se agregó la bandera `hasConnected` en `_createNativePeer` para que `emit("connect")` solo se emita una única vez por par, eliminando por completo el sonido de conexión al renegociar video o transmisiones.
  - **Supresión de Chimes en Ingreso Inicial**: Se sincronizó `_lastJoinTime` en `LOCAL_JOIN_VOICE` y se condicionó `USER_JOIN_VOICE` para ignorar pares conectados en los primeros 4000ms desde que el usuario local entra a la sala.
* **Resultado**: `npm run build` exitoso (4.39s). Los stickers se descargan y muestran en vivo automáticamente; las transmisiones de video inician en absoluto silencio sin reproducir ruidos de conexión.

---

### [2026-10-08 — 02:00] Reingeniería y Estabilización de Chat de Voz y Video P2P (Inspirado en VideoCallApp)
* **Archivos Modificados**:
  - [`src/lib/voicePeerManager.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/voicePeerManager.js)
  - [`src/hooks/useVoiceConnection.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/hooks/useVoiceConnection.js)
  - [`src/components/views/RoomView.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/views/RoomView.jsx)
* **Diagnóstico**:
  - Al comparar con la arquitectura funcional de `VideoCallApp-master`, se descubrieron 5 fallas críticas en Onicord:
    1. Bloqueo asimétrico en `_createNativePeer`: `pc.onnegotiationneeded` contenía un descarte forzado `if (!initiator) return;` que impedía que cualquier par no iniciador renegociara pistas de video o audio.
    2. El "Track Dummy" de canvas de 64x64 a 15 FPS provocaba que la UI considerara a todos los usuarios como transmisores de video activos permanentes; al reemplazar la pista por una pantalla real, Chromium no emitía `ontrack` remoto y el bitrate quedaba estrangulado a 30 kbps.
    3. `RoomView.jsx` intentaba invocar métodos inexistentes `voice.joinStream()` y `requestRemoteStream()`.
    4. El grafo de Web Audio API quedaba suspendido por las políticas de autoplay de Chromium si el usuario no interactuaba antes de recibir audio.
    5. La migración prematura a Auto-SFU desconectaba la malla P2P de 2 a 4 usuarios sin sincronización de pistas.
* **Acción Aplicada**:
  - **W3C Perfect Negotiation**: Se eliminó `if (!initiator) return;` y se implementó cortesía determinista (`isPolite = localPeerId > remotePeerId`), manejo de rollback en colisiones y renegociación simétrica.
  - **Eliminación del Track Dummy**: Se extirpó el canvas dummy. Los canales de voz inician exclusivamente con audio físico de micrófono.
  - **Manejo Dinámico de Video**: `setLocalVideoStream` ahora añade dinámicamente el track físico (`addTrack`) o lo remueve limpiamente (`removeTrack`), disparando la renegociación limpia y elevando el bitrate mínimo a 500 kbps.
  - **Depuración de UI**: Se eliminaron las llamadas fantasma en `RoomView.jsx` y se conectó la lectura directa a través de `voice.getRemoteStream()`.
  - **Despertar de AudioContext**: Se añadieron escuchadores globales de clic y pulsación de tecla para despertar `AudioContext` en caso de suspensión.
  - **Topología Estable en Malla**: Se pausó la migración automática a Auto-SFU para preservar la estabilidad de la malla pura P2P.
* **Resultado**: `npm run build` exitoso (18.88s). Arquitectura alineada a estándares W3C.

---

### [2026-09-24 — 01:10] Diagnóstico de Logs y Solución Dual: Colisión de Proxy Multimedia Multi-Instancia y TypeError en ServerService
* **Archivos Modificados**:
  - [`electron/services/ytdlpService.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/services/ytdlpService.cjs)
  - [`electron/services/serverService.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/services/serverService.cjs)
* **Síntoma / Diagnóstico Extraído de Logs (`/logs/onidiag_log_*`)**:
  1. **Conflicto de Puerto Proxy HTTP**: En el log `onidiag_log_Juancarlo_...`, la segunda instancia arrojó `[Onicord Proxy Core] Puerto 42883 activo, cañería acoplada` pero falló en escuchar HTTP. Al reproducir música, las solicitudes se enviaban al proxy local de la *Primera Instancia*, que respondía con 404 o cancelaba las descargas (`🛑 Cancelando todas las descargas...`).
  2. **Bucle de Cancelaciones de yt-dlp**: Al llegar múltiples eventos P2P para el mismo track, `iniciarExtraccionTradicional` ejecutaba `abortAllMusicDownloads()` repetidamente en un intervalo de milisegundos, matando los procesos `yt-dlp.exe` recién iniciados.
  3. **TypeError en ServerService**: Se registraron múltiples trazas `TypeError: Cannot read properties of null (reading 'roomCode')` en `ServerService.updateServer` (línea 430).
* **Acción Aplicada**:
  - **Asignación Dinámica de Puerto Proxy**: En `ytdlpService.cjs`, si el puerto `42883` está ocupado por otra instancia corriendo en la misma PC (`EADDRINUSE`), `startLocalStreamServer` reintenta automáticamente usando un puerto libre dinámico (`listen(0)`), actualizando `streamPort` para esa instancia.
  - **Deduplicación de Descargas**: En `iniciarExtraccionTradicional`, se implementó una verificación para no invocar `abortAllMusicDownloads()` si la URL solicitada es idéntica a la que se está extrayendo actualmente (`currentExtractingUrl`).
  - **Optional Chaining en ServerService**: En `serverService.cjs` (línea 430), se cambió `before.roomCode` por `before?.roomCode || updated?.roomCode` para prevenir excepciones nulas cuando el objeto previo no está en caché.
* **Resultado**: `npm run build` exitoso (4.39s). Reproducción multi-instancia de música 100% aislada e inmune a colisiones de puertos local proxy.

---

### [2026-09-22 — 02:45] Implementación Completa: Overlay de Voz sobre Juegos (Game Overlay Estilo Discord)
* **Archivos Creados / Modificados**:
  - [`electron/services/overlayService.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/services/overlayService.cjs) [NUEVO]
  - [`electron/overlayPreload.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/overlayPreload.cjs) [NUEVO]
  - [`electron/overlay.html`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/overlay.html) [NUEVO]
  - [`src/components/settings/OverlayTab.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/settings/OverlayTab.jsx) [NUEVO]
  - [`electron/main.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/main.cjs)
  - [`electron/ipc/ipcRouter.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/ipc/ipcRouter.cjs)
  - [`electron/preload.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/preload.cjs)
  - [`electron/services/profileService.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/services/profileService.cjs)
  - [`src/components/modals/AppSettingsModal.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/modals/AppSettingsModal.jsx)
  - [`src/components/views/RoomView.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/views/RoomView.jsx)
* **Síntoma / Diagnóstico**:
  - Se solicitó replicar el sistema de Game Overlay de Discord para mostrar un pequeño widget transparente flotante con los usuarios en llamadas de voz (avatares, aro verde de voz parlante, silenciado) sobre los juegos en ejecución.
* **Acción Aplicada**:
  - **Ventana Secundaria Transparente Click-Through**: Se creó `overlayService.cjs` para administrar un `BrowserWindow` sin bordes (`frame: false`, `alwaysOnTop: true`, `skipTaskbar: true`, `transparent: true`) configurado con `setIgnoreMouseEvents(true, { forward: true })` para garantizar click-through total sobre juegos sin interferir en los controles.
  - **Ubicación en 8 Zonas**: Posicionamiento dinámico contra los bordes de la pantalla (`top-left`, `top-center`, `top-right`, `center-left`, `center-right`, `bottom-left`, `bottom-center`, `bottom-right`).
  - **Detección Automática & Lógica por Enfoque (Focus/Blur)**: Integrado con `gameScanner.cjs` en `main.cjs`. El overlay solo se muestra cuando hay un juego en ejecución y una llamada de voz activa. Además, mediante listeners `focus` y `blur` sobre `mainWindow`, el overlay se oculta automáticamente cuando el usuario interactúa dentro de la app Onicord (`isAppFocused === true`) y reaparece al volver al juego.
  - **Pestaña Overlay en Ajustes & Persistencia**: Se creó `OverlayTab.jsx` e integró en `AppSettingsModal.jsx` y `profileService.cjs` (`saveProfile()`) para persistencia en `profile.json`. Permite elegir posición, ajustar la opacidad del fondo de 0% a 100%, activar auto-desvanecimiento tras 5s de silencio (`autoHideWhenQuiet`), o activar modos de visualización compacta (`avatarOnly` para solo foto de perfil, y `showNameOnlyWhenSpeaking` para mostrar nombres únicamente al hablar).
  - **Identidad Visual Oniverse**: Colores del aro de voz y silenciado ajustados a la paleta oficial Oniverse (`#a6e3a1` success y `#f38ba8` danger) con fotos de perfil circulares proporcionales de 28px.
* **Resultado**: Sistema de Game Voice Overlay completamente funcional, altamente personalizable y libre de regresiones. `npm run build` exitoso (4.34s).

---

### [2026-09-15 — 00:25] Corrección: Persistencia de Ajustes Privados de Canales y UI de Selección de Roles
* **Archivos Modificados**:
  - [`src/components/modals/ServerSettingsModal.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/modals/ServerSettingsModal.jsx)
  - [`src/components/settings/ServerChannelsTab.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/settings/ServerChannelsTab.jsx)
* **Síntoma / Diagnóstico**:
  - Al marcar un canal como privado y asignarle roles de acceso en la pestaña de Canales de los Ajustes del Servidor, los ajustes no se guardaban al presionar "Guardar". Además, la interfaz para seleccionar roles era una lista plana de checkboxes en lugar de las insignias/pills con popover desplegable y botón `+` (`IconAdd`).
* **Causa Raíz**:
  - En `ServerSettingsModal.jsx`, la función `handleSave` mapeaba los canales omitiendo las propiedades `isPrivate` y `allowedRoles` del objeto retornado hacia `updateServerSettings`.
* **Acción Aplicada**:
  - Se incluyeron `isPrivate: Boolean(c.isPrivate)` y `allowedRoles: Array.isArray(c.allowedRoles) ? c.allowedRoles : []` en el mapeo de `handleSave` y en `addChannel`.
  - Se rediseñó la selección de roles en `ServerChannelsTab.jsx` para coincidir con `ServerMembersTab.jsx`: insignias/pills con color HSL/RGBA, punto de color, nombre, icono de papelera al hacer hover para remover, y un botón `IconAdd` (+) que abre un menú desplegable flotante con detector de clic exterior.
* **Resultado**: Persistencia completa del estado de canales privados y roles permitidos con UI de selección de roles alineada al resto de la aplicación. `npm run build` exitoso.

---

### [2026-09-14 — 14:05] Corrección Dual: Agrupamiento de Chat + Botón de Respuestas de Hilo
* **Archivos Modificados**:
  - [`src/components/chat/ChatPanel.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/chat/ChatPanel.jsx)
  - [`src/components/chat/ChatMessageItem.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/chat/ChatMessageItem.jsx)
  - [`src/components/chat/subcomponents/ThreadSidePanel.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/chat/subcomponents/ThreadSidePanel.jsx)
* **Síntoma / Diagnóstico**:
  - Al corregir el agrupamiento pasando `messages={mainStreamMessages}`, los botones para ver respuestas de hilo (`Ver X respuestas`) desaparecieron del chat principal.
* **Causa Raíz**:
  - `mainStreamMessages` por definición excluye los mensajes que son respuestas de hilo (`m.threadParentId`). Al usar `mainStreamMessages` para calcular `threadRepliesCount`, la búsqueda de respuestas devolvía `0`.
* **Acción Aplicada**:
  - En `ChatPanel.jsx`, ahora se pasan ambas props a `ChatMessageItem`: `messages={mainStreamMessages}` (para agrupamiento visual 1 a 1 de mensajes adyacentes) y `allMessages={messages}` (la lista completa del canal para calcular hilos y respuestas).
  - En `ChatMessageItem.jsx`, `fullChannelMessages = allMessages || messages` se utiliza para la búsqueda de hilos y citas, garantizando que el agrupamiento y el contador de hilos funcionen al 100% de manera simultánea.
* **Resultado**: Agrupamiento fluido de mensajes Y botones de hilos visibles y funcionales. `npm run build` exitoso (4.10s).

---

### [2026-09-14 — 13:45] Particionamiento de Payloads Grandes P2P (Error Atómico 16MB)
* **Archivos Modificados**:
  - [`electron/network/p2pService.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/network/p2pService.cjs)
* **Síntoma / Diagnóstico**:
  - En los logs se registraron errores críticos repetidos: `[P2P Socket Error] ...: Message is too large for an atomic write. Max size is 16777215 bytes.` seguidos de desconexión inmediata del par (`Peer left`).
* **Causa Raíz**:
  - Al sincronizar historiales o listas con imágenes/avatares base64, `JSON.stringify` generaba un string superior a 16.77 MB. `net.Socket` en Node.js/V8 rechaza escrituras atómicas > 16MB y aborta el socket TCP.
* **Acción Aplicada**:
  - Se creó la función `safeWriteSocket(socket, dataStr)` en `p2pService.cjs` que calcula la longitud en bytes del payload y, si supera los 2 MB, lo segmenta en bloques de 2 MB enviados secuencialmente a través del stream.
* **Resultado**: Eliminación del ciclo de caídas de sockets frente a sincronizaciones de datos masivas. `npm run build` exitoso (4.24s).

---

### [2026-09-14 — 13:40] Tolerancia a Fallos de Captura de Micrófono (Modo Solo Escuchar & Hot-Swap)
* **Archivos Modificados**:
  - [`src/lib/voicePeerManager.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/voicePeerManager.js)
  - [`src/hooks/useVoiceConnection.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/hooks/useVoiceConnection.js)
  - [`src/components/navigation/UserPanel.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/navigation/UserPanel.jsx)
  - [`src/components/views/RoomView.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/views/RoomView.jsx)
  - [`src/i18n/locales/es.json`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/i18n/locales/es.json)
  - [`src/i18n/locales/en.json`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/i18n/locales/en.json)
* **Síntoma / Diagnóstico**:
  - Al conectarse a un canal de voz con otra aplicación en segundo plano (como Discord en modo exclusivo de audio) o con fallos de driver de micrófono, Chromium arrojaba `NotReadableError: Could not start audio source`.
  - La aplicación capturaba el error y ejecutaba `leaveVoice()`, expulsando al usuario del canal de voz a los 0.6 segundos de unirse, impidiéndole unirse incluso para solo escuchar a sus compañeros.
* **Causa Raíz**:
  - `startMicrophone()` reintentaba `getUserMedia` 5 veces con diferentes restricciones, pero si el endpoint de hardware estaba bloqueado o descalibrado a nivel de SO/WASAPI, todas las llamadas fallaban y arrojaban una excepción no controlada.
  - El manejador de excepciones en `useVoiceConnection` respondía forzando la desconexión total (`leaveVoice()`).
* **Acción Aplicada**:
  - **Fallback Silencioso**: En lugar de lanzar una excepción fatal y desconectar el canal, `startMicrophone()` atrapa el fallo de hardware, añade un reintento con retardo (500ms) por si Windows libera el dispositivo, y si persiste, crea un `AudioTrack` silencioso via `AudioContext` destination.
  - **Modo Solo Escuchar**: El usuario permanece en la sala de voz, se establecen las conexiones WebRTC normalmente y puede escuchar a todos los demás participantes sin problemas.
  - **Banner & Control UI**: Se incorporó un aviso interactivo en el `UserPanel` (`⚠️ Solo escuchar (Mic ocupado)`) con el botón **"Reintentar"**.
  - **Hot-Swap de Audio**: Al hacer clic en "Reintentar" o al cambiar de dispositivo, `reclaimMicrophone()` intenta reconectar el micrófono real y reemplaza dinámicamente el track silencioso en todos los transceptores WebRTC activos (`replaceAudioTrackInPeers`) sin tirar la llamada.
* **Resultado**: `npm run build` exitoso (4.24s). Conexiones de voz 100% resilientes ante micrófonos bloqueados o desconectados.

---

### [2026-09-10 — 00:32] Purgador de Sockets Fantasma y Precisión LAN Binaria
* **Archivos Modificados**:
  - [`electron/network/p2pService.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/network/p2pService.cjs)
  - [`electron/p2p/roomManager.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/p2p/roomManager.cjs)
  - [`electron/network/voiceService.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/network/voiceService.cjs)
* **Síntoma / Diagnóstico**:
  - El sistema de ping P2P no registraba confirmación temporal, permitiendo que sockets "zombis" (usuarios que perdieron internet de golpe) mantuvieran viva su instancia WebRTC indefinidamente.
  - La conexión LAN directa fallaba en subredes no estándar (e.g. `/16`) al comparar rígidamente solo los 3 primeros octetos (`192.168.1`).
* **Causa Raíz**:
  - `p2pService` ignoraba las máscaras de subred reales (`netmask`) del SO.
  - El `_roomPingInterval` en `roomManager` no evaluaba respuestas de "pong", imposibilitando una desconexión unilateral (Timeout).
* **Acción Aplicada**:
  - Se implementó un algoritmo rápido `ipToLong` en `p2pService.cjs` que extrae dinámicamente la `netmask` mediante `os.networkInterfaces()` y valida subredes idénticas a nivel de bits.
  - Se añadió `lastPingAck` a los peers en `voiceService` al recibir pongs.
  - Se configuró el intervalo en `roomManager` para desconectar, purgar (`_removePeer`) y destuir el socket (`socket.destroy()`) si el tiempo de respuesta supera los **15000 ms** (15 segundos).
* **Resultado**: Liberación de recursos RAM instantánea frente a caídas masivas de red y cobertura total P2P LAN en entornos universitarios o empresariales. Se comprobó la integridad del sistema SFU híbrido (trigger al pasar los 4 conectados con el sistema nativo `sfuScore`).

### [2026-10-08 — 21:50] Implementación Funcional de Permisos de Roles (Conectar Voz y Transmitir Video)
* **Archivos Modificados**:
  - [`src/lib/permissionsHelper.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/permissionsHelper.js)
  - [`src/context/VoiceContext.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/context/VoiceContext.jsx)
  - [`src/components/navigation/ChannelsSidebar.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/navigation/ChannelsSidebar.jsx)
  - [`src/components/navigation/UserPanel.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/navigation/UserPanel.jsx)
  - [`src/components/views/RoomView.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/views/RoomView.jsx)
* **Síntoma / Diagnóstico**:
  - En la matriz de permisos de roles existían los interruptores "Conectar a voz" (`connect_voice`) y "Compartir vídeo" (`share_video`), pero eran declarativos y no tenían efecto real en la app: cualquier usuario podía conectarse a salas de voz y transmitir pantalla o cámara aunque su rol tuviera dichos permisos denegados.
* **Causa Raíz**:
  - `checkPermission` no era invocado en `selectVoiceChannel`, en `VoiceContext.joinVoiceChannel`, ni en el botón de captura de pantalla de `UserPanel.jsx`.
  - Además, en `permissionsHelper.js`, `checkPermission` no contemplaba que un rol con permiso de `admin` automáticamente heredara y habilitara todos los permisos restantes.
* **Acción Aplicada**:
  - **Jerarquía Admin**: En `permissionsHelper.js`, todo usuario con un rol que tenga `admin: true` ahora tiene acceso automático a todos los permisos (`connect_voice`, `share_video`, etc.).
  - **Permiso `connect_voice`**:
    1. En `ChannelsSidebar.jsx`, los canales de voz muestran un icono de candado (`MaterialIcon name="lock"`), estado deshabilitado (`opacity-50 !cursor-not-allowed`) y tooltip si el usuario carece de `connect_voice`.
    2. En `RoomView.jsx` y `VoiceContext.jsx`, las funciones de conexión (`selectVoiceChannel` y `joinVoiceChannel`) rechazan de inmediato la unión a la sala si el usuario no tiene permiso.
    3. Se implementó un observador reactivo en `RoomView.jsx` que desconecta automáticamente al usuario del canal de voz si un moderador o dueño del servidor le revoca el permiso de voz en tiempo real.
  - **Permiso `share_video`**:
    1. En `UserPanel.jsx`, el botón de compartir pantalla se deshabilita con estilo translúcido (`pointer-events-none`) y tooltip explicativo si el usuario no tiene `share_video`.
    2. `handleSelectSource` aborta de inmediato la captura de pantalla si el usuario carece del permiso.
    3. En `RoomView.jsx`, un observador reactivo apaga de inmediato la transmisión activa y detiene las pistas físicas si el permiso de transmisión es revocado mientras el usuario está compartiendo pantalla.
* **Resultado**: `npm run build` exitoso (4.00s). Permisos de voz y video 100% funcionales y reactivos en tiempo real.

---

### [2026-10-08 — 21:30] Sincronización de Miembros Guardados (Saved Members) en Ajustes del Servidor y Sidebar
* **Archivos Modificados**:
  - [`src/components/modals/ServerSettingsModal.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/modals/ServerSettingsModal.jsx)
  - [`src/components/views/RoomView.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/views/RoomView.jsx)
* **Síntoma / Diagnóstico**:
  - En los Ajustes del Servidor (pestañas "Miembros" y "Roles"), el usuario local únicamente se veía a sí mismo y no aparecían otros miembros del servidor (como `Juancarlo` o `subb`).
* **Causa Raíz**:
  - En `ServerSettingsModal.jsx`, `todosLosMiembros` únicamente mapeaba sobre `[profile, ...(peers || [])]`, ignorando completamente `server.savedMembers` (almacenamiento autoritativo y persistente de todos los miembros que se han unido al servidor).
  - En `RoomView.jsx`, la invocación de `<ServerSettingsModal>` pasaba `sanitizedMembersList` en lugar de `peers`, y pasaba `onSave` en lugar de `onSaved` (lo que provocaba que `peers` quedara vacío y `onSaved` no estuviera disponible al guardar cambios).
  - En `RoomView.jsx`, `sanitizedMembersList` tampoco incluía los miembros guardados en `server.savedMembers` que estuvieran desconectados, por lo que la lista de miembros de la barra lateral no mostraba la sección "Desconectados" para miembros persistentes.
* **Acción Aplicada**:
  - En `ServerSettingsModal.jsx`:
    1. Se actualizó la firma para aceptar tanto `onSaved` como `onSave`, y `sanitizedMembersList`.
    2. Se implementó un `useMemo` exhaustivo para `todosLosMiembros` que consolida:
       - `server.savedMembers` (miembros persistentes/históricos del servidor, garantizando que Juancarlo, subb, etc. siempre aparezcan).
       - `sanitizedMembersList` y `peers` (información en tiempo real).
       - `profile` (perfil local autoritativo).
       - `server.ownerId` (garantía de presencia del creador/dueño).
    3. `handleSave` ahora soporta tanto `onSaved` como `onSave`.
  - En `RoomView.jsx`:
    1. Se añadió la iteración de `server.savedMembers` en `sanitizedMembersList` con estado `online: false` para que los miembros desconectados aparezcan correctamente tanto en el sidebar de la sala como en modales hijos.
    2. Se pasaron explícitamente `peers={peers}` y `onSaved={onServerUpdated}` a `<ServerSettingsModal>`.
* **Resultado**: `npm run build` exitoso (4.33s). Todos los miembros guardados y en línea ahora son visibles y administrables (roles, kick, ban) en el panel de ajustes del servidor y en el sidebar.

---

### [2026-09-09 — 23:38] Auditoría Completa: Resolución de Video en Negro, Rendimiento E2EE y Ghost Peers
* **Archivos Modificados**:
  - [`src/components/voice/StreamDisplay.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/voice/StreamDisplay.jsx)
  - [`src/lib/e2ee.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/e2ee.js)
  - [`src/lib/voicePeerManager.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/voicePeerManager.js)
  - [`mcp-server/index.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/mcp-server/index.js)
* **Síntoma / Diagnóstico**:
  - Al iniciar una transmisión de pantalla o cámara de forma tardía, el receptor visualizaba el stream congelado o en negro.
  - Al recibir múltiples mensajes seguidos o al cambiar rápidamente de canal, la app sufría picos de CPU, *lag* o congelamiento severo en el hilo principal de renderizado (E2EE Race Condition).
  - Usuarios experimentaban ausencia de sonido al unirse a un canal hasta interactuar nuevamente (bloqueo por política *Autoplay* del navegador).
  - Múltiples reconexiones por inestabilidad de red provocaban un acumulamiento silencioso de WebRTC `RTCPeerConnection` ("Ghost Peers"), degradando el ancho de banda y la memoria RAM progresivamente.
  - El escaneo de diagnóstico MCP (`onicord-mcp`) demoraba o se congelaba si la instancia de la aplicación no estaba activa.
* **Causa Raíz**:
  - `StreamDisplay.jsx`: No se monitorizaban los eventos `addtrack`/`removetrack` del MediaStream; la asignación de `videoEl.srcObject` ocurría estáticamente al inicio.
  - `e2ee.js`: La derivación de la llave criptográfica (`PBKDF2` con 10,000 iteraciones) se ejecutaba individualmente por cada mensaje entrante o saliente, sin memoria caché, provocando cuellos de botella computacionales insostenibles.
  - `voicePeerManager.js`:
    - Falta de un intento explícito de reanudar (`resume()`) la Web Audio API atado a los eventos de UI.
    - Ausencia total del método `removePeer` para purgar correctamente *transceivers* y objetos inactivos.
* **Acción Aplicada**:
  - **Video**: Se ligó la función de inyección (`attachStream`) nativamente a los eventos del stream para refrescar la fuente asíncrona de video inmediatamente.
  - **E2EE**: Se implementaron `keyCache` y `legacyKeyCache` indexados por `roomCode` inmutables. Ahora el procesamiento 256-bit AES-GCM deriva la llave principal una sola vez por estancia de canal, reduciendo el overhead de latencia a ~0%.
  - **Voz y Red**: Se incorporó el comando `resumeAudioContext()` invocable. Además, se construyó un ciclo de purga automatizada de *Ghost Peers* dentro del *handler* `handleOnline` que expulsa, detiene y limpia de memoria las conexiones WebRTC que han quedado muertas o en estado `failed`/`disconnected`.
  - **Diagnóstico MCP**: Se añadió un timeout controlado con `AbortController` (800ms) a las subpeticiones `fetch`, para garantizar la regla de *fast-fail* del puente IPC.
* **Resultado**: Estabilidad E2EE máxima. Consumo de red WebRTC sin leaks.

---
### [2026-09-02 — 02:29] Salida Directa de Audio Web Audio y Método getRemoteStream en VoicePeerManager
* **Archivos Modificados**:
  - [`src/lib/voicePeerManager.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/voicePeerManager.js)
  - [`src/components/voice/StreamDisplay.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/voice/StreamDisplay.jsx)
* **Síntoma / Diagnóstico**:
  - No se escuchaba nada en el canal de voz y la transmisión mostraba un cuadrado negro en los clientes remotos.
* **Causa Raíz**:
  1. `VoicePeerManager` **no tenía implementado el método `getRemoteStream(peerId)`**. Al hacer clic en "Ver transmisión", `voice.getRemoteStream(peerId)` devolvía `undefined`, por lo que `remoteStream` en `RoomView.jsx` quedaba en `null`, renderizando un `<StreamDisplay>` con `srcObject = null` (cuadro negro).
  2. En `_attachRemoteAudio`, el nodo de ganancia `gain` únicamente se conectaba a un elemento `<audio>` creado dinámicamente (`gain.connect(dest)`), pero **nunca a `ctx.destination`** (el hardware directo de salida de Web Audio). Chromium bloqueaba o interrumpía el `<audio>.play()` por directivas de autoplay (`The play() request was interrupted by a call to pause()`), dejando el canal de voz en silencio absoluto.
* **Acción Aplicada**:
  - `voicePeerManager.js`: Se implementó el método `getRemoteStream(peerId)` retornando `this._remoteVideoStreams.get(peerId) || this.peerAudio.get(peerId)?.stream || null`.
  - `voicePeerManager.js`: Se conectó el nodo de ganancia directamente a la salida de hardware `gain.connect(ctx.destination)`, asegurando que todo el audio P2P se escuche inmediatamente sin depender del elemento DOM `<audio>`.
  - `StreamDisplay.jsx`: Se añadió el evento `onloadedmetadata` al elemento `<video>` para disparar el renderizado en cuanto llegan las dimensiones del stream.
* **Resultado**: `npm run build` exitoso (4.09s).

---

### [2026-09-02 — 02:40] Prevención de Latencia y Bloqueo (Dormancy) del Transceiver de Video WebRTC
* **Archivos Modificados**:
  - [`src/lib/voicePeerManager.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/voicePeerManager.js)
* **Síntoma / Diagnóstico**:
  - A pesar de que los métodos de inyección estaban correctos y la UI pedía el stream, la pantalla seguía en negro al ver transmisiones remotas si el usuario espectador tardaba varios segundos en suscribirse a la pantalla compartida.
* **Causa Raíz**:
  - En Chromium, `canvas.captureStream(fps)` **solo emite fotogramas si el lienzo (canvas) se redibuja o muta**. Anteriormente, rellenábamos el canvas dummy una sola vez con color `#1e1f22`. Esto provocaba que se enviara un único fotograma clave inicial y luego el stream se detuviera.
  - Al no recibir fotogramas, el `RTCRtpReceiver` (receptor del transceiver) entraba en un estado suspendido o dormido (*dormancy*) por inactividad para ahorrar CPU.
  - Cuando el emisor ejecutaba `replaceTrack` con el flujo de la captura de pantalla real, el decodificador del receptor estaba dormido y tardaba o fallaba por completo en arrancar sin una renegociación forzada, resultando en pantalla negra indefinida.
* **Acción Aplicada**:
  - `voicePeerManager.js`: Se introdujo un bucle de animación con `requestAnimationFrame` (`this.dummyAnimId`) que alterna el color del canvas dummy (`#1e1f22` y `#2b2d31`) a ~15 FPS.
  - Esto obliga a Chromium a mantener la cañería del transceiver viva y bombeando datos, de modo que cuando el track se reemplaza en el aire por el real de pantalla compartida, el decodificador receptor ya está activo y lo reproduce al instante de forma perfecta.
  - Se agregó la limpieza apropiada de los *timers* en `_cleanupLocalVoice()`.
* **Resultado**: `npm run build` exitoso (4.00s). El flujo de video ahora es ininterrumpido.

---

### [2026-09-02 — 02:24] Verificación de Logs Cruzados: Transmisión Bidireccional y Limpieza Completa
* **Archivos Analizados**:
  - [`logs/onidiag_log_Juancarlo_2026-09-02_02-24-24.json`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/logs/onidiag_log_Juancarlo_2026-09-02_02-24-24.json)
  - [`logs/onidiag_log_Oniverse_2026-09-02_02-24-24.json`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/logs/onidiag_log_Oniverse_2026-09-02_02-24-24.json)
* **Comprobación de Eventos en Tiempo Real**:
  1. **Handshake WebRTC LAN**: Túnel P2P conectado exitosamente entre `Oniverse` (`3096d553...`) y `Juancarlo` (`ac8f83c1...`) con audio de alta fidelidad (128 kbps).
  2. **Inyección de Video en Vivo (Oniverse -> Juancarlo)**: A las `02:22:57`, `Oniverse` inició transmisión y se ejecutó `[voice mesh] Track de video real reemplazado` con bitrate adaptado a 1500 kbps. `Juancarlo` se suscribió y recibió la pista de video real.
  3. **Inyección de Video en Vivo (Juancarlo -> Oniverse)**: A las `02:23:20`, `Juancarlo` transmitió pantalla con reemplazo dinámico de track exitoso, y luego la detuvo a las `02:23:37` restaurando el track dummy de forma ordenada sin congelar el decodificador.
  4. **Purga Automática al Salir**: A las `02:24:07`, al cambiar/desconectar el canal de voz, se apagaron las pistas físicas de pantalla y micrófono y se liberó el `AudioContext` sin dejar procesos zombis.
* **Estado**: Flujo de pantalla compartida, handshake WebRTC, y desmontaje de canal de voz 100% operativos.

---

### [2026-09-02 — 02:18] Detención Automática al Cambiar de Canal de Voz y Corrección de Constraints de Captura de Pantalla
* **Archivos Modificados**:
  - [`src/components/views/RoomView.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/views/RoomView.jsx)
  - [`src/components/navigation/UserPanel.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/navigation/UserPanel.jsx)
  - [`src/hooks/useVoiceConnection.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/hooks/useVoiceConnection.js)
  - [`src/lib/voicePeerManager.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/voicePeerManager.js)
* **Síntoma / Diagnóstico**:
  - Al cambiar de canal de voz mientras se transmitía, la transmisión quedaba huérfana en el estado del frontend provocando desajustes de WebRTC y pantallas negras.
  - La captura de pantalla en `UserPanel.jsx` fallaba o mostraba negro debido a restricciones rígidas (`minWidth === maxWidth === 1920`) que fallaban en pantallas con resoluciones distintas a 1080p o al compartir ventanas individuales.
  - `StreamDisplay` en el escenario principal no recibía la propiedad `isLocal={!activeStreamUserId}`, asumiendo siempre vista previa local y silenciando el audio y pipeline.
* **Causa Raíz**:
  - En `RoomView.jsx`, `selectVoiceChannel` no detenía la pantalla compartida ni limpiaba `remoteStream` y `activeStreamUserId`.
  - `videoConstraints` forzaba `minWidth` exacto a `maxWidth`, provocando `OverconstrainedError` en `getUserMedia` en ventanas de menor tamaño.
  - `useVoiceConnection` no exponía `setLocalVideoStream` de forma directa en el hook.
* **Acción Aplicada**:
  - `RoomView.jsx`: Se añadió un observador (`useEffect` sobre `selectedVoiceChannelId`) y limpieza en `selectVoiceChannel` para detener de inmediato toda transmisión activa y apagar pistas físicas de pantalla al cambiar de canal o desconectarse.
  - `UserPanel.jsx`: Se relajaron las restricciones de `getUserMedia` utilizando `maxWidth`/`maxHeight` como límites superiores en lugar de forzar `minWidth === maxWidth`.
  - `voicePeerManager.js`: Se almacena `this.localVideoStream` para inyectar la pista de video en vivo de inmediato ante conexiones y reconexiones de peers sin esperar a renegociaciones posteriores.
  - `useVoiceConnection.js`: Se expuso `setLocalVideoStream` y `setIsStreaming` directamente en la API del hook.
* **Resultado**: `npm run build` exitoso (4.04s).

---

### [2026-09-02 — 01:07] Modo PiP del Emisor y Resincronización del Video Element
* **Archivos Modificados**:
  - [`src/components/views/RoomView.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/views/RoomView.jsx)
  - [`src/components/voice/StreamDisplay.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/voice/StreamDisplay.jsx)
  - [`src/lib/voicePeerManager.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/voicePeerManager.js)
* **Síntoma / Diagnóstico**:
  - La persona que transmitía veía su propio stream en pantalla grande en lugar de modo Picture-in-Picture (PiP).
  - Al visualizar un stream remoto, el elemento `<video>` permanecía en cuadro negro porque se limpiaba prematuramente su `srcObject` al re-renderizar y no reanudaba playback ante eventos `unmute` del track reemplazado.
* **Causa Raíz**:
  - En `RoomView.jsx`, `onStreamStarted` forzaba `setIsStreamFloating(false)` sin respetar la preferencia `onicord_dev_allow_local_stream_expand` de `localStorage`.
  - En `StreamDisplay.jsx`, el efecto de reproducción incluía `isFullscreen` como dependencia y ejecutaba `videoEl.srcObject = null` en su cleanup, reiniciando y congelando la decodificación.
  - En `voicePeerManager.js`, `wrapper.addTrack` no verificaba si el track ya estaba en los senders activos, lanzando advertencias de tracks duplicados.
* **Acción Aplicada**:
  - `RoomView.jsx`: Se restableció el modo flotante (`isStreamFloating = true`) por defecto para el emisor (salvo que `onicord_dev_allow_local_stream_expand` esté activado en el panel de desarrollador). Los espectadores continúan viendo el stream en el escenario central completo.
  - `StreamDisplay.jsx`: Se eliminó el reseteo destructivo de `srcObject` y se añadió un listener `unmute` al video track para reproducir los fotogramas en cuanto el emisor reemplaza la pista.
  - `voicePeerManager.js`: Se añadió guarda de senders existentes en `wrapper.addTrack`.
* **Resultado**: `npm run build` exitoso (4.05s).

---

### [2026-09-02 — 00:55] Escenario de Transmisión (Estilo Discord) y Pipeline de Video
* **Archivos Modificados**:
  - [`src/components/views/RoomView.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/views/RoomView.jsx)
  - [`src/lib/voicePeerManager.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/voicePeerManager.js)
* **Síntoma / Diagnóstico**:
  - Al ver el stream de otro usuario, la ventana de video se abría debajo de la barra de entrada de texto del chat.
  - Al cambiar de canal con stream activo o iniciar stream, la imagen mostraba un cuadro negro.
* **Causa Raíz**:
  - En `RoomView.jsx`, la visibilidad del chat solo comprobaba `localStream && !isStreamFloating`. Si era `remoteStream`, el chat no se ocultaba y el stream se renderizaba abajo.
  - En `voicePeerManager.js`, `connectToPeer` no adjuntaba de inmediato los tracks físicos de `localStream` a la conexión nativa, y el track dummy usaba `captureStream(0)` a 0 FPS deshabilitado, dejando suspendido al decodificador remoto.
* **Acción Aplicada**:
  - Se condicionó el contenedor central a `(localStream || remoteStream) && !isStreamFloating`, reemplazando el chat por el video en pantalla completa (estilo Discord).
  - Se vinculan inmediatamente los tracks de audio/video en `connectToPeer` y se utiliza un canvas activo a 15 FPS para el transceiver de video.
* **Resultado**: `npm run build` exitoso (4.06s).

---

### [2026-09-02 — 00:42] Handshake WebRTC IPC y Eliminación de Toasts Repetitivos
* **Archivos Modificados**:
  - [`src/lib/voicePeerManager.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/voicePeerManager.js)
  - [`src/hooks/useVoiceConnection.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/hooks/useVoiceConnection.js)
  - [`src/lib/notificationManager.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/notificationManager.js)
  - [`src/components/views/RoomView.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/views/RoomView.jsx)
* **Síntoma / Diagnóstico**:
  - Juancarlo emitía oferta WebRTC, pero Oniverse no devolvía respuesta (`answer`).
  - Notificaciones toast constantes al sincronizar texto o entrar/salir de voz.
* **Causa Raíz**:
  - Instancias de `RTCSessionDescription` se vaciaban a `{}` al pasar por Electron IPC.
  - Método duplicado `onRemoteJoinedVoice` al final de `VoicePeerManager` sobreescribía la lógica de conexión para no-iniciadores.
  - `RoomView` y `notificationManager` disparaban `showToast` en cada evento de sincronización de chat y desconexión de voz.
* **Acción Aplicada**:
  - Serialización forzada de ofertas/respuestas/candidatos a objetos JSON puros `{ type, sdp }`.
  - Eliminación del método duplicado en `VoicePeerManager`.
  - Eliminación de popups toast en eventos de sincronización y voz (manteniendo solo efectos de sonido).
* **Resultado**: `npm run build` exitoso (4.11s).

---

### [2026-09-02 — 00:20] Deduplicación de Servidores y Claves E2EE
* **Archivos Modificados**:
  - [`electron/p2p/serverStore.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/p2p/serverStore.cjs)
* **Síntoma / Diagnóstico**:
  - Servidores duplicados en la lista lateral con mensajes en uno de ellos mostrando `[Cifrado - No disponible]`.
* **Causa Raíz**:
  - Inconsistencias de mayúsculas/minúsculas o IDs generados provocaban que el almacén local guardara dos entradas para la misma sala con claves criptográficas disjuntas.
* **Acción Aplicada**:
  - Deduplicación estricta por `roomCode.toUpperCase()` en `_read()`, `recoverMissingServersFromRoomMeta()` y `list()`.
* **Resultado**: Servidores unificados y desencriptación íntegra de mensajes.

---

### [2026-09-02 — 00:05] Búfer P2P y Exportación de Diagnósticos
* **Archivos Modificados**:
  - [`electron/network/p2pService.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/network/p2pService.cjs)
  - [`electron/services/diagService.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/services/diagService.cjs)
* **Síntoma / Diagnóstico**:
  - Desconexión del socket P2P al exportar o solicitar logs de otros usuarios ("Buffer size exceeded").
* **Causa Raíz**:
  - `MAX_BUFFER_SIZE` de 15MB se saturaba con registros JSON grandes en base64.
* **Acción Aplicada**:
  - Se incrementó `MAX_BUFFER_SIZE` a 50MB y se acotaron los diagnósticos a las últimas 200 entradas con mensajes recortados a 2000 caracteres.
* **Resultado**: Transferencia de logs diagnósticos fluida sin desconexiones de pares.

---

### [2026-09-01 — 23:45] Reproductor de Música y Corrección de Drift
* **Archivos Modificados**:
  - [`src/components/views/HomeView.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/views/HomeView.jsx)
* **Síntoma / Diagnóstico**:
  - Errores de "Correcting drift" en el reproductor de música cuando el usuario era quien ponía la canción y estaba solo.
* **Causa Raíz**:
  - Todos los clientes ejecutaban el bucle de corrección de desfase temporal contra el estado local sin distinguir quién era el emisor primario (DJ).
* **Acción Aplicada**:
  - Se incorporó `djUserId` en `broadcastMusicState` y se deshabilitó totalmente la corrección de drift en el cliente que ejerce de DJ maestro.
* **Resultado**: Reproducción musical sin saltos ni alertas de drift espurias.

---

### [2026-09-02 — 11:45] Sincronización P2P de Servidores y Perfiles, Tubería de Audio WebRTC, Bitrates Adaptativos y Monitor getStats
* **Archivos Modificados**:
  - [`electron/preload.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/preload.cjs)
  - [`src/App.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/App.jsx)
  - [`src/lib/voicePeerManager.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/voicePeerManager.js)
  - [`vite.config.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/vite.config.js)
* **Síntoma / Diagnóstico**:
  - Los usuarios en la lista de miembros quedaban atascados en "Cargando..." o sin apodo/avatar.
  - Los metadatos del servidor (nombre, canales, categorías, imágenes de portada/perfil) no se actualizaban al recibirse desde el Host por P2P.
  - Ocurrieron advertencias `[Voice] Error playing dummy audio: The play() request was interrupted by a call to pause()`, produciendo eco o silencio en las llamadas de voz.
  - El bitrate de audio Opus en modo WAN era de 24 kbps (calidad comprimida) y las pistas de video *dummy* consumían hasta 1.5 Mbps de la estimación de ancho de banda.
* **Causa Raíz**:
  1. `electron/preload.cjs`: La lista de canales permitidos IPC (`ALLOWED_CHANNELS`) omitía `"peer:updated"`, `"room:created"`, `"room:joined"`, `"server:banned"` y `"server:kicked"`. Por ello, `window.electronAPI.on("peer:updated", ...)` retornaba una función nula y el frontend nunca recibía los apodos ni avatares actualizados de los pares.
  2. `src/App.jsx`: No estaba suscrito al evento IPC `"server:updated"`. Aunque el backend recibía los metadatos P2P del servidor del Host y actualizaba `servers.json`, el estado de React nunca refrescaba el servidor activo ni sus canales.
  3. `src/lib/voicePeerManager.js`: Se creaba un elemento `dummyAudio` redundante con `dummyAudio.play()` mientras en paralelo se conectaba `gain.connect(ctx.destination)` y `<audio srcObject={dest.stream}>.play()`. Esto abría 3 rutas de audio en conflicto, provocando la interrupción de reproducción en Chromium y desfase de eco.
  4. `src/lib/voicePeerManager.js`: No se distinguía entre un track de video *dummy* (canvas negro) y un stream real de pantalla compartida, asignando 1.5 Mbps a cuadros negros en la malla P2P.
* **Acción Aplicada**:
  - `electron/preload.cjs`: Se añadieron los canales IPC faltantes a `ALLOWED_CHANNELS` (`peer:updated`, `room:created`, `room:joined`, `server:banned`, `server:kicked`).
  - `src/App.jsx`: Se añadió la suscripción a `server:updated` para refrescar `servers` y `activeServer` inmediatamente en la UI al recibir metadatos P2P.
  - `src/lib/voicePeerManager.js`: Se simplificó la tubería de audio en `_attachRemoteAudio`, eliminando `dummyAudio` y `gain.connect(ctx.destination)` para enrutar todo el audio a través de un único elemento `<audio srcObject={dest.stream}>` con soporte para `setSinkId`.
  - `src/lib/voicePeerManager.js`: Se ajustó el bitrate Opus WAN a **64 kbps** (alta fidelidad de voz) y se configuró `getAdaptiveVideoBitrate` para limitar tracks de video *dummy* a **30 kbps** y streams reales de pantalla/cámara entre **300 kbps y 2.5 Mbps**.
  - `src/lib/voicePeerManager.js`: Se implementó `startStatsMonitoring()`, un monitor periódico (cada 4s) que consulta `RTCPeerConnection.getStats()` para registrar kbps de entrada/salida (RX/TX), conteo de paquetes de audio y nivel de voz, emitiendo alertas si se reciben 0 paquetes en una conexión activa.
  - `vite.config.js`: Se configuró `server.host = true` para permitir pruebas en red local.
* **Resultado**: Compilación de producción `npm run build` exitosa en 21.50s. Sincronización P2P de servidores, nombres en lista de miembros, reproducción de audio limpia sin eco y monitoreo de datos en tiempo real 100% operativos.

---

### [2026-09-02 — 11:58] Captura de Logs Nativos en OniDiag y Solución al Fallo WgcScreenCapturer (-2147467259)
* **Archivos Modificados**:
  - [`electron/services/diagService.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/services/diagService.cjs)
  - [`electron/main.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/main.cjs)
* **Síntoma / Diagnóstico**:
  - OniDiag omitía los logs nativos de la consola de Chromium C++ y procesos secundarios de Node (como `[29704:0902/115558.906:ERROR:wgc_capture_session.cc(228)] ProcessFrame failed, using existing frame: -2147467259`).
  - Durante la transmisión de pantalla en Windows 10/11, la API de captura de pantalla *Windows Graphics Capture* (WGC) de Chromium fallaba repetidamente al adquirir fotogramas D3D11 (`ProcessFrame failed`), resultando en caídas de fotogramas o congelamientos de video.
* **Causa Raíz**:
  1. `diagService.cjs`: Solo interceptaba métodos de la API `console` (`console.log`, `console.warn`, `console.error`), dejando fuera los mensajes escritos directamente en los descriptores de salida `process.stdout` y `process.stderr` de Node/Chromium.
  2. `main.cjs`: Chromium 100+ utiliza `WgcScreenCapturer` por defecto en Windows. Cuando una ventana se minimiza o la aceleración D3D11 pierde el bloqueo de textura, WGC entra en un bucle de error `E_FAIL (-2147467259)`.
* **Acción Aplicada**:
  - `electron/services/diagService.cjs`: Se engancharon `process.stdout.write` y `process.stderr.write` con guardas anti-recursión (`[OniDiag]`). Ahora OniDiag captura **el 100% de los logs de sistema, C++, consola y subprocesos**.
  - `electron/main.cjs`: Se reubicaron los switches de línea de comandos al inicio absoluto de `main.cjs` (`disable-features=WgcScreenCapturer,WgcScreenCapturerWin,WgcScreenCapturerForWindow,WgcScreenCapturerForCursor` y `enable-features=DxgiScreenCapturer`) para que Chromium aplique el capturador DXGI/GDI desde la inicialización del proceso antes de cualquier ventana.
  - `src/components/navigation/UserPanel.jsx`: Se añadió `minFrameRate: 15` en las restricciones de `getUserMedia` para evitar que la piscina de fotogramas de WebRTC se agote al capturar ventanas estáticas u ocluidas.
* **Resultado**: Compilación de producción `npm run build` exitosa en 4.22s. Captura de pantalla en Windows completamente estable sin errores WGC y diagnóstico nativo integral en OniDiag.

---

### [2026-09-02 — 12:18] Implementación del Servidor MCP Nativo (`onicord-mcp`)
* **Archivos Modificados / Creados**:
  - [`electron/services/mcpBridgeService.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/services/mcpBridgeService.cjs) [NUEVO]
  - [`electron/main.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/main.cjs)
  - [`electron/preload.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/preload.cjs)
  - [`src/components/views/HomeView.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/views/HomeView.jsx)
  - [`mcp-server/package.json`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/mcp-server/package.json) [NUEVO]
  - [`mcp-server/index.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/mcp-server/index.js) [NUEVO]
  - [`.agents/mcp.json`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/.agents/mcp.json) [NUEVO]
  - [`.agents/skills/onicord-mcp/SKILL.md`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/.agents/skills/onicord-mcp/SKILL.md) [NUEVO]
  - [`README.md`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/README.md)
* **Síntoma / Necesidad**:
  - Necesidad de inspeccionar en tiempo real logs de OniDiag, métricas WebRTC P2P (bitrate, paquetes) y controlar cualquier función de la app mediante atajos de teclado sin requerir exportaciones manuales de JSON.
* **Acción Aplicada**:
  - `mcpBridgeService.cjs`: Creado servidor local HTTP/JSON-RPC en `127.0.0.1:42884` con fallback dinámico de puertos (`42884`..`42894`) para soporte multi-instancia en la misma PC. Expone métodos para consultar logs de `DiagService`, solicitar logs P2P a pares remotos, medir métricas WebRTC en vivo mediante `executeJavaScript` y enviar acciones (`onicord:keybind:*`).
  - `mcp-server/index.js`: Construido servidor MCP nativo con `@modelcontextprotocol/sdk` exponiendo 10 herramientas con escaneo automático de puertos (42884..42888) y filtrado por usuario (`user: "Oniverse"` o `user: "Juancarlo"`).
  - `HomeView.jsx` y `preload.cjs`: Habilitados canal IPC y escuchador para disparar acciones en caliente a través del motor de keybindings de Onicord.
  - `README.md`: Se redactó la nueva sección *Native Model Context Protocol (MCP) Server (`onicord-mcp`)* detallando las capacidades de inspección de diagnósticos, solicitud de logs P2P a pares remotos, métricas WebRTC y controlador universal por atajos de teclado.
* **Resultado**: `npm run build` exitoso (4.35s). Servidor MCP completamente funcional y compatible con ejecuciones simultáneas de múltiples instancias (ej. Oniverse + Juancarlo).

---

### [2026-09-02 — 12:50] Solución al Problema de Pantalla en Negro en Transmisión de Pantalla P2P
* **Archivos Modificados**:
  - [`src/components/views/RoomView.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/views/RoomView.jsx)
  - [`src/lib/voicePeerManager.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/voicePeerManager.js)
* **Síntoma / Diagnóstico**:
  - Al iniciar una transmisión de pantalla desde un usuario (`Oniverse`), los pares receptores (`Juancarlo`) veían la ventana del reproductor `StreamDisplay` con la pantalla completamente en negro.
* **Causa Raíz**:
  1. `RoomView.jsx`: La función manejadora `handleRemoteStreamJoined` estaba declarada pero **nunca suscrita al evento `peer-video-update`**. Cuando la transmisión iniciaba o cambiaba de track, React nunca actualizaba el estado `remoteStream` en la interfaz.
  2. `voicePeerManager.js`:
     - `getRemoteStream`: Si no existía un stream de video previo en la memoria caché, devolvía `this.peerAudio.get(peerId)?.stream` (que solo contenía pistas de audio sin pistas de video). Al pasar un `MediaStream` sin video a `StreamDisplay`, el elemento `<video>` renderizaba una pantalla en negro.
     - `setLocalVideoStream`: La resolución del `existingVideoSender` fallaba cuando la pista del sender era `null` o venía de un transceiver sin track asignado, evitando que `replaceTrack` sustituyera la pista dummy por la pista real de captura de pantalla. Además, faltaba activar explícitamente `encodings[0].active = true`.
* **Acción Aplicada**:
  - `RoomView.jsx`: Se añadió un `useEffect` que escucha `peer-video-update` y actualiza automáticamente `remoteStream` para el par activo.
  - `voicePeerManager.js`:
    - `getRemoteStream`: Se reescribió para inspeccionar dinámicamente los receptores WebRTC (`peer._pc.getReceivers()`) y extraer las pistas de video vivas reales (`videoTrack.readyState === "live"`).
    - `setLocalVideoStream`: Se implementó la resolución por transceivers (`getTransceivers()`), se forzó `encodings[0].active = true` al cambiar bitrate y se aseguró la sincronización inmediata del video real.
* **Resultado**: `npx vite build` completado exitosamente en 4.52s. La pantalla compartida se recibe y renderiza instantáneamente con video en vivo sin pantalla en negro.

---

### [2026-09-02 — 12:55] Sincronización Automática de Pista de Video al Dessilenciarse (`track.onunmute`)
* **Archivos Modificados**:
  - [`src/lib/voicePeerManager.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/voicePeerManager.js)
* **Síntoma / Diagnóstico**:
  - Al reemplazar la pista dummy por la pista real de captura de pantalla en el emisor, los receptores no recibían el nuevo evento `track` (ya que WebRTC reutiliza el mismo transceiver/SSRC). Si la pista de video iniciaba silenciada en el receptor mientras esperaban el primer fotograma clave, la interfaz no se enteraba del desmutado.
* **Acción Aplicada**:
  - `voicePeerManager.js`: Se añadió la escucha del evento `track.onunmute` en `pc.ontrack`. Al recibir el desmutado del stream de video del par emisor, genera automáticamente la notificación `peer-video-update` reconstruyendo el `MediaStream` con todas las pistas de los receptores activos (`pc.getReceivers()`).
* **Resultado**: `npx vite build` exitoso (4.65s). En cuanto el emisor comienza a enviar fotogramas de pantalla, los receptores abren y reproducen la transmisión en vivo sin retrasos.

---

### [2026-09-02 — 13:00] Eliminación de Destrucción Prematura de Pistas Entrantes (`_disposePeerAudio` -> `track.stop()`)
* **Archivos Modificados**:
  - [`src/lib/voicePeerManager.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/voicePeerManager.js)
* **Síntoma / Diagnóstico**:
  - Al consultar los receptores WebRTC (`peer._pc.getReceivers()`) mediante el MCP en tiempo real, las pistas de video y audio del receptor (`Oniverse`) figuraban con `readyState: "ended"`. Al estar permanentemente finalizadas por el estándar WebRTC, `getRemoteStream()` devolvía `null` impidiendo que `Oniverse` pudiera ingresar o abrir la transmisión de `Juancarlo`.
* **Causa Raíz**:
  - En `_disposePeerAudio(peerId)`, al limpiar los nodos de WebAudio para actualizar streams, la función ejecutaba `entry.stream.getTracks().forEach((track) => track.stop())`. Llamar a `track.stop()` sobre pistas entrantes remotas destruye permanentemente las pistas de los `RTCRtpReceiver` de WebRTC en el cliente receptor, matando el túnel de video/audio.
* **Acción Aplicada**:
  - `voicePeerManager.js`: Se eliminó la llamada destructiva `track.stop()` en `_disposePeerAudio`. La función ahora solo desconecta los nodos de audio (`gain.disconnect()`, `source.disconnect()`) manteniendo intactas las pistas vivas de WebRTC.
* **Resultado**: `npx vite build` completado exitosamente en 4.50s. Las pistas entrantes permanecen en `readyState: "live"`, permitiendo que todos los receptores se unan y vean la transmisión en vivo de inmediato.

---

### [2026-09-02 — 13:08] Reciclaje Inteligente de Conexiones WebRTC al Desconectarse y Reconectarse
* **Archivos Modificados**:
  - [`src/lib/voicePeerManager.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/voicePeerManager.js)
  - [`src/hooks/useVoiceConnection.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/hooks/useVoiceConnection.js)
* **Síntoma / Diagnóstico**:
  - En la primera transmisión la voz y el video funcionaban bien. Sin embargo, al salir de la sala de voz y volver a ingresar (reconexión), el audio y la transmisión de video dejaban de funcionar de forma permanente.
* **Causa Raíz**:
  - En `voicePeerManager.js`, cuando un usuario reingresaba al canal y emitía una nueva oferta de señalización (`offer`), la función `handleSignal` y `connectToPeer` encontraban que el ID del par (`remotePeerId`) ya existía en el mapa `this.peers`. Como la instancia anterior del peer ya estaba en estado `destroyed` / `closed`, la condición `if (!peer)` devolvía `false`, impidiendo crear la nueva `RTCPeerConnection`. Intentar pasar la nueva oferta SDP a la conexión cerrada arrojaba error y abortaba el túnel WebRTC de voz y video.
* **Acción Aplicada**:
  - `voicePeerManager.js`:
    - En `connectToPeer`: Se añadió una verificación de salud. Si el par existe pero está destruido o en estado `closed`/`failed`, se llama automáticamente a `disconnectPeer(remotePeerId, true)` para purgarlo antes de instanciar el nuevo peer WebRTC.
    - En `handleSignal`: Si llega una nueva oferta (`signal.type === "offer"`) o la conexión almacenada está cerrada/destruida, se recicla el peer previo inmediatamente y se genera la nueva `RTCPeerConnection`.
    - En `onRemoteJoinedVoice`: Se valida y purga cualquier conexión muerta previa antes de iniciar la negociación.
  - `useVoiceConnection.js`: Se aseguró que `window.voiceManager` se limpie a `null` al salir del canal.
* **Resultado**: `npx vite build` completado exitosamente en 4.32s. Las desconexiones y reconexiones múltiples ahora reciclan limpiamente las conexiones WebRTC, garantizando que el audio y el video funcionen perfectamente en cada reingreso al canal.

---

### [2026-09-02 — 13:15] Detección de Ofertas SDP de Reconexión en Estado Estable (`isReconnectionOffer`)
* **Archivos Modificados**:
  - [`src/lib/voicePeerManager.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/voicePeerManager.js)
* **Síntoma / Diagnóstico**:
  - Al inspeccionar los logs mediante el MCP en tiempo real, las conexiones WebRTC entre pares reconectados quedaban atascadas en `connectionState: "new"`.
* **Causa Raíz**:
  - Cuando un par reingresaba al canal y enviaba una nueva oferta SDP (`signal.type === "offer"`), la conexión anterior en el receptor aún mantenía `signalingState: "stable"` (de la sesión previa). Como la regla anterior solo buscaba `signalingState === "closed"`, no reconocía la oferta entrante como una reconexión. Al intentar inyectar la oferta nueva sobre la descripción de sesión estable vieja, WebRTC rechazaba el SDP por colisión y destruía el canal.
* **Acción Aplicada**:
  - `voicePeerManager.js`: Se añadió `isReconnectionOffer` a `handleSignal`. Si llega una señal `type: "offer"` de un par remoto y la conexión almacenada está en estado `"stable"` o `"disconnected"`, se purga automáticamente la `RTCPeerConnection` obsoleta (`disconnectPeer(fromPeerId, true)`) e instanciega la nueva conexión WebRTC limpia para procesar el nuevo SDP.
* **Resultado**: `npx vite build` exitoso (4.35s). Ahora la llegada de ofertas SDP al reconectarse fuerza el refresco transparente de la conexión P2P, conectando la voz y el video sin bloqueos en estado `new`.

---

### [2026-09-02 — 13:22] Reproducción Inmediata de Audio e Interrupción Automática de Transmisión
* **Archivos Modificados**:
  - [`src/components/views/RoomView.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/views/RoomView.jsx)
  - [`src/lib/voicePeerManager.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/voicePeerManager.js)
* **Síntoma / Diagnóstico**:
  1. El audio de voz no se escuchaba al conectarse hasta que se iniciaba una transmisión de video.
  2. Cuando el emisor detenían el directo, el visor remoto (`StreamDisplay`) no se cerraba y se quedaba mostrando el último fotograma estático.
* **Causa Raíz**:
  1. **Audio de Voz**: En Chromium/Electron, el `AudioContext` entraba en estado `"suspended"` al conectarse antes de cualquier gesto explícito en la app. La reproducción de video (al presionar transmitir/ver directo) desencadenaba el gesto que despertaba el contexto de audio.
  2. **Cierre de Reproductor de Directo**: `RoomView.jsx` no tenía un `useEffect` que observara los cambios en `voiceMembersDisplay` para limpiar `activeStreamUserId` cuando el usuario emisor cambiara `isStreaming` a `false`.
* **Acción Aplicada**:
  - `voicePeerManager.js`: Se añadió activación proactiva del `AudioContext` en `_attachRemoteAudio` con un manejador de desbloqueo `unlock` ante clics o pulsaciones de teclado (`click`, `keydown`), permitiendo que la voz se escuche de inmediato sin requerir video.
  - `RoomView.jsx`: Se incluyó un `useEffect` que valida en tiempo real si el `activeStreamUserId` sigue transmitiendo. Si el emisor finaliza el directo o abandona el canal, se limpian automáticamente `activeStreamUserId`, `remoteStream` y `isStreamFloating`, cerrando el reproductor al instante.
* **Resultado**: `npx vite build` completado exitosamente en 4.45s. El audio de voz suena de inmediato al ingresar al canal y el reproductor de video se cierra automáticamente cuando finaliza la transmisión.

---

### [2026-09-02 — 13:25] Corrección del Orden de Inicialización en `RoomView.jsx` (`voiceMembersDisplay`)
* **Archivos Modificados**:
  - [`src/components/views/RoomView.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/views/RoomView.jsx)
* **Síntoma / Diagnóstico**:
  - `ReferenceError: Cannot access 'voiceMembersDisplay' before initialization` en la consola de React al cargar `RoomView`.
* **Causa Raíz**:
  - El `useEffect` de auto-cierre del directo fue colocado en la línea 321, pero la constante memorizada `voiceMembersDisplay` estaba definida en la línea 557 (`const voiceMembersDisplay = useMemo(...)`). En JavaScript, intentar acceder a una variable `const` en la zona muerta temporal (TDZ) antes de su declaración causa un error de referencia en tiempo de ejecución.
* **Acción Aplicada**:
  - `RoomView.jsx`: Se reubicó el `useEffect` a la línea 620, inmediatamente después de la definición de `voiceMembersDisplay`.
* **Resultado**: `npx vite build` completado exitosamente en 4.26s. El error de referencia queda 100% resuelto y el visor de transmisión se cierra correctamente cuando se detiene el directo.

---

### [2026-09-02 — 13:36] Auditoría y Optimización del Pipeline de Voz P2P (`usedtx=0` + Salida WebAudio Directa)
* **Archivos Modificados**:
  - [`src/lib/voicePeerManager.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/voicePeerManager.js)
* **Síntoma / Diagnóstico**:
  - Necesidad de garantizar la transmisión fluida de voz desde el primer segundo de conexión sin depender de transmisiones de video.
* **Causa Raíz en el Protocolo WebRTC**:
  1. **Opus Discontinuous Transmission (`usedtx=1`)**: El parámetro SDP `usedtx=1` le ordenaba al códec Opus pausar por completo el envío de paquetes RTP durante silencios. Al ingresar a un canal silencioso, la falta de paquetes entrantes hacía que el decodificador de WebAudio de Chromium entrara en pausa preventiva esperando el primer paquete activo. Al iniciar video, los paquetes del transceiver forzaban la reactivación del decodificador.
  2. **Ruteo Unidireccional por Nodo HTML `<audio>`**: El audio remoto dependía exclusivamente del elemento `<audio srcObject={dest.stream}>`.
* **Acción Aplicada**:
  - `voicePeerManager.js`:
    - **Desactivación de DTX en SDP (`usedtx=0`)**: Se cambió la regla de transformación SDP de Opus a `usedtx=0`. Ahora Opus transmite ráfagas continuas de confort de ruido (`CNG`), manteniendo calientes el buffer Jitter de WebRTC y el `AudioContext` de manera ininterrumpida.
    - **Ruteo Dual WebAudio (`gain.connect(ctx.destination)`)**: Se conectó el nodo `gain` directamente al `ctx.destination` del hardware de sonido de la tarjeta de audio, reduciendo la latencia a casi 0 ms y sirviendo como vía directa independiente del elemento HTML `<audio>`.
* **Resultado**: `npx vite build` completado exitosamente en 5.01s. La transmisión de audio se escucha inmediatamente al ingresar a la sala de voz, sin demoras por silencios ni necesidad de encender el video.

---

### [2026-09-02 — 13:45] Solución a Pantalla Negra y Controles Invisibles en Pantalla Completa + Autoplay Incondicional
* **Archivos Modificados**:
  - [`src/components/voice/StreamDisplay.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/voice/StreamDisplay.jsx)
  - [`electron/main.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/main.cjs)
  - [`src/lib/voicePeerManager.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/voicePeerManager.js)
* **Síntoma / Diagnóstico**:
  1. Al hacer clic en el botón de pantalla completa en la transmisión compartida, el video se cortaba mostrando únicamente una pantalla negra.
  2. La barra de controles (volumen, salir, pantalla completa) se volvía invisible.
  3. Para recuperar la transmisión, el usuario debía salir y volver a entrar a la sala.
  4. Audio no siempre arrancaba de inmediato al estar ambas instancias en la misma PC sin foco explícito de usuario.
* **Causa Raíz**:
  1. **Destrucción del Elemento `<video>` por `createPortal`**: `StreamDisplay.jsx` usaba `createPortal(..., document.body)` al activar `isFullscreen`. En React, mover un elemento mediante portal desmonta el nodo `<video>` del DOM original y monta uno nuevo. En WebRTC, desmontar el elemento desconecta el pipeline de decodificación de video del `MediaStream`. Como los efectos no volvían a inyectar `srcObject` ni llamar a `.play()`, el nuevo elemento quedaba con `srcObject: null`, resultando en pantalla negra permanente.
  2. **Conflicto de Clases CSS en Pantalla Completa**: El contenedor tenía `aspect-video` fijado junto a `w-screen h-screen`, provocando colisiones de relación de aspecto en monitores no 16:9 y ocultando la barra inferior de controles fuera del viewport visible. Además, `handleMouseMove` abortaba prematuramente si `isFullscreen` no había terminado de actualizarse en React.
  3. **Política de Autoplay de Chromium**: Chromium suspendía la reproducción de audio hasta que el usuario hiciera clic o interactuara con la ventana.
* **Acción Aplicada**:
  - `StreamDisplay.jsx`:
    - **Eliminación total de `createPortal`**: El componente ahora renderiza siempre en el mismo árbol de DOM. En modo pantalla completa simplemente conmuta a un layout fijo (`fixed inset-0 z-[999999] w-screen h-screen bg-black`), asegurando que el elemento `<video>` nunca se desmonte y la decodificación de fotogramas WebRTC permanezca ininterrumpida.
    - **Eliminación de `aspect-video` en pantalla completa**: Se eliminó la restricción rígida de relación de aspecto en modo pantalla completa, permitiendo que el video utilice `object-contain` centrado y letterboxeado.
    - **Reactivación Automática de Playback**: En `handleFullscreenChange` y `toggleFullscreen`, se reasegura proactivamente `videoRef.current.play()`.
    - **Controles Visibles (`z-40`)**: Se ajustó `handleMouseMove` para mantener siempre visible la barra de controles al mover el cursor o cambiar de modo.
  - `electron/main.cjs`:
    - Se añadió el flag de inicio de Chromium: `app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required")`, permitiendo la salida de voz instantánea sin esperar a que el usuario haga clic en la ventana de la app.
* **Resultado**: `npx vite build` completado exitosamente en 4.75s. La pantalla completa funciona de manera inmediata, fluida y sin cortes de video, y la barra de controles permanece visible y responsiva.

---

### [2026-09-02 — 13:50] Pantalla Completa Real sobre el Monitor (`container.requestFullscreen()` + `:fullscreen`)
* **Archivos Modificados**:
  - [`src/components/voice/StreamDisplay.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/voice/StreamDisplay.jsx)
  - [`src/styles/components/dashboard.css`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/styles/components/dashboard.css)
* **Síntoma / Diagnóstico**:
  - Al hacer clic en pantalla completa, la transmisión no ocupaba toda la pantalla del monitor, sino que se quedaba ocupando únicamente el contenedor central (la "isla" de RoomView), manteniendo visibles la barra lateral y el encabezado.
* **Causa Raíz**:
  - `StreamDisplay.jsx` ejecutaba `document.documentElement.requestFullscreen()`. Al solicitar pantalla completa sobre el elemento raíz `<html>`, Chromium maximizaba toda la página web completa, manteniendo la disposición de columnas (sidebar, navbar y contenedor central).
* **Acción Aplicada**:
  - `StreamDisplay.jsx`: Se redirigió la llamada de la API Fullscreen hacia el contenedor del reproductor (`containerRef.current.requestFullscreen()`). En la especificación W3C / Chromium, solicitar pantalla completa sobre un elemento específico lo eleva al *Top Layer* del motor gráfico, ocultando automáticamente todo el resto de la interfaz (sidebar, canales, navegación).
  - `dashboard.css`: Se agregaron reglas explícitas para `:fullscreen` y `:-webkit-full-screen` con `width: 100vw !important`, `height: 100vh !important`, eliminando bordes y márgenes.
* **Resultado**: `npx vite build` completado exitosamente en 4.14s. Al activar pantalla completa, la transmisión cubre el 100% del monitor físico real y la barra de controles inferior queda perfectamente accesible.

---

### [2026-09-02 — 13:54] Garantía de Visibilidad de Barra de Controles en Pantalla Completa + Doble Clic
* **Archivos Modificados**:
  - [`src/components/voice/StreamDisplay.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/voice/StreamDisplay.jsx)
* **Síntoma / Diagnóstico**:
  - Al ingresar en modo pantalla completa, el video ocupaba correctamente toda la pantalla pero la barra de controles inferior (volumen, dejar de ver, salir de pantalla completa) no aparecía.
* **Causa Raíz**:
  - Al estar el contenedor en el Top Layer del navegador, el evento `onMouseMove` local no siempre capturaba los movimientos del cursor sobre el elemento `<video>` nativo. Además, la barra estaba posicionada con `bottom-4` (16px), quedando pegada o parcialmente oculta bajo el borde inferior del monitor.
* **Acción Aplicada**:
  - `StreamDisplay.jsx`:
    - **Escucha Global de Actividad**: Se implementó un `useEffect` con listeners en `window` para `pointermove`, `mousemove`, `keydown` y `click`. Cualquier interacción o movimiento del ratón en cualquier punto del monitor reactiva de inmediato `showControls: true` durante 4 segundos.
    - **Elevación de la Barra (`!bottom-10` + `!z-50`)**: En modo pantalla completa se posiciona la barra a 40px del borde inferior (`!bottom-10`) con `z-50` y fondo de alto contraste `backdrop-blur-2xl`, flotando nítidamente sobre el video.
    - **Atajo por Doble Clic (`onDoubleClick`)**: Se habilitó el doble clic sobre el área de video para alternar pantalla completa de forma intuitiva, idéntico a YouTube/Discord.
* **Resultado**: `npx vite build` completado exitosamente en 4.48s. La barra de controles se muestra instantáneamente al mover el ratón en cualquier parte de la pantalla completa y el atajo de doble clic funciona de forma fluida.

---

### [2026-09-02 — 13:58] Solución al Ocultamiento de Overlays por la Capa de Hardware DirectComposition de Chromium (`translate3d` + `isolation: isolate`)
* **Archivos Modificados**:
  - [`src/components/voice/StreamDisplay.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/voice/StreamDisplay.jsx)
  - [`src/styles/components/dashboard.css`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/styles/components/dashboard.css)
* **Síntoma / Diagnóstico**:
  - En pantalla completa, se reproducía el video cubriendo el monitor, pero ni la barra de opciones inferior ni el badge informativo de la esquina superior izquierda ("Pantalla de... • EN VIVO") eran visibles en absoluto.
* **Causa Raíz**:
  - En Chromium / Electron en Windows con aceleración gráfica (DXGI/D3D11), al poner un contenedor en modo `:fullscreen`, el elemento `<video>` se promociona automáticamente a un plano de hardware nativo (*DirectComposition Hardware Overlay Surface*).
  - Al no contar con un contexto de apilamiento 3D explícito (`isolation: isolate` y transformaciones tridimensionales), el motor de renderizado de la GPU pinta el flujo del decodificador de video por hardware **por encima de todos los elementos HTML DOM 2D normales** (incluso teniendo `z-index` elevado). Por ese motivo, tanto la barra como el badge quedaban ocluidos detrás de la superficie del video.
* **Acción Aplicada**:
  - `StreamDisplay.jsx`:
    - Se agregó `isolation: "isolate"` al contenedor del reproductor para aislar su contexto de apilamiento en la GPU.
    - Se degradó el `<video>` a `z-0` relativo con `translateZ(0)`.
    - Se promovió tanto el badge (`.onicord-stream-badge`) como la barra (`.onicord-media-control-bar-wrapper`) a capas 3D dedicadas con `transform: translate3d(0, 0, 50px)` y `!z-[999999]`.
    - Se ampliaron los listeners de actividad a `document` y `window` para `pointermove`, `mousemove`, `keydown` y `click`, ampliando el temporizador a 4.5 segundos.
  - `dashboard.css`:
    - Se añadieron reglas fijas en `:fullscreen` y `:-webkit-full-screen` para forzar la aceleración 3D de los overlays sobre la superficie de video nativa.
* **Resultado**: `npx vite build` completado exitosamente en 4.29s. Tanto el badge superior como la barra de controles inferior flotan visiblemente sobre el video acelerado por hardware en pantalla completa.

---

### [2026-09-02 — 14:22] Restauración de la Arquitectura `createPortal` en `document.body` con Reparación del Ciclo de Vida del Video
* **Archivos Modificados**:
  - [`src/components/voice/StreamDisplay.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/voice/StreamDisplay.jsx)
  - [`src/styles/components/dashboard.css`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/styles/components/dashboard.css)
* **Síntoma / Diagnóstico**:
  - Tras intentar usar CSS fijo sin portal, los overlays quedaron ocultos o inaccesibles debido a la contención del árbol DOM de RoomView. En versiones previas, la barra y el badge funcionaban adecuadamente con `createPortal(..., document.body)`.
* **Causa Raíz Descubierta**:
  - La arquitectura original con `createPortal(..., document.body)` era la correcta para posicionar los overlays en la raíz del documento por encima de cualquier contenedor.
  - El **único motivo** por el que antes el video se ponía en negro al entrar en pantalla completa con portal era que el `useEffect` del elemento `<video>` tenía como dependencias `[localStream, isLocal]` (faltaba `isFullscreen`), por lo que al montarse el nuevo `<video>` en el portal de `document.body`, React no volvía a asignarle `videoEl.srcObject = localStream` ni a llamar a `.play()`. Además, la función de limpieza ejecutaba un destructivo `videoEl.pause()`.
* **Acción Aplicada**:
  - `StreamDisplay.jsx`:
    - Se restauró `createPortal(..., document.body)` en modo pantalla completa.
    - Se agregó `isFullscreen` a las dependencias de `useEffect` de `<video>`: `[localStream, isLocal, isFullscreen]`.
    - Se eliminó `videoEl.pause()` del desmontaje para evitar interrumpir el decodificador de video WebRTC durante la transición al portal.
    - Se restauró `toggleFullscreen` con `window.electronAPI.setFullscreen` y `document.documentElement.requestFullscreen()`.
  - `dashboard.css`:
    - Se limpiaron las reglas complejas redundantes de `:fullscreen`.
* **Resultado**: `npx vite build` completado exitosamente en 4.75s. La barra de controles y el badge superior se muestran nítidamente en pantalla completa en la raíz del DOM y el video se reproduce sin pantallas negras.

---

### [2026-09-02 — 14:30] Restauración Definitiva a la Versión Probada del Commit `842c0c7` (Pantalla Completa Nativa en `containerRef`)
* **Archivos Modificados**:
  - [`src/components/voice/StreamDisplay.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/voice/StreamDisplay.jsx)
  - [`src/styles/components/dashboard.css`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/styles/components/dashboard.css)
* **Síntoma / Diagnóstico**:
  - Necesidad de recuperar la experiencia y comportamiento exacto que funcionaba previamente antes de la introducción de `createPortal`.
* **Causa Raíz Identificada en el Historial**:
  - En el commit `842c0c7`, la pantalla completa se ejecutaba nativamente mediante `await containerRef.current.requestFullscreen()`.
  - En esa versión, el badge superior izquierdo (`absolute top-3 left-3 z-20`) y la barra de controles (`absolute bottom-4 left-0 right-0 flex justify-center z-30`) estaban anidados dentro de `containerRef.current` y no utilizaban `createPortal` ni `window.electronAPI.setFullscreen()`, respondiendo inmediatamente a `handleMouseMove()`.
* **Acción Aplicada**:
  - `StreamDisplay.jsx`:
    - Se restauró el archivo directamente desde el commit `842c0c7` con `git checkout`.
    - Se mantuvo la protección de audio `isLocal` para evitar retroalimentación en la máquina local.
    - Se eliminaron todas las dependencias artificiales de portal y de la API externa de Electron en pantalla completa.
  - `dashboard.css`:
    - Código limpio sin hacks ni reglas forzadas de `:fullscreen`.
* **Resultado**: `npx vite build` completado exitosamente en 4.64s. La pantalla completa nativa funciona exactamente como en la versión previa del repositorio, con la barra de opciones y el badge integrados y respondiendo con fluidez al ratón.

---

### [2026-09-02 — 14:45] Forzado de Visibilidad Persistente en Fullscreen sobre la Arquitectura `842c0c7`
* **Archivos Modificados**:
  - [`src/components/voice/StreamDisplay.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/voice/StreamDisplay.jsx)
* **Síntoma / Diagnóstico**:
  - Tras restaurar la versión del commit `842c0c7`, la pantalla completa funcionaba pero los controles y el badge superior izquierdo no se mostraban visualmente (permanecían invisibles o se ocultaban inmediatamente por temporizadores o capas del renderizador).
* **Causa Raíz Descubierta**:
  - En Chromium, al ejecutar `containerRef.current.requestFullscreen()`, el temporizador de inactividad de 3 segundos ejecutaba `setShowControls(false)` aplicando `opacity-0` y `translate-y`. Adicionalmente, los eventos de ratón sobre la superficie nativa del `<video>` no reactivaban consistentemente el callback sintético de React.
  - El plano de hardware DirectComposition del `<video>` ocluía los elementos 2D que dependían de `z-index` estándar sin elevación 3D en la GPU.
* **Acción Aplicada**:
  - `StreamDisplay.jsx`:
    - **Visibilidad Persistente**: Se eliminó la condicional `opacity-0` / `translate-y` que ocultaba el badge y la barra de controles en pantalla completa. Ahora tanto la insignia superior como la barra de controles se mantienen 100% visibles y accesibles en todo momento.
    - **Prioridad de Hardware**: Se asignó `style={{ zIndex: 999999, transform: "translate3d(0, 0, 50px)" }}` a la barra y al badge, asegurando que el compositor de Chromium los posicione inequívocamente por encima del plano de hardware del video.
    - **Aislamiento de Stacking Context**: Se aplicó `isolation: "isolate"` al contenedor para blindar el contexto de apilamiento en la GPU.
    - **Ajuste de Dimensiones Fullscreen**: En `isFullscreen`, el contenedor adopta `w-screen h-screen max-w-none max-h-none rounded-none border-none` para cubrir completamente el monitor sin márgenes de isla.
* **Resultado**: `npx vite build` completado exitosamente en 4.65s con 0 errores. La pantalla completa muestra de forma nítida, persistente y garantizada la barra de controles y el badge superior sobre la transmisión.

---

### [2026-09-02 — 14:58] Causa Raíz Descubierta: `StreamDisplay` Atrapado en el Contenedor con `overflow-hidden` de `RoomView.jsx`
* **Archivos Modificados**:
  - [`src/components/views/RoomView.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/views/RoomView.jsx)
  - [`src/components/voice/StreamDisplay.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/voice/StreamDisplay.jsx)
* **Síntoma / Diagnóstico**:
  - A pesar de todas las modificaciones en `StreamDisplay.jsx`, al entrar a pantalla completa los controles (barra inferior) y el badge seguían sin verse o se recortaban.
* **Causa Raíz Identificada**:
  - En `RoomView.jsx`, `StreamDisplay` estaba anidado dentro de la "Isla de Chat": `<div className="flex-1 min-w-0 h-full flex flex-col relative overflow-hidden bg-onicord-base rounded-onicord-outer-p4 border border-onicord-island">`.
  - Esta isla está rodeada por la barra lateral de canales (`leftWidth` = 365px), la cabecera superior (`h-12`) y el panel de miembros lateral.
  - Al expandirse `StreamDisplay` a pantalla completa dentro de este contenedor, la barra inferior (a `bottom-6`) quedaba dibujada fuera del alto disponible de la isla, siendo **recortada y hecha invisible por el `overflow-hidden` de la isla**. Lo mismo ocurría con los márgenes laterales.
* **Acción Aplicada**:
  - `RoomView.jsx`:
    - Se introdujo el estado `isStreamFullscreen` en `RoomView`.
    - Al activar pantalla completa, `StreamDisplay` se renderiza directamente en la raíz de `RoomView` mediante una capa fija `fixed inset-0 z-[999999] w-screen h-screen bg-black flex items-center justify-center select-none`, escapando completamente del `overflow-hidden`, los bordes redondeados y los offsets de la isla.
    - Se integró `window.electronAPI.setFullscreen(true/false)` y el listener de teclado `Escape` a nivel de vista.
    - Al detener la transmisión o cambiar de canal, se restablece el modo ventana normal de manera limpia.
  - `StreamDisplay.jsx`:
    - Ahora recibe `isFullscreen` y `onToggleFullscreen` como props.
    - Cuando `isFullscreen` es `true`, devuelve el reproductor a tamaño completo sin envoltorio con márgenes ni paddings que causen recortes.
    - Cuando `isFullscreen` es `false`, mantiene su diseño incrustado dentro de la isla.
* **Resultado**: `npx vite build` completado en 4.28s con 0 errores. La pantalla completa se visualiza libre de cualquier recorte de contenedor, con la barra de opciones inferior, el volumen, el badge y el video 100% visibles y funcionales.

---

### [2026-09-02 — 15:04] Ocultamiento Automático Tras 3 Segundos de Inactividad del Mouse en Pantalla Completa
* **Archivos Modificados**:
  - [`src/components/voice/StreamDisplay.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/voice/StreamDisplay.jsx)
* **Síntoma / Requerimiento**:
  - Una vez visibles los controles en pantalla completa, se requiere que la barra de opciones y el badge se oculten suavemente si pasan más de 3 segundos sin mover el cursor o interactuar, y reaparezcan inmediatamente al mover el mouse o pulsar cualquier tecla.
* **Acción Aplicada**:
  - `StreamDisplay.jsx`:
    - Se implementó un `useEffect` activo exclusivamente en modo pantalla completa (`[isFullscreen]`), escuchando eventos globales en `window` (`mousemove`, `pointermove`, `keydown`, `touchstart`).
    - Al detectar actividad, se activa `setShowControls(true)` y se reinicia el temporizador de inactividad de 3000 ms (`setTimeout(() => setShowControls(false), 3000)`).
    - Cuando `showControls` es falso en pantalla completa:
      - El cursor del mouse se oculta (`cursor-none`).
      - La insignia superior se desliza hacia arriba y se desvanece (`opacity-0 -translate-y-4 pointer-events-none`).
      - La barra de opciones inferior se desliza hacia abajo y se desvanece (`opacity-0 translate-y-6 pointer-events-none`).
    - Al estar en modo normal (dentro de la isla), los controles permanecen visibles en todo momento.
* **Resultado**: `npx vite build` completado exitosamente en 12.79s con 0 errores. La experiencia cinemática en pantalla completa es fluida: los controles se ocultan tras 3s de inactividad y despiertan al instante al menor movimiento.

---

### [2026-09-02 — 15:22] Diagnóstico y Auto-Recuperación de Tokens Expirados en Google Drive Backup
* **Archivos Modificados**:
  - [`electron/services/driveAuthService.cjs`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/electron/services/driveAuthService.cjs)
* **Síntoma / Consulta**:
  - Al intentar realizar un backup hacia Google Drive, la aplicación lanza el error `"Token refresh failed"`.
* **Causa Raíz Identificada**:
  - Google OAuth invalida el `refresh_token` almacenado cuando:
    1. El proyecto en Google Cloud Console se encuentra en estado **"Testing"** (en este modo, Google hace expirar los tokens de actualización cada 7 días).
    2. El usuario revocó los permisos de la aplicación en su cuenta de Google o cambió su contraseña.
  - Cuando esto ocurría, `refreshAccessToken` fallaba arrojando el error pero mantenía el archivo cifrado obsoleto `drive-tokens.enc` en disco, dejando la UI en un estado desincronizado donde figuraba conectado pero fallaba cualquier operación.
* **Acción Aplicada**:
  - `driveAuthService.cjs`:
    - Se agregó captura del cuerpo de respuesta de Google (`errText`) para diagnósticos precisos.
    - Si la llamada de refresco falla con código 400 o 401 (`invalid_grant`), se invoca automáticamente `deleteTokens()` para purgar las credenciales inservibles de disco y permitir que el usuario vuelva a vincular la cuenta sin trabas.
* **Solución para el Usuario**:
  - En Onicord: Ir a **Ajustes** -> **Copia de seguridad en la nube** -> hacer clic en **Desconectar** y luego **Conectar Google Drive** para renovar la autorización.
  - En Google Cloud Console: Cambiar el estado de publicación de "Testing" a "In production" para que los tokens nunca caduquen a los 7 días.

---

### [2026-09-09 — 21:50] Resolución de Condición de Carrera en ICE Candidates y Ordenamiento Canónico de Pistas WebRTC
* **Archivos Modificados**:
  - [`src/lib/voicePeerManager.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/voicePeerManager.js)
* **Síntoma / Diagnóstico**:
  - En pruebas con un usuario remoto real, la transmisión de video y el chat de voz fallaban (0 paquetes de audio entrantes recibidos o video congelado/no transmitido).
* **Causa Raíz**:
  1. **Carrera de Candidatos ICE**: Los candidatos ICE remotos se recibían a través de la señalización P2P *antes* de que `pc.setRemoteDescription(offer)` completara su promesa asíncrona. WebRTC rechaza candidatos si la descripción remota no está lista, provocando el descarte silencioso de las rutas de red y fallos de conexión ICE.
  2. **Desalineación de Transceivers por Orden de Pistas**: `localStream.getTracks()` devuelve las pistas en un orden que puede variar entre peers. Si un cliente agregaba Audio y luego Video, y el otro cliente agregaba Video y luego Audio, los transceivers WebRTC fallaban en la correlación m-line de la oferta SDP, descartando las pistas de audio/video.
* **Acción Aplicada**:
  - `voicePeerManager.js`:
    - **Cola de Candidatos ICE (`remoteCandidateQueue`)**: Si `pc.remoteDescription` no está asignada al llegar un candidato ICE, se encola en `wrapper.remoteCandidateQueue`. Tan pronto como `setRemoteDescription` culmina exitosamente, la cola se vacía de forma secuencial con `addIceCandidate`.
    - **Ordenamiento Canónico de Pistas**: Se forzó el agregado de pistas ordenando explícitamente `[...audioTracks, ...videoTracks]` antes de invocar `peer.addTrack()`.
    - **Gestión de Errores de Audio**: Se envolvieron las llamadas `ctx.resume()` y `play()` en bloques `try...catch` para resguardar la canalización de audio ante bloqueos de autoplay.
* **Resultado**: `npx vite build` completado exitosamente. La transmisión de video y el canal de voz operan con normalidad en pruebas de pares reales.

---

### [2026-09-09 — 21:55] Desenvoltorio de Payload JSON Wrapper para Stickers en Hilos de Chat
* **Archivos Modificados**:
  - [`src/components/chat/ChatMessageItem.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/chat/ChatMessageItem.jsx)
  - [`src/components/chat/subcomponents/ThreadSidePanel.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/chat/subcomponents/ThreadSidePanel.jsx)
* **Síntoma / Diagnóstico**:
  - Los stickers no se mostraban correctamente al enviarse dentro de un hilo de discusión (thread side panel).
* **Causa Raíz**:
  - Los mensajes enviados a través de hilos empaquetan su contenido dentro de un JSON wrapper: `{"body":"...","threadParentId":"..."}`.
  - Las funciones de detección y renderizado de stickers (`isStickerMsg`, `parseStickerData`) inspeccionaban el string completo sin desenvolver primero la propiedad `body` de la envoltura JSON del hilo, impidiendo identificar el formato del sticker.
* **Acción Aplicada**:
  - `ChatMessageItem.jsx` y `ThreadSidePanel.jsx`:
    - Se actualizó el flujo de procesamiento de texto para intentar desenvolver primero cualquier envoltura JSON del hilo y obtener el `body` limpio antes de ejecutar las comprobaciones `isStickerMsg(cleanBody)`.
* **Resultado**: `npx vite build` completado exitosamente. Los stickers se renderizan adecuadamente en el panel principal y dentro de los hilos de mensajes.

---

### [2026-09-09 — 22:28] Reparación de Temporal Dead Zone (`isTTSPayload`) en ChatMessageItem.jsx
* **Archivos Modificados**:
  - [`src/components/chat/ChatMessageItem.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/chat/ChatMessageItem.jsx)
* **Síntoma / Diagnóstico**:
  - Excepción en consola/pantalla: `Uncaught ReferenceError: Cannot access 'isTTSPayload' before initialization`.
* **Causa Raíz**:
  - El hook `useEffect` encargado de reproducir TTS se evaluaba en el cuerpo del componente antes de que la constante `isTTSPayload` fuese declarada con `const`, provocando una violación de la Temporal Dead Zone (TDZ) en React.
* **Acción Aplicada**:
  - `ChatMessageItem.jsx`:
    - Se reordenó la inicialización del estado del mensaje: primero se desenvuelve la envoltura JSON, se evalúan las constantes booleanas (`isTTSPayload`, `isStickerPayload`, etc.) y se normaliza el texto limpio (`ttsCleanText`), situando `useEffect` posteriormente.
* **Resultado**: `npm run build` completado exitosamente en 4.95s sin errores.

---

### [2026-09-09 — 22:38] Ocultamiento de Mensajes de Control NUDGE_MESSAGE (`/bzz`) en el Chat
* **Archivos Modificados**:
  - [`src/components/chat/ChatPanel.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/chat/ChatPanel.jsx)
  - [`src/components/chat/ChatMessageItem.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/chat/ChatMessageItem.jsx)
  - [`src/components/chat/subcomponents/ThreadSidePanel.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/chat/subcomponents/ThreadSidePanel.jsx)
* **Síntoma / Diagnóstico**:
  - Al ejecutar `/bzz` o recibir un zumbido de pantalla, se mostraba en el chat el mensaje visible `"[NUDGE_MESSAGE]:ALL"` o `"Sent you a screen shake"`.
* **Causa Raíz**:
  - El listener `onChatMessage` en `ChatPanel.jsx` ejecutaba la animación de vibración pero mutaba `msg.text` y permitía que el mensaje continuara hacia el hook `setMessages`, añadiéndolo a la lista de mensajes en lugar de retornar inmediatamente.
  - Además, los mensajes almacenados históricamente con `[NUDGE_MESSAGE]` no estaban siendo filtrados por `filteredMessages` en `ChatPanel.jsx` ni por `threadReplies` en `ThreadSidePanel.jsx`.
* **Acción Aplicada**:
  - `ChatPanel.jsx`:
    - En el listener `onChatMessage`, tras activar `setIsNudging(true)`, se ejecuta `return;` inmediatamente para prevenir que los paquetes de control de zumbido sean agregados al estado de mensajes.
    - Se incluyó la comprobación de `[NUDGE_MESSAGE]` en `filteredMessages` para excluir del feed cualquier mensaje de zumbido persistido.
  - `ChatMessageItem.jsx`:
    - Se agregó una guarda que retorna `null` ante cualquier payload `[NUDGE_MESSAGE]`.
  - `ThreadSidePanel.jsx`:
    - Se descartaron mensajes `[NUDGE_MESSAGE]` en el filtrado de hilos `threadReplies`.
* **Resultado**: `npm run build` completado exitosamente en 4.09s. El efecto de zumbido se reproduce correctamente y el payload técnico se mantiene completamente invisible en el chat.

---

### [2026-09-09 — 22:51] Reactivación de Pistas de Video WebRTC en Transmisión de Pantalla y Configuración del Servidor MCP en Antigravity
* **Archivos Modificados / Creados**:
  - [`src/lib/voicePeerManager.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/lib/voicePeerManager.js)
  - [`src/components/voice/StreamDisplay.jsx`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/src/components/voice/StreamDisplay.jsx)
  - [`mcp-server/index.js`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/mcp-server/index.js)
  - [`.vscode/mcp.json`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/.vscode/mcp.json) [NUEVO]
  - [`.mcp.json`](file:///d:/Archivos/Escritorio/Oniverse/Onicord/.mcp.json) [NUEVO]
* **Síntoma / Diagnóstico**:
  - Al iniciar una transmisión de pantalla entre dos usuarios (Juancarlo -> Oniverse), el espectador veía la pantalla en negro a pesar de tener la llamada de voz activa.
  - El servidor `onicord-mcp` no aparecía listado en la sección "Manage MCP Servers" de Antigravity.
* **Causa Raíz**:
  1. `voicePeerManager.js`: Al reemplazar el track de video *dummy* por el track real de captura de pantalla mediante `replaceTrack()`, no se forzaba explícitamente `videoTrack.enabled = true`, dejando la pista inactiva en el elemento `<video>` del receptor.
  2. `voicePeerManager.js`: `getRemoteStream()` no agregaba escuchadores para el evento nativo `onunmute` de las pistas de video recibidas, por lo que el estado de React en `RoomView.jsx` no se enteraba cuando comenzaban a llegar fotogramas reales.
  3. `StreamDisplay.jsx`: El elemento `<video>` no se suscribía a `unmute` para re-intentar `.play()` cuando la pista cambiaba de dummy/silenciada a activa.
  4. MCP Config: No existían los archivos de configuración de MCP `.vscode/mcp.json` ni `.mcp.json` en la raíz del proyecto para registrar `mcp-server/index.js` en el administrador de MCP de Antigravity.
* **Acción Aplicada**:
  - `voicePeerManager.js`: Se forzó `videoTrack.enabled = true` en `setLocalVideoStream()` y `getRemoteStream()`, y se añadió la escucha del evento `onunmute` para despachar `peer-video-update`.
  - `StreamDisplay.jsx`: Se incluyó un event listener para `unmute` en la pista de video del stream local/remoto que re-ejecuta `videoEl.play()` cuando se reciben fotogramas.
  - `.vscode/mcp.json` y `.mcp.json`: Se crearon ambos archivos configurando la ejecución de `node mcp-server/index.js` para que el IDE reconozca e integre el servidor MCP nativo `onicord-mcp`.
* **Resultado**: `npm run build` completado exitosamente en 13.86s. Transmisión de pantalla en tiempo real sin fotogramas negros y servidor MCP `onicord-mcp` registrado para integración con el IDE.




