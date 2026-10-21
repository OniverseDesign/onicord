const { app } = require("electron");
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const pluginService = require("./pluginService.cjs");

function resolvePluginAvatar(avatarProp, pluginId) {
  return pluginService.resolvePluginIcon(avatarProp, pluginId);
}

class PluginSandboxService {
  constructor() {
    this.activeSandboxes = new Map(); // pluginId -> { context, manifest, widgets, commandHandlers, p2pListeners }
    global.pluginSandboxService = this;
  }

  unloadPlugin(pluginId, ipcBroadcaster) {
    if (!pluginId) return;
    const broadcaster = ipcBroadcaster || this.ipcBroadcaster;
    let deleted = false;
    for (const [key, sandbox] of this.activeSandboxes.entries()) {
      if (key === pluginId || sandbox?.manifest?.id === pluginId) {
        this.activeSandboxes.delete(key);
        deleted = true;
        console.log(`[SANDBOX] Desactivado e inhabilitado el complemento: ${key}`);
      }
    }
    if (deleted && broadcaster) {
      broadcaster("plugins:widgets-updated", this.getAllPluginIslandWidgets());
      broadcaster("plugins:commands-updated", this.getAllPluginCommands());
      broadcaster("plugins:dashboard-widgets-updated", this.getRegisteredDashboardWidgets());
      broadcaster("plugins:voice-control-buttons-updated", this.getAllVoiceControlButtons());
    }
  }

  async loadAndRunPlugins(ipcBroadcaster, p2pBroadcaster) {
    if (ipcBroadcaster) this.ipcBroadcaster = ipcBroadcaster;
    const plugins = await pluginService.listPlugins();
    
    for (const plugin of plugins) {
      if (plugin.enabled !== false) {
        this.runPlugin(plugin, ipcBroadcaster, p2pBroadcaster);
      }
    }
  }

