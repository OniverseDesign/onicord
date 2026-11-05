import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import DiscoverServerCard from "./DiscoverServerCard";
import { soundEngine } from "../../lib/soundEngine";
import { notificationManager } from "../../lib/notificationManager";

export default function DiscoverView({
  profile,
  servers = [],
  onSelectServer,
  onRefreshServers,
  onNavigate,
}) {
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState(null);
  const [discoveredServers, setDiscoveredServers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyServerCode, setBusyServerCode] = useState(null);

  // Knocking modal / prompt state
  const [knockingServer, setKnockingServer] = useState(null);
  const [knockMessage, setKnockMessage] = useState("");
  const [knockSuccess, setKnockSuccess] = useState(false);

  // 1. Fetch initial discovered servers & subscribe to updates
  useEffect(() => {
    let isMounted = true;
    const api = window.electronAPI;

    const loadServers = async () => {
      setLoading(true);
      try {
        if (api?.getDiscoveredServers) {
          const list = await api.getDiscoveredServers();
          if (isMounted && Array.isArray(list)) {
            setDiscoveredServers(list);
          }
        } else {
          // Fallback / local scan for servers having discover addon active
          if (api?.listServers) {
            const myServers = await api.listServers();
            const publicOnes = (myServers || [])
              .filter((s) => s.discoverConfig?.enabled || s.isPublicDiscover)
              .map((s) => ({
                roomCode: s.roomCode,
                name: s.name,
                icon: s.icon,
                banner: s.banner,
                description: s.discoverConfig?.description || s.description || "",
                category: s.discoverConfig?.category || "General",
                tags: s.discoverConfig?.tags || [],
                memberCount: s.savedMembers ? Object.keys(s.savedMembers).length : 1,
                accessMode: s.discoverConfig?.accessMode || "public",
              }));
            if (isMounted) setDiscoveredServers(publicOnes);
          }
        }
      } catch (err) {
        console.error("[DiscoverView] Error al cargar servidores:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadServers();

    const unsub = api?.on?.("plugins:discover-servers-updated", (updatedList) => {
      if (Array.isArray(updatedList)) {
        setDiscoveredServers(updatedList);
      }
    });

    const unsubKnockStatus = api?.on?.("discover:knock-status-changed", (data) => {
      if (data?.status === "approved") {
        onRefreshServers?.();
        window.dispatchEvent(new CustomEvent("onicord:refresh-servers"));
      }
    });

    return () => {
      isMounted = false;
      if (unsub) unsub();
      if (unsubKnockStatus) unsubKnockStatus();
    };
  }, [onRefreshServers]);

  // 1. Build a lookup of current user's local servers
  const localServerMap = useMemo(() => {
    const map = new Map();
    (servers || []).forEach((s) => {
      const code = String(s.roomCode || s.id || "").trim().toUpperCase();
      if (code) map.set(code, s);
    });
    return map;
  }, [servers]);

  // 2. Unify, enrich, and filter out any locally disabled servers in real-time
  const unifiedDiscoveredServers = useMemo(() => {
    const result = [];
    const seenCodes = new Set();

    (discoveredServers || []).forEach((srv) => {
      if (!srv?.roomCode) return;
      const code = String(srv.roomCode).trim().toUpperCase();
      seenCodes.add(code);

      const local = localServerMap.get(code);
      if (local) {
        // If this is the user's server and Discover is disabled, OMIT IT!
        const isEnabled = Boolean(local.discoverConfig?.enabled || local.isPublicDiscover);
        if (!isEnabled) return;

        // Enrich with up-to-date local server data (guaranteeing local banner and icon are displayed)
        result.push({
          ...srv,
          name: local.name || srv.name,
          icon: local.icon || srv.icon,
          banner: local.banner || srv.banner,
          description: local.discoverConfig?.description || local.description || srv.description || "",
          tags: Array.isArray(local.discoverConfig?.tags) ? local.discoverConfig.tags : srv.tags,
          accessMode: local.discoverConfig?.accessMode || srv.accessMode || "public",
        });
      } else {
        result.push(srv);
      }
    });

    // Also include any local servers that have discover enabled but haven't synced to P2P yet
    (servers || []).forEach((local) => {
      const code = String(local.roomCode || local.id || "").trim().toUpperCase();
      if (!code || seenCodes.has(code)) return;
      const isEnabled = Boolean(local.discoverConfig?.enabled || local.isPublicDiscover);
      if (isEnabled) {
        result.push({
          roomCode: code,
          name: local.name,
          icon: local.icon,
          banner: local.banner,
          description: local.discoverConfig?.description || local.description || "",
          category: local.discoverConfig?.category || "General",
          tags: Array.isArray(local.discoverConfig?.tags) ? local.discoverConfig.tags : [],
          accessMode: local.discoverConfig?.accessMode || "public",
          memberCount: local.savedMembers ? Object.keys(local.savedMembers).length : 1,
          lastSeen: Date.now(),
        });
      }
    });

    return result;
  }, [discoveredServers, localServerMap, servers]);

  // Extract and count all tags dynamically (matching ForumTagsBar)
  const tagsList = useMemo(() => {
    if (!Array.isArray(unifiedDiscoveredServers) || unifiedDiscoveredServers.length === 0) return [];

    const map = new Map();
    unifiedDiscoveredServers.forEach((srv) => {
      if (!srv) return;
      if (Array.isArray(srv.tags)) {
        const found = new Set();
        srv.tags.forEach((rawTag) => {
          const clean = String(rawTag).replace(/^#/, "").trim().toLowerCase();
          if (clean) found.add(clean);
        });
        found.forEach((tag) => {
          map.set(tag, (map.get(tag) || 0) + 1);
        });
      }
    });

    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [unifiedDiscoveredServers]);

  // Filtered servers list based on search and selected tag
  const filteredServers = useMemo(() => {
    return unifiedDiscoveredServers.filter((srv) => {
      // Tag filter (matching ForumTagsBar)
      if (selectedTag) {
        const target = selectedTag.toLowerCase();
        const hasTag =
          Array.isArray(srv.tags) &&
          srv.tags.some((tag) => String(tag).replace(/^#/, "").trim().toLowerCase() === target);
        if (!hasTag) return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const nameMatch = srv.name?.toLowerCase().includes(query);
        const descMatch = srv.description?.toLowerCase().includes(query);
        const tagMatch =
          Array.isArray(srv.tags) &&
          srv.tags.some((tag) => tag.toLowerCase().includes(query));
        const codeMatch = srv.roomCode?.toLowerCase().includes(query);
        if (!nameMatch && !descMatch && !tagMatch && !codeMatch) return false;
      }

      return true;
    });
  }, [unifiedDiscoveredServers, selectedTag, searchQuery]);

  // Handle user joining a public server
  const handleJoinServer = async (server) => {
    if (!server?.roomCode || !profile) return;
    setBusyServerCode(server.roomCode);
    soundEngine.playNav("select");

    try {
      const api = window.electronAPI;
      if (!api?.joinServer) return;

      const joined = await api.joinServer(
        server.roomCode,
        server.name || `Servidor ${server.roomCode}`,
        profile
      );

      await onRefreshServers?.();
      window.dispatchEvent(new CustomEvent("onicord:refresh-servers"));

      notificationManager.showToast(
        t("discover.joinedSuccessTitle", "¡Te has unido!"),
        `${t("discover.joinedSuccessDesc", "Bienvenido a")} ${server.name}`,
        "info"
      );

      // Navigate to server
      if (onSelectServer) {
        await onSelectServer(joined || server.roomCode);
      } else {
        window.dispatchEvent(
          new CustomEvent("onicord:select-server", { detail: server.roomCode })
        );
      }
    } catch (err) {
      console.error("[DiscoverView] Error al unirse al servidor:", err);
      notificationManager.showToast(
        t("discover.joinErrorTitle", "Error al unirse"),
        err.message || t("discover.joinErrorDesc", "No se pudo conectar con el servidor."),
        "warning"
      );
    } finally {
      setBusyServerCode(null);
    }
  };

  // Open the knocking request dialog
  const handleOpenKnock = (server, onSentCallback) => {
    setKnockingServer({ server, onSentCallback });
    setKnockMessage("");
    setKnockSuccess(false);
  };

  // Confirm sending the knocking request
  const handleSendKnock = async () => {
    if (!knockingServer?.server || !profile) return;
    const { server, onSentCallback } = knockingServer;
    setBusyServerCode(server.roomCode);

    try {
      const api = window.electronAPI;
      const requestPayload = {
        type: "KNOCK_REQUEST",
        roomCode: server.roomCode,
        applicant: {
          id: profile.id,
          nickname: profile.nickname || profile.username || "Usuario P2P",
          avatar: profile.avatar || null,
        },
        message: knockMessage.trim() || null,
        timestamp: Date.now(),
      };

      if (api?.sendKnockRequest) {
        await api.sendKnockRequest(requestPayload);
      } else if (api?.sendWidgetP2PData) {
        await api.sendWidgetP2PData({
          pluginId: "onicord-discover",
          widgetId: "discover-service",
          data: requestPayload,
        });
      }

      setKnockSuccess(true);
      onSentCallback?.();
      notificationManager.showToast(
        t("discover.knockSentTitle", "Solicitud Enviada"),
        `${t("discover.knockSentDesc", "Tu solicitud fue enviada a los administradores de")} ${server.name}`,
        "info"
      );

      setTimeout(() => {
        setKnockingServer(null);
      }, 1500);
    } catch (err) {
      console.error("[DiscoverView] Error enviando knock request:", err);
      notificationManager.showToast(
        t("discover.knockErrorTitle", "Error al solicitar"),
        err.message || t("discover.knockErrorDesc", "No se pudo emitir la solicitud."),
        "warning"
      );
    } finally {
      setBusyServerCode(null);
    }
  };

  // Switch to server if already a member
  const handleVisitServer = (server) => {
    const existing = servers.find(
      (s) =>
        s.roomCode?.toUpperCase() === server.roomCode?.toUpperCase() ||
        s.id?.toUpperCase() === server.roomCode?.toUpperCase()
    );
    if (existing && onSelectServer) {
      onSelectServer(existing.id);
    } else {
      window.dispatchEvent(
        new CustomEvent("onicord:select-server", { detail: server.roomCode })
      );
    }
  };

  return (
    <div
      style={{ gap: "calc(var(--gap) + 3px)" }}
      className="flex-1 h-full bg-transparent select-none flex flex-col pr-1 overflow-hidden"
    >
      {/* 1. Header (Standard Onicord Dashboard Header) */}
      <header className="onicord-dashboard-header">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <MaterialIcon
            name="explore"
            size={44}
            className="text-onicord-accent shrink-0 select-none"
          />

          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-onicord-text tracking-wide truncate">
              {t("discover.heroTitle", "Explorar Servidores")}
            </h1>
            <p className="text-xs text-onicord-muted mt-0.5 truncate">
              {t(
                "discover.heroDesc",
                "Encuentra y únete a salas y comunidades de la red Onicord"
              )}
            </p>
          </div>
        </div>

        {/* Search bar inside header */}
        <div className="flex items-center gap-3 shrink-0 pl-4">
          <div className="relative w-64 md:w-80">
            <MaterialIcon
              name="search"
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-onicord-muted pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("discover.searchPlaceholder", "Buscar comunidades o etiquetas...")}
              className="onicord-input h-10 pl-9 pr-8 text-xs placeholder:text-onicord-muted/60"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-onicord-muted hover:text-white transition cursor-pointer p-0.5"
              >
                <MaterialIcon name="close" size={14} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 2. Main Content Card */}
      <div className="flex-1 min-h-0 bg-onicord-base rounded-onicord-outer-p4 border border-onicord-island overflow-hidden flex flex-col shadow-md">
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 no-scrollbar">
          <div className="max-w-6xl mx-auto w-full flex flex-col gap-5">
            {/* Seamless Tag Filter Bar (matching ForumTagsBar, no dark container or heavy border) */}
            {tagsList.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 shrink-0">
                {/* Reset / All communities button */}
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.playNav("select");
                    setSelectedTag(null);
                  }}
                  className={`text-[12px] px-3 py-1 rounded-full border transition-all cursor-pointer truncate shrink-0 flex items-center gap-1.5 ${
                    !selectedTag
                      ? "bg-onicord-accent/20 border-onicord-accent text-onicord-accent font-bold shadow-xs"
                      : "bg-onicord-surface/80 border-white/10 text-onicord-muted hover:text-onicord-text hover:border-white/20 hover:bg-onicord-surface"
                  }`}
                  title={t("chat.forumAllPosts", "Ver todas las comunidades")}
                >
                  <MaterialIcon name="apps" size={14} />
                  <span>{t("chat.forumAll", "Todos")}</span>
                </button>

                {/* Tag Badges */}
                {tagsList.map(({ name, count }) => {
                  const isActive = selectedTag?.toLowerCase() === name.toLowerCase();
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        soundEngine.playNav("select");
                        setSelectedTag(isActive ? null : name);
                      }}
                      className={`text-[12px] px-3 py-1 rounded-full border transition-all cursor-pointer truncate max-w-[200px] shrink-0 flex items-center gap-1 ${
                        isActive
                          ? "bg-onicord-accent/20 border-onicord-accent text-onicord-accent font-bold shadow-xs scale-[1.02]"
                          : "bg-onicord-surface/80 border-white/10 text-onicord-text hover:text-onicord-accent hover:border-onicord-accent/50 hover:bg-onicord-surface"
                      }`}
                      title={`#${name}`}
                    >
                      <span className={`font-semibold ${isActive ? "text-onicord-accent" : "text-onicord-muted"}`}>
                        #
                      </span>
                      <span>{name}</span>
                      <span className="text-[10px] opacity-40 ml-0.5 font-mono">
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Server Cards Grid */}
            {loading ? (
              <div className="w-full h-64 flex flex-col items-center justify-center gap-3 text-onicord-muted">
                <MaterialIcon name="sync" size={32} className="animate-spin text-onicord-accent" />
                <span className="text-sm font-semibold">{t("discover.loading", "Explorando la red...")}</span>
              </div>
            ) : filteredServers.length === 0 ? (
              <div className="w-full h-64 flex flex-col items-center justify-center text-center p-6">
                <div className="w-12 h-12 rounded-full bg-onicord-surface border border-onicord-island flex items-center justify-center text-onicord-muted mb-3">
                  <MaterialIcon name="travel_explore" size={26} />
                </div>
                <h4 className="text-sm font-bold text-onicord-text">
                  {t("discover.noResultsTitle", "No se encontraron servidores")}
                </h4>
                <p className="text-xs text-onicord-muted mt-1 max-w-sm leading-relaxed">
                  {searchQuery
                    ? t("discover.noResultsSearchDesc", "Ningún servidor coincide con tu búsqueda o filtros actuales.")
                    : t(
                        "discover.noResultsGeneralDesc",
                        "Aún no hay servidores anunciados en este canal. ¡Crea el tuyo y habilita Discover en los ajustes del servidor!"
                      )}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {filteredServers.map((server) => {
                  const isMember = servers.some(
                    (s) =>
                      s.roomCode?.toUpperCase() === server.roomCode?.toUpperCase() ||
                      s.id?.toUpperCase() === server.roomCode?.toUpperCase()
                  );
                  return (
                    <DiscoverServerCard
                      key={server.roomCode}
                      server={server}
                      isMember={isMember}
                      busy={busyServerCode === server.roomCode}
                      onJoin={handleJoinServer}
                      onRequestAccess={handleOpenKnock}
                      onVisit={handleVisitServer}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Knocking Request Modal (Access request dialog) */}
      {knockingServer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 onicord-animate-fade-in">
          <div className="w-full max-w-md rounded-onicord-outer-p4 bg-onicord-surface border border-onicord-island shadow-2xl overflow-hidden onicord-animate-modal-in">
            <div className="p-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
                  <MaterialIcon name="waving_hand" size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-onicord-text truncate">
                    {t("discover.knockModalTitle", "Solicitar Ingreso")}
                  </h3>
                  <p className="text-xs text-onicord-muted truncate">
                    {knockingServer.server?.name}
                  </p>
                </div>
              </div>

              {knockSuccess ? (
                <div className="my-6 p-4 rounded-onicord-inner bg-onicord-success/15 border border-onicord-success/30 text-center onicord-animate-fade-in">
                  <MaterialIcon name="check_circle" size={28} className="text-onicord-success mx-auto mb-1.5" />
                  <p className="text-sm font-bold text-onicord-text">
                    {t("discover.knockSentSuccess", "¡Solicitud enviada con éxito!")}
                  </p>
                  <p className="text-xs text-onicord-subtext mt-1">
                    {t("discover.knockWaitAdmin", "Los moderadores recibirán tu solicitud y podrán autorizarte.")}
                  </p>
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  <p className="text-xs text-onicord-subtext leading-relaxed">
                    {t(
                      "discover.knockModalDesc",
                      "Este servidor requiere autorización previa para ingresar. Puedes añadir un mensaje opcional para los administradores:"
                    )}
                  </p>

                  <textarea
                    rows={3}
                    value={knockMessage}
                    onChange={(e) => setKnockMessage(e.target.value)}
                    placeholder={t("discover.knockPlaceholder", "Hola, me gustaría unirme porque...")}
                    className="w-full p-3 rounded-onicord-inner bg-onicord-base border border-onicord-island focus:border-onicord-accent text-onicord-text text-xs placeholder:text-onicord-muted outline-none transition-all resize-none shadow-inner"
                  />
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-6 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setKnockingServer(null)}
                  disabled={busyServerCode !== null}
                  className="onicord-btn-secondary text-xs"
                >
                  {t("common.cancel", "Cancelar")}
                </button>

                {!knockSuccess && (
                  <button
                    type="button"
                    onClick={handleSendKnock}
                    disabled={busyServerCode !== null}
                    className="px-4 h-9 rounded-onicord-button font-bold text-xs bg-amber-500 hover:bg-amber-600 text-black transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
                  >
                    {busyServerCode ? (
                      <MaterialIcon name="sync" className="animate-spin text-sm" />
                    ) : (
                      <>
                        <MaterialIcon name="send" size={14} />
                        <span>{t("discover.sendKnockBtn", "Enviar Solicitud")}</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
