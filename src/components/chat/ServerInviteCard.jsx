import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import SmartAnimatedImage from "../ui/SmartAnimatedImage";

export default function ServerInviteCard({ roomCode, fullUrl }) {
  const { t } = useTranslation();
  const [serverData, setServerData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [copied, setCopied] = useState(false);

  const cleanCode = String(roomCode || "").trim().toUpperCase();

  useEffect(() => {
    let isMounted = true;
    async function loadServerInfo() {
      if (!cleanCode) return;
      try {
        setLoading(true);
        const api = window.electronAPI;
        if (!api) return;

        // 1. Check if user is already a member of this server
        const servers = await api.listServers();
        const existing = (servers || []).find(
          (s) => s.roomCode?.toUpperCase() === cleanCode || s.id?.toUpperCase() === cleanCode
        );

        if (existing) {
          if (isMounted) {
            setServerData({
              name: existing.name || `Servidor ${cleanCode}`,
              icon: existing.icon || null,
              banner: existing.banner || null,
              memberCount: existing.savedMembers ? Object.keys(existing.savedMembers).length : 1,
              isMember: true,
              serverObj: existing,
            });
            window.dispatchEvent(new CustomEvent("onicord:embed-loaded"));
          }
          return;
        }

        // 2. Fetch invite details from main process if not local member
        let details = null;
        if (api.resolveInvite) {
          try {
            details = await api.resolveInvite(cleanCode);
          } catch (e) {}
        }

        if (isMounted) {
          setServerData({
            name: details?.name || `Servidor ${cleanCode}`,
            icon: details?.icon || null,
            banner: details?.banner || null,
            memberCount: details?.memberCount || 1,
            isMember: false,
            serverObj: null,
          });
        }
      } catch (err) {
        console.error("Error cargando metadatos de invitación:", err);
        if (isMounted) {
          setServerData({
            name: `Servidor ${cleanCode}`,
            icon: null,
            isMember: false,
          });
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadServerInfo();
    return () => {
      isMounted = false;
    };
  }, [cleanCode]);

  const handleAction = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!cleanCode) return;
    const api = window.electronAPI;
    if (!api) return;

    try {
      setJoining(true);
      if (serverData?.isMember) {
        // Switch to server
        window.dispatchEvent(
          new CustomEvent("onicord:select-server", { detail: cleanCode })
        );
      } else {
        // Join new server
        const profile = await api.getProfile?.();
        const joinedServer = await api.joinServer(
          cleanCode,
          serverData?.name || `Servidor ${cleanCode}`,
          profile
        );
        setServerData((prev) => ({
          ...prev,
          isMember: true,
          serverObj: joinedServer,
        }));
        // Switch to the server immediately after joining
        window.dispatchEvent(
          new CustomEvent("onicord:select-server", { detail: cleanCode })
        );
      }
    } catch (err) {
      console.error("Error al procesar acción de invitación:", err);
    } finally {
      setJoining(false);
    }
  };
  const serverName = serverData?.name || `Servidor ${cleanCode}`;
  const initial = serverName.trim()?.[0]?.toUpperCase() || "?";
  const memberCount = serverData?.memberCount || 1;

  return (
    <div className="my-2.5 pr-3 max-w-md w-full rounded-onicord-inner bg-onicord-mantle border border-onicord-island hover:border-onicord-accent/40 overflow-hidden backdrop-blur-md transition-all group/invite text-left select-none">

      {/* Main content body */}
      <div className="p-3.5 flex items-center gap-3.5">
        {/* Server Avatar / Icon */}
        <div className="relative w-14 h-14 shrink-0 rounded-full overflow-hidden bg-onicord-dark border border-onicord-island flex items-center justify-center group-hover/invite:scale-105 transition-transform">
          {serverData?.icon ? (
            <SmartAnimatedImage
              src={serverData.icon}
              alt={serverName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-onicord-accent/40 via-onicord-surface to-onicord-dark flex items-center justify-center font-bold text-xl text-white">
              {initial}
            </div>
          )}
        </div>

        {/* Server Info */}
        <div className="flex-1 min-w-0">
          <h4 className="text-base font-bold text-onicord-text truncate tracking-wide leading-snug">
            {serverName}
          </h4>
          <div className="flex items-center gap-2 mt-1 text-xs text-onicord-text font-medium">
            <span className="flex items-center gap-1 text-onicord-success font-semibold">
              <span className="w-2 h-2 rounded-full bg-onicord-success animate-pulse" />
              {memberCount} {memberCount === 1 ? "Miembro" : "Miembros"}
            </span>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={handleAction}
          disabled={joining || loading}
          className={`px-4 py-2 rounded-onicord-button font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0 active:scale-95 ${
            serverData?.isMember
              ? "onicord-btn-primary"
              : "onicord-btn-primary"
          }`}
        >
          {joining ? (
            <MaterialIcon name="sync" className="animate-spin text-sm" />
          ) : serverData?.isMember ? (
            <>
              <span>{t("invite.visitButton", "Ir al servidor")}</span>
            </>
          ) : (
            <>
              <MaterialIcon name="group_add" className="text-sm" />
              <span>{t("invite.joinButton", "Unirse")}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
