import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import SmartAnimatedImage from "../ui/SmartAnimatedImage";

export default function DiscoverServerCard({
  server,
  isMember = false,
  onJoin,
  onRequestAccess,
  onVisit,
  busy = false,
}) {
  const { t } = useTranslation();
  const [requestSent, setRequestSent] = useState(false);

  const serverName = server?.name || "Servidor P2P";
  const initial = serverName.trim()?.[0]?.toUpperCase() || "?";
  const memberCount = server?.memberCount || 1;
  const isPublic = server?.accessMode !== "approval";
  const tags = Array.isArray(server?.tags) ? server.tags : [];
  const description =
    server?.description ||
    t("discover.noDescription", "Comunidad de Onicord sin descripción pública.");

  const handleActionClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;

    if (isMember) {
      onVisit?.(server);
    } else if (isPublic) {
      onJoin?.(server);
    } else {
      onRequestAccess?.(server, () => setRequestSent(true));
    }
  };

  return (
    <div className="flex flex-col w-full max-w-[340px] mx-auto sm:max-w-none rounded-onicord-inner bg-onicord-surface hover:bg-onicord-surface/75 border border-white/5 hover:border-white/10 overflow-hidden transition-all duration-200 group text-left select-none relative">
      {/* 1. Header Banner (Same design as server: rounded corners, no gradient) */}
      <div className="p-2.5 pb-0">
        <div className="w-full h-32 rounded-xl relative overflow-hidden bg-onicord-mantle border border-white/5">
          {server?.banner ? (
            <SmartAnimatedImage
              src={server.banner}
              alt={serverName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-onicord-mantle/70 flex items-center justify-center">
              <MaterialIcon name="groups" size={32} className="text-white/10" />
            </div>
          )}

          {/* Access Badge (Top Right) */}
          <div className="absolute top-2 right-2 z-10">
            {isPublic ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-onicord-success/20 text-onicord-success border border-onicord-success/30 flex items-center gap-1 backdrop-blur-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-onicord-success animate-pulse" />
                {t("discover.badgePublic", "Público")}
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 backdrop-blur-sm">
                <MaterialIcon name="lock" size={11} />
                {t("discover.badgeApproval", "Por Aprobación")}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Overlapping Avatar */}
      <div className="px-4 -mt-6 relative z-10 flex items-end justify-between">
        <div className="w-12 h-12 rounded-full border-2 border-onicord-surface overflow-hidden bg-onicord-base flex items-center justify-center shrink-0">
          {server?.icon ? (
            <SmartAnimatedImage
              src={server.icon}
              alt={serverName}
              className="w-full h-full object-cover"
              isAvatar
            />
          ) : (
            <div className="w-full h-full bg-onicord-surface flex items-center justify-center font-extrabold text-onicord-accent text-base uppercase">
              {initial}
            </div>
          )}
        </div>

        {/* Online Members counter */}
        <div className="flex items-center gap-1.5 pb-0.5 text-xs font-semibold text-onicord-success">
          <span className="w-2 h-2 rounded-full bg-onicord-success animate-pulse" />
          <span>
            {memberCount}{" "}
            {memberCount === 1
              ? t("discover.memberSingle", "Miembro")
              : t("discover.memberPlural", "Miembros")}
          </span>
        </div>
      </div>

      {/* 3. Server Info Body */}
      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
        <div>
          <h3 className="font-bold text-sm text-onicord-text truncate group-hover:text-onicord-accent transition-colors leading-tight">
            {serverName}
          </h3>

          <p className="text-xs text-onicord-subtext line-clamp-2 mt-1 leading-relaxed min-h-[32px]">
            {description}
          </p>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {tags.slice(0, 4).map((tag, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-onicord-button text-[10px] font-medium bg-onicord-base text-onicord-subtext border border-onicord-island hover:border-onicord-accent/40 transition-colors"
                >
                  #{tag.replace(/^#/, "")}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 4. Action Button Footer (No horizontal divider) */}
        <div className="pt-1 flex items-center justify-end gap-2 mt-auto">
          <div className="shrink-0">
            {busy ? (
              <div className="h-8 px-3 rounded-onicord-button bg-onicord-base text-onicord-muted border border-onicord-island flex items-center gap-1.5 text-xs">
                <MaterialIcon name="sync" className="animate-spin text-sm" />
              </div>
            ) : isMember ? (
              <button
                type="button"
                onClick={handleActionClick}
                className="onicord-btn-secondary border border-onicord-island h-8 px-3 text-xs flex items-center gap-1.5"
              >
                <MaterialIcon name="login" size={14} />
                <span>{t("discover.visitBtn", "Ir al servidor")}</span>
              </button>
            ) : requestSent ? (
              <div className="bg-amber-500/20 text-amber-300 border border-amber-500/30 h-8 px-3 text-xs rounded-onicord-button font-bold flex items-center gap-1.5">
                <MaterialIcon name="schedule" size={14} />
                <span>{t("discover.requestSentBtn", "Solicitud Enviada")}</span>
              </div>
            ) : isPublic ? (
              <button
                type="button"
                onClick={handleActionClick}
                className="onicord-btn-primary h-8 px-3 text-xs flex items-center gap-1.5"
              >
                <MaterialIcon name="group_add" size={14} />
                <span>{t("discover.joinBtn", "Unirse")}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleActionClick}
                className="bg-amber-500 hover:bg-amber-600 text-black font-bold h-8 px-3 text-xs rounded-onicord-button flex items-center gap-1.5 cursor-pointer"
              >
                <MaterialIcon name="waving_hand" size={14} />
                <span>{t("discover.requestAccessBtn", "Solicitar Ingreso")}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