  runPlugin(manifest, ipcBroadcaster, p2pBroadcaster) {
    if (ipcBroadcaster) this.ipcBroadcaster = ipcBroadcaster;
    const pluginId = manifest.id;
    if (this.activeSandboxes.has(pluginId)) {
      this.unloadPlugin(pluginId);
    }

    const pluginDir = pluginService.getPluginPath(pluginId);
    const mainFile = path.join(pluginDir, manifest.main || "index.js");

    if (!fs.existsSync(mainFile)) {
      console.warn(`[SANDBOX] El complemento ${pluginId} no tiene archivo principal: ${mainFile}`);
      return;
    }

    const code = fs.readFileSync(mainFile, "utf-8");

    const widgets = [];
    const voiceButtons = [];
    const voiceButtonHandlers = new Map();
    const commandHandlers = new Map();
    const p2pListeners = new Set();

    if (Array.isArray(manifest.voiceControlButtons)) {
      for (const btn of manifest.voiceControlButtons) {
        voiceButtons.push({
          id: btn.id || `btn_${Date.now()}`,
          pluginId,
          pluginName: manifest.name,
          icon: btn.icon || "sports_esports",
          tooltip: btn.tooltip || manifest.name,
          action: btn.action || btn.id,
        });
      }
    }

    // Idioma por defecto del sistema
    const appLanguage = (app.getLocale ? app.getLocale() : "es").split("-")[0] || "es";

    // Crear API aislada Onicord Sandbox
    const sandboxAPI = {
      manifest,
      language: appLanguage,
      getLanguage: () => appLanguage,
      get config() {
        return sandboxAPI.getConfig();
      },
      getConfig: (key) => {
        let serverConfig = null;
        try {
          const rCode = sandboxAPI._activeContext?.roomCode || global.roomManager?.roomCode;
          if (rCode) {
            const serverService = require("./serverService.cjs");
            const serverStore = serverService.getServerStore();
            const server = serverStore.getServerByRoomCodeSync(rCode);
            const sp = server?.plugins?.find(
              (p) =>
                p.id === pluginId ||
                p.id === manifest.id ||
                (p.id && pluginId && (p.id.includes(pluginId) || pluginId.includes(p.id))) ||
                (p.name && manifest.name && p.name.toLowerCase() === manifest.name.toLowerCase())
            );
            if (sp?.config) serverConfig = sp.config;
          }
        } catch (e) {}
        const merged = { ...(manifest.defaultConfig || {}), ...(serverConfig || {}) };
        return key ? merged[key] : merged;
      },
      chat: {
        onCommand: (cmd, cb) => {
          if (manifest.permissions?.includes("chat.read") || manifest.permissions?.includes("chat.send")) {
            commandHandlers.set(cmd.toLowerCase(), cb);
          } else {
            console.warn(`[SANDBOX] ${pluginId} intentó registrar comando sin permiso chat.read/send`);
          }
        },
        sendMessage: async (msgData) => {
          if (manifest.permissions?.includes("chat.send")) {
            const ctx = sandboxAPI._activeContext || {};
            const rCode = ctx.roomCode || global.roomManager?.roomCode;
            const cId = ctx.channelId || "general";
            const isRoomActive = global.roomManager && rCode && (
              global.roomManager.roomCode === rCode ||
              global.roomManager.rooms?.has(rCode) ||
              global.roomManager.chatService?._isActiveRoom?.(rCode)
            );

            if (isRoomActive) {
              try {
                const cryptoService = require("./cryptoService.cjs");
                const reqId = ctx.requestMessageId || "direct";
                const plainText = msgData.text || msgData.content || "";
                const encryptedText = cryptoService.encrypt(rCode, plainText);
                const msgObj = {
                  id: `plugin-res-${reqId}-${pluginId}`,
                  roomCode: rCode,
                  channelId: cId,
                  isComplement: true,
                  complementName: msgData.complementName || manifest.name || "Complemento",
                  complementId: manifest.id,
                  text: encryptedText,
                  linkUrl: msgData.linkUrl || msgData.url || null,
                  timestamp: ctx.requestMessageTimestamp ? ctx.requestMessageTimestamp + 1 : Date.now(),
                  authorId: `bot_${pluginId}`,
                  authorNickname: msgData.complementName || manifest.name || "Complemento",
                  authorAvatar: resolvePluginAvatar(
                    msgData.avatar || manifest.icon || manifest.avatar,
                    pluginId,
                  ),
                  triggerUserId: ctx.requestMessageAuthorId || null,
                };
                if (global.roomManager.chatService) {
                  await global.roomManager.chatService.persistAndEmit(msgObj, rCode);
                  global.roomManager.chatService.p2p._broadcast("chat", msgObj);
                }
              } catch (err) {
                console.error("[SANDBOX] Error persisting plugin message:", err);
              }
            } else {
              if (ipcBroadcaster) {
                ipcBroadcaster("plugins:chat-message-outbound", { pluginId, message: msgData });
              }
            }
          } else {
            console.warn(`[SANDBOX] ${pluginId} bloqueado: falta permiso chat.send`);
          }
        },
        clearPluginMessages: async () => {
          if (manifest.permissions?.includes("chat.send")) {
            const ctx = sandboxAPI._activeContext || {};
            const rCode = ctx.roomCode || global.roomManager?.roomCode;
            const cId = ctx.channelId || "general";
            const triggerUserId = ctx.requestMessageAuthorId || global.roomManager?.p2pService?.profile?.id;

            if (global.roomManager && global.roomManager.chatService && triggerUserId && rCode) {
              try {
                const history = await global.roomManager.chatService.getChatHistory(rCode, cId);
                const toDelete = history.filter((msg) => 
                  msg && 
                  msg.isComplement && 
                  (msg.complementId === manifest.id || msg.complementName === manifest.name) &&
                  msg.triggerUserId === triggerUserId
                );
                for (const msg of toDelete) {
                  await global.roomManager.chatService.deleteChatMessage(cId, msg.id, rCode);
                }
                console.log(`[SANDBOX] Limpiados ${toDelete.length} mensajes del complemento ${manifest.name} solicitados por el usuario ${triggerUserId}`);
              } catch (err) {
                console.error("[SANDBOX] Error clearing plugin messages from history:", err);
              }
            }
            if (ipcBroadcaster) {
              ipcBroadcaster("plugins:chat-clear-outbound", { pluginId, triggerUserId });
            }
          } else {
            console.warn(`[SANDBOX] ${pluginId} bloqueado: falta permiso chat.send para limpiar mensajes`);
          }
        }
      },
      p2p: {
        broadcast: (data) => {
          if (manifest.permissions?.includes("p2p.network")) {
            if (p2pBroadcaster) {
              p2pBroadcaster({ pluginId, data });
            }
          } else {
            console.warn(`[SANDBOX] ${pluginId} bloqueado: falta permiso p2p.network`);
          }
        },
        onMessage: (cb) => {
          if (manifest.permissions?.includes("p2p.network")) {
            p2pListeners.add(cb);
          }
        }
      },
      ui: {
        registerPluginIslandWidget: (widgetDef) => {
          if (manifest.permissions?.includes("ui.plugin_island") || manifest.permissions?.includes("ui.custom_widget")) {
            const pluginsDir = pluginService.getPluginsDir ? pluginService.getPluginsDir() : "";
            const pluginDir = (pluginService.findPluginDir && pluginService.findPluginDir(pluginId)) || (pluginsDir ? path.join(pluginsDir, pluginId) : "");
            let entryUrl = "";
            let htmlContent = "";
            if (widgetDef.entryPoint && pluginDir) {
              const entryPath = path.join(pluginDir, widgetDef.entryPoint);
              try {
                entryUrl = `file://${entryPath.replace(/\\/g, "/")}`;
                if (fs.existsSync(entryPath)) {
                  htmlContent = fs.readFileSync(entryPath, "utf-8");
                }
              } catch (err) {
                console.error(`[SANDBOX] Error reading island widget HTML ${entryPath}:`, err.message);
              }
            }
            const resolvedIcon = (pluginService.resolvePluginIcon && pluginService.resolvePluginIcon(manifest.icon, pluginId)) || manifest.icon || null;
            const locDesc = (manifest.locales && manifest.locales[appLanguage] && manifest.locales[appLanguage].description) || manifest.description || "";
            const locName = (manifest.locales && manifest.locales[appLanguage] && manifest.locales[appLanguage].name) || manifest.name || "Complemento";

            widgets.push({
              ...widgetDef,
              pluginId,
              pluginName: locName,
              icon: resolvedIcon,
              description: locDesc,
              permissions: manifest.permissions || [],
              entryUrl,
              htmlContent,
            });
            if (ipcBroadcaster) {
              ipcBroadcaster("plugins:widgets-updated", this.getAllPluginIslandWidgets());
            }
          } else {
            console.warn(`[SANDBOX] ${pluginId} bloqueado: falta permiso ui.plugin_island`);
          }
        },
        showToast: (message) => {
          if (ipcBroadcaster) {
            ipcBroadcaster("plugins:show-toast", { pluginId, message });
          }
        },
        registerVoiceControlButton: (btnDef) => {
          if (manifest.permissions?.includes("ui.voice_control_button") || manifest.permissions?.includes("ui.custom_widget")) {
            const locName = (manifest.locales && manifest.locales[appLanguage] && manifest.locales[appLanguage].name) || manifest.name || "Complemento";
            let resolvedIcon = btnDef.icon || manifest.icon || "extension";
            if (pluginService.resolvePluginIcon && typeof resolvedIcon === "string" && (resolvedIcon.includes("/") || resolvedIcon.includes("\\") || resolvedIcon.endsWith(".svg") || resolvedIcon.endsWith(".png"))) {
              const fileIcon = pluginService.resolvePluginIcon(resolvedIcon, pluginId);
              if (fileIcon) resolvedIcon = fileIcon;
            }
            const btnObj = {
              id: btnDef.id || `btn_${Date.now()}`,
              pluginId,
              pluginName: locName,
              icon: resolvedIcon,
              tooltip: btnDef.tooltip || locName,
              action: btnDef.action || btnDef.id,
              badge: btnDef.badge || null,
            };
            const existingIdx = voiceButtons.findIndex((b) => b.id === btnObj.id);
            if (existingIdx >= 0) {
              voiceButtons[existingIdx] = { ...voiceButtons[existingIdx], ...btnObj };
            } else {
              voiceButtons.push(btnObj);
            }
            if (typeof btnDef.onClick === "function") {
              voiceButtonHandlers.set(btnObj.id, btnDef.onClick);
            }
            if (ipcBroadcaster) {
              ipcBroadcaster("plugins:voice-control-buttons-updated", this.getAllVoiceControlButtons());
            }
          } else {
            console.warn(`[SANDBOX] ${pluginId} bloqueado: falta permiso ui.voice_control_button`);
          }
        },
        openStageView: (stageDef) => {
          if (manifest.permissions?.includes("ui.stage_view") || manifest.permissions?.includes("ui.custom_widget")) {
            const pluginsDir = pluginService.getPluginsDir ? pluginService.getPluginsDir() : "";
            const pluginDir = (pluginService.findPluginDir && pluginService.findPluginDir(pluginId)) || (pluginsDir ? path.join(pluginsDir, pluginId) : "");
            let htmlContent = stageDef?.htmlContent || "";
            if (stageDef?.entryPoint && pluginDir) {
              const entryPath = path.join(pluginDir, stageDef.entryPoint);
              try {
                if (fs.existsSync(entryPath)) {
                  htmlContent = fs.readFileSync(entryPath, "utf-8");
                  const widgetDir = path.dirname(entryPath);
                  const baseHref = `onicord-media://win-disk/${widgetDir.replace(/\\/g, "/")}/`;
                  if (!htmlContent.includes("<base ") && htmlContent.includes("<head>")) {
                    htmlContent = htmlContent.replace("<head>", `<head>\n  <base href="${baseHref}">`);
                  }
                }
              } catch (err) {
                console.error(`[SANDBOX] Error reading stage entryPoint HTML ${entryPath}:`, err.message);
              }
            }

            const enriched = {
              pluginId,
              ...stageDef,
              htmlContent: htmlContent || stageDef?.htmlContent || undefined,
            };
            global.activeStageDef = enriched;
            let scripts = Array.isArray(enriched?.frameScripts) ? [...enriched.frameScripts] : [];
            const bridgeScript = `
              try {
                window.onicord = window.onicord || {};
                if (!window.onicord.confirm) {
                  window.onicord.confirm = function(opts) {
                    return new Promise(function(resolve) {
                      var reqId = "req_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
                      function onMsg(ev) {
                        if (ev.data && ev.data.type === "ONICORD_CONFIRM_RESPONSE" && ev.data.requestId === reqId) {
                          window.removeEventListener("message", onMsg);
                          resolve(Boolean(ev.data.confirmed));
                        }
                      }
                      window.addEventListener("message", onMsg);
                      window.parent.postMessage(Object.assign({
                        type: "ONICORD_REQUEST_CONFIRM",
                        requestId: reqId
                      }, opts || {}), "*");
                    });
                  };
                }
              } catch (_) {}
            `;
            scripts.unshift(bridgeScript);
            const nick = enriched?.userNick || enriched?.authorName;
            if (nick && typeof nick === "string" && nick.trim()) {
              scripts.unshift(`window._onicordUserNick = ${JSON.stringify(nick.trim().slice(0, 20))};`);
            }
            global.currentStageScripts = scripts;

            if (ipcBroadcaster) {
              ipcBroadcaster("plugins:open-stage-view", enriched);
            }
          } else {
            console.warn(`[SANDBOX] ${pluginId} bloqueado: falta permiso ui.stage_view`);
          }
        },
        closeStageView: () => {
          global.activeStageDef = null;
          global.currentStageScripts = [];
          if (ipcBroadcaster) {
            ipcBroadcaster("plugins:close-stage-view", { pluginId });
          }
        }
      },
      user: {
        getProfile: () => {
          if (!manifest.permissions?.includes("user.profile")) {
            console.warn(`[SANDBOX] ${pluginId} bloqueado: falta permiso user.profile`);
            return null;
          }
          if (global.roomManager?.p2pService?.profile) {
            const p = global.roomManager.p2pService.profile;
            return { nickname: p.nickname, avatar: p.avatar, id: p.id };
          }
          return null;
        },
      },
      server: {
        getInfo: () => {
          if (!manifest.permissions?.includes("server.info")) {
            console.warn(`[SANDBOX] ${pluginId} bloqueado: falta permiso server.info`);
            return null;
          }
          if (global.roomManager) {
            return {
              roomCode: global.roomManager.roomCode,
              serverName: global.roomManager.serverName || "Servidor",
            };
          }
          return null;
        },
      },
      gaming: {
        getActivity: () => {
          if (!manifest.permissions?.includes("gaming.activity")) {
            console.warn(`[SANDBOX] ${pluginId} bloqueado: falta permiso gaming.activity`);
            return null;
          }
          return global.activeGameActivity || { name: null };
        },
        setActivity: (activity) => {
          if (!manifest.permissions?.includes("gaming.activity")) {
            console.warn(`[SANDBOX] ${pluginId} bloqueado: falta permiso gaming.activity`);
            return;
          }
          try {
            const { setRpcActivity } = require("../gameScanner.cjs");
            const resolvedIcon = (pluginService.resolvePluginIcon && pluginService.resolvePluginIcon(manifest.icon, pluginId)) || manifest.icon || null;
            const locName = (manifest.locales && manifest.locales[appLanguage] && manifest.locales[appLanguage].name) || manifest.name || "Complemento";
            setRpcActivity({
              ...activity,
              source: `addon:${pluginId}`,
              smallCover: activity.smallCover !== undefined ? activity.smallCover : resolvedIcon,
              smallText: activity.smallText || locName,
              details: activity.details || locName,
            });
          } catch (err) {
            console.error(`[SANDBOX] Error seteando actividad para ${pluginId}:`, err);
          }
        },
        clearActivity: () => {
          if (!manifest.permissions?.includes("gaming.activity")) {
            console.warn(`[SANDBOX] ${pluginId} bloqueado: falta permiso gaming.activity`);
            return;
          }
          try {
            const { clearRpcActivity } = require("../gameScanner.cjs");
            clearRpcActivity();
          } catch (err) {
            console.error(`[SANDBOX] Error limpiando actividad para ${pluginId}:`, err);
          }
        },
      },
      audio: {
        getState: () => {
          if (!manifest.permissions?.includes("audio.state")) {
            console.warn(`[SANDBOX] ${pluginId} bloqueado: falta permiso audio.state`);
            return null;
          }
          if (global.roomManager?.voiceService) {
            return global.roomManager.voiceService.getVoiceState?.() || { isConnected: true };
          }
          return { isConnected: false };
        },
      },
      storage: {
        get: (key) => {
          if (!manifest.permissions?.includes("storage")) {
            console.warn(`[SANDBOX] ${pluginId} bloqueado: falta permiso storage`);
            return null;
          }
          return pluginService.getPluginStorage(pluginId, key);
        },
        set: (key, val) => {
          if (!manifest.permissions?.includes("storage")) {
            console.warn(`[SANDBOX] ${pluginId} bloqueado: falta permiso storage`);
            return;
          }
          pluginService.setPluginStorage(pluginId, key, val);
        },
      },
      console: {
        log: (...args) => console.log(`[PLUGIN ${manifest.name}]`, ...args),
        warn: (...args) => console.warn(`[PLUGIN ${manifest.name}]`, ...args),
        error: (...args) => console.error(`[PLUGIN ${manifest.name}]`, ...args)
      }
    };

    // Contexto aislado (VM Sandbox)
    const contextObject = {
      Onicord: sandboxAPI,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      Math,
      Date,
      JSON,
      Array,
      Object,
      String,
      Number,
      Boolean,
      encodeURIComponent,
      decodeURIComponent,
    };

    if (manifest.permissions?.includes("network.outbound")) {
      contextObject.fetch = global.fetch || require("node-fetch");
    }

    const context = vm.createContext(contextObject);

    try {
      vm.runInContext(code, context, { filename: manifest.main || "index.js", timeout: 5000 });
      this.activeSandboxes.set(pluginId, {
        context,
        manifest,
        widgets,
        voiceButtons,
        voiceButtonHandlers,
        commandHandlers,
        p2pListeners,
      });
      console.log(`[SANDBOX] Complemento ${manifest.name} iniciado correctamente.`);
      if (ipcBroadcaster) {
        ipcBroadcaster("plugins:widgets-updated", this.getAllPluginIslandWidgets());
        ipcBroadcaster("plugins:commands-updated", this.getAllPluginCommands());
        ipcBroadcaster("plugins:dashboard-widgets-updated", this.getRegisteredDashboardWidgets());
        ipcBroadcaster("plugins:voice-control-buttons-updated", this.getAllVoiceControlButtons());
      }
    } catch (err) {
      console.error(`[SANDBOX] Error ejecutando complemento ${manifest.name}:`, err);
    }
  }

