const { app } = require("electron");
const crypto = require("crypto");
const { ServerStore } = require("../p2p/serverStore.cjs");
const { RoomMetaStore } = require("../p2p/roomMetaStore.cjs");

class ServerService {
  getServerStore() {
    return new ServerStore(app.getPath("userData"));
  }

  async enterServer(serverId, profile, roomManager, startLocalStreamServer) {
    const store = this.getServerStore();
    const server = await store.get(serverId);
    if (!server) throw new Error("Server not found");

    const profileService = require("./profileService.cjs");
    await profileService.saveProfileToDisk(profile);

    roomManager.setProfile(profile);
    await roomManager.connectToRoom(server.roomCode, server.isOwner, profile);
    await store.touch(serverId);
    if (typeof store.setLastActive === "function") {
      await store.setLastActive(serverId);
    }

    if (startLocalStreamServer) {
      startLocalStreamServer();
    }

    return server;
  }

  async bootBackgroundServers(profile, excludeServerId, roomManager) {
    if (!roomManager) return;
    const store = this.getServerStore();
    const servers = await store.list();
    for (const server of servers) {
      if (server.id === excludeServerId) continue;
      if (!server.roomCode) continue;
      try {
        await roomManager.connectToRoom(server.roomCode, server.isOwner, profile);
      } catch (err) {
        console.error(`[ServerService] Error booting background room ${server.roomCode}:`, err.message);
      }
    }
  }

  async createServer(name, profile) {
    const profileService = require("./profileService.cjs");
    await profileService.saveProfileToDisk(profile);

    const code = crypto.randomBytes(4).toString("hex").toUpperCase();

    const server = await this.getServerStore().add({
      name: name || "My Server",
      roomCode: code,
      isOwner: true,
      ownerId: profile.id,
    });

    const roomMetaStore = new RoomMetaStore(app.getPath("userData"));
    await roomMetaStore.bump(
      code,
      { name: server.name, channels: server.channels, ownerId: profile.id },
      "local"
    );

    return server;
  }

  async leaveRoom(roomManager) {
    console.log(
      "\n============= [SERVICE COMMAND] EXECUTING ROOM: LEAVE ============="
    );
    if (roomManager) {
      try {
        roomManager.leaveVoice();
        console.log("[ONICORD P2P] Canal de voz purgado preventivamente.");
        await roomManager.destroy();
        console.log("[ONICORD P2P] Servidor Ares y Swarm destruidos con éxito.");
      } catch (err) {
        console.error(
          "[ONICORD P2P Error] Failed to clear network buffers:",
          err.message
        );
      }
    }
  }

  async removeServer(serverId, roomManager) {
    console.log(
      `\n============= [SERVICE COMMAND] DELETING SERVER: ${serverId} =============`
    );
    const store = this.getServerStore();
    const server = await store.get(serverId);

    const isCurrentlyActiveRoom =
      server &&
      roomManager &&
      (
        (roomManager.rooms && roomManager.rooms.has(server.roomCode)) ||
        (roomManager.chatService && roomManager.chatService._isActiveRoom?.(server.roomCode)) ||
        (roomManager.roomCode && (
          String(roomManager.roomCode).toUpperCase() === String(server.roomCode || "").toUpperCase() ||
          String(roomManager.roomCode).toUpperCase() === String(server.id || "").toUpperCase()
        ))
      );

    if (isCurrentlyActiveRoom) {
      try {
        const roomMetaStore = roomManager.roomMetaStore;
        if (roomMetaStore) {
          const meta = await roomMetaStore.load(server.roomCode);
          const localProfileId = roomManager.p2pService?.profile?.id;
          if (meta && localProfileId && meta.ownerId === localProfileId) {
            const otherMembers = Object.values(meta.savedMembers || {})
              .filter((m) => m.id !== localProfileId);

            if (otherMembers.length > 0) {
              otherMembers.sort((a, b) => {
                const ta = a.joinedAt || a.updatedAt || Date.now();
                const tb = b.joinedAt || b.updatedAt || Date.now();
                return ta - tb;
              });

              const newOwnerId = otherMembers[0].id;
              console.log(`[Owner Inheritance] Transferring ownership of server ${server.roomCode} from ${meta.ownerId} to oldest member: ${newOwnerId}`);

              await roomMetaStore.bump(
                server.roomCode,
                { ownerId: newOwnerId },
                localProfileId
              );

              await roomManager.publishServerMeta({
                ownerId: newOwnerId
              }).catch(() => {});
            }
          }
        }
      } catch (err) {
        console.error("[Owner Inheritance] Error transferring ownership on leave:", err.message);
      }

      try {
        roomManager.leaveVoice();
        await roomManager.destroy();
        console.log(
          "[ONICORD P2P] Servidor activo removido y sockets purgados del S.O."
        );
      } catch (e) {
        console.error(
          "[ONICORD P2P] Error purging manager on removal:",
          e.message
        );
      }
    }

    return await store.remove(serverId);
  }

