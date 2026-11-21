const vm = require("vm");

function hardenHostFn(fn) {
  const safeFn = function (...args) {
    try {
      const res = fn.apply(null, args);
      if (res && typeof res.then === "function") {
        const thenable = Object.create(null);
        thenable.then = hardenHostFn((onFulfilled, onRejected) =>
          res.then(
            typeof onFulfilled === "function" ? (v) => onFulfilled(v) : undefined,
            typeof onRejected === "function" ? (e) => onRejected(new Error(e?.message || "Error")) : undefined
          )
        );
        thenable.catch = hardenHostFn((onRejected) =>
          res.catch(typeof onRejected === "function" ? (e) => onRejected(new Error(e?.message || "Error")) : undefined)
        );
        return Object.freeze(thenable);
      }
      return res;
    } catch (err) {
      throw new Error(err?.message || "Sandbox execution error");
    }
  };
  Object.setPrototypeOf(safeFn, null);
  return Object.freeze(safeFn);
}

function hardenHostObject(obj, seen = new WeakSet()) {
  if (obj === null || typeof obj !== "object") {
    return typeof obj === "function" ? hardenHostFn(obj) : obj;
  }
  if (seen.has(obj)) return obj;
  seen.add(obj);

  Object.setPrototypeOf(obj, null);
  for (const key of Reflect.ownKeys(obj)) {
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    if (!desc) continue;
    if ("value" in desc) {
      if (typeof desc.value === "function") {
        obj[key] = hardenHostFn(desc.value);
      } else if (desc.value && typeof desc.value === "object") {
        hardenHostObject(desc.value, seen);
      }
    } else {
      if (typeof desc.get === "function") desc.get = hardenHostFn(desc.get);
      if (typeof desc.set === "function") desc.set = hardenHostFn(desc.set);
      Object.defineProperty(obj, key, desc);
    }
  }
  return Object.freeze(obj);
}

function postToMain(msg) {
  try {
    process.parentPort?.postMessage(msg);
  } catch {}
}

class PluginHostProcess {
  constructor() {
    this.sandboxes = new Map();
  }

  unloadPlugin(pluginId) {
    const sb = this.sandboxes.get(pluginId);
    if (!sb) return;
    for (const timer of sb.activeTimers) {
      clearTimeout(timer);
      clearInterval(timer);
    }
    sb.activeTimers.clear();
    sb.timerHandleMap.clear();
    this.sandboxes.delete(pluginId);
  }

  _updateEnv(sb, envSnapshot, activeContext = undefined) {
    if (envSnapshot && typeof envSnapshot === "object") {
      if (envSnapshot.config !== undefined) sb.env.config = envSnapshot.config;
      if (envSnapshot.profile !== undefined) sb.env.profile = envSnapshot.profile;
      if (envSnapshot.serverInfo !== undefined) sb.env.serverInfo = envSnapshot.serverInfo;
      if (envSnapshot.gameActivity !== undefined) sb.env.gameActivity = envSnapshot.gameActivity;
      if (envSnapshot.audioState !== undefined) sb.env.audioState = envSnapshot.audioState;
      if (envSnapshot.storageGlobal !== undefined) sb.env.storageGlobal = envSnapshot.storageGlobal || {};
      if (envSnapshot.storageRooms && typeof envSnapshot.storageRooms === "object") {
        sb.env.storageRooms = { ...sb.env.storageRooms, ...envSnapshot.storageRooms };
      }
      if (envSnapshot.defaultRoomCode !== undefined) sb.env.defaultRoomCode = envSnapshot.defaultRoomCode;
    }
    if (activeContext !== undefined) {
      sb.activeContext = activeContext;
    }
  }

