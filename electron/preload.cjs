const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  minimizeWindow: () => ipcRenderer.send("window:minimize"),
  isWindowMinimized: () => ipcRenderer.invoke("window:isMinimized"),
  maximizeWindow: () => ipcRenderer.send("window:maximize"),
  setFullscreen: (flag) => ipcRenderer.send("window:setFullscreen", flag),
  closeWindow: () => ipcRenderer.send("window:close"),
  showItemInFolder: (fullPath) =>
    ipcRenderer.send("show-item-in-folder", fullPath),
  updateAppIcon: (dataUrl) => ipcRenderer.send("app:update-icon", dataUrl),

  getProfile: () => ipcRenderer.invoke("profile:get"),
  saveProfile: (profile) => ipcRenderer.invoke("profile:save", profile),
  deleteAccount: () => ipcRenderer.invoke("profile:delete"),
  onProfileUpdated: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("profile:updated", handler);
    return () => ipcRenderer.removeListener("profile:updated", handler);
  },

  sendOSNotification: (title, body) =>
    ipcRenderer.send("show-os-notification", { title, body }),
  testOSNotification: (title, body) =>
    ipcRenderer.invoke("system:test-notification", { title, body }),

  getRealCPU: () => ipcRenderer.invoke("hardware:getRealCPU"),
  getRealRAM: () => ipcRenderer.invoke("hardware:getRealRAM"),
  getNetworkSpeed: () => ipcRenderer.invoke("hardware:getNetworkSpeed"),
  getDiagnostics: () => ipcRenderer.invoke("system:getDiagnostics"),

  getServerFiles: (roomCode) => ipcRenderer.invoke("storage:getServerFiles", roomCode),
  deleteServerFile: (roomCode, fileName) => ipcRenderer.invoke("storage:deleteFile", roomCode, fileName),
  clearServerCache: (roomCode) => ipcRenderer.invoke("storage:clearServerCache", roomCode),
  getTotalCacheStats: () => ipcRenderer.invoke("storage:getTotalCacheStats"),

  searchWeatherCity: (name) => ipcRenderer.invoke("weather:search", name),
  searchCities: (currentName) =>
    ipcRenderer.invoke("weather:searchCities", currentName),
  loadForecast: (lat, lon) =>
    ipcRenderer.invoke("weather:loadForecast", { lat, lon }),

  onGameActivityChanged: (callback) => {
    const handler = (event, gameName) => callback(gameName);
    ipcRenderer.on("game-activity-changed", handler);
    return () => ipcRenderer.removeListener("game-activity-changed", handler);
  },
  getCurrentGame: () => ipcRenderer.invoke("game:get-current"),

  // Voice Overlay
  updateOverlayMembers: (members) => ipcRenderer.send("overlay:update-members", members),
  getOverlaySettings: () => ipcRenderer.invoke("overlay:get-settings"),
  setOverlaySettings: (settings) => ipcRenderer.invoke("overlay:set-settings", settings),
  triggerTestOverlay: (durationMs) => ipcRenderer.invoke("overlay:trigger-test", durationMs),
  listServers: () => ipcRenderer.invoke("servers:list"),
  createServer: (name, profile) =>
    ipcRenderer.invoke("servers:create", name, profile),
  joinServer: (code, name, profile) =>
    ipcRenderer.invoke("servers:join", code, name, profile),
  enterServer: (serverId, profile) =>
    ipcRenderer.invoke("servers:enter", serverId, profile),
  bootBackgroundServers: (profile, excludeServerId) =>
    ipcRenderer.invoke("servers:boot-background", profile, excludeServerId),
  getRoomPeers: (roomCode) => ipcRenderer.invoke("servers:get-room-peers", roomCode),
  deleteServer: (serverId) => ipcRenderer.invoke("servers:remove", serverId),
  removeServer: (serverId) => ipcRenderer.invoke("servers:remove", serverId),
  setServerChannel: (serverId, channelId) =>
    ipcRenderer.invoke("servers:setChannel", serverId, channelId),
  updateServerSettings: (serverId, settings) =>
    ipcRenderer.invoke("servers:updateSettings", serverId, settings),
  checkDirectPort: (port) =>
    ipcRenderer.invoke("servers:checkDirectPort", port),
  setLastServer: (serverId) =>
    ipcRenderer.invoke("servers:setLastActive", serverId),
  getLastServer: () => ipcRenderer.invoke("servers:getLastActive"),
  writeClipboard: (text) => ipcRenderer.invoke("clipboard:writeText", text),
  readClipboard: () => ipcRenderer.invoke("clipboard:readText"),

  createRoom: (profile) => ipcRenderer.invoke("room:create", profile),
  joinRoom: (code, profile) => ipcRenderer.invoke("room:join", code, profile),
  leaveRoom: () => ipcRenderer.invoke("room:leave"),
  getRoomState: () => ipcRenderer.invoke("room:state"),

  getChatHistory: (roomCode, channelId) =>
    ipcRenderer.invoke("chat:history", roomCode, channelId || "general"),
  sendChatMessage: (roomCode, channelId, text) =>
    ipcRenderer.invoke("chat:send", roomCode, channelId || "general", text),
  sendPluginCommand: (roomCode, channelId, text) =>
    ipcRenderer.invoke("chat:send-plugin-command", roomCode, channelId || "general", text),
  deleteChatMessage: (roomCode, channelId, messageId) =>
    ipcRenderer.invoke(
      "chat:delete",
      roomCode,
      channelId || "general",
      messageId,
    ),
  sendTyping: (channelId) => ipcRenderer.invoke("chat:setTyping", channelId),
  onChatMessage: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("chat:message", handler);
    return () => ipcRenderer.removeListener("chat:message", handler);
  },
  onChatMessageDeleted: (callback) => {
    const handler = (_event, id) => callback(id);
    ipcRenderer.on("chat:deleted", handler);
    return () => ipcRenderer.removeListener("chat:deleted", handler);
  },
  onUserTyping: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("chat:typing", handler);
    return () => ipcRenderer.removeListener("chat:typing", handler);
  },
  on: (channel, callback) => {
    const ALLOWED_CHANNELS = [
      "peer:joined", "peer:left", "peer:updated", "peer:activity", "sync:complete",
      "server:updated", "room:created", "room:joined", "server:banned", "server:kicked",
      "p2p:error", "chat:message", "chat:deleted",
      "chat:typing", "voice:state", "voice:signal", "voice:speaking-updated",
      "voice:sfu-migrated", "diagnostics:peer-logs", "file:progress",
      "sketch:draw", "onicord:deep-link", "onicord:direct-link",
      "invite:details-updated", "plugins:widgets-updated", "plugins:show-toast",
      "plugins:commands-updated", "plugins:chat-message-outbound",
      "plugins:chat-clear-outbound", "onicord:widget-p2p-data",
      "plugins:dashboard-widgets-updated", "drive:progress", "update:status",
      "game-activity-changed", "profile:updated", "onicord:mcp-trigger-action",
      "onicord:global-keybind",
      "voice:join-channel", "voice:leave-channel", "voice:toggle-media"
    ];
    if (!ALLOWED_CHANNELS.includes(channel)) {
      console.warn(`[Preload Guard] Intento de suscripción no permitida al canal: ${channel}`);
      return () => {};
    }
    const subscription = (event, ...args) => callback(...args);
    ipcRenderer.on(channel, subscription);

    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },

  onGlobalKeybind: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("onicord:global-keybind", handler);
    return () => ipcRenderer.removeListener("onicord:global-keybind", handler);
  },
  updateGlobalKeybinds: (keybindings) =>
    ipcRenderer.invoke("keybinds:update", keybindings),

  saveStickerLocal: (data) => ipcRenderer.invoke("save-sticker-local", data),
  getStickerPath: (id) => ipcRenderer.invoke("get-sticker-path", id),
  requestSticker: (data) => ipcRenderer.invoke("request-sticker", data),
  exportStickerPack: (data) => ipcRenderer.invoke("export-sticker-pack", data),
  importStickerPackRaw: (jsonStr) =>
    ipcRenderer.invoke("import-sticker-pack-raw", jsonStr),
  listLocalStickers: () => ipcRenderer.invoke("list-local-stickers"),
  deleteStickerLocal: (data) =>
    ipcRenderer.invoke("delete-sticker-local", data),

  extractMusicTrack: (url) => ipcRenderer.invoke("music:extract-track", url),
  resolveAndPrepareStream: (url) => ipcRenderer.invoke("music:resolve-prepare", url),
  localizeTrack: (track) => ipcRenderer.invoke("music:localize-track", track),
  loadHistory: (serverId) => ipcRenderer.invoke("history:load", serverId),
  saveHistory: (serverId, data) =>
    ipcRenderer.invoke("history:save", serverId, data),

  abortMusicDownloads: () => ipcRenderer.invoke("music:abort-all-downloads"),
  broadcastMusicState: (channelId, state, roomCode) =>
    ipcRenderer.invoke("music:broadcast-state", channelId, state, roomCode),
  sendMusicCommand: (channelId, command, roomCode) =>
    ipcRenderer.invoke("music:send-command", channelId, command, roomCode),
  onMusicChannelState: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("music:channel-state", handler);
    return () => ipcRenderer.removeListener("music:channel-state", handler);
  },
  onMusicChannelCommand: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("music:channel-cmd", handler);
    return () => ipcRenderer.removeListener("music:channel-cmd", handler);
  },

  onMusicQueue: (callback) => {
    const handler = (_event, track) => callback(track);
    ipcRenderer.on("music:queue-bridge", handler);
    return () => ipcRenderer.removeListener("music:queue-bridge", handler);
  },
  onMusicQueueImmediate: (callback) => {
    const handler = (_event, track) => callback(track);
    ipcRenderer.on("onicord:music-queue-immediate", handler);
    return () =>
      ipcRenderer.removeListener("onicord:music-queue-immediate", handler);
  },

  onAutoAddTrack: (callback) => {
    const handler = (_event, subTrackUrl) => callback(subTrackUrl);
    ipcRenderer.on("music:auto-add-track", handler);
    return () => ipcRenderer.removeListener("music:auto-add-track", handler);
  },

  onMusicQueueNative: (callback) => {
    const handler = (_event, trackData) => callback(trackData);
    ipcRenderer.on("onicord:music-queue-native", handler);
    return () =>
      ipcRenderer.removeListener("onicord:music-queue-native", handler);
  },

  onPeerJoined: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("peer:joined", handler);
    return () => ipcRenderer.removeListener("peer:joined", handler);
  },
  onPeerLeft: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("peer:left", handler);
    return () => ipcRenderer.removeListener("peer:left", handler);
  },
  onPeerActivityUpdated: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("peer:activity", handler);
    return () => ipcRenderer.removeListener("peer:activity", handler);
  },
  onSyncComplete: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("sync:complete", handler);
    return () => ipcRenderer.removeListener("sync:complete", handler);
  },
  onServerUpdated: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("server:updated", handler);
    return () => ipcRenderer.removeListener("server:updated", handler);
  },
  onP2PError: (callback) => {
    const handler = (_event, message) => callback(message);
    ipcRenderer.on("p2p:error", handler);
    return () => ipcRenderer.removeListener("p2p:error", handler);
  },

  sendSpeakingState: (isSpeaking, vol) =>
    ipcRenderer.invoke("voice:speaking", isSpeaking, vol),
  joinVoice: (channelId) => ipcRenderer.invoke("voice:join", channelId),
  leaveVoice: () => ipcRenderer.invoke("voice:leave"),
  setVoiceMuted: (muted) => ipcRenderer.invoke("voice:setMuted", muted),
  setVoiceDeafened: (deafened) =>
    ipcRenderer.invoke("voice:setDeafened", deafened),
  sendVoiceSignal: (toPeerId, channelId, signal) =>
    ipcRenderer.invoke("voice:signal", toPeerId, channelId, signal),
  getVoiceState: () => ipcRenderer.invoke("voice:state"),
  setStreaming: (isStreaming) =>
    ipcRenderer.invoke("voice:setStreaming", isStreaming),
  onVoiceState: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("voice:state", handler);
    return () => ipcRenderer.removeListener("voice:state", handler);
  },
  onVoiceSignal: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("voice:signal", handler);
    return () => ipcRenderer.removeListener("voice:signal", handler);
  },
  onSpeakingUpdated: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("voice:speaking-updated", handler);
    return () => ipcRenderer.removeListener("voice:speaking-updated", handler);
  },
  claimVoiceHost: () => ipcRenderer.invoke("voice:claim-host"),
  updateVoiceStreamIds: (audioStreamId, videoStreamId, bandwidth) =>
    ipcRenderer.invoke("voice:update-stream-ids", audioStreamId, videoStreamId, bandwidth),
  onVoiceSfuMigrated: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("voice:sfu-migrated", handler);
    return () => ipcRenderer.removeListener("voice:sfu-migrated", handler);
  },

  // --- OniDiag Diagnostics P2P ---
  getLocalLogs: () => ipcRenderer.invoke("diagnostics:getLocal"),
  clearLogs: () => ipcRenderer.invoke("diagnostics:clear"),
  requestPeerLogs: (peerId) => ipcRenderer.invoke("diagnostics:request", peerId),
  diagLog: (level, category, message) => ipcRenderer.invoke("diagnostics:log", level, category, message),
  exportAllUserLogs: () => ipcRenderer.invoke("diagnostics:exportAllUserLogs"),
  onPeerLogsReceived: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("diagnostics:peer-logs", handler);
    return () => ipcRenderer.removeListener("diagnostics:peer-logs", handler);
  },

  // --- files / attachments ---
  getRecentFiles: () => ipcRenderer.invoke("dashboard:getRecentFiles"),
  readBinaryFile: (filePath) => ipcRenderer.invoke("storage:readBinaryFile", filePath),
  getNativePath: (file) => webUtils.getPathForFile(file),
  saveDevDefaultLayout: (layoutMap) => ipcRenderer.invoke("dev:save-default-layout", layoutMap),
  processDroppedMeta: (roomCode, filePath) =>
    ipcRenderer.invoke("files:processDroppedMeta", roomCode, filePath),
  selectFileMeta: (roomCode) =>
    ipcRenderer.invoke("files:selectFileMeta", roomCode),
  downloadFile: (roomCode, fileId, fileName, fileSize) =>
    ipcRenderer.invoke("files:download", roomCode, fileId, fileName, fileSize),
  cancelDownload: (fileId) => ipcRenderer.invoke("files:cancel", fileId),
  onFileProgress: (callback) => {
    const subscription = (_event, data) => callback(data);
    ipcRenderer.on("file:progress", subscription);
    return () => ipcRenderer.removeListener("file:progress", subscription);
  },
  uploadClipboardImage: (roomCode, arrayBuffer) =>
    ipcRenderer.invoke("files:uploadClipboardImage", roomCode, arrayBuffer),

  fetchUploadedLocalPath: (roomCode, fileId) =>
    ipcRenderer.invoke("files:getUploadedLocalPath", roomCode, fileId),

  getScreenSources: () => ipcRenderer.invoke("stream:get-sources"),

  openExternalLink: (url) => ipcRenderer.send("window:open-external", url),
  fetchOpenGraph: (url) => ipcRenderer.invoke("opengraph:fetch", url),
  fetchMediaLocalPath: (fileId) =>
    ipcRenderer.invoke("files:getLocalPath", fileId),
  getAudioCover: (filePath) =>
    ipcRenderer.invoke("storage:getAudioCover", filePath),

  sendSketchDraw: (payload) => ipcRenderer.invoke("sketch:sendDraw", payload),
  onSketchDraw: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("sketch:draw", handler);
    return () => ipcRenderer.removeListener("sketch:draw", handler);
  },

  onDeepLink: (callback) => {
    const handler = (_event, code) => callback(code);
    ipcRenderer.on("onicord:deep-link", handler);
    return () => ipcRenderer.removeListener("onicord:deep-link", handler);
  },
  onDirectLink: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("onicord:direct-link", handler);
    return () => ipcRenderer.removeListener("onicord:direct-link", handler);
  },
  checkPendingDeepLink: () => ipcRenderer.invoke("deeplink:check-pending"),

  resolveInvite: (code, profile) => ipcRenderer.invoke("deeplink:resolve-invite", code, profile),
  cancelInviteResolve: (code) => ipcRenderer.send("deeplink:cancel-resolve-invite", code),
  onInviteDetailsUpdated: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("invite:details-updated", handler);
    return () => ipcRenderer.removeListener("invite:details-updated", handler);
  },

  // --- Complementos (Plugins) API ---
  listPlugins: () => ipcRenderer.invoke("plugins:list"),
  installPluginDialog: () => ipcRenderer.invoke("plugins:install-dialog"),
  downloadAndInstallPlugin: (pluginId) => ipcRenderer.invoke("plugins:download-install", pluginId),
  downloadAndInstallStickerPack: (downloadUrl) => ipcRenderer.invoke("stickers:download-install", downloadUrl),
  packPluginDialog: () => ipcRenderer.invoke("plugins:pack-dialog"),
  uninstallPlugin: (pluginId) => ipcRenderer.invoke("plugins:uninstall", pluginId),
  togglePlugin: (pluginId, enabled) => ipcRenderer.invoke("plugins:toggle", pluginId, enabled),
  getPluginWidgets: () => ipcRenderer.invoke("plugins:get-widgets"),
  onPluginWidgetsUpdated: (callback) => {
    const handler = (_event, widgets) => callback(widgets);
    ipcRenderer.on("plugins:widgets-updated", handler);
    return () => ipcRenderer.removeListener("plugins:widgets-updated", handler);
  },
  onPluginShowToast: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("plugins:show-toast", handler);
    return () => ipcRenderer.removeListener("plugins:show-toast", handler);
  },
  getPluginCommands: () => ipcRenderer.invoke("plugins:get-commands"),
  execPluginCommand: (text, author, roomCode, channelId) => ipcRenderer.invoke("plugins:exec-command", text, author, roomCode, channelId),
  onPluginCommandsUpdated: (callback) => {
    const handler = (_event, commands) => callback(commands);
    ipcRenderer.on("plugins:commands-updated", handler);
    return () => ipcRenderer.removeListener("plugins:commands-updated", handler);
  },
  onPluginChatMessageOutbound: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("plugins:chat-message-outbound", handler);
    return () => ipcRenderer.removeListener("plugins:chat-message-outbound", handler);
  },
  onPluginChatClearOutbound: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("plugins:chat-clear-outbound", handler);
    return () => ipcRenderer.removeListener("plugins:chat-clear-outbound", handler);
  },
  getDashboardWidgets: () => ipcRenderer.invoke("plugins:get-dashboard-widgets"),
  sendWidgetP2PData: (payload) => ipcRenderer.invoke("plugins:send-widget-p2p-data", payload),
  onWidgetP2PData: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("onicord:widget-p2p-data", handler);
    return () => ipcRenderer.removeListener("onicord:widget-p2p-data", handler);
  },
  onDashboardWidgetsUpdated: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("plugins:dashboard-widgets-updated", handler);
    return () => ipcRenderer.removeListener("plugins:dashboard-widgets-updated", handler);
  },

  // ─── Google Drive Backup ──────────────────────────────────────────────────
  driveIsConnected:    () => ipcRenderer.invoke("drive:isConnected"),
  driveGetEmail:       () => ipcRenderer.invoke("drive:getEmail"),
  driveGetUser:        () => ipcRenderer.invoke("drive:getUser"),
  driveAuthorize:      () => ipcRenderer.invoke("drive:authorize"),
  driveDisconnect:     () => ipcRenderer.invoke("drive:disconnect"),
  driveListBackups:    () => ipcRenderer.invoke("drive:listBackups"),
  driveEstimateSize:   (cats) => ipcRenderer.invoke("drive:estimateSize", cats),
  driveCreateBackup:   (cats, name) => ipcRenderer.invoke("drive:createBackup", cats, name),
  driveDownloadBackup: (fileId, cats) => ipcRenderer.invoke("drive:downloadBackup", fileId, cats),
  driveDeleteBackup:   (fileId) => ipcRenderer.invoke("drive:deleteBackup", fileId),
  driveGetSettings:    () => ipcRenderer.invoke("drive:getSettings"),
  driveSaveSettings:   (settings) => ipcRenderer.invoke("drive:saveSettings", settings),
  onDriveProgress: (cb) => {
    const h = (_event, data) => cb(data);
    ipcRenderer.on("drive:progress", h);
    return () => ipcRenderer.removeListener("drive:progress", h);
  },

  // ─── Updater API ──────────────────────────────────────────────────────────
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  downloadUpdate: () => ipcRenderer.invoke("update:download"),
  installUpdate: () => ipcRenderer.invoke("update:install"),
  isPortableBuild: () => ipcRenderer.invoke("update:isPortable"),
  onUpdateStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("update:status", handler);
    return () => ipcRenderer.removeListener("update:status", handler);
  },
});