  async joinServer(code, name, profile) {
    const profileService = require("./profileService.cjs");
    await profileService.saveProfileToDisk(profile);

    const normalized = String(code).trim().toUpperCase();
    if (!/^[A-F0-9]{8}$/.test(normalized))
      throw new Error("Código de invitación inválido");

    return await this.getServerStore().add({
      name: name || `Servidor ${normalized}`,
      roomCode: normalized,
      isOwner: false,
    });
  }

  async listServers() {
    return await this.getServerStore().list();
  }

  async updateServer(serverId, data, roomManager) {
    const store = this.getServerStore();
    const beforeObj = await store.get(serverId);
    const before = beforeObj ? JSON.parse(JSON.stringify(beforeObj)) : null;
    const updated = await store.updateSettings(serverId, data);
    if (!updated) return null;

    const auditLogs = [];
    if (before && roomManager?.profile) {
      const profile = roomManager.profile;
      const editorInfo = {
        userId: profile.id,
        nickname: profile.nickname || "Usuario",
        avatar: profile.avatar || null,
      };

      const log = (action, target, details) => {
        auditLogs.push({
          id: crypto.randomUUID(),
          userId: editorInfo.userId,
          nickname: editorInfo.nickname,
          avatar: editorInfo.avatar,
          action,
          target: String(target || "").slice(0, 50),
          timestamp: Date.now(),
          details: String(details || "").slice(0, 200),
        });
      };

      if (data.name !== undefined && before.name !== data.name) {
        log("update_settings", data.name, `Changed server name to "${data.name}"`);
      }
      if (data.icon !== undefined && before.icon !== data.icon) {
        log("update_settings", "Icon", "Updated server icon");
      }
      if (data.banner !== undefined && before.banner !== data.banner) {
        log("update_settings", "Banner", "Updated server banner");
      }
      if (data.disableFlameSystem !== undefined && before.disableFlameSystem !== data.disableFlameSystem) {
        log("update_settings", "Flame Settings", data.disableFlameSystem ? "Disabled Flame system" : "Enabled Flame system");
      }
      if (data.groupByRoles !== undefined && before.groupByRoles !== data.groupByRoles) {
        log("update_settings", "Member Settings", data.groupByRoles ? "Enabled grouping by user rank groups in sidebar" : "Disabled grouping by user rank groups in sidebar");
      }
      if (data.allowExecutableFiles !== undefined && before.allowExecutableFiles !== data.allowExecutableFiles) {
        log("update_settings", "File Security", data.allowExecutableFiles ? "Allowed executable files sending and downloading" : "Restricted executable files sending");
      }

      if (Array.isArray(data.channels)) {
        const beforeChs = before.channels || [];
        const newChs = data.channels || [];

        for (const bc of beforeChs) {
          if (!newChs.some((nc) => nc.id === bc.id)) {
            const isCat = bc.type === "category" || String(bc.id).startsWith("cat-");
            const chTypeLabel = isCat ? "category" : bc.type === "voice" ? "voice channel" : "text channel";
            log("delete_channel", bc.name, `Deleted ${chTypeLabel} "${bc.name}"`);
          }
        }

        for (const nc of newChs) {
          const bc = beforeChs.find((c) => c.id === nc.id);
          const isCat = nc.type === "category" || String(nc.id).startsWith("cat-");
          const chTypeLabel = isCat ? "category" : nc.type === "voice" ? "voice channel" : "text channel";

          if (!bc) {
            log("create_channel", nc.name, `Created ${chTypeLabel} "${nc.name}"`);
          } else {
            if (bc.name !== nc.name) {
              if (isCat) {
                log("update_category", nc.name, `Renamed category "${bc.name}" to "${nc.name}"`);
              } else {
                log("update_channel", nc.name, `Renamed ${chTypeLabel} "${bc.name}" to "${nc.name}"`);
              }
            }
            if (bc.parentId !== nc.parentId) {
              const oldCatName = bc.parentId ? (beforeChs.find((c) => c.id === bc.parentId)?.name || "Category") : "Uncategorized";
              const newCatName = nc.parentId ? (newChs.find((c) => c.id === nc.parentId)?.name || "Category") : "Uncategorized";
              log("update_channel", nc.name, `Moved channel "${nc.name}" from category "${oldCatName}" to "${newCatName}"`);
            }
          }
        }
      }

      if (Array.isArray(data.roles)) {
        const beforeRoles = before.roles || [];
        const newRoles = data.roles || [];

        for (const br of beforeRoles) {
          if (!newRoles.some((nr) => nr.id === br.id)) {
            log("update_role", br.name, `Deleted role "${br.name}"`);
          }
        }

        for (let i = 0; i < newRoles.length; i++) {
          const nr = newRoles[i];
          const br = beforeRoles.find((r) => r.id === nr.id);
          if (!br) {
            log("update_role", nr.name, `Created role "${nr.name}"`);
          } else {
            if (br.name !== nr.name) {
              log("update_role", nr.name, `Renamed role "${br.name}" to "${nr.name}"`);
            }
            if (br.color && nr.color && br.color !== nr.color) {
              log("update_role", nr.name, `Changed role palette "${nr.name}" to ${nr.color}`);
            }

            const oldIndex = beforeRoles.findIndex((r) => r.id === nr.id);
            if (oldIndex !== -1 && oldIndex !== i) {
              log("update_role", nr.name, `Reordered role position for "${nr.name}"`);
            }

            const permLabels = {
              admin: "Administrator",
              send_messages: "Send Messages",
              connect_voice: "Connect Voice",
              share_video: "Share Video",
              view_advanced_settings: "View Advanced Settings",
            };

            const changedPerms = [];
            for (const [pk, label] of Object.entries(permLabels)) {
              const beforeVal = br.permissions?.[pk] ?? (pk !== "admin" && pk !== "view_advanced_settings");
              const newVal = nr.permissions?.[pk] ?? (pk !== "admin" && pk !== "view_advanced_settings");
              if (beforeVal !== newVal) {
                changedPerms.push(`${label}: ${newVal ? "Allowed" : "Denied"}`);
              }
            }
            if (changedPerms.length > 0) {
              log("update_role", nr.name, `Modified permissions for role "${nr.name}": ${changedPerms.join(", ")}`);
            }
          }
        }
      }

      if (Array.isArray(data.bannedUsers)) {
        const beforeBanned = Array.isArray(before.bannedUsers) ? before.bannedUsers : [];
        const newBanned = data.bannedUsers;

        const newlyBanned = newBanned.filter((u) => !beforeBanned.includes(u));
        const newlyUnbanned = beforeBanned.filter((u) => !newBanned.includes(u));
        const targetRoomCode = before.roomCode || before.id || roomManager?.roomCode;

        for (const uId of newlyBanned) {
          const memberName = roomManager?.roomMetaStore ? 
            await roomManager.roomMetaStore.load(targetRoomCode).then((meta) => meta.savedMembers?.[uId]?.nickname || uId).catch(() => uId) : uId;
          log("update_settings", memberName, `Banned user "${memberName}" from server`);
        }

        for (const uId of newlyUnbanned) {
          const memberName = roomManager?.roomMetaStore ? 
            await roomManager.roomMetaStore.load(targetRoomCode).then((meta) => meta.savedMembers?.[uId]?.nickname || uId).catch(() => uId) : uId;
          log("update_settings", memberName, `Unbanned user "${memberName}" from server`);
        }
      }

      if (data.kickedUsers) {
        const beforeKicked = before.kickedUsers || {};
        const newKicked = data.kickedUsers;

        const targetRoomCode = before.roomCode || before.id || roomManager?.roomCode;
        for (const [uId, kickTime] of Object.entries(newKicked)) {
          if (!beforeKicked[uId] || beforeKicked[uId] !== kickTime) {
            const memberName = roomManager?.roomMetaStore ? 
              await roomManager.roomMetaStore.load(targetRoomCode).then((meta) => meta.savedMembers?.[uId]?.nickname || uId).catch(() => uId) : uId;
            log("update_settings", memberName, `Kicked user "${memberName}" from server`);
          }
        }
      }

      if (Array.isArray(data.plugins)) {
        const beforePlugins = before.plugins || [];
        const newPlugins = data.plugins || [];

        for (const bp of beforePlugins) {
          if (!newPlugins.some((np) => np.id === bp.id)) {
            const pName = bp.name || bp.id;
            log("update_plugin", pName, `Removed plugin "${pName}" from server`);
          }
        }

        for (const np of newPlugins) {
          const bp = beforePlugins.find((p) => p.id === np.id);
          const pName = np.name || bp?.name || np.id;

          if (!bp) {
            log("update_plugin", pName, `Added plugin "${pName}" to server`);
          } else {
            if (bp.enabled !== false && np.enabled === false) {
              log("update_plugin", pName, `Disabled plugin "${pName}" on server`);
            } else if (bp.enabled === false && np.enabled !== false) {
              log("update_plugin", pName, `Enabled plugin "${pName}" on server`);
            }

            const oldConfig = bp.config || {};
            const newConfig = np.config || {};
            const keys = Array.from(new Set([...Object.keys(oldConfig), ...Object.keys(newConfig)]));
            const changedKeys = [];

            for (const k of keys) {
              if (JSON.stringify(oldConfig[k]) !== JSON.stringify(newConfig[k])) {
                changedKeys.push(`${k}: ${JSON.stringify(newConfig[k])}`);
              }
            }

            if (changedKeys.length > 0) {
              log("update_plugin", pName, `Modified configuration for "${pName}": ${changedKeys.join(", ")}`);
            }
          }
        }
      }

      if (data.directConnectionEnabled !== undefined && before.directConnectionEnabled !== data.directConnectionEnabled) {
        log("update_settings", "Direct Connection", data.directConnectionEnabled ? "Enabled direct P2P connection" : "Disabled direct P2P connection");
      }
      if (Array.isArray(data.iceServers) && JSON.stringify(before.iceServers) !== JSON.stringify(data.iceServers)) {
        log("update_settings", "ICE/STUN Servers", `Updated ICE/STUN servers (${data.iceServers.length} configured)`);
      }

      if (data.userRoles && before.userRoles) {
        const targetRoomCode = before.roomCode || before.id || roomManager?.roomCode;
        const beforeUserIds = Object.keys(before.userRoles || {});
        const newUserIds = Object.keys(data.userRoles || {});
        const allUserIds = Array.from(new Set([...beforeUserIds, ...newUserIds]));

        for (const uId of allUserIds) {
          const bRoles = Array.isArray(before.userRoles[uId]) ? before.userRoles[uId] : (before.userRoles[uId] ? [before.userRoles[uId]] : []);
          const nRoles = Array.isArray(data.userRoles[uId]) ? data.userRoles[uId] : (data.userRoles[uId] ? [data.userRoles[uId]] : []);
          
          const addedRoles = nRoles.filter((r) => !bRoles.includes(r));
          const removedRoles = bRoles.filter((r) => !nRoles.includes(r));

          const memberName = roomManager.roomMetaStore ? 
            await roomManager.roomMetaStore.load(targetRoomCode).then((meta) => meta.savedMembers?.[uId]?.nickname || uId).catch(() => uId) : uId;

          const allRoles = [...(data.roles || []), ...(before.roles || [])];
          
          for (const ar of addedRoles) {
            const roleName = allRoles.find((r) => r.id === ar)?.name || ar;
            log("assign_role", memberName, `Assigned role "${roleName}" to "${memberName}"`);
          }
          for (const rr of removedRoles) {
            const roleName = allRoles.find((r) => r.id === rr)?.name || rr;
            log("assign_role", memberName, `Removed role "${roleName}" from "${memberName}"`);
          }
        }
      }
    }

    const targetServerRoomCode = before?.roomCode || before?.id || updated?.roomCode || updated?.id || roomManager?.roomCode;
    if (targetServerRoomCode && roomManager?.roomMetaStore) {
      let mergedAuditLog = [];
      try {
        const meta = await roomManager.roomMetaStore.load(targetServerRoomCode);
        const existingLog = Array.isArray(meta.auditLog) ? meta.auditLog : [];
        const logMap = new Map();
        for (const entry of [...existingLog, ...auditLogs]) {
          if (entry && entry.id) logMap.set(entry.id, entry);
        }
        mergedAuditLog = Array.from(logMap.values())
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 100);
      } catch (err) {
        mergedAuditLog = auditLogs;
      }

      roomManager
        .publishServerMeta({
          name: updated.name,
          icon: updated.icon,
          banner: updated.banner ?? null,
          channels: updated.channels,
          roles: updated.roles || [],
          userRoles: updated.userRoles || {},
          plugins: updated.plugins || [],
          iceServers: updated.iceServers || [],
          bannedUsers: updated.bannedUsers || [],
          kickedUsers: updated.kickedUsers || {},
          disableFlameSystem: updated.disableFlameSystem || false,
          groupByRoles: updated.groupByRoles || false,
          allowExecutableFiles: updated.allowExecutableFiles || false,
          directConnectionEnabled: updated.directConnectionEnabled || false,
          directIP: updated.directIP || "",
          directPort: updated.directPort || 7777,
          auditLog: mergedAuditLog,
        })
        .catch(() => {});
    }
    return updated;
  }

  async setChannel(serverId, channelId) {
    return await this.getServerStore().touch(serverId, { lastChannelId: channelId });
  }

  async getLastActive() {
    try {
      const store = this.getServerStore();
      const lastId = await store.getLastActive();
      if (!lastId) return null;
      const server = await store.get(lastId);
      return server || { id: lastId };
    } catch (err) {
      console.error("[ServerService] Error getting last active server:", err);
      return null;
    }
  }

  async setChannel(serverId, channelId) {
    try {
      const store = this.getServerStore();
      if (typeof store.setLastChannel === "function") {
        await store.setLastChannel(serverId, channelId);
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async setLastActive(serverId) {
    try {
      const store = this.getServerStore();
      if (typeof store.setLastActive === "function")
        await store.setLastActive(serverId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
}

module.exports = new ServerService();