  getAllPluginCommands() {
    const commands = [];
    for (const [pluginId, sandbox] of this.activeSandboxes) {
      const rawIcon = sandbox.manifest?.icon || sandbox.manifest?.avatar || null;
      const icon = resolvePluginAvatar(rawIcon, pluginId);
      const locales = sandbox.manifest?.locales || null;
      if (Array.isArray(sandbox.manifest?.commands)) {
        for (const cmdObj of sandbox.manifest.commands) {
          commands.push({
            ...cmdObj,
            pluginId,
            pluginName: sandbox.manifest.name,
            locales,
            icon,
          });
        }
      } else {
        for (const [cmdName] of sandbox.commandHandlers) {
          commands.push({
            command: `/${cmdName}`,
            description: `Executes ${sandbox.manifest.name} plugin functionality`,
            pluginId,
            pluginName: sandbox.manifest.name,
            locales,
            icon,
          });
        }
      }
    }
    return commands;
  }

  getAllPluginIslandWidgets() {
    const allWidgets = [];
    const pluginsDir = pluginService.getPluginsDir ? pluginService.getPluginsDir() : "";
    for (const [pluginId, sandbox] of this.activeSandboxes) {
      const manifest = sandbox.manifest || {};
      for (const w of sandbox.widgets) {
        if (w.entryPoint && !w.htmlContent && pluginsDir) {
          const pluginDir = (pluginService.findPluginDir && pluginService.findPluginDir(pluginId)) || path.join(pluginsDir, pluginId);
          const entryPath = path.join(pluginDir, w.entryPoint);
          try {
            w.entryUrl = `file://${entryPath.replace(/\\/g, "/")}`;
            if (fs.existsSync(entryPath)) {
              w.htmlContent = fs.readFileSync(entryPath, "utf-8");
            }
          } catch (err) {
            console.error(`[SANDBOX] Error reading island widget HTML ${entryPath}:`, err.message);
          }
        }
        if (!w.permissions) {
          w.permissions = manifest.permissions || [];
        }
        if (!w.icon) {
          w.icon = (pluginService.resolvePluginIcon && pluginService.resolvePluginIcon(manifest.icon, pluginId)) || manifest.icon || null;
        }
        if (!w.description) {
          w.description = (manifest.locales && manifest.locales.es && manifest.locales.es.description) || manifest.description || "";
        }
        if (!w.pluginName) {
          w.pluginName = (manifest.locales && manifest.locales.es && manifest.locales.es.name) || manifest.name || "Complemento";
        }
        allWidgets.push(w);
      }
    }
    return allWidgets;
  }

