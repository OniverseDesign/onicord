const { app, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const fsPromises = require("fs/promises");
const profileService = require("../../services/profileService.cjs");
const cacheService = require("../../services/cacheService.cjs");
const { DbManager } = require("../../storage/dbManager.cjs");
const { CasStore } = require("../../storage/casStore.cjs");

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

  ipcMain.handle("profile:save-server-profile", async (_event, serverId, data) => {
    return profileService.saveServerProfile(serverId, data, global.roomManager);
  });

  ipcMain.handle("profile:delete-server-profile", async (_event, serverId) => {
    return profileService.deleteServerProfile(serverId, global.roomManager);
  });

  ipcMain.handle("keybinds:update", async (_event, keybindings) => {
    if (typeof global.updateGlobalShortcuts === "function") {
      global.updateGlobalShortcuts(keybindings);
    }
    return true;
  });

  ipcMain.handle("profile:delete", async () => {
    const userData = app.getPath("userData");
    const dbDir = path.join(userData, "db");
    const serversDir = path.join(userData, "servers");
    const casDir = path.join(userData, "cas");
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

      try {
        DbManager.getInstance(userData).closeAll();
      } catch {}

      if (fs.existsSync(dbDir)) fs.rmSync(dbDir, { recursive: true, force: true });
      if (fs.existsSync(serversDir)) fs.rmSync(serversDir, { recursive: true, force: true });
      if (fs.existsSync(casDir)) fs.rmSync(casDir, { recursive: true, force: true });
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
      const code = String(serverId || "").trim().toUpperCase();
      if (!code) return [];
      const dbMgr = DbManager.getInstance(app.getPath("userData"));
      const widgetsDb = dbMgr.getServerDb(code, "widgets");
      const rows = widgetsDb
        .prepare("SELECT * FROM music_history ORDER BY played_at DESC LIMIT 100")
        .all();
      return rows.map((r) => {
        let playedBy = null;
        if (r.played_by_json) {
          try {
            playedBy = JSON.parse(r.played_by_json);
          } catch {}
        } else if (r.played_by_user_id || r.played_by_nickname) {
          playedBy = {
            id: r.played_by_user_id,
            nickname: r.played_by_nickname,
            avatar: r.played_by_avatar_ref,
          };
        }
        return {
          id: r.track_id,
          trackId: r.track_id,
          title: r.title,
          author: r.author,
          duration: r.duration,
          durationSeconds: r.duration_seconds,
          thumbnail: r.thumbnail_ref || "",
          source: r.source || "Audio",
          originalUrl: r.original_url || "",
          playedAt: r.played_at,
          playedBy,
        };
      });
    } catch (err) {
      console.error("Error cargando historial de música desde widgets.db:", err);
      return [];
    }
  });

  ipcMain.handle("history:save", async (_event, serverId, historyData) => {
    try {
      if (!Array.isArray(historyData)) {
        return { success: false, error: "Historial no es un array." };
      }
      const code = String(serverId || "").trim().toUpperCase();
      if (!code) return { success: false, error: "ServerId vacío." };

      const userData = app.getPath("userData");
      const dbMgr = DbManager.getInstance(userData);
      const cas = CasStore.getInstance(userData);
      const widgetsDb = dbMgr.getServerDb(code, "widgets");

      if (historyData.length === 0) {
        const countRow = widgetsDb.prepare("SELECT COUNT(*) AS cnt FROM music_history").get();
        if (countRow && countRow.cnt > 0) {
          console.log("⚠️ Intento de sobrescritura vacía bloqueado en widgets.db.");
          return { success: false, reason: "ignorar_vacio" };
        }
      }

      const cleaned = historyData
        .filter((t) => t && (t.trackId || t.id))
        .slice(0, 100)
        .reverse();

      const tx = widgetsDb.transaction((items) => {
        widgetsDb.prepare("DELETE FROM music_history").run();
        const insertTrack = widgetsDb.prepare(`
          INSERT INTO music_history (
            track_id, title, author, duration, duration_seconds, thumbnail_ref,
            source, original_url, played_by_user_id, played_by_nickname, played_by_avatar_ref,
            played_by_json, played_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const t of items) {
          const thumbRef = cas.storeDataUri(t.thumbnail || "");
          let pbAvatarRef = null;
          let cleanPlayedBy = null;
          if (t.playedBy && typeof t.playedBy === "object") {
            pbAvatarRef = cas.storeDataUri(t.playedBy.avatar || null);
            cleanPlayedBy = { ...t.playedBy, avatar: pbAvatarRef };
          }
          insertTrack.run(
            String(t.trackId || t.id),
            String(t.title || "Audio"),
            String(t.author || "Unknown"),
            String(t.duration || "0:00"),
            Number(t.durationSeconds) || 0,
            thumbRef,
            String(t.source || "Audio"),
            String(t.originalUrl || t.url || ""),
            cleanPlayedBy?.id || null,
            cleanPlayedBy?.nickname || cleanPlayedBy?.name || null,
            pbAvatarRef,
            cleanPlayedBy ? JSON.stringify(cleanPlayedBy) : null,
            Number(t.playedAt) || Date.now()
          );
        }
      });
      tx(cleaned);
      return { success: true };
    } catch (err) {
      console.error("Error guardando historial en widgets.db:", err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("activity:load-playtime", async () => {
    try {
      const activityDb = DbManager.getInstance(app.getPath("userData")).getGlobalDb("activity");
      const rows = activityDb.prepare("SELECT * FROM game_playtime ORDER BY total_seconds DESC").all();
      const map = {};
      for (const r of rows) {
        map[r.game_key] = {
          name: r.display_name,
          cover: r.cover_ref || null,
          type: r.activity_type || "Playing",
          totalSeconds: r.total_seconds || 0,
          lastPlayed: r.last_played_at || 0,
        };
      }
      return map;
    } catch {
      return {};
    }
  });

  ipcMain.handle("activity:save-playtime", async (_event, playtimeMap) => {
    if (!playtimeMap || typeof playtimeMap !== "object") return { success: false };
    try {
      const userData = app.getPath("userData");
      const activityDb = DbManager.getInstance(userData).getGlobalDb("activity");
      const cas = CasStore.getInstance(userData);
      const upsert = activityDb.prepare(`
        INSERT OR REPLACE INTO game_playtime (
          game_key, display_name, cover_ref, activity_type, total_seconds, last_played_at, sessions_count
        ) VALUES (?, ?, ?, ?, ?, ?, 1)
      `);
      const tx = activityDb.transaction((entries) => {
        for (const [k, v] of entries) {
          if (!v || typeof v !== "object") continue;
          const coverRef = cas.storeDataUri(v.cover || null);
          upsert.run(
            String(k),
            String(v.name || k),
            coverRef,
            String(v.type || "Playing"),
            Number(v.totalSeconds) || 0,
            Number(v.lastPlayed) || Date.now()
          );
        }
      });
      tx(Object.entries(playtimeMap));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("dashboard:load-islands", async () => {
    try {
      const dashDb = DbManager.getInstance(app.getPath("userData")).getGlobalDb("dashboard");
      const rows = dashDb.prepare("SELECT * FROM dashboard_islands").all();
      const map = {};
      for (const r of rows) {
        map[r.island_id] = {
          x: r.x,
          y: r.y,
          w: r.w,
          h: r.h,
          visible: Boolean(r.visible),
          ...(r.config_json ? JSON.parse(r.config_json) : {}),
        };
      }
      return map;
    } catch {
      return {};
    }
  });

  ipcMain.handle("dashboard:save-islands", async (_event, layoutMap) => {
    if (!layoutMap || typeof layoutMap !== "object") return { success: false };
    try {
      const dashDb = DbManager.getInstance(app.getPath("userData")).getGlobalDb("dashboard");
      const now = Date.now();
      const upsert = dashDb.prepare(`
        INSERT OR REPLACE INTO dashboard_islands (island_id, x, y, w, h, visible, config_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const tx = dashDb.transaction((entries) => {
        for (const [id, geo] of entries) {
          if (!geo || typeof geo !== "object") continue;
          upsert.run(
            String(id),
            Number(geo.x) || 0,
            Number(geo.y) || 0,
            Number(geo.w) || 4,
            Number(geo.h) || 4,
            geo.visible !== false ? 1 : 0,
            JSON.stringify(geo),
            now
          );
        }
      });
      tx(Object.entries(layoutMap));
      return { success: true };
    } catch (err) {
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