  runPlugin({ manifest, code, appLanguage = "es", envSnapshot = {} }) {
    const pluginId = manifest.id;
    if (this.sandboxes.has(pluginId)) {
      this.unloadPlugin(pluginId);
    }

    const commandHandlers = new Map();
    const voiceButtonHandlers = new Map();
    const p2pListeners = new Set();
    const stageResolvers = [];
    const activeTimers = new Set();
    const timerHandleMap = new Map();
    let timerIdCounter = 0;

    const sb = {
      manifest,
      appLanguage,
      activeContext: null,
      env: {
        config: envSnapshot.config || {},
        profile: envSnapshot.profile || null,
        serverInfo: envSnapshot.serverInfo || null,
        gameActivity: envSnapshot.gameActivity || { name: null },
        audioState: envSnapshot.audioState || { isConnected: false },
        storageGlobal: envSnapshot.storageGlobal || {},
        storageRooms: envSnapshot.storageRooms || {},
        defaultRoomCode: envSnapshot.defaultRoomCode || null,
      },
      commandHandlers,
      voiceButtonHandlers,
      p2pListeners,
      stageResolvers,
      activeTimers,
      timerHandleMap,
      registeredWidgets: [],
      registeredVoiceButtons: [],
      registeredRailActions: [],
      registeredServerSettingsTabs: [],
      registeredCustomViews: [],
    };

    const emitHostEvent = (eventName, payload) => {
      postToMain({
        type: "host-event",
        pluginId,
        eventName,
        payload,
      });
    };

    const safeManifestCopy = JSON.parse(JSON.stringify(manifest || {}));

    const sandboxAPI = {
      manifest: safeManifestCopy,
      language: appLanguage,
      get _activeContext() {
        return sb.activeContext;
      },
      set _activeContext(val) {
        sb.activeContext = val;
      },
      getLanguage: () => appLanguage,
      get config() {
        return sandboxAPI.getConfig();
      },
      getConfig: (key) => {
        const merged = { ...(manifest.defaultConfig || {}), ...(sb.env.config || {}) };
        return key ? merged[key] : merged;
      },
      chat: {
        onCommand: (cmd, cb) => {
          if (manifest.permissions?.includes("chat.read") || manifest.permissions?.includes("chat.send")) {
            commandHandlers.set(String(cmd).toLowerCase(), cb);
          } else {
            console.warn(`[SANDBOX] ${pluginId} intentó registrar comando sin permiso chat.read/send`);
          }
        },
        sendMessage: async (msgData) => {
          if (manifest.permissions?.includes("chat.send")) {
            emitHostEvent("chat.sendMessage", {
              msgData,
              activeContext: sb.activeContext,
            });
          } else {
            console.warn(`[SANDBOX] ${pluginId} bloqueado: falta permiso chat.send`);
          }
        },
        clearPluginMessages: async () => {
          if (manifest.permissions?.includes("chat.send")) {
            emitHostEvent("chat.clearPluginMessages", {
              activeContext: sb.activeContext,
            });
          } else {
            console.warn(`[SANDBOX] ${pluginId} bloqueado: falta permiso chat.send para limpiar mensajes`);
          }
        },
      },
      p2p: {
        broadcast: (data) => {
          if (manifest.permissions?.includes("p2p.network")) {
            emitHostEvent("p2p.broadcast", { data });
          } else {
            console.warn(`[SANDBOX] ${pluginId} bloqueado: falta permiso p2p.network`);
          }
        },
        onMessage: (cb) => {
          if (manifest.permissions?.includes("p2p.network")) {
            p2pListeners.add(cb);
          }
        },
      },
      ui: {
        registerPluginIslandWidget: (widgetDef) => {
          if (manifest.permissions?.includes("ui.plugin_island") || manifest.permissions?.includes("ui.custom_widget")) {
            sb.registeredWidgets.push(widgetDef);
            emitHostEvent("ui.registerPluginIslandWidget", { widgetDef });
          } else {
            console.warn(`[SANDBOX] ${pluginId} bloqueado: falta permiso ui.plugin_island`);
          }
        },
        showToast: (message, title = null, type = "info") => {
          emitHostEvent("ui.showToast", { message, title, type });
        },
        registerVoiceControlButton: (btnDef) => {
          if (manifest.permissions?.includes("ui.voice_control_button") || manifest.permissions?.includes("ui.custom_widget")) {
            const btnId = btnDef.id || `btn_${Date.now()}`;
            if (typeof btnDef.onClick === "function") {
              voiceButtonHandlers.set(btnId, btnDef.onClick);
            }
            const cleanDef = {
              id: btnId,
              icon: btnDef.icon,
              tooltip: btnDef.tooltip,
              action: btnDef.action || btnId,
              badge: btnDef.badge || null,
            };
            sb.registeredVoiceButtons.push(cleanDef);
            emitHostEvent("ui.registerVoiceControlButton", { btnDef: cleanDef });
          } else {
            console.warn(`[SANDBOX] ${pluginId} bloqueado: falta permiso ui.voice_control_button`);
          }
        },
        registerRailAction: (actionDef) => {
          if (manifest.permissions?.includes("ui.rail_actions") || manifest.permissions?.includes("ui.custom_widget")) {
            sb.registeredRailActions.push(actionDef);
            emitHostEvent("ui.registerRailAction", { actionDef });
          }
        },
        registerServerSettingsTab: (tabDef) => {
          if (manifest.permissions?.includes("ui.server_settings_tabs") || manifest.permissions?.includes("ui.custom_widget")) {
            sb.registeredServerSettingsTabs.push(tabDef);
            emitHostEvent("ui.registerServerSettingsTab", { tabDef });
          }
        },
        registerCustomView: (viewDef) => {
          if (manifest.permissions?.includes("ui.custom_views") || manifest.permissions?.includes("ui.custom_widget")) {
            sb.registeredCustomViews.push(viewDef);
            emitHostEvent("ui.registerCustomView", { viewDef });
          }
        },
        openStageView: (stageDef) => {
          if (manifest.permissions?.includes("ui.stage_view") || manifest.permissions?.includes("ui.custom_widget")) {
            emitHostEvent("ui.openStageView", {
              stageDef,
              activeContext: sb.activeContext,
            });
          } else {
            console.warn(`[SANDBOX] ${pluginId} bloqueado: falta permiso ui.stage_view`);
          }
        },
        closeStageView: () => {
          emitHostEvent("ui.closeStageView", {});
        },
      },
      stage: {
        onResolveStage: (handler) => {
          if (typeof handler === "function") {
            stageResolvers.push(handler);
          }
        },
      },
      user: {
        getProfile: () => {
          if (!manifest.permissions?.includes("user.profile")) {
            console.warn(`[SANDBOX] ${pluginId} bloqueado: falta permiso user.profile`);
            return null;
          }
          return sb.env.profile;
        },
      },
      server: {
        getInfo: () => {
          if (!manifest.permissions?.includes("server.info")) {
            console.warn(`[SANDBOX] ${pluginId} bloqueado: falta permiso server.info`);
            return null;
          }
          return sb.env.serverInfo;
        },
      },
      gaming: {
        getActivity: () => {
          if (!manifest.permissions?.includes("gaming.activity")) {
            console.warn(`[SANDBOX] ${pluginId} bloqueado: falta permiso gaming.activity`);
            return null;
          }
          return sb.env.gameActivity || { name: null };
        },
        setActivity: (activity) => {
          if (!manifest.permissions?.includes("gaming.activity")) {
            console.warn(`[SANDBOX] ${pluginId} bloqueado: falta permiso gaming.activity`);
            return;
          }
          emitHostEvent("gaming.setActivity", { activity });
        },
        clearActivity: () => {
          if (!manifest.permissions?.includes("gaming.activity")) {
            console.warn(`[SANDBOX] ${pluginId} bloqueado: falta permiso gaming.activity`);
            return;
          }
          emitHostEvent("gaming.clearActivity", {});
        },
      },
      audio: {
        getState: () => {
          if (!manifest.permissions?.includes("audio.state")) {
            console.warn(`[SANDBOX] ${pluginId} bloqueado: falta permiso audio.state`);
            return null;
          }
          return sb.env.audioState || { isConnected: false };
        },
      },
      storage: {
        get: (key) => {
          if (!manifest.permissions?.includes("storage")) {
            console.warn(`[SANDBOX] ${pluginId} bloqueado: falta permiso storage`);
            return null;
          }
          const activeRoomCode = sb.activeContext?.roomCode || sb.env.defaultRoomCode || null;
          const bucket = activeRoomCode ? sb.env.storageRooms[activeRoomCode] || {} : sb.env.storageGlobal || {};
          if (key) {
            return bucket[String(key)] !== undefined ? bucket[String(key)] : null;
          }
          return Object.keys(bucket).length > 0 ? { ...bucket } : null;
        },
        set: (key, val) => {
          if (!manifest.permissions?.includes("storage")) {
            console.warn(`[SANDBOX] ${pluginId} bloqueado: falta permiso storage`);
            return;
          }
          const activeRoomCode = sb.activeContext?.roomCode || sb.env.defaultRoomCode || null;
          if (key) {
            if (activeRoomCode) {
              if (!sb.env.storageRooms[activeRoomCode]) sb.env.storageRooms[activeRoomCode] = {};
              sb.env.storageRooms[activeRoomCode][String(key)] = val;
            } else {
              sb.env.storageGlobal[String(key)] = val;
            }
          }
          emitHostEvent("storage.set", { key, val, activeRoomCode });
        },
      },
      console: {
        log: (...args) => console.log(`[PLUGIN ${manifest.name}]`, ...args),
        warn: (...args) => console.warn(`[PLUGIN ${manifest.name}]`, ...args),
        error: (...args) => console.error(`[PLUGIN ${manifest.name}]`, ...args),
      },
    };

    const safeSetTimeout = hardenHostFn((fn, delay, ...args) => {
      const numericId = ++timerIdCounter;
      const handle = setTimeout(() => {
        activeTimers.delete(handle);
        timerHandleMap.delete(numericId);
        if (typeof fn === "function") fn(...args);
      }, delay);
      activeTimers.add(handle);
      timerHandleMap.set(numericId, handle);
      return numericId;
    });

    const safeClearTimeout = hardenHostFn((id) => {
      const handle = timerHandleMap.get(id) || id;
      timerHandleMap.delete(id);
      activeTimers.delete(handle);
      clearTimeout(handle);
    });

    const safeSetInterval = hardenHostFn((fn, delay, ...args) => {
      const numericId = ++timerIdCounter;
      const handle = setInterval((...a) => {
        if (typeof fn === "function") fn(...a);
      }, delay, ...args);
      activeTimers.add(handle);
      timerHandleMap.set(numericId, handle);
      return numericId;
    });

    const safeClearInterval = hardenHostFn((id) => {
      const handle = timerHandleMap.get(id) || id;
      timerHandleMap.delete(id);
      activeTimers.delete(handle);
      clearInterval(handle);
    });

    hardenHostObject(sandboxAPI);

    const contextObject = Object.create(null);
    contextObject.Onicord = sandboxAPI;
    contextObject.setTimeout = safeSetTimeout;
    contextObject.clearTimeout = safeClearTimeout;
    contextObject.setInterval = safeSetInterval;
    contextObject.clearInterval = safeClearInterval;

    if (manifest.permissions?.includes("network.outbound")) {
      const rawFetch = global.fetch;
      contextObject.fetch = hardenHostFn((url, opts) => rawFetch(url, opts));
    }

    const context = vm.createContext(contextObject, {
      codeGeneration: { strings: false, wasm: false },
    });

    try {
      vm.runInContext(code || "", context, { filename: manifest.main || "index.js", timeout: 5000 });
      this.sandboxes.set(pluginId, sb);
      return {
        ok: true,
        commandNames: Array.from(commandHandlers.keys()),
        hasStageResolver: stageResolvers.length > 0,
      };
    } catch (err) {
      for (const timer of activeTimers) {
        clearTimeout(timer);
        clearInterval(timer);
      }
      activeTimers.clear();
      timerHandleMap.clear();
      console.error(`[SANDBOX] Error ejecutando complemento ${manifest.name}:`, err);
      return { ok: false, error: err?.message || String(err) };
    }
  }

