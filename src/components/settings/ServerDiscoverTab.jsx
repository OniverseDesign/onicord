import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import DiscoverServerCard from "../discover/DiscoverServerCard";
import { ModalInput } from "../ui/ModalShell";
import { soundEngine } from "../../lib/soundEngine";
import { notificationManager } from "../../lib/notificationManager";

export default function ServerDiscoverTab({
  server,
  profile,
  peers = [],
  discoverConfig = {},
  setDiscoverConfig,
}) {
  const { t } = useTranslation();

  const enabled = Boolean(discoverConfig.enabled);
  const accessMode = discoverConfig.accessMode || "public";
  const description = discoverConfig.description || "";
  const tags = Array.isArray(discoverConfig.tags) ? discoverConfig.tags : [];
  const pendingRequests = Array.isArray(discoverConfig.pendingRequests)
    ? discoverConfig.pendingRequests
    : [];

  const [currentTagInput, setCurrentTagInput] = useState("");

  const updateConfig = (patch) => {
    soundEngine.playNav("toggle-on");
    setDiscoverConfig?.((prev) => ({
      ...prev,
      ...patch,
    }));
  };

  const addTag = (raw) => {
    if (!raw) return;
    const parts = raw
      .split(",")
      .map((t) => t.trim().replace(/^#/, "").toLowerCase())
      .filter(Boolean);
    if (parts.length === 0) return;
    const combined = [...tags];
    for (const p of parts) {
      if (!combined.includes(p) && combined.length < 6) {
        combined.push(p);
      }
    }
    updateConfig({ tags: combined });
    setCurrentTagInput("");
  };

  const removeTag = (indexToRemove) => {
    const next = tags.filter((_, idx) => idx !== indexToRemove);
    updateConfig({ tags: next });
  };

  // Preview server object
  const previewServer = {
    roomCode: server?.roomCode || "00000000",
    name: server?.name || "Mi Servidor",
    icon: server?.icon || null,
    banner: server?.banner || null,
    description: description.trim() || t("discover.previewDesc", "Descripción de ejemplo de tu servidor en Discover."),
    tags: tags.length > 0 ? tags : ["p2p", "comunidad"],
    memberCount: server?.savedMembers ? Object.keys(server.savedMembers).length : 1,
    accessMode,
  };

  // Approve a pending knock request
  const handleApprove = async (request) => {
    soundEngine.playNav("select");
    const nextRequests = pendingRequests.filter((r) => r.applicant?.id !== request.applicant?.id);
    updateConfig({ pendingRequests: nextRequests });

    try {
      const api = window.electronAPI;
      if (api?.approveKnockRequest) {
        await api.approveKnockRequest(server.roomCode, request.applicant);
      } else if (api?.sendWidgetP2PData) {
        await api.sendWidgetP2PData({
          pluginId: "onicord-discover",
          widgetId: "discover-service",
          data: {
            type: "KNOCK_APPROVED",
            roomCode: server.roomCode,
            applicantId: request.applicant?.id,
            timestamp: Date.now(),
          },
        });
      }

      notificationManager.showToast(
        t("discover.approvedSuccessTitle", "Solicitud Aprobada"),
        `${t("discover.approvedSuccessDesc", "Se ha autorizado el ingreso a")} ${request.applicant?.nickname || "usuario"}`,
        "info"
      );
    } catch (err) {
      console.error("[ServerDiscoverTab] Error aprobando solicitud:", err);
    }
  };

  // Reject a pending knock request
  const handleReject = async (request) => {
    soundEngine.playNav("toggle-off");
    const nextRequests = pendingRequests.filter((r) => r.applicant?.id !== request.applicant?.id);
    updateConfig({ pendingRequests: nextRequests });

    try {
      const api = window.electronAPI;
      if (api?.rejectKnockRequest) {
        await api.rejectKnockRequest(server.roomCode, request.applicant);
      } else if (api?.sendWidgetP2PData) {
        await api.sendWidgetP2PData({
          pluginId: "onicord-discover",
          widgetId: "discover-service",
          data: {
            type: "KNOCK_REJECTED",
            roomCode: server.roomCode,
            applicantId: request.applicant?.id,
          },
        });
      }

      notificationManager.showToast(
        t("discover.rejectedTitle", "Solicitud Rechazada"),
        `${request.applicant?.nickname || "El usuario"} ha sido descartado.`,
        "info"
      );
    } catch (err) {
      console.error("[ServerDiscoverTab] Error rechazando solicitud:", err);
    }
  };

  return (
    <div className="onicord-settings-container space-y-4">
      {/* CARD 1: PUBLICACION EN DISCOVER (MASTER TOGGLE) */}
      <div className="onicord-settings-card">
        <h3 className="onicord-settings-section-title">
          <span>{t("discover.enableTitle", "Publicación en Onicord Discover")}</span>
        </h3>

        <div className="onicord-settings-row">
          <div className="min-w-0 pr-4">
            <p className="onicord-settings-row-title">
              {t("discover.enableRowTitle", "Hacer Servidor Visible en la Red P2P")}
            </p>
            <p className="onicord-settings-row-desc">
              {t(
                "discover.enableDesc",
                "Al activar esta opción, tu servidor emitirá periódicamente un anuncio seguro a la red P2P para que otros peers puedan encontrarlo en el menú Discover."
              )}
            </p>
          </div>

          <label className="relative inline-flex items-center select-none shrink-0 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => updateConfig({ enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="onicord-toggle-slider" />
          </label>
        </div>
      </div>

      {enabled && (
        <>
          {/* CARD 2: ACCESS POLICY */}
          <div className="onicord-settings-card">
            <h3 className="onicord-settings-section-title">
              <span>{t("discover.accessPolicyTitle", "Modalidad de Ingreso")}</span>
            </h3>
            <p className="onicord-settings-row-desc">
              {t(
                "discover.accessPolicyDesc",
                "Define cómo los exploradores de la red pueden unirse a tu comunidad."
              )}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              {/* Option 1: Full Public */}
              <button
                type="button"
                onClick={() => updateConfig({ accessMode: "public" })}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  accessMode === "public"
                    ? "bg-onicord-accent/10 border-onicord-accent/50 text-onicord-text"
                    : "bg-onicord-base/40 border-white/5 text-onicord-muted hover:border-white/10"
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <MaterialIcon
                    name={accessMode === "public" ? "radio_button_checked" : "radio_button_unchecked"}
                    size={18}
                    className={accessMode === "public" ? "text-onicord-accent" : "text-onicord-muted"}
                  />
                  <span className="font-bold text-sm text-onicord-text">
                    {t("discover.modePublicTitle", "Acceso Libre")}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-onicord-muted">
                  {t(
                    "discover.modePublicDesc",
                    "Cualquier usuario de la red puede ver el servidor y unirse inmediatamente con un solo clic."
                  )}
                </p>
              </button>

              {/* Option 2: By Approval (Knocking) */}
              <button
                type="button"
                onClick={() => updateConfig({ accessMode: "approval" })}
                className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                  accessMode === "approval"
                    ? "bg-onicord-accent/10 border-onicord-accent/50 text-onicord-text"
                    : "bg-onicord-base/40 border-white/5 text-onicord-muted hover:border-white/10"
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <MaterialIcon
                    name={accessMode === "approval" ? "radio_button_checked" : "radio_button_unchecked"}
                    size={18}
                    className={accessMode === "approval" ? "text-onicord-accent" : "text-onicord-muted"}
                  />
                  <span className="font-bold text-sm text-onicord-text">
                    {t("discover.modeApprovalTitle", "Por Aprobación (Knocking)")}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-onicord-muted">
                  {t(
                    "discover.modeApprovalDesc",
                    "Los interesados envían una solicitud con un mensaje opcional y un administrador debe aceptarla."
                  )}
                </p>
              </button>
            </div>
          </div>

          {/* CARD 3: METADATOS PUBLICOS Y VISTA PREVIA */}
          <div className="onicord-settings-card">
            <h3 className="onicord-settings-section-title">
              <span>{t("discover.metadataTitle", "Ficha Pública del Servidor")}</span>
            </h3>
            <p className="onicord-settings-row-desc mb-4">
              {t(
                "discover.metadataDesc",
                "Personaliza cómo se mostrará la tarjeta de tu servidor en el directorio Discover."
              )}
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Form (7 cols) */}
              <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-onicord-text">
                      {t("discover.descriptionLabel", "Descripción Pública")}
                    </label>
                    <span className="text-[10px] text-onicord-muted font-mono">
                      {description.length}/160
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    maxLength={160}
                    value={description}
                    onChange={(e) => updateConfig({ description: e.target.value })}
                    placeholder={t(
                      "discover.descPlaceholder",
                      "Escribe una breve presentación de tu comunidad para los exploradores..."
                    )}
                    className="onicord-input w-full p-3 rounded-onicord-button bg-onicord-base text-onicord-text border border-white/5 outline-none ring-onicord-accent focus:ring-2 placeholder:text-onicord-faded text-xs sm:text-sm transition-all duration-150 resize-none min-h-[100px] leading-relaxed"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-onicord-text block mb-1.5">
                    {t("discover.tagsLabel", "Etiquetas")}
                  </label>
                  <ModalInput
                    type="text"
                    value={currentTagInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.includes(",")) {
                        addTag(val);
                      } else {
                        setCurrentTagInput(val);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        addTag(currentTagInput);
                      } else if (e.key === "Backspace" && !currentTagInput && tags.length > 0) {
                        e.preventDefault();
                        removeTag(tags.length - 1);
                      }
                    }}
                    onBlur={() => {
                      if (currentTagInput.trim()) {
                        addTag(currentTagInput);
                      }
                    }}
                    placeholder={
                      tags.length >= 6
                        ? t("discover.tagsMaxReached", "Límite de 6 etiquetas alcanzado")
                        : t("discover.tagsPlaceholder", "Escribe una etiqueta y presiona Enter o coma...")
                    }
                    disabled={tags.length >= 6}
                    className="text-xs"
                  />
                  <p className="text-[11px] text-onicord-muted mt-1.5">
                    {t("discover.tagsHint", "Presiona Enter o coma para añadir etiquetas (hasta 6 etiquetas).")}
                  </p>

                  {/* Dynamic interactive tag chips */}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2.5">
                      {tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-onicord-accent/15 text-onicord-accent border border-onicord-accent/30 animate-fade-in"
                        >
                          <span>#{tag}</span>
                          <button
                            type="button"
                            onClick={() => removeTag(idx)}
                            className="hover:text-white transition-colors cursor-pointer flex items-center justify-center p-0.5"
                            title={t("common.delete", "Eliminar")}
                          >
                            <MaterialIcon name="close" size={13} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Helpful tip card to optimize space balance */}
                <div className="p-3 rounded-xl bg-onicord-base/30 border border-white/5 flex items-start gap-2.5 text-onicord-muted text-[11px] leading-relaxed">
                  <MaterialIcon name="tips_and_updates" size={16} className="text-onicord-accent shrink-0 mt-0.5" />
                  <span>
                    {t(
                      "discover.tagsTip",
                      "Usa etiquetas descriptivas como el juego principal, temática o idioma para que tu comunidad aparezca destacada en las búsquedas."
                    )}
                  </span>
                </div>
              </div>

              {/* Preview (5 cols) */}
              <div className="lg:col-span-5 flex flex-col items-center">
                <div className="w-full">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-onicord-muted mb-2 flex items-center gap-1.5">
                    <MaterialIcon name="visibility" size={14} />
                    <span>{t("discover.previewLabel", "Vista Previa en Discover")}</span>
                  </span>
                  <div className="w-full max-w-[340px] mx-auto lg:mx-0">
                    <DiscoverServerCard
                      server={previewServer}
                      isMember={false}
                      onJoin={() => {}}
                      onRequestAccess={() => {}}
                      onVisit={() => {}}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CARD 4: KNOCKING ACCESS REQUESTS INBOX */}
          <div className="onicord-settings-card">
            <div className="flex items-center justify-between mb-2">
              <h3 className="onicord-settings-section-title mb-0">
                <span className="flex items-center gap-2">
                  <MaterialIcon name="inbox" size={16} className="text-onicord-accent" />
                  {t("discover.pendingRequestsTitle", "Solicitudes de Acceso")}
                  {pendingRequests.length > 0 && (
                    <span className="ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      {pendingRequests.length}/25
                    </span>
                  )}
                </span>
              </h3>
            </div>

            {pendingRequests.length >= 25 && (
              <div className="p-3 mb-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                <MaterialIcon name="warning" size={16} className="shrink-0" />
                <span>
                  {t(
                    "discover.queueFullNotice",
                    "La cola de solicitudes está completa (máximo 25). Debes responder a las solicitudes actuales para permitir que nuevos usuarios envíen peticiones."
                  )}
                </span>
              </div>
            )}

            <p className="onicord-settings-row-desc mb-3">
              {t(
                "discover.pendingRequestsDesc",
                "Gestiona las peticiones de ingreso recibidas cuando el servidor está en modo de aprobación."
              )}
            </p>

            {pendingRequests.length === 0 ? (
              <div className="p-6 rounded-xl border border-dashed border-white/10 bg-onicord-base/20 text-center flex flex-col items-center justify-center">
                <MaterialIcon name="mark_email_read" size={28} className="text-onicord-muted mb-2 opacity-60" />
                <p className="text-xs font-semibold text-onicord-subtext">
                  {t("discover.noPendingRequests", "No hay solicitudes de acceso pendientes.")}
                </p>
                <p className="text-[11px] text-onicord-muted mt-0.5">
                  {t("discover.noPendingDesc", "Cuando alguien solicite unirse, aparecerá listado aquí para que puedas admitirlo o rechazarlo.")}
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto no-scrollbar">
                {pendingRequests.map((req, idx) => {
                  const applicant = req.applicant || {};
                  return (
                    <div
                      key={req.applicant?.id || idx}
                      className="p-3 rounded-xl bg-onicord-base/40 border border-white/5 flex items-center justify-between gap-3 animate-fade-in"
                    >
                      {/* Avatar + User info */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full overflow-hidden bg-onicord-base border border-white/10 shrink-0 flex items-center justify-center font-bold text-xs text-onicord-accent">
                          {applicant.avatar ? (
                            <img src={applicant.avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            (applicant.nickname || applicant.username || "?").slice(0, 1).toUpperCase()
                          )}
                        </div>

                        <div className="min-w-0">
                          <h5 className="text-xs font-bold text-onicord-text truncate">
                            {applicant.nickname || applicant.username || "Usuario P2P"}
                          </h5>
                          {req.message && (
                            <p className="text-[11px] text-onicord-subtext truncate mt-0.5 italic">
                              "{req.message}"
                            </p>
                          )}
                          <span className="text-[10px] text-onicord-muted block mt-0.5">
                            {new Date(req.timestamp || Date.now()).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleReject(req)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-onicord-danger hover:bg-onicord-danger/10 border border-onicord-danger/30 transition-all cursor-pointer"
                        >
                          {t("discover.rejectBtn", "Rechazar")}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApprove(req)}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-onicord-accent text-white hover:bg-onicord-accent/90 transition-all cursor-pointer shadow-sm"
                        >
                          {t("discover.approveBtn", "Aprobar")}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
