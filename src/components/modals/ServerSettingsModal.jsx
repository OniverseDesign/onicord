import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { checkPermission } from "../../lib/permissionsHelper";
import { copyTextToClipboard } from "../../lib/clipboard";
import { getWebInviteUrl } from "../../lib/inviteUtils";
import ModalShell, {
  ModalButton,
} from "../ui/ModalShell";

import ServerOverviewTab from "../settings/ServerOverviewTab";
import ServerChannelsTab from "../settings/ServerChannelsTab";
import ServerRolesTab from "../settings/ServerRolesTab";
import ServerMembersTab from "../settings/ServerMembersTab";
import ServerInviteTab from "../settings/ServerInviteTab";
import ServerStorageTab from "../settings/ServerStorageTab";
import ServerNetworkTab from "../settings/ServerNetworkTab";
import ServerAuditTab from "../settings/ServerAuditTab";
import ServerPluginsTab from "../settings/ServerPluginsTab";
import ServerWebhooksTab from "../settings/ServerWebhooksTab";

function slugId(prefix, name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return `${prefix}-${base || "nuevo"}-${Date.now().toString(36).slice(-4)}`;
}

export default function ServerSettingsModal({
  server,
  peers = [],
  profile,
  onClose,
  onSaved,
  onSave,
  sanitizedMembersList = [],
  servers,
  onLeave,
  onRefreshServers,
  onProfileChange,
}) {
  if (!server) return null;
  const { t } = useTranslation();

  const serverWithCopy = useMemo(() => {
    if (!server) return null;
    const copy = { ...server };
    if (!copy.ownerId && copy.isOwner && profile?.id) {
      copy.ownerId = profile.id;
    }
    return copy;
  }, [server, profile?.id]);

  const hasAdvanced = checkPermission(serverWithCopy, profile?.id, "view_advanced_settings");
  const hasAdmin = checkPermission(serverWithCopy, profile?.id, "admin");

  const SECTIONS = useMemo(
    () => {
      const base = [
        {
          id: "overview",
          label: t("serverSettings.tabs.overview"),
          icon: "settings",
          keywords: ["general", "servidor", "nombre", "icono", "banner", "eliminar"],
          features: [
            { id: "serverName", label: t("serverSettings.overview.serverName", "Nombre del Servidor"), keywords: ["nombre", "servidor", "titulo", "cambiar nombre"] },
            { id: "serverIcon", label: t("serverSettings.overview.serverIcon", "Icono del Servidor"), keywords: ["icono", "avatar", "imagen", "foto", "logo"] },
            { id: "serverBanner", label: t("serverSettings.overview.serverBanner", "Banner del Servidor"), keywords: ["banner", "fondo", "cabecera", "imagen"] },
            { id: "deleteServer", label: t("serverSettings.overview.deleteServer", "Eliminar Servidor definitivamente"), keywords: ["eliminar", "borrar", "destruir", "servidor"] },
          ],
        },
      ];
      if (hasAdvanced) {
        base.push(
          {
            id: "channels",
            label: t("serverSettings.tabs.channels"),
            icon: "tag",
            keywords: ["canales", "texto", "voz", "categorias", "chat"],
            features: [
              { id: "textChannels", label: t("serverSettings.channels.text", "Canales de texto"), keywords: ["texto", "chat", "mensajes", "crear canal"] },
              { id: "voiceChannels", label: t("serverSettings.channels.voice", "Canales de voz"), keywords: ["voz", "llamada", "lounges", "audio", "hablar"] },
              { id: "categories", label: t("serverSettings.channels.categories", "Categorías de canales"), keywords: ["categoria", "organizar", "reordenar", "grupos"] },
            ],
          },
          {
            id: "roles",
            label: t("serverSettings.tabs.roles"),
            icon: "shield",
            keywords: ["roles", "permisos", "rangos", "moderacion", "seguridad"],
            features: [
              { id: "roleList", label: t("serverSettings.roles.list", "Roles y jerarquía"), keywords: ["roles", "rangos", "jerarquia", "admin", "moderador"] },
              { id: "rolePermissions", label: t("serverSettings.roles.permissions", "Permisos de roles"), keywords: ["permisos", "privilegios", "seguridad", "expulsar"] },
            ],
          }
        );
      }
      if (hasAdmin) {
        base.push(
          {
            id: "members",
            label: t("serverSettings.tabs.members", "Miembros"),
            icon: "group",
            keywords: ["miembros", "usuarios", "personas", "lista", "kick", "ban"],
            features: [
              { id: "memberList", label: t("serverSettings.members.list", "Miembros sincronizados P2P"), keywords: ["miembros", "usuarios", "amigos", "personas", "lista"] },
              { id: "memberKickBan", label: t("serverSettings.members.kickBan", "Expulsar o banear miembros"), keywords: ["kick", "ban", "expulsar", "bloquear", "echar"] },
            ],
          },
          {
            id: "audit",
            label: t("serverSettings.tabs.audit", "Auditoría"),
            icon: "history",
            keywords: ["auditoria", "historial", "seguridad", "log", "registro"],
            features: [
              { id: "auditLog", label: t("serverSettings.audit.log", "Registro de auditoría del servidor"), keywords: ["auditoria", "historial", "cambios", "seguridad", "log"] },
            ],
          }
        );
      }
      base.push(
        {
          id: "invite",
          label: t("serverSettings.tabs.invites"),
          icon: "link",
          keywords: ["invitaciones", "enlace", "link", "roomcode", "codigo"],
          features: [
            { id: "roomCode", label: t("serverSettings.invite.roomCode", "Código de sala P2P (roomCode)"), keywords: ["codigo", "roomcode", "clave", "enlace"] },
            { id: "webInvite", label: t("serverSettings.invite.webInvite", "Enlace de invitación web"), keywords: ["invitacion", "link", "url", "unirse", "compartir"] },
          ],
        },
        {
          id: "plugins",
          label: "Complementos",
          icon: "extension",
          keywords: ["complementos", "addons", "plugins", "juegos", "arcade", "isla"],
          features: [
            { id: "serverPlugins", label: t("serverSettings.plugins.title", "Complementos activos en el servidor"), keywords: ["addons", "complementos", "servidor", "juegos", "arcade", "isla"] },
          ],
        },
        {
          id: "storage",
          label: t("serverSettings.tabs.storage", "Almacenamiento"),
          icon: "folder",
          keywords: ["almacenamiento", "disco", "archivos", "mensajes", "peso", "limpiar"],
          features: [
            { id: "storageStats", label: t("serverSettings.storage.stats", "Espacio en disco y mensajes"), keywords: ["almacenamiento", "disco", "archivos", "mensajes", "peso"] },
            { id: "clearStorage", label: t("serverSettings.storage.clear", "Limpiar caché de archivos locales"), keywords: ["limpiar", "borrar", "purgar", "optimizar"] },
          ],
        }
      );
      if (hasAdvanced) {
        base.push(
          {
            id: "network",
            label: t("serverSettings.tabs.network", "Red"),
            icon: "dns",
            keywords: ["red", "p2p", "hyperswarm", "dht", "webrtc", "peers"],
            features: [
              { id: "p2pStatus", label: t("serverSettings.network.p2p", "Estado de red Hyperswarm DHT"), keywords: ["red", "p2p", "enjambre", "swarm", "dht", "peers", "conexiones"] },
              { id: "webrtcStats", label: t("serverSettings.network.webrtc", "Diagnóstico de canales WebRTC"), keywords: ["webrtc", "latencia", "ping", "paquetes"] },
            ],
          },
          {
            id: "webhooks",
            label: t("serverSettings.tabs.webhooks", "Webhooks"),
            icon: "hub",
            keywords: ["webhooks", "api", "bots", "notificaciones", "discord", "http", "rss"],
            features: [
              { id: "incomingWebhooks", label: t("serverSettings.webhooks.incomingFeature", "Webhooks entrantes (API / Discord)"), keywords: ["webhook", "entrante", "api", "bot", "discord", "curl", "notificaciones"] },
              { id: "outgoingWebhooks", label: t("serverSettings.webhooks.outgoingFeature", "Webhooks salientes (Polling de feeds/APIs)"), keywords: ["saliente", "polling", "rss", "feed", "intervalo"] },
            ],
          }
        );
      }
      return base;
    },
    [t, hasAdvanced, hasAdmin]
  );
  const [section, setSection] = useState("overview");
  const [name, setName] = useState(server.name);
  const [icon, setIcon] = useState(server.icon ?? null);
  const [banner, setBanner] = useState(server.banner ?? null);
  const [channels, setChannels] = useState(
    server.channels?.map((c) => ({ ...c })) ?? [],
  );
  const [disableFlameSystem, setDisableFlameSystem] = useState(
    server.disableFlameSystem ?? false,
  );
  const [groupByRoles, setGroupByRoles] = useState(
    server.groupByRoles ?? false,
  );
  const [allowExecutableFiles, setAllowExecutableFiles] = useState(
    server.allowExecutableFiles ?? false,
  );

  const [roles, setRoles] = useState(server.roles ?? []);
  const [userRoles, setUserRoles] = useState(server.userRoles ?? {});
  const [nuevoRoleName, setNuevoRoleName] = useState("");
  const [iceServers, setIceServers] = useState(server.iceServers ?? []);
  const [directConnectionEnabled, setDirectConnectionEnabled] = useState(server.directConnectionEnabled ?? false);
  const [directIP, setDirectIP] = useState(server.directIP ?? "");
  const [directPort, setDirectPort] = useState(server.directPort ?? 7777);
  const [bannedUsers, setBannedUsers] = useState(server.bannedUsers ?? []);
  const [kickedUsers, setKickedUsers] = useState(server.kickedUsers ?? {});
  const [serverPlugins, setServerPlugins] = useState(server.plugins ?? []);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (server) {
      setName(server.name || "");
      setIcon(server.icon ?? null);
      setBanner(server.banner ?? null);
      setChannels(server.channels?.map((c) => ({ ...c })) ?? []);
      setDisableFlameSystem(Boolean(server.disableFlameSystem));
      setGroupByRoles(Boolean(server.groupByRoles));
      setAllowExecutableFiles(Boolean(server.allowExecutableFiles));
      setRoles(server.roles ?? []);
      setUserRoles(server.userRoles ?? {});
      setIceServers(server.iceServers ?? []);
      setDirectConnectionEnabled(Boolean(server.directConnectionEnabled));
      setDirectIP(server.directIP ?? "");
      setDirectPort(server.directPort ?? 7777);
      setBannedUsers(server.bannedUsers ?? []);
      setKickedUsers(server.kickedUsers ?? {});
      setServerPlugins(server.plugins ?? []);
    }
  }, [server]);

  const updateChannelById = (id, field, value) => {
    setChannels((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    );
  };

  const addChannel = (type, parentId = null) => {
    const defaultName =
      type === "category"
        ? t("serverSettings.channels.defaultCategoryName", "Category")
        : type === "text"
          ? t("serverSettings.channels.defaultTextChannelName", "general")
          : t("serverSettings.channels.defaultVoiceChannelName", "Voice Lounge");

    setChannels((prev) => [
      ...prev,
      {
        id: slugId(
          type === "category" ? "cat" : type === "text" ? "ch" : "voice",
          defaultName,
        ),
        type,
        name: defaultName,
        isPrivate: false,
        allowedRoles: [],
        ...(parentId ? { parentId } : {}),
      },
    ]);
  };

  const removeChannelById = (id) => {
    setChannels((prev) => {
      const toRemove = prev.find((c) => c.id === id);
      const next =
        toRemove?.type === "category" || String(id).startsWith("cat-")
          ? prev.filter((c) => c.id !== id && c.parentId !== id)
          : prev.filter((c) => c.id !== id);

      const isCatNode = (c) =>
        c.type === "category" || String(c.id).startsWith("cat-");
      if (next.filter((c) => !isCatNode(c)).length < 1) {
        setError("At least one channel must remain");
        return prev;
      }
      setError(null);
      return next;
    });
  };

  const handleDragStart = (e, type, id) => {
    e.dataTransfer.setData("dragType", type);
    e.dataTransfer.setData("dragId", id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDropChannel = (e, targetCatId, targetChannelId = null) => {
    e.preventDefault();
    e.stopPropagation();
    const type = e.dataTransfer.getData("dragType");
    const dragId = e.dataTransfer.getData("dragId");

    if (type !== "channel" || !dragId || dragId === targetChannelId) return;

    setChannels((prev) => {
      const copy = prev.map((c) => ({ ...c }));
      const dragIdx = copy.findIndex((c) => c.id === dragId);
      if (dragIdx === -1) return prev;

      const draggedItem = copy[dragIdx];
      draggedItem.parentId = targetCatId || null;

      copy.splice(dragIdx, 1);

      if (targetChannelId) {
        const dropIdx = copy.findIndex((c) => c.id === targetChannelId);
        if (dropIdx !== -1) {
          copy.splice(dropIdx, 0, draggedItem);
          return copy;
        }
      }
      copy.push(draggedItem);
      return copy;
    });
  };

  const handleDropCategory = (e, targetCatId) => {
    e.preventDefault();
    e.stopPropagation();
    const type = e.dataTransfer.getData("dragType");
    const dragId = e.dataTransfer.getData("dragId");

    if (type === "channel") {
      return handleDropChannel(e, targetCatId, null);
    }

    if (type !== "category" || !dragId || dragId === targetCatId) return;

    setChannels((prev) => {
      const copy = prev.map((c) => ({ ...c }));
      const dragIdx = copy.findIndex((c) => c.id === dragId);
      const dropIdx = copy.findIndex((c) => c.id === targetCatId);
      if (dragIdx === -1 || dropIdx === -1) return prev;

      const draggedItem = copy.splice(dragIdx, 1)[0];
      copy.splice(dropIdx, 0, draggedItem);
      return copy;
    });
  };

  const handleRoleDragStart = (e, type, roleId) => {
    e.dataTransfer.setData("dragType", type);
    e.dataTransfer.setData("dragId", roleId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleRoleDrop = (e, targetRoleId = null) => {
    e.preventDefault();
    e.stopPropagation();
    const type = e.dataTransfer.getData("dragType");
    const dragId = e.dataTransfer.getData("dragId");

    if (type !== "role" || !dragId || dragId === targetRoleId) return;

    setRoles((prev) => {
      const copy = [...prev];
      const dragIdx = copy.findIndex((r) => r.id === dragId);
      if (dragIdx === -1) return prev;

      const draggedItem = copy[dragIdx];
      copy.splice(dragIdx, 1);

      if (targetRoleId) {
        const dropIdx = copy.findIndex((r) => r.id === targetRoleId);
        if (dropIdx !== -1) {
          copy.splice(dropIdx, 0, draggedItem);
          return copy;
        }
      }
      copy.push(draggedItem);
      return copy;
    });
  };

  const handleAddRole = () => {
    if (!nuevoRoleName.trim()) return;
    const id = `role-${crypto.randomUUID().slice(0, 8)}`;
    setRoles([
      ...roles,
      {
        id,
        name: nuevoRoleName.trim(),
        color: "#ca9ee6",
        permissions: {
          admin: false,
          send_messages: true,
          connect_voice: true,
          share_video: true,
          view_advanced_settings: false,
        },
      },
    ]);
    setNuevoRoleName("");
  };

  const handleUpdateRole = (id, field, value) => {
    setRoles(roles.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const handleRemoveRole = (id) => {
    setRoles(roles.filter((r) => r.id !== id));
    const copiaUserRoles = { ...userRoles };
    Object.keys(copiaUserRoles).forEach((uid) => {
      if (Array.isArray(copiaUserRoles[uid])) {
        copiaUserRoles[uid] = copiaUserRoles[uid].filter((rId) => rId !== id);
        if (copiaUserRoles[uid].length === 0) delete copiaUserRoles[uid];
      } else if (copiaUserRoles[uid] === id) {
        delete copiaUserRoles[uid];
      }
    });
    setUserRoles(copiaUserRoles);
  };

  const handleAssignRole = (userId, roleId) => {
    if (!roleId) return;
    setUserRoles((prev) => {
      const next = { ...prev };
      const currentRoles = Array.isArray(next[userId])
        ? next[userId]
        : next[userId]
          ? [next[userId]]
          : [];

      if (!currentRoles.includes(roleId)) {
        next[userId] = [...currentRoles, roleId];
      }
      return next;
    });
  };

  const handleRemoveUserRole = (userId, roleId) => {
    setUserRoles((prev) => {
      const next = { ...prev };
      const currentRoles = Array.isArray(next[userId])
        ? next[userId]
        : next[userId]
          ? [next[userId]]
          : [];

      const filtered = currentRoles.filter((id) => id !== roleId);
      if (filtered.length === 0) {
        delete next[userId];
      } else {
        next[userId] = filtered;
      }
      return next;
    });
  };

  const copyCode = async () => {
    await copyTextToClipboard(getWebInviteUrl(server.roomCode, server.name));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await window.electronAPI.updateServerSettings(serverWithCopy.id, {
        name: name.trim(),
        icon,
        banner,
        roles,
        userRoles,
        disableFlameSystem,
        groupByRoles,
        allowExecutableFiles,
        iceServers,
        directConnectionEnabled,
        directIP,
        directPort,
        bannedUsers,
        kickedUsers,
        plugins: serverPlugins,
        ownerId: serverWithCopy.ownerId,
        channels: channels.map((c) => {
          const isCat =
            c.type === "category" || String(c.id).startsWith("cat-");
          return {
            id: c.id,
            type: isCat ? "category" : c.type,
            name:
              c.name.trim() ||
              (isCat ? "Category" : c.type === "text" ? "general" : "voice"),
            parentId: c.parentId || null,
            isPrivate: Boolean(c.isPrivate),
            allowedRoles: Array.isArray(c.allowedRoles) ? c.allowedRoles : [],
          };
        }),
      });
      const notifySave = onSaved || onSave;
      notifySave?.(updated);
      onClose();
    } catch (err) {
      setError(err.message || "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const renderFooter = () => {
    if (section === "invite" || (!hasAdvanced && section === "overview"))
      return (
        <ModalButton key="btn-ready" variant="primary" onClick={onClose}>
          {t("common.confirm")}
        </ModalButton>
      );
    return (
      <>
        <ModalButton key="btn-cancel" variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </ModalButton>
        <ModalButton key="btn-save" variant="primary" disabled={busy} onClick={handleSave}>
          {busy ? t("common.saving") : t("common.save")}
        </ModalButton>
      </>
    );
  };

  const todosLosMiembros = useMemo(() => {
    const memberMap = new Map();

    // 1. Incorporar miembros guardados / históricos del servidor (garantiza ver a Juancarlo, subb, etc.)
    const saved = server?.savedMembers || serverWithCopy?.savedMembers;
    const savedList = Array.isArray(saved)
      ? saved
      : typeof saved === "object" && saved !== null
      ? Object.values(saved)
      : [];

    for (const m of savedList) {
      const id = m?.id || m?.userId;
      if (!id) continue;
      memberMap.set(id, {
        id,
        nickname: m.nickname || m.name || "Usuario",
        avatar: m.avatar || null,
        customStatus: m.customStatus || null,
        joinedAt: m.joinedAt || null,
      });
    }

    // 2. Integrar lista sanitizada de RoomView si fue provista
    for (const m of sanitizedMembersList || []) {
      const id = m?.id || m?.userId || m?.peerId;
      if (!id) continue;
      const prev = memberMap.get(id) || {};
      memberMap.set(id, {
        ...prev,
        ...m,
        id,
        nickname: m.nickname || prev.nickname || "Usuario",
        avatar: m.avatar || prev.avatar || null,
      });
    }

    // 3. Integrar peers conectados en tiempo real
    for (const p of peers || []) {
      const id = p?.userId || p?.id || p?.peerId;
      if (!id) continue;
      const prev = memberMap.get(id) || {};
      memberMap.set(id, {
        ...prev,
        ...p,
        id,
        nickname: p.nickname || prev.nickname || "Usuario",
        avatar: p.avatar || prev.avatar || null,
      });
    }

    // 4. Integrar usuario local
    if (profile?.id) {
      const prev = memberMap.get(profile.id) || {};
      memberMap.set(profile.id, {
        ...prev,
        id: profile.id,
        nickname: profile.nickname || prev.nickname || t("common.you", "Tú"),
        avatar: profile.avatar || prev.avatar || null,
      });
    }

    // 5. Asegurar presencia del owner si está configurado
    const ownerId = serverWithCopy?.ownerId || server?.ownerId;
    if (ownerId && !memberMap.has(ownerId)) {
      memberMap.set(ownerId, {
        id: ownerId,
        nickname: "Propietario",
        avatar: null,
      });
    }

    return Array.from(memberMap.values());
  }, [
    server?.savedMembers,
    serverWithCopy?.savedMembers,
    serverWithCopy?.ownerId,
    server?.ownerId,
    sanitizedMembersList,
    peers,
    profile,
    t,
  ]);

  return (
    <ModalShell
      title={t("serverSettings.title", "Server")}
      subtitle={server.name}
      sections={SECTIONS}
      activeSection={section}
      onSectionChange={setSection}
      onClose={onClose}
      footer={renderFooter()}
    >
      {section === "overview" && (
        <ServerOverviewTab
          name={name}
          setName={setName}
          icon={icon}
          setIcon={setIcon}
          banner={banner}
          setBanner={setBanner}
          setError={setError}
          disableFlameSystem={disableFlameSystem}
          setDisableFlameSystem={setDisableFlameSystem}
          groupByRoles={groupByRoles}
          setGroupByRoles={setGroupByRoles}
          allowExecutableFiles={allowExecutableFiles}
          setAllowExecutableFiles={setAllowExecutableFiles}
          readOnly={!hasAdvanced}
          channels={channels}
          server={server}
        />
      )}

      {section === "channels" && (
        <ServerChannelsTab
          channels={channels}
          roles={roles}
          updateChannelById={updateChannelById}
          removeChannelById={removeChannelById}
          addChannel={addChannel}
          handleDragStart={handleDragStart}
          handleDragOver={handleDragOver}
          handleDropChannel={handleDropChannel}
          handleDropCategory={handleDropCategory}
        />
      )}

      {section === "roles" && (
        <ServerRolesTab
          nuevoRoleName={nuevoRoleName}
          setNuevoRoleName={setNuevoRoleName}
          handleAddRole={handleAddRole}
          roles={roles}
          handleRoleDragStart={handleRoleDragStart}
          handleDragOver={handleDragOver}
          handleRoleDrop={handleRoleDrop}
          handleUpdateRole={handleUpdateRole}
          handleRemoveRole={handleRemoveRole}
          todosLosMiembros={todosLosMiembros}
          userRoles={userRoles}
          handleAssignRole={handleAssignRole}
          handleRemoveUserRole={handleRemoveUserRole}
          profile={profile}
          ownerId={serverWithCopy?.ownerId}
        />
      )}

      {section === "members" && (
        <ServerMembersTab
          server={serverWithCopy}
          roles={roles}
          todosLosMiembros={todosLosMiembros}
          userRoles={userRoles}
          handleAssignRole={handleAssignRole}
          handleRemoveUserRole={handleRemoveUserRole}
          profile={profile}
          bannedUsers={bannedUsers}
          setBannedUsers={setBannedUsers}
          kickedUsers={kickedUsers}
          setKickedUsers={setKickedUsers}
        />
      )}

      {section === "invite" && (
        <ServerInviteTab
          server={server}
          copyCode={copyCode}
          copied={copied}
        />
      )}

      {section === "plugins" && (
        <ServerPluginsTab
          server={{ ...serverWithCopy, plugins: serverPlugins }}
          onUpdateServer={(updated) => setServerPlugins(updated.plugins || [])}
          onCloseSettings={onClose}
        />
      )}

      {section === "storage" && (
        <ServerStorageTab
          server={server}
        />
      )}
      
      {section === "network" && (
        <ServerNetworkTab
          iceServers={iceServers}
          setIceServers={setIceServers}
          directConnectionEnabled={directConnectionEnabled}
          setDirectConnectionEnabled={setDirectConnectionEnabled}
          directIP={directIP}
          setDirectIP={setDirectIP}
          directPort={directPort}
          setDirectPort={setDirectPort}
          roomCode={server.roomCode}
        />
      )}

      {section === "webhooks" && (
        <ServerWebhooksTab
          server={serverWithCopy}
          onUpdateServer={onSaved}
          profile={profile}
        />
      )}
      
      {section === "audit" && (
        <ServerAuditTab
          server={serverWithCopy}
        />
      )}
      
      {error && (
        <p className="onicord-error-banner mt-3 animate-fade-in">{error}</p>
      )}
    </ModalShell>
  );
}