  async triggerVoiceButton({ pluginId, buttonId, data, envSnapshot }) {
    const sb = this.sandboxes.get(pluginId);
    if (!sb) return false;
    this._updateEnv(sb, envSnapshot);
    if (sb.voiceButtonHandlers.has(buttonId)) {
      await sb.voiceButtonHandlers.get(buttonId)(data);
    }
    return true;
  }

  async handleCommand({ pluginId, cmd, args, author, activeContext, envSnapshot }) {
    const sb = this.sandboxes.get(pluginId);
    if (!sb || !sb.commandHandlers.has(cmd)) return false;
    this._updateEnv(sb, envSnapshot, activeContext);
    const handler = sb.commandHandlers.get(cmd);
    await handler(args, { author });
    return true;
  }

  resolveStage({ pluginId, stageDef, envSnapshot }) {
    const sb = this.sandboxes.get(pluginId);
    if (!sb || sb.stageResolvers.length === 0) return stageDef;
    this._updateEnv(sb, envSnapshot);
    let resolvedStage = stageDef;
    for (const resolver of sb.stageResolvers) {
      try {
        const resolved = resolver(stageDef);
        if (resolved && typeof resolved === "object") {
          resolvedStage = {
            ...resolved,
            ...stageDef,
            frameScripts:
              Array.isArray(resolved.frameScripts) && resolved.frameScripts.length > 0
                ? resolved.frameScripts
                : stageDef?.frameScripts,
            shareCapture: resolved.shareCapture || stageDef?.shareCapture,
          };
        }
      } catch (e) {
        console.error(`[SANDBOX] Error executing stage resolver for ${pluginId}:`, e);
      }
    }
    return resolvedStage;
  }