  getRegisteredDashboardWidgets() {
    const allWidgets = [];
    const pluginsDir = pluginService.getPluginsDir();

    for (const [pluginId, sandbox] of this.activeSandboxes) {
      const manifest = sandbox.manifest || {};
      if (Array.isArray(manifest.dashboardWidgets)) {
        const pluginDir = pluginService.findPluginDir(pluginId) || path.join(pluginsDir, pluginId);
        for (const w of manifest.dashboardWidgets) {
          const fullId = `${pluginId}:${w.id}`;
          const entryPath = path.join(pluginDir, w.entryPoint || "index.html");
          let entryUrl = "";
          let htmlContent = "";
          try {
            entryUrl = `file://${entryPath.replace(/\\/g, "/")}`;
            if (fs.existsSync(entryPath)) {
              htmlContent = fs.readFileSync(entryPath, "utf-8");
            }
          } catch (err) {
            console.error(`[pluginSandboxService] Error reading widget HTML file ${entryPath}:`, err.message);
          }

          allWidgets.push({
            fullId,
            pluginId,
            widgetId: w.id,
            title: w.title || manifest.name || "Widget",
            badgeText: w.badgeText || "Addon",
            type: w.type || "local",
            bgVariant: w.bgVariant || "dark",
            entryUrl,
            htmlContent,
            defaultGeo: w.defaultGeo || { x: 1, y: 1, w: 2, h: 2 },
            permissions: manifest.permissions || [],
          });
        }
      }
    }
    return allWidgets;
  }

