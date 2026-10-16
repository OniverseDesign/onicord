const { app, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const fsPromises = require("fs/promises");
const profileService = require("../../services/profileService.cjs");
const cacheService = require("../../services/cacheService.cjs");

const getHistoryPath = (serverId) =>
  path.join(app.getPath("userData"), `history_${serverId}.json`);

function registerProfileStorageHandlers() {
  ipcMain.handle("profile:save", async (_event, profile) => {
    const saved = await profileService.saveProfile(profile, global.roomManager);
    if (typeof global.updateScannerState === "function") {
      global.updateScannerState(saved.showRichPresence ?? true, saved.customGames ?? []);
    }
    return saved;
  });

  ipcMain.handle("profile:load", async () => {
    return profileService.loadProfile();
  });

  ipcMain.handle("profile:get", async () => {
    return profileService.getProfile();
  });

  ipcMain.handle("keybinds:update", async (_event, keybindings) => {
    if (typeof global.updateGlobalShortcuts === "function") {
      global.updateGlobalShortcuts(keybindings);
    }
    return true;
  });

  ipcMain.handle("profile:delete", async () => {
    const userData = app.getPath("userData");
    const profilePath = path.join(userData, "profile.json");
    const serversPath = path.join(userData, "servers.json");
    const chatsDir = path.join(userData, "chats");
    const filesDir = path.join(userData, "files");
    const roomMetaDir = path.join(userData, "room-meta");

    try {
      if (global.roomManager) {
        try {
          await global.roomManager.destroy();
        } catch (e) {
          console.error("[Profile Delete] Error destroying room manager:", e.message);
        }
        global.roomManager = null;
      }

      if (fs.existsSync(profilePath)) fs.unlinkSync(profilePath);
      if (fs.existsSync(serversPath)) fs.unlinkSync(serversPath);
      if (fs.existsSync(chatsDir)) fs.rmSync(chatsDir, { recursive: true, force: true });
      if (fs.existsSync(filesDir)) fs.rmSync(filesDir, { recursive: true, force: true });
      if (fs.existsSync(roomMetaDir)) fs.rmSync(roomMetaDir, { recursive: true, force: true });

      return { success: true };
    } catch (err) {
      console.error("[Profile Delete] Error deleting account:", err.message);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("storage:getServerFiles", async (_event, roomCode) => {
    return cacheService.getServerFiles(roomCode);
  });

  ipcMain.handle("storage:deleteFile", async (_event, roomCode, fileName) => {
    return cacheService.deleteServerFile(roomCode, fileName);
  });

  ipcMain.handle("storage:clearServerCache", async (_event, roomCode) => {
    return cacheService.clearServerCache(roomCode);
  });

  ipcMain.handle("storage:getTotalCacheStats", async () => {
    return cacheService.getTotalCacheStats();
  });

  ipcMain.handle("storage:fetchUploadedLocalPath", async (_event, roomCode, fileId) => {
    return cacheService.getFilePath(roomCode, fileId);
  });

  ipcMain.handle("storage:fetchMediaLocalPath", async (_event, fileId) => {
    return cacheService.getFilePath(null, fileId);
  });

  ipcMain.handle("storage:getAudioCover", async (_event, filePath) => {
    return cacheService.getAudioCover(filePath);
  });

  ipcMain.handle("storage:readBinaryFile", async (_event, filePath) => {
    try {
      if (!filePath || typeof filePath !== "string") return null;
      const absolutePath = path.resolve(filePath);
      if (!fs.existsSync(absolutePath)) return null;
      return fs.readFileSync(absolutePath);
    } catch (err) {
      console.error("[Storage] Error reading binary file:", err);
      return null;
    }
  });

  ipcMain.handle("history:load", async (_event, serverId) => {
    try {
      const filePath = getHistoryPath(serverId);
      if (!fs.existsSync(filePath)) return [];
      const data = await fsPromises.readFile(filePath, "utf8");
      return JSON.parse(data);
    } catch (err) {
      console.error("Error cargando historial del disco:", err);
      return [];
    }
  });

  ipcMain.handle("history:save", async (_event, serverId, historyData) => {
    try {
      if (!Array.isArray(historyData)) {
        return { success: false, error: "Historial no es un array." };
      }
      const filePath = getHistoryPath(serverId);
      if (historyData.length === 0 && fs.existsSync(filePath)) {
        const existingData = await fsPromises.readFile(filePath, "utf8");
        const parsed = JSON.parse(existingData);
        if (parsed.length > 0) {
          console.log("⚠️ Intento de sobrescritura vacía bloqueado.");
          return { success: false, reason: "ignorar_vacio" };
        }
      }

      const cleaned = historyData
        .filter((t) => t && (t.trackId || t.id))
        .map((t) => ({
          id: t.id || t.trackId,
          trackId: t.trackId || t.id,
          title: t.title || "Audio",
          author: t.author || "Unknown",
          duration: t.duration || "0:00",
          durationSeconds: Number(t.durationSeconds) || 0,
          thumbnail: t.thumbnail || "",
          source: t.source || "Audio",
          originalUrl: t.originalUrl || t.url || "",
          playedAt: t.playedAt || Date.now(),
          playedBy: t.playedBy || null,
        }))
        .slice(0, 100);

      await fsPromises.writeFile(
        filePath,
        JSON.stringify(cleaned, null, 2),
        "utf8"
      );
      return { success: true };
    } catch (err) {
      console.error("Error guardando historial:", err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("clipboard:writeText", async (_event, text) => {
    try {
      const { clipboard } = require("electron");
      clipboard.writeText(String(text || ""));
      return { success: true };
    } catch (err) {
      console.error("[Clipboard IPC] Error writing text:", err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("clipboard:readText", async () => {
    try {
      const { clipboard } = require("electron");
      return clipboard.readText();
    } catch (err) {
      console.error("[Clipboard IPC] Error reading text:", err);
      return "";
    }
  });

  ipcMain.handle("dev:save-default-layout", async (_event, layoutMap) => {
    if (!layoutMap || typeof layoutMap !== "object") {
      return { success: false, error: "Invalid layout map" };
    }

    try {
      let widgetsDir = path.join(process.cwd(), "src/components/dashboard/widgets");
      if (!fs.existsSync(widgetsDir)) {
        widgetsDir = path.join(app.getAppPath(), "src/components/dashboard/widgets");
      }
      if (!fs.existsSync(widgetsDir)) {
        return { success: false, error: "Widget directory not found" };
      }

      const files = await fsPromises.readdir(widgetsDir);
      let updatedCount = 0;

      for (const file of files) {
        if (!file.endsWith(".jsx") && !file.endsWith(".tsx")) continue;
        const filePath = path.join(widgetsDir, file);
        let content = await fsPromises.readFile(filePath, "utf8");

        const widgetIdMatch = content.match(/\w+\.widgetId\s*=\s*["']([^"']+)["']/);
        if (!widgetIdMatch) continue;

        const widgetId = widgetIdMatch[1];
        const newGeo = layoutMap[widgetId];

        if (newGeo && typeof newGeo.x === "number") {
          const defaultGeoRegex = /(\w+\.defaultGeo\s*=\s*\{)[^\}]+(\};)/;
          const replacement = `$1 x: ${newGeo.x}, y: ${newGeo.y}, w: ${newGeo.w}, h: ${newGeo.h} $2`;

          if (defaultGeoRegex.test(content)) {
            const updatedContent = content.replace(defaultGeoRegex, replacement);
            await fsPromises.writeFile(filePath, updatedContent, "utf8");
            updatedCount++;
            console.log(
              `[Dev Layout Saver] 💾 Actualizado ${file} (${widgetId}) -> defaultGeo = { x: ${newGeo.x}, y: ${newGeo.y}, w: ${newGeo.w}, h: ${newGeo.h} }`,
            );
          }
        }
      }

      return { success: true, updatedCount };
    } catch (err) {
      console.error("[Dev Layout Saver Error]:", err);
      return { success: false, error: err.message };
    }
  });
}

module.exports = { registerProfileStorageHandlers };