  handleP2PMessage({ pluginId, sender, data, envSnapshot }) {
    const sb = this.sandboxes.get(pluginId);
    if (!sb) return;
    this._updateEnv(sb, envSnapshot);
    for (const listener of sb.p2pListeners) {
      try {
        listener(sender, data);
      } catch (err) {
        console.error(`[SANDBOX] Error en listener P2P de complemento ${pluginId}:`, err);
      }
    }
  }
}

const host = new PluginHostProcess();

if (process.parentPort) {
  process.parentPort.on("message", async (event) => {
    const msg = event?.data || event;
    if (!msg || typeof msg !== "object") return;

    const reply = (result, error = null) => {
      if (!msg.reqId) return;
      postToMain({
        type: "rpc-response",
        reqId: msg.reqId,
        result,
        error,
      });
    };

    try {
      if (msg.type === "run-plugin") {
        const res = host.runPlugin(msg);
        reply(res);
      } else if (msg.type === "unload-plugin") {
        host.unloadPlugin(msg.pluginId);
        reply(true);
      } else if (msg.type === "trigger-voice-btn") {
        const res = await host.triggerVoiceButton(msg);
        reply(res);
      } else if (msg.type === "handle-command") {
        const res = await host.handleCommand(msg);
        reply(res);
      } else if (msg.type === "resolve-stage") {
        const res = host.resolveStage(msg);
        reply(res);
      } else if (msg.type === "p2p-message") {
        host.handleP2PMessage(msg);
        reply(true);
      } else if (msg.type === "shutdown") {
        for (const id of Array.from(host.sandboxes.keys())) {
          host.unloadPlugin(id);
        }
        reply(true);
        process.exit(0);
      }
    } catch (err) {
      reply(null, err?.message || String(err));
    }
  });
}