  getAllVoiceControlButtons() {
    const allButtons = [];
    const seen = new Set();
    for (const [pluginId, sandbox] of this.activeSandboxes) {
      if (Array.isArray(sandbox.voiceButtons)) {
        for (const btn of sandbox.voiceButtons) {
          const key = `${pluginId}:${btn.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            allButtons.push({
              ...btn,
              pluginId,
              pluginName: sandbox.manifest?.name || btn.pluginName,
            });
          }
        }
      }
    }
    return allButtons;
  }

  async triggerVoiceControlButton(pluginId, buttonId, data, broadcastToAll) {
    const sandbox = this.activeSandboxes.get(pluginId);
    if (!sandbox) return false;
    if (broadcastToAll) {
      broadcastToAll("plugins:voice-control-button-triggered", { pluginId, buttonId, data });
    }
    if (sandbox.voiceButtonHandlers && sandbox.voiceButtonHandlers.has(buttonId)) {
      try {
        await sandbox.voiceButtonHandlers.get(buttonId)(data);
      } catch (err) {
        console.error(`[SANDBOX] Error en handler de botón de voz (${pluginId}:${buttonId}):`, err);
      }
    }
    return true;
  }

  handleIncomingWidgetP2PData(senderPeerId, payload) {
    if (!global.mainWindow || global.mainWindow.isDestroyed()) return;
    const { pluginId, widgetId, data } = payload || {};
    if (pluginId) {
      global.mainWindow.webContents.send("onicord:widget-p2p-data", {
        fullId: widgetId ? `${pluginId}:${widgetId}` : pluginId,
        pluginId,
        widgetId: widgetId || "",
        senderPeerId,
        data,
      });
    }
  }

  handleChatMessage(text, author, ipcBroadcaster, roomCode, channelId) {
    if (!text || !text.startsWith("/")) return false;
    const parts = text.slice(1).split(" ");
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    const serverService = require("./serverService.cjs");
    const serverStore = serverService.getServerStore();
    const server = roomCode ? serverStore.getServerByRoomCodeSync(roomCode) : null;

    for (const [pluginId, sandbox] of this.activeSandboxes) {
      if (sandbox.commandHandlers.has(cmd)) {
        try {
          if (sandbox.context && sandbox.context.Onicord) {
            sandbox.context.Onicord._activeContext = { roomCode, channelId };
          }
          const handler = sandbox.commandHandlers.get(cmd);
          handler(args, { author });
        } catch (err) {
          console.error(`[SANDBOX] Error ejecutando comando /${cmd} en complemento ${pluginId}:`, err);
        }
      }
    }
  }

  async processLiveChatMessage(message) {
    if (!message || !message.text) return;
    const text = message.text.trim();
    console.log(`[SANDBOX] processLiveChatMessage evaluando: "${text}" en sala: "${message.roomCode}". Sandboxes activas: ${this.activeSandboxes.size}`);

    const parts = text.split(/\s+/);
    if (!parts[0]) return;
    const rawCmd = parts[0].toLowerCase().replace(/^\/+/, "");
    const matchedArgs = parts.slice(1);

    if (!rawCmd) return;

    const author = {
      id: message.authorId,
      nickname: message.authorNickname || "Usuario",
      avatar: message.authorAvatar || null,
    };

    const serverService = require("./serverService.cjs");
    const serverStore = serverService.getServerStore();
    const server = message.roomCode ? serverStore.getServerByRoomCodeSync(message.roomCode) : null;

    for (const [pluginId, sandbox] of this.activeSandboxes) {
      const manifestId = sandbox.manifest?.id;
      const manifestName = sandbox.manifest?.name;

      let sp = null;
      let isEnabled = false;

      if (server && Array.isArray(server.plugins) && server.plugins.length > 0) {
        sp = server.plugins.find(
          (p) =>
            p.id === pluginId ||
            p.id === manifestId ||
            (p.id && pluginId && (p.id.includes(pluginId) || pluginId.includes(p.id))) ||
            (p.name && manifestName && p.name.toLowerCase() === manifestName.toLowerCase())
        );
        if (sp) {
          isEnabled = sp.enabled !== false;
        }
      }

      if (!isEnabled) {
        continue;
      }

      console.log(`[SANDBOX] Evaluando complemento ${pluginId}: buscando comando "/${rawCmd}". Manejadores disponibles:`, Array.from(sandbox.commandHandlers.keys()));

      if (sandbox.commandHandlers.has(rawCmd)) {
        console.log(`[SANDBOX] Ejecutando manejador "/${rawCmd}" para el complemento ${pluginId}...`);
        try {
          if (sandbox.context && sandbox.context.Onicord) {
            sandbox.context.Onicord._activeContext = {
              roomCode: message.roomCode,
              channelId: message.channelId || "general",
              requestMessageId: message.id,
              requestMessageTimestamp: message.timestamp,
              requestMessageAuthorId: message.authorId,
            };
          }
          const handler = sandbox.commandHandlers.get(rawCmd);
          await handler(matchedArgs, { author });
          console.log(`[SANDBOX] ✅ Comando "/${rawCmd}" finalizado para complemento ${pluginId}.`);
        } catch (err) {
          console.error(`[SANDBOX] ❌ Error ejecutando comando en complemento ${pluginId}:`, err);
        }
      }
    }
  }

  handleP2PPluginMessage(senderPeerId, payload) {
    const { pluginId, data } = payload || {};
    if (!pluginId || !this.activeSandboxes.has(pluginId)) return;

    // Verificar si el servidor activo tiene este complemento habilitado
    try {
      const roomCode = global.roomManager?.roomCode;
      if (roomCode) {
        const serverService = require("./serverService.cjs");
        const serverStore = serverService.getServerStore();
        const server = serverStore.getServerByRoomCodeSync(roomCode);
        if (!server || !Array.isArray(server.plugins)) return;
        const sp = server.plugins.find(
          (p) =>
            p.id === pluginId ||
            (p.id && (p.id.includes(pluginId) || pluginId.includes(p.id)))
        );
        if (!sp || sp.enabled === false) return;
      }
    } catch (e) {}

    const sandbox = this.activeSandboxes.get(pluginId);
    for (const listener of sandbox.p2pListeners) {
      try {
        listener({ id: senderPeerId, name: senderPeerId.slice(0, 6) }, data);
      } catch (err) {
        console.error(`[SANDBOX] Error en listener P2P de complemento ${pluginId}:`, err);
      }
    }
  }
}

module.exports = new PluginSandboxService();
