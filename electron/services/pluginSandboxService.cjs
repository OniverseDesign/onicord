const { app, utilityProcess } = require("electron");
const fs = require("fs");
const path = require("path");
const pluginService = require("./pluginService.cjs");
const profileService = require("./profileService.cjs");
const diagService = require("./diagService.cjs");
const { resolveWorkerPath } = require("../workers/workerRunner.cjs");

function resolvePluginAvatar(avatarProp, pluginId) {
  return pluginService.resolvePluginIcon(avatarProp, pluginId);
}

class PluginSandboxService {
  constructor() {
    this.activeSandboxes = new Map(); // pluginId -> mirror metadata for synchronous getters
    this.ipcBroadcaster = null;
    this.p2pBroadcaster = null;
    this._proc = null;
    this._reqId = 1;
    this._pendingRpc = new Map();
    global.pluginSandboxService = this;
  }

  _ensureProcess() {
    if (this._proc) return this._proc;
    const scriptPath = resolveWorkerPath("pluginHostProcess.cjs");
    const proc = utilityProcess.fork(scriptPath, [], {
      serviceName: "Onicord Plugin Host",
      stdio: "pipe",
    });
    this._proc = proc;

    const readline = require("readline");
    for (const [stream, logFn] of [
      [proc.stdout, console.log],
      [proc.stderr, console.error],
    ]) {
      if (!stream) continue;
      readline
        .createInterface({ input: stream, crlfDelay: Infinity })
        .on("line", (line) => {
          if (line.trim()) logFn(line);
        });
    }

    proc.on("message", (msg) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "rpc-response" && msg.reqId) {
        const pending = this._pendingRpc.get(msg.reqId);
        if (pending) {
          this._pendingRpc.delete(msg.reqId);
          clearTimeout(pending.timer);
          if (msg.error) pending.reject(new Error(msg.error));
          else pending.resolve(msg.result);
        }
      } else if (msg.type === "host-event") {
        this._handleHostEvent(msg.pluginId, msg.eventName, msg.payload);
      }
    });

    proc.on("exit", (code) => {
      if (this._proc === proc) {
        this._proc = null;
      }
      for (const [, pending] of this._pendingRpc) {
        clearTimeout(pending.timer);
        pending.reject(new Error(`PluginHostProcess exited (${code})`));
      }
      this._pendingRpc.clear();
      if (code !== 0 && !global.isQuitting) {
        diagService.log?.("error", "PluginHost", `Plugin host process crashed/exited with code ${code}`);
      }
    });

    return proc;
  }

  _sendRpc(msg, timeoutMs = 10_000) {
    const proc = this._ensureProcess();
    const reqId = this._reqId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingRpc.delete(reqId);
        reject(new Error(`Plugin host RPC timeout (${msg.type})`));
      }, timeoutMs);
      if (typeof timer.unref === "function") timer.unref();
      this._pendingRpc.set(reqId, { resolve, reject, timer });
      proc.postMessage({ ...msg, reqId });
    });
  }

  _getAppLanguage() {
    return (app && typeof app.getLocale === "function" ? app.getLocale() : "es").split("-")[0] || "es";
  }

  _buildEnvSnapshot(manifest, targetRoomCode = null) {
    const pluginId = manifest.id;
    const rCode = targetRoomCode || global.roomManager?.roomCode || null;

    let serverConfig = null;
    try {
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
    } catch {}

    let profile = null;
    try {
      if (manifest.permissions?.includes("user.profile")) {
        const p = global.roomManager?.p2pService?.profile || profileService.activeProfile;
        if (p) {
          profile = {
            nickname: p.nickname || p.username || "Jugador",
            avatar: p.avatar,
            id: p.id,
            username: p.username || p.nickname || "Jugador",
          };
        }
      }
    } catch {}

    let serverInfo = null;
    try {
      if (manifest.permissions?.includes("server.info") && global.roomManager) {
        serverInfo = {
          roomCode: global.roomManager.roomCode,
          serverName: global.roomManager.serverName || "Servidor",
        };
      }
    } catch {}

    let audioState = { isConnected: false };
    try {
      if (manifest.permissions?.includes("audio.state") && global.roomManager?.voiceService) {
        audioState = global.roomManager.voiceService.getVoiceState?.() || { isConnected: true };
      }
    } catch {}

    let storageGlobal = {};
    const storageRooms = {};
    try {
      if (manifest.permissions?.includes("storage")) {
        storageGlobal = pluginService.getPluginStorage(pluginId, null, null) || {};
        if (rCode) {
          storageRooms[rCode] = pluginService.getPluginStorage(pluginId, null, rCode) || {};
        }
      }
    } catch {}

    return {
      config: serverConfig || {},
      profile,
      serverInfo,
      gameActivity: global.activeGameActivity || { name: null },
      audioState,
      storageGlobal,
      storageRooms,
      defaultRoomCode: rCode,
    };
  }

  _handleHostEvent(pluginId, eventName, payload = {}) {
    const sandbox = this.activeSandboxes.get(pluginId);
    if (!sandbox) return;
    const manifest = sandbox.manifest || {};
    const appLanguage = this._getAppLanguage();
    const ipcBroadcaster = this.ipcBroadcaster;
    const p2pBroadcaster = this.p2pBroadcaster;

    if (eventName === "chat.sendMessage") {
      const { msgData, activeContext } = payload;
      const ctx = activeContext || {};
      const rCode = ctx.roomCode || global.roomManager?.roomCode;
      const cId = ctx.channelId || "general";
      const isRoomActive =
        global.roomManager &&
        rCode &&
        (global.roomManager.roomCode === rCode ||
          global.roomManager.rooms?.has(rCode) ||
          global.roomManager.chatService?._isActiveRoom?.(rCode));

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
            authorAvatar: resolvePluginAvatar(msgData.avatar || manifest.icon || manifest.avatar, pluginId),
            triggerUserId: ctx.requestMessageAuthorId || null,
          };
          if (global.roomManager.chatService) {
            global.roomManager.chatService
              .persistAndEmit(msgObj, rCode)
              .then(() => global.roomManager?.chatService?.p2p?._broadcast("chat", msgObj))
              .catch((err) => console.error("[SANDBOX] Error persisting plugin message:", err));
          }
        } catch (err) {
          console.error("[SANDBOX] Error persisting plugin message:", err);
        }
      } else if (ipcBroadcaster) {
        ipcBroadcaster("plugins:chat-message-outbound", { pluginId, message: msgData });
      }
      return;
    }

    if (eventName === "chat.clearPluginMessages") {
      const ctx = payload.activeContext || {};
      const rCode = ctx.roomCode || global.roomManager?.roomCode;
      const cId = ctx.channelId || "general";
      const triggerUserId = ctx.requestMessageAuthorId || global.roomManager?.p2pService?.profile?.id;
      if (global.roomManager && global.roomManager.chatService && triggerUserId && rCode) {
        global.roomManager.chatService
          .getChatHistory(rCode, cId)
          .then(async (history) => {
            const toDelete = history.filter(
              (msg) =>
                msg &&
                msg.isComplement &&
                (msg.complementId === manifest.id || msg.complementName === manifest.name) &&
                msg.triggerUserId === triggerUserId
            );
            for (const msg of toDelete) {
              await global.roomManager.chatService.deleteChatMessage(cId, msg.id, rCode);
            }
          })
          .catch((err) => console.error("[SANDBOX] Error clearing plugin messages:", err));
      }
      if (ipcBroadcaster) {
        ipcBroadcaster("plugins:chat-clear-outbound", { pluginId, triggerUserId });
      }
      return;
    }

    if (eventName === "p2p.broadcast") {
      if (p2pBroadcaster) {
        p2pBroadcaster({ pluginId, data: payload.data });
      }
      return;
    }

    if (eventName === "ui.registerPluginIslandWidget") {
      const widgetDef = payload.widgetDef || {};
      const pluginsDir = pluginService.getPluginsDir ? pluginService.getPluginsDir() : "";
      const pluginDir =
        (pluginService.findPluginDir && pluginService.findPluginDir(pluginId)) ||
        (pluginsDir ? path.join(pluginsDir, pluginId) : "");
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
      const resolvedIcon =
        (pluginService.resolvePluginIcon && pluginService.resolvePluginIcon(manifest.icon, pluginId)) ||
        manifest.icon ||
        null;
      const locDesc =
        (manifest.locales && manifest.locales[appLanguage] && manifest.locales[appLanguage].description) ||
        manifest.description ||
        "";
      const locName =
        (manifest.locales && manifest.locales[appLanguage] && manifest.locales[appLanguage].name) ||
        manifest.name ||
        "Complemento";

      sandbox.widgets.push({
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
      return;
    }

    if (eventName === "ui.showToast") {
      if (ipcBroadcaster) {
        const locName =
          (manifest.locales && manifest.locales[appLanguage] && manifest.locales[appLanguage].name) ||
          manifest.name ||
          "Complemento";
        const { message, title, type } = payload;
        const toastTitle = title || locName;
        const toastMsg = typeof message === "string" ? message : message?.text || JSON.stringify(message);
        ipcBroadcaster("plugins:show-toast", {
          pluginId,
          title: toastTitle,
          message: toastMsg,
          type: type || "info",
        });
      }
      return;
    }

    if (eventName === "ui.registerVoiceControlButton") {
      const btnDef = payload.btnDef || {};
      const locName =
        (manifest.locales && manifest.locales[appLanguage] && manifest.locales[appLanguage].name) ||
        manifest.name ||
        "Complemento";
      let resolvedIcon = btnDef.icon || manifest.icon || "extension";
      if (
        pluginService.resolvePluginIcon &&
        typeof resolvedIcon === "string" &&
        (resolvedIcon.includes("/") ||
          resolvedIcon.includes("\\") ||
          resolvedIcon.endsWith(".svg") ||
          resolvedIcon.endsWith(".png"))
      ) {
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
      const existingIdx = sandbox.voiceButtons.findIndex((b) => b.id === btnObj.id);
      if (existingIdx >= 0) {
        sandbox.voiceButtons[existingIdx] = { ...sandbox.voiceButtons[existingIdx], ...btnObj };
      } else {
        sandbox.voiceButtons.push(btnObj);
      }
      if (ipcBroadcaster) {
        ipcBroadcaster("plugins:voice-control-buttons-updated", this.getAllVoiceControlButtons());
      }
      return;
    }

    if (eventName === "ui.registerRailAction") {
      const actionDef = payload.actionDef || {};
      sandbox.railActions.push({
        ...actionDef,
        id: actionDef.id || `rail_${Date.now()}`,
        pluginId,
        pluginName: manifest.name,
      });
      if (ipcBroadcaster) {
        ipcBroadcaster("plugins:rail-actions-updated", this.getAllRailActions());
      }
      return;
    }

    if (eventName === "ui.registerServerSettingsTab") {
      const tabDef = payload.tabDef || {};
      sandbox.serverSettingsTabs.push({
        ...tabDef,
        id: tabDef.id || `tab_${Date.now()}`,
        pluginId,
        pluginName: manifest.name,
      });
      if (ipcBroadcaster) {
        ipcBroadcaster("plugins:server-settings-tabs-updated", this.getAllServerSettingsTabs());
      }
      return;
    }

    if (eventName === "ui.registerCustomView") {
      const viewDef = payload.viewDef || {};
      sandbox.customViews.push({
        ...viewDef,
        id: viewDef.id || `view_${Date.now()}`,
        pluginId,
        pluginName: manifest.name,
      });
      if (ipcBroadcaster) {
        ipcBroadcaster("plugins:custom-views-updated", this.getAllCustomViews());
      }
      return;
    }

    if (eventName === "ui.openStageView") {
      const { stageDef, activeContext } = payload;
      const currentProfile = profileService.activeProfile;
      if (
        activeContext &&
        activeContext.requestMessageAuthorId &&
        currentProfile?.id &&
        activeContext.requestMessageAuthorId !== currentProfile.id
      ) {
        return;
      }
      const pluginsDir = pluginService.getPluginsDir ? pluginService.getPluginsDir() : "";
      const pluginDir =
        (pluginService.findPluginDir && pluginService.findPluginDir(pluginId)) ||
        (pluginsDir ? path.join(pluginsDir, pluginId) : "");
      let htmlContent = stageDef?.htmlContent || "";
      if (stageDef?.entryPoint && pluginDir) {
        const entryPath = path.join(pluginDir, stageDef.entryPoint);
        try {
          if (fs.existsSync(entryPath)) {
            htmlContent = fs.readFileSync(entryPath, "utf-8");
            const widgetDir = path.dirname(entryPath);
            const baseHref = `onicord-media://win-disk/${widgetDir.replace(/\\/g, "/")}/`;
            const fallbackNick =
              profileService.activeProfile?.nickname || profileService.activeProfile?.username || "Oniverse";
            let initialUserNick = stageDef?.userNick || stageDef?.authorName;
            if (!initialUserNick || initialUserNick === "Jugador" || initialUserNick === "PLAYER") {
              initialUserNick = fallbackNick;
            }
            if (htmlContent.includes("<head>")) {
              const headInject = `<head>\n  <base href="${baseHref}">\n  <script>window._onicordUserNick = ${JSON.stringify(initialUserNick)};</script>`;
              htmlContent = htmlContent.replace("<head>", headInject);
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
      const scripts = Array.isArray(enriched?.frameScripts) ? [...enriched.frameScripts] : [];
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
      const fallbackNick =
        profileService.activeProfile?.nickname || profileService.activeProfile?.username || "Oniverse";
      let nick = enriched?.userNick || enriched?.authorName;
      if (!nick || nick === "Jugador" || nick === "PLAYER") {
        nick = fallbackNick;
      }
      if (nick && typeof nick === "string" && nick.trim()) {
        scripts.unshift(`window._onicordUserNick = ${JSON.stringify(nick.trim().slice(0, 20))};`);
      }
      global.currentStageScripts = scripts;
      global.activeStageDef = enriched;
      global.activeStageUrl = enriched?.url || null;
      let stageHost = "";
      if (enriched?.url) {
        try {
          stageHost = new URL(enriched.url).host.toLowerCase();
        } catch (_) {
          stageHost = String(enriched.url).replace(/^https?:\/\//i, "").split("/")[0].toLowerCase();
        }
      }
      global.activeStageHost = stageHost || null;

      if (ipcBroadcaster) {
        ipcBroadcaster("plugins:open-stage-view", enriched);
      }
      return;
    }

    if (eventName === "ui.closeStageView") {
      global.activeStageDef = null;
      global.activeStageUrl = null;
      global.activeStageHost = null;
      global.currentStageScripts = [];
      if (ipcBroadcaster) {
        ipcBroadcaster("plugins:close-stage-view", { pluginId });
      }
      return;
    }

    if (eventName === "gaming.setActivity") {
      try {
        const { setRpcActivity } = require("../gameScanner.cjs");
        const activity = payload.activity || {};
        const resolvedIcon =
          (pluginService.resolvePluginIcon && pluginService.resolvePluginIcon(manifest.icon, pluginId)) ||
          manifest.icon ||
          null;
        const locName =
          (manifest.locales && manifest.locales[appLanguage] && manifest.locales[appLanguage].name) ||
          manifest.name ||
          "Complemento";
        const isMediaAddon =
          pluginId === "onicord-cinema" || manifest.icon === "movie" || activity.type === "movie";
        setRpcActivity({
          ...activity,
          type: isMediaAddon ? "movie" : activity.type || (activity.isCatalog ? "launcher" : "game"),
          source: `addon:${pluginId}`,
          smallCover: activity.smallCover !== undefined ? activity.smallCover : resolvedIcon,
          smallText: activity.smallText || locName,
          details: activity.details || locName,
        });
      } catch (err) {
        console.error(`[SANDBOX] Error seteando actividad para ${pluginId}:`, err);
      }
      return;
    }

    if (eventName === "gaming.clearActivity") {
      try {
        const { clearRpcActivity } = require("../gameScanner.cjs");
        clearRpcActivity();
      } catch (err) {
        console.error(`[SANDBOX] Error limpiando actividad para ${pluginId}:`, err);
      }
      return;
    }

    if (eventName === "storage.set") {
      pluginService.setPluginStorage(pluginId, payload.key, payload.val, payload.activeRoomCode || null);
    }
  }

  stopPlugin(pluginId, ipcBroadcaster) {
    return this.unloadPlugin(pluginId, ipcBroadcaster);
  }

  unloadPlugin(pluginId, ipcBroadcaster) {
    if (!pluginId) return;
    const broadcaster = ipcBroadcaster || this.ipcBroadcaster;
    let deleted = false;
    for (const [key, sandbox] of this.activeSandboxes.entries()) {
      if (key === pluginId || sandbox?.manifest?.id === pluginId) {
        this.activeSandboxes.delete(key);
        deleted = true;
        if (this._proc) {
          this._sendRpc({ type: "unload-plugin", pluginId: key }).catch(() => {});
        }
        console.log(`[SANDBOX] Desactivado e inhabilitado el complemento: ${key}`);
      }
    }
    if (deleted && broadcaster) {
      broadcaster("plugins:widgets-updated", this.getAllPluginIslandWidgets());
      broadcaster("plugins:commands-updated", this.getAllPluginCommands());
      broadcaster("plugins:dashboard-widgets-updated", this.getRegisteredDashboardWidgets());
      broadcaster("plugins:voice-control-buttons-updated", this.getAllVoiceControlButtons());
      broadcaster("plugins:rail-actions-updated", this.getAllRailActions());
      broadcaster("plugins:server-settings-tabs-updated", this.getAllServerSettingsTabs());
      broadcaster("plugins:custom-views-updated", this.getAllCustomViews());
    }
  }

  async loadAndRunPlugins(ipcBroadcaster, p2pBroadcaster) {
    if (ipcBroadcaster) this.ipcBroadcaster = ipcBroadcaster;
    if (p2pBroadcaster) this.p2pBroadcaster = p2pBroadcaster;
    const plugins = await pluginService.listPlugins();

    for (const plugin of plugins) {
      if (plugin.enabled !== false) {
        await this.runPlugin(plugin, ipcBroadcaster, p2pBroadcaster);
      }
    }
  }

  runPlugin(manifest, ipcBroadcaster, p2pBroadcaster) {
    if (ipcBroadcaster) this.ipcBroadcaster = ipcBroadcaster;
    if (p2pBroadcaster) this.p2pBroadcaster = p2pBroadcaster;

    const pluginId = manifest.id;
    if (this.activeSandboxes.has(pluginId)) {
      this.unloadPlugin(pluginId);
    }

    const pluginDir =
      (pluginService.findPluginDir && pluginService.findPluginDir(pluginId)) ||
      pluginService.getPluginPath(pluginId);
    const mainFile = path.join(pluginDir, manifest.main || "index.js");
    const code = fs.existsSync(mainFile) ? fs.readFileSync(mainFile, "utf-8") : "";

    const widgets = [];
    const voiceButtons = [];
    const commandNames = new Set();
    const railActions = [];
    const serverSettingsTabs = [];
    const customViews = [];

    if (Array.isArray(manifest.railActions)) {
      for (const act of manifest.railActions) {
        railActions.push({
          ...act,
          id: act.id || `rail_${Date.now()}`,
          pluginId,
          pluginName: manifest.name,
        });
      }
    }

    if (Array.isArray(manifest.serverSettingsTabs)) {
      for (const tab of manifest.serverSettingsTabs) {
        serverSettingsTabs.push({
          ...tab,
          id: tab.id || `tab_${Date.now()}`,
          pluginId,
          pluginName: manifest.name,
        });
      }
    }

    if (Array.isArray(manifest.customViews)) {
      for (const v of manifest.customViews) {
        customViews.push({
          ...v,
          id: v.id || `view_${Date.now()}`,
          pluginId,
          pluginName: manifest.name,
        });
      }
    }

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

    const sandboxMirror = {
      manifest,
      widgets,
      voiceButtons,
      commandNames,
      railActions,
      serverSettingsTabs,
      customViews,
      hasStageResolver: false,
    };
    this.activeSandboxes.set(pluginId, sandboxMirror);

    const appLanguage = this._getAppLanguage();
    const envSnapshot = this._buildEnvSnapshot(manifest);

    return this._sendRpc({
      type: "run-plugin",
      manifest,
      code,
      appLanguage,
      envSnapshot,
    })
      .then((res) => {
        if (!res?.ok) {
          this.activeSandboxes.delete(pluginId);
          return false;
        }
        if (Array.isArray(res.commandNames)) {
          for (const c of res.commandNames) sandboxMirror.commandNames.add(c);
        }
        sandboxMirror.hasStageResolver = Boolean(res.hasStageResolver);
        console.log(`[SANDBOX] Complemento ${manifest.name} iniciado correctamente (UtilityProcess).`);
        if (this.ipcBroadcaster) {
          this.ipcBroadcaster("plugins:widgets-updated", this.getAllPluginIslandWidgets());
          this.ipcBroadcaster("plugins:commands-updated", this.getAllPluginCommands());
          this.ipcBroadcaster("plugins:dashboard-widgets-updated", this.getRegisteredDashboardWidgets());
          this.ipcBroadcaster("plugins:voice-control-buttons-updated", this.getAllVoiceControlButtons());
          this.ipcBroadcaster("plugins:rail-actions-updated", this.getAllRailActions());
          this.ipcBroadcaster("plugins:server-settings-tabs-updated", this.getAllServerSettingsTabs());
          this.ipcBroadcaster("plugins:custom-views-updated", this.getAllCustomViews());
        }
        return true;
      })
      .catch((err) => {
        this.activeSandboxes.delete(pluginId);
        console.error(`[SANDBOX] Error ejecutando complemento ${manifest.name}:`, err);
        return false;
      });
  }

  async resolveStage(pluginId, stageDef) {
    if (!pluginId) return stageDef;
    const sandbox = this.activeSandboxes.get(pluginId);
    let resolvedStage = stageDef;

    if (sandbox?.hasStageResolver && this._proc) {
      try {
        const envSnapshot = this._buildEnvSnapshot(sandbox.manifest);
        const resolved = await this._sendRpc({
          type: "resolve-stage",
          pluginId,
          stageDef,
          envSnapshot,
        });
        if (resolved && typeof resolved === "object") {
          resolvedStage = resolved;
        }
      } catch (e) {
        console.error(`[SANDBOX] Error executing stage resolver for ${pluginId}:`, e);
      }
    }

    if (resolvedStage?.entryPoint && !resolvedStage?.htmlContent) {
      const pluginsDir = pluginService.getPluginsDir ? pluginService.getPluginsDir() : "";
      const pluginDir =
        (pluginService.findPluginDir && pluginService.findPluginDir(pluginId)) ||
        (pluginsDir ? path.join(pluginsDir, pluginId) : "");
      if (pluginDir) {
        const entryPath = path.join(pluginDir, resolvedStage.entryPoint);
        try {
          if (fs.existsSync(entryPath)) {
            let htmlContent = fs.readFileSync(entryPath, "utf-8");
            const widgetDir = path.dirname(entryPath);
            const baseHref = `onicord-media://win-disk/${widgetDir.replace(/\\/g, "/")}/`;
            const fallbackNick =
              profileService.activeProfile?.nickname || profileService.activeProfile?.username || "Oniverse";
            let initialUserNick = resolvedStage?.userNick || resolvedStage?.authorName;
            if (!initialUserNick || initialUserNick === "Jugador" || initialUserNick === "PLAYER") {
              initialUserNick = fallbackNick;
            }
            if (htmlContent.includes("<head>")) {
              const headInject = `<head>\n  <base href="${baseHref}">\n  <script>window._onicordUserNick = ${JSON.stringify(initialUserNick)};</script>`;
              htmlContent = htmlContent.replace("<head>", headInject);
            }
            resolvedStage = {
              ...resolvedStage,
              htmlContent,
            };
          }
        } catch (err) {
          console.error(`[SANDBOX] Error resolving stage entryPoint HTML ${entryPath}:`, err.message);
        }
      }
    }

    return resolvedStage;
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
      } else if (sandbox.commandNames) {
        for (const cmdName of sandbox.commandNames) {
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
          const pluginDir =
            (pluginService.findPluginDir && pluginService.findPluginDir(pluginId)) ||
            path.join(pluginsDir, pluginId);
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
        if (!w.permissions) w.permissions = manifest.permissions || [];
        if (!w.icon) {
          w.icon =
            (pluginService.resolvePluginIcon && pluginService.resolvePluginIcon(manifest.icon, pluginId)) ||
            manifest.icon ||
            null;
        }
        if (!w.description) {
          w.description =
            (manifest.locales && manifest.locales.es && manifest.locales.es.description) ||
            manifest.description ||
            "";
        }
        if (!w.pluginName) {
          w.pluginName =
            (manifest.locales && manifest.locales.es && manifest.locales.es.name) ||
            manifest.name ||
            "Complemento";
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

  getAllRailActions() {
    const allActions = [];
    const seen = new Set();
    for (const [pluginId, sandbox] of this.activeSandboxes) {
      const actions = sandbox.railActions || sandbox.manifest?.railActions || [];
      if (Array.isArray(actions)) {
        for (const act of actions) {
          const key = `${pluginId}:${act.id || act.targetView}`;
          if (!seen.has(key)) {
            seen.add(key);
            allActions.push({
              ...act,
              pluginId,
              pluginName: sandbox.manifest?.name || pluginId,
            });
          }
        }
      }
    }
    return allActions;
  }

  getAllServerSettingsTabs() {
    const allTabs = [];
    const seen = new Set();
    for (const [pluginId, sandbox] of this.activeSandboxes) {
      const tabs = sandbox.serverSettingsTabs || sandbox.manifest?.serverSettingsTabs || [];
      if (Array.isArray(tabs)) {
        for (const tab of tabs) {
          const key = `${pluginId}:${tab.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            allTabs.push({
              ...tab,
              pluginId,
              pluginName: sandbox.manifest?.name || pluginId,
            });
          }
        }
      }
    }
    return allTabs;
  }

  getAllCustomViews() {
    const allViews = [];
    const seen = new Set();
    for (const [pluginId, sandbox] of this.activeSandboxes) {
      const views = sandbox.customViews || sandbox.manifest?.customViews || [];
      if (Array.isArray(views)) {
        for (const view of views) {
          const key = `${pluginId}:${view.id}`;
          if (!seen.has(key)) {
            seen.add(key);
            allViews.push({
              ...view,
              pluginId,
              pluginName: sandbox.manifest?.name || pluginId,
            });
          }
        }
      }
    }
    return allViews;
  }

  async triggerVoiceControlButton(pluginId, buttonId, data, broadcastToAll) {
    const sandbox = this.activeSandboxes.get(pluginId);
    if (!sandbox) return false;
    if (broadcastToAll) {
      broadcastToAll("plugins:voice-control-button-triggered", { pluginId, buttonId, data });
    }
    if (this._proc) {
      try {
        const envSnapshot = this._buildEnvSnapshot(sandbox.manifest);
        await this._sendRpc({
          type: "trigger-voice-btn",
          pluginId,
          buttonId,
          data,
          envSnapshot,
        });
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
      this.handleP2PPluginMessage(senderPeerId, { pluginId, data });
    }
  }

  async handleChatMessage(text, author, ipcBroadcaster, roomCode, channelId) {
    if (!text || !text.startsWith("/")) return false;
    const parts = text.slice(1).split(" ");
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    for (const [pluginId, sandbox] of this.activeSandboxes) {
      if (sandbox.commandNames?.has(cmd)) {
        try {
          const envSnapshot = this._buildEnvSnapshot(sandbox.manifest, roomCode);
          await this._sendRpc({
            type: "handle-command",
            pluginId,
            cmd,
            args,
            author,
            activeContext: { roomCode, channelId },
            envSnapshot,
          });
        } catch (err) {
          console.error(`[SANDBOX] Error ejecutando comando /${cmd} en complemento ${pluginId}:`, err);
        }
      }
    }
  }

  async processLiveChatMessage(message) {
    if (!message || !message.text) return;
    const text = message.text.trim();
    if (!text.startsWith("/")) return;

    const parts = text.split(/\s+/);
    if (!parts[0]) return;
    const rawCmd = parts[0].slice(1).toLowerCase();
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
      let sp = null;
      let isEnabled = false;

      if (server && Array.isArray(server.plugins) && server.plugins.length > 0) {
        sp = server.plugins.find((p) => p.id === pluginId || p.id === manifestId);
        if (sp) isEnabled = sp.enabled !== false;
      }
      if (!isEnabled) continue;

      if (sandbox.commandNames?.has(rawCmd)) {
        try {
          const envSnapshot = this._buildEnvSnapshot(sandbox.manifest, message.roomCode);
          await this._sendRpc({
            type: "handle-command",
            pluginId,
            cmd: rawCmd,
            args: matchedArgs,
            author,
            activeContext: {
              roomCode: message.roomCode,
              channelId: message.channelId || "general",
              requestMessageId: message.id,
              requestMessageTimestamp: message.timestamp,
              requestMessageAuthorId: message.authorId,
            },
            envSnapshot,
          });
        } catch (err) {
          console.error(`[SANDBOX] ❌ Error ejecutando comando /${rawCmd} en complemento ${pluginId}:`, err);
        }
      }
    }
  }

  handleP2PPluginMessage(senderPeerId, payload) {
    const { pluginId, data } = payload || {};
    if (!pluginId || !this.activeSandboxes.has(pluginId)) return;

    try {
      const roomCode = global.roomManager?.roomCode;
      if (roomCode) {
        const serverService = require("./serverService.cjs");
        const serverStore = serverService.getServerStore();
        const server = serverStore.getServerByRoomCodeSync(roomCode);
        if (!server || !Array.isArray(server.plugins)) return;
        const sp = server.plugins.find(
          (p) => p.id === pluginId || (p.id && (p.id.includes(pluginId) || pluginId.includes(p.id)))
        );
        if (!sp || sp.enabled === false) return;
      }
    } catch {}

    const sandbox = this.activeSandboxes.get(pluginId);
    const envSnapshot = this._buildEnvSnapshot(sandbox.manifest);
    this._sendRpc({
      type: "p2p-message",
      pluginId,
      sender: { id: senderPeerId, name: senderPeerId.slice(0, 6) },
      data,
      envSnapshot,
    }).catch(() => {});
  }

  destroy() {
    const proc = this._proc;
    this._proc = null;
    for (const [, pending] of this._pendingRpc) {
      clearTimeout(pending.timer);
      pending.reject(new Error("PluginSandboxService destroyed"));
    }
    this._pendingRpc.clear();
    if (!proc) return;
    try {
      proc.postMessage({ type: "shutdown" });
    } catch {}
    try {
      proc.kill();
    } catch {}
  }
}

module.exports = new PluginSandboxService();
