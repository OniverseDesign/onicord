import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ModalInput } from "../ui/ModalShell";
import Heading from "../ui/Heading";
import Text from "../ui/Text";
import AvatarPicker from "../ui/AvatarPicker";
import MaterialIcon from "../icons/MaterialIcon";
import { cn } from "../../lib/cn";
import { parseInviteUrl } from "../../lib/inviteUtils";
import { soundEngine } from "../../lib/soundEngine";
import { useInternalClose } from "../../hooks/useAnimatedMount";

export default function AddServerModal({ profile, onClose, onCreated }) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("default");
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(null);
  const [inviteInput, setInviteInput] = useState("");
  const [templateInput, setTemplateInput] = useState("");
  const [discordPreview, setDiscordPreview] = useState(null);
  const [discordServerName, setDiscordServerName] = useState("");
  const [discordIcon, setDiscordIcon] = useState(null);
  const [selectedChannelIds, setSelectedChannelIds] = useState(() => new Set());
  const [selectedRoleIds, setSelectedRoleIds] = useState(() => new Set());
  const [busyAction, setBusyAction] = useState(null);
  const [error, setError] = useState(null);

  const nameInputRef = useRef(null);
  const templateInputRef = useRef(null);
  const { isClosing, triggerClose } = useInternalClose(onClose, 140);

  const handleClose = useCallback(() => {
    if (busyAction) return;
    soundEngine.playNav("close");
    triggerClose();
  }, [busyAction, triggerClose]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === "default") {
        nameInputRef.current?.focus();
      } else if (!discordPreview) {
        templateInputRef.current?.focus();
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [activeTab, discordPreview]);

  const parsedInvite = useMemo(() => {
    const parsedUrl = parseInviteUrl(inviteInput);
    if (parsedUrl && /^[A-F0-9]{8}$/i.test(parsedUrl.roomCode)) {
      return {
        valid: true,
        code: parsedUrl.roomCode.toUpperCase(),
        ip: parsedUrl.ip || null,
        port: parsedUrl.port || null,
      };
    }

    const trimmed = inviteInput.replace(/\s+/g, "");
    if (/^[a-fA-F0-9]{8}$/.test(trimmed)) {
      return {
        valid: true,
        code: trimmed.toUpperCase(),
        ip: null,
        port: null,
      };
    }

    return { valid: false, code: "", ip: null, port: null };
  }, [inviteInput]);

  const discordCounts = useMemo(() => {
    if (!discordPreview) return { categories: 0, channels: 0, roles: 0 };
    let categories = 0;
    let channels = 0;
    for (const ch of discordPreview.channels || []) {
      if (!selectedChannelIds.has(ch.discordId)) continue;
      if (ch.type === "category") categories += 1;
      else channels += 1;
    }
    const roles = (discordPreview.roles || []).filter((r) =>
      selectedRoleIds.has(r.discordId)
    ).length;
    return { categories, channels, roles };
  }, [discordPreview, selectedChannelIds, selectedRoleIds]);

  const resolveDiscordError = useCallback(
    (err) => {
      const msg = String(err?.message || "");
      if (msg.includes("INVALID_TEMPLATE_URL")) {
        return t(
          "addServerModal.discordInvalidUrl",
          "Enlace inválido. Usa un link tipo https://discord.new/XXXX o el código de plantilla."
        );
      }
      if (msg.includes("DISCORD_TEMPLATE_NOT_FOUND")) {
        return t(
          "addServerModal.discordNotFound",
          "No se encontró la plantilla en Discord o el enlace expiró."
        );
      }
      const rateMatch = msg.match(/DISCORD_RATE_LIMITED:(\d+)/);
      if (rateMatch) {
        return t(
          "addServerModal.discordRateLimited",
          "Discord limitó temporalmente las consultas. Intenta de nuevo en {{seconds}}s.",
          { seconds: rateMatch[1] }
        );
      }
      if (msg.includes("DISCORD_TIMEOUT")) {
        return t(
          "addServerModal.discordTimeout",
          "Tiempo de espera agotado al conectar con Discord."
        );
      }
      return t(
        "addServerModal.discordFetchError",
        "No se pudo obtener la plantilla de Discord."
      );
    },
    [t]
  );

  const handleAnalyzeDiscordTemplate = async () => {
    const trimmed = templateInput.trim();
    if (!trimmed || busyAction) return;

    setBusyAction("previewDiscord");
    setError(null);
    try {
      const preview = await window.electronAPI.previewDiscordTemplate(trimmed);
      setDiscordPreview(preview);
      setDiscordServerName(preview.serverName || "");
      setDiscordIcon(null);
      setSelectedChannelIds(
        new Set((preview.channels || []).map((c) => String(c.discordId)))
      );
      setSelectedRoleIds(
        new Set((preview.roles || []).map((r) => String(r.discordId)))
      );
    } catch (err) {
      setError(resolveDiscordError(err));
    } finally {
      setBusyAction(null);
    }
  };

  const toggleChannelSelection = (ch) => {
    setSelectedChannelIds((prev) => {
      const next = new Set(prev);
      const id = String(ch.discordId);
      const willSelect = !next.has(id);
      if (willSelect) next.add(id);
      else next.delete(id);

      if (ch.type === "category" && discordPreview?.channels) {
        for (const child of discordPreview.channels) {
          if (child.parentDiscordId === id) {
            if (willSelect) next.add(String(child.discordId));
            else next.delete(String(child.discordId));
          }
        }
      }
      return next;
    });
  };

  const toggleRoleSelection = (roleId) => {
    setSelectedRoleIds((prev) => {
      const next = new Set(prev);
      const id = String(roleId);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImportDiscord = async () => {
    const trimmedName = discordServerName.trim();
    if (!discordPreview || !trimmedName || busyAction) return;

    setBusyAction("importDiscord");
    setError(null);
    try {
      const server = await window.electronAPI.importDiscordTemplate(
        {
          serverName: trimmedName,
          icon: discordIcon,
          channels: discordPreview.channels,
          roles: discordPreview.roles,
          selectedChannelIds: Array.from(selectedChannelIds),
          selectedRoleIds: Array.from(selectedRoleIds),
          afkChannelDiscordId: discordPreview.afkChannelDiscordId,
          afkTimeout: discordPreview.afkTimeout,
        },
        profile
      );
      await onCreated(server);
    } catch (err) {
      setError(
        err?.message ||
          t("addServerModal.discordImportError", "No se pudo importar el servidor.")
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || busyAction) return;

    setBusyAction("create");
    setError(null);
    try {
      let server = await window.electronAPI.createServer(
        trimmedName,
        profile,
        icon,
      );
      if (icon && server?.id && !server?.icon && window.electronAPI.updateServerSettings) {
        const updated = await window.electronAPI.updateServerSettings(server.id, { icon });
        if (updated) server = updated;
      }
      await onCreated(server);
    } catch (err) {
      setError(err.message || "Could not create server");
    } finally {
      setBusyAction(null);
    }
  };

  const handleJoin = async () => {
    if (!parsedInvite.valid || busyAction) return;

    setBusyAction("join");
    setError(null);
    try {
      let server = await window.electronAPI.joinServer(
        parsedInvite.code,
        "",
        profile,
      );
      if (
        parsedInvite.ip &&
        parsedInvite.port &&
        server?.id &&
        window.electronAPI.updateServerSettings
      ) {
        const updated = await window.electronAPI.updateServerSettings(server.id, {
          directConnectionEnabled: true,
          directIP: parsedInvite.ip,
          directPort: parsedInvite.port,
        });
        if (updated) server = updated;
      }
      await onCreated(server);
    } catch (err) {
      setError(err.message || "Could not join server");
    } finally {
      setBusyAction(null);
    }
  };

  const renderChannelTypeIcon = (type) => {
    const iconName =
      type === "category"
        ? "folder"
        : type === "voice"
          ? "volume_up"
          : type === "forum"
            ? "forum"
            : "tag";
    return <MaterialIcon name={iconName} size="sm" className="text-onicord-muted shrink-0" />;
  };

  return createPortal(
    <div
      className={cn("onicord-modal-backdrop p-4", isClosing && "onicord-animate-backdrop-out")}
      onClick={handleClose}
      role="presentation"
    >
      <div
        className={cn(
          "onicord-modal-card w-full p-6 sm:p-7 relative max-h-[90vh] overflow-y-auto",
          activeTab === "discord" && discordPreview ? "!max-w-[490px]" : "!max-w-[440px]",
          isClosing && "onicord-animate-modal-out",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleClose}
          disabled={Boolean(busyAction)}
          className="onicord-icon-btn absolute right-4 top-4 z-10"
          aria-label={t("common.close", "Cerrar")}
        >
          <MaterialIcon name="close" size="base" />
        </button>

        {/* Mode Switcher */}
        <div className="mb-5 pr-8 flex justify-center">
          <div className="inline-flex rounded-xl bg-onicord-mantle p-1 border border-onicord-border">
            <button
              type="button"
              disabled={Boolean(busyAction)}
              onClick={() => {
                setActiveTab("default");
                setError(null);
              }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                activeTab === "default"
                  ? "bg-onicord-accent text-white shadow-sm"
                  : "text-onicord-muted hover:text-onicord-text"
              )}
            >
              {t("addServerModal.createOrJoinTab", "Crear / Unirse")}
            </button>
            <button
              type="button"
              disabled={Boolean(busyAction)}
              onClick={() => {
                setActiveTab("discord");
                setError(null);
              }}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5",
                activeTab === "discord"
                  ? "bg-onicord-accent text-white shadow-sm"
                  : "text-onicord-muted hover:text-onicord-text"
              )}
            >
              <MaterialIcon name="download" size="xs" />
              {t("addServerModal.importDiscordTab", "Importar de Discord")}
            </button>
          </div>
        </div>

        {activeTab === "default" ? (
          <>
            {/* Centered Header */}
            <div className="text-center px-4">
              <Heading level={2} size="2xl" className="text-center">
                {t("addServerModal.title", "Crea tu servidor")}
              </Heading>
              <Text variant="sm" color="muted" className="mt-2 leading-relaxed text-center">
                {t(
                  "addServerModal.subtitle",
                  "Tu servidor es donde te reúnes con tus amigos. Crea el tuyo y empieza a hablar.",
                )}
              </Text>
            </div>

            {/* Server Icon Picker */}
            <div className="my-6 flex justify-center">
              <AvatarPicker
                src={icon}
                onChange={setIcon}
                onError={setError}
                initial={name.trim() ? name.trim().slice(0, 2).toUpperCase() : ""}
                fallbackIcon="dns"
                size="lg"
                disabled={Boolean(busyAction)}
                title={
                  icon
                    ? t("addServerModal.changeIcon", "Cambiar icono")
                    : t("addServerModal.uploadIcon", "Subir")
                }
                removeTitle={t("addServerModal.removeIcon", "Eliminar icono")}
              />
            </div>

            {/* Create Server Section */}
            <div>
              <label className="mb-2 block text-xs font-semibold text-onicord-subtext select-none">
                {t("addServerModal.serverNameLabel", "Nombre del servidor")}{" "}
                <span className="text-onicord-danger">*</span>
              </label>
              <ModalInput
                ref={nameInputRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && name.trim() && !busyAction) {
                    e.preventDefault();
                    handleCreate();
                  }
                }}
                maxLength={48}
                disabled={Boolean(busyAction)}
                placeholder={t("addServerModal.createPlaceholder", "Ej: Squad Gaming")}
                className="h-10"
              />
              <button
                type="button"
                disabled={Boolean(busyAction) || !name.trim()}
                onClick={handleCreate}
                className="onicord-btn-primary w-full mt-3 h-10"
              >
                {busyAction === "create"
                  ? t("common.saving", "Guardando...")
                  : t("addServerModal.createButton", "Crear servidor")}
              </button>
            </div>

            {/* Join Server Section */}
            <div className="mt-6 pt-5 border-t border-onicord-border">
              <Heading level={3} size="lg" className="text-center mb-3">
                {t("addServerModal.haveInviteTitle", "¿Ya tienes una invitación?")}
              </Heading>
              <ModalInput
                value={inviteInput}
                onChange={(e) => setInviteInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && parsedInvite.valid && !busyAction) {
                    e.preventDefault();
                    handleJoin();
                  }
                }}
                disabled={Boolean(busyAction)}
                placeholder={t("addServerModal.invitePlaceholder", "A1B2C3D4 o enlace de invitación")}
                className="h-10"
              />
              <button
                type="button"
                disabled={Boolean(busyAction) || !parsedInvite.valid}
                onClick={handleJoin}
                className="onicord-btn-secondary w-full mt-2.5 h-10 bg-onicord-overlay/60 hover:bg-onicord-overlay border border-onicord-border text-onicord-text"
              >
                {busyAction === "join"
                  ? t("common.loading", "Cargando...")
                  : t("addServerModal.joinButton", "Únete a un servidor")}
              </button>
            </div>
          </>
        ) : !discordPreview ? (
          /* Discord Import — Step A: Template URL Input */
          <div>
            <div className="text-center px-2 mb-5">
              <Heading level={2} size="2xl" className="text-center">
                {t("addServerModal.discordTitle", "Importar desde Discord")}
              </Heading>
              <Text variant="sm" color="muted" className="mt-2 leading-relaxed text-center">
                {t(
                  "addServerModal.discordSubtitle",
                  "Pega el enlace de una plantilla de servidor de Discord para clonar sus categorías, canales y roles al instante."
                )}
              </Text>
            </div>

            <label className="mb-2 block text-xs font-semibold text-onicord-subtext select-none">
              {t("addServerModal.discordUrlLabel", "Enlace de plantilla de Discord")}{" "}
              <span className="text-onicord-danger">*</span>
            </label>
            <ModalInput
              ref={templateInputRef}
              value={templateInput}
              onChange={(e) => setTemplateInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && templateInput.trim() && !busyAction) {
                  e.preventDefault();
                  handleAnalyzeDiscordTemplate();
                }
              }}
              disabled={Boolean(busyAction)}
              placeholder={t(
                "addServerModal.discordUrlPlaceholder",
                "https://discord.new/XXXX"
              )}
              className="h-10"
            />
            <p className="mt-2 text-xs text-onicord-muted leading-relaxed">
              {t(
                "addServerModal.discordUrlHint",
                "En Discord: Ajustes del servidor → Plantilla del servidor → Copiar enlace."
              )}
            </p>

            <button
              type="button"
              disabled={Boolean(busyAction) || !templateInput.trim()}
              onClick={handleAnalyzeDiscordTemplate}
              className="onicord-btn-primary w-full mt-4 h-10"
            >
              {busyAction === "previewDiscord"
                ? t("addServerModal.discordAnalyzing", "Analizando plantilla...")
                : t("addServerModal.discordAnalyzeButton", "Analizar plantilla")}
            </button>
          </div>
        ) : (
          /* Discord Import — Step B: Preview & Selection */
          <div>
            <div className="text-center px-2 mb-4">
              <Heading level={2} size="xl" className="text-center">
                {t("addServerModal.discordPreviewTitle", "Vista previa del servidor")}
              </Heading>
              <p className="mt-1 text-xs text-onicord-muted">
                {t(
                  "addServerModal.discordSummary",
                  "{{categories}} categorías · {{channels}} canales · {{roles}} roles",
                  discordCounts
                )}
              </p>
            </div>

            <div className="flex items-center gap-4 mb-4">
              <AvatarPicker
                src={discordIcon}
                onChange={setDiscordIcon}
                onError={setError}
                initial={
                  discordServerName.trim()
                    ? discordServerName.trim().slice(0, 2).toUpperCase()
                    : ""
                }
                fallbackIcon="dns"
                size="md"
                disabled={Boolean(busyAction)}
                title={
                  discordIcon
                    ? t("addServerModal.changeIcon", "Cambiar icono")
                    : t("addServerModal.uploadIcon", "Subir")
                }
                removeTitle={t("addServerModal.removeIcon", "Eliminar icono")}
              />
              <div className="flex-1 min-w-0">
                <label className="mb-1.5 block text-xs font-semibold text-onicord-subtext select-none">
                  {t("addServerModal.serverNameLabel", "Nombre del servidor")}{" "}
                  <span className="text-onicord-danger">*</span>
                </label>
                <ModalInput
                  value={discordServerName}
                  onChange={(e) => setDiscordServerName(e.target.value)}
                  maxLength={48}
                  disabled={Boolean(busyAction)}
                  placeholder={t("addServerModal.createPlaceholder", "Ej: Squad Gaming")}
                  className="h-9"
                />
              </div>
            </div>

            <div className="mb-3 rounded-lg bg-onicord-mantle/80 border border-onicord-border px-3 py-2 flex items-start gap-2 text-xs text-onicord-muted">
              <MaterialIcon name="info" size="sm" className="text-onicord-accent mt-0.5" />
              <span>
                {t(
                  "addServerModal.discordBestEffortNote",
                  "Se importarán categorías, canales, foros, flags +18 y roles. Funciones exclusivas de Discord (como modo lento) se omitirán."
                )}
              </span>
            </div>

            {/* Scrollable Preview List */}
            <div className="max-h-56 overflow-y-auto space-y-3 pr-1 rounded-lg border border-onicord-border bg-onicord-mantle/40 p-3">
              {/* Channels & Categories */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-onicord-muted mb-1.5">
                  {t("addServerModal.discordChannelsSection", "Canales y categorías")}
                </p>
                <div className="space-y-1">
                  {(discordPreview.channels || []).map((ch) => {
                    const isChecked = selectedChannelIds.has(String(ch.discordId));
                    const isChild = Boolean(ch.parentDiscordId && ch.type !== "category");
                    const isAfk =
                      ch.type === "voice" &&
                      discordPreview.afkChannelDiscordId &&
                      String(ch.discordId) === String(discordPreview.afkChannelDiscordId);
                    return (
                      <label
                        key={ch.discordId}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-2 py-1 text-xs cursor-pointer hover:bg-onicord-overlay/40 transition-colors",
                          isChild && "ml-5",
                          ch.type === "category" && "font-semibold text-onicord-text"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={Boolean(busyAction)}
                          onChange={() => toggleChannelSelection(ch)}
                          className="accent-onicord-accent rounded"
                        />
                        {renderChannelTypeIcon(ch.type)}
                        <span className="truncate flex-1 text-onicord-text">{ch.name}</span>
                        {isAfk && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-onicord-accent/15 text-onicord-accent shrink-0"
                            title={t("addServerModal.discordAfkChannel", "Canal AFK")}
                          >
                            <MaterialIcon name="bedtime" size={12} />
                            {t("addServerModal.discordAfkBadge", "AFK")}
                          </span>
                        )}
                        {ch.isPrivate && (
                          <MaterialIcon
                            name="lock"
                            size="xs"
                            className="text-onicord-muted shrink-0"
                            title={t("addServerModal.discordPrivateChannel", "Canal privado")}
                          />
                        )}
                        {ch.nsfw && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-onicord-danger/15 text-onicord-danger shrink-0">
                            {t("addServerModal.discordNsfwBadge", "+18")}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Roles */}
              {(discordPreview.roles || []).length > 0 && (
                <div className="pt-2 border-t border-onicord-border/60">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-onicord-muted mb-1.5">
                    {t("addServerModal.discordRolesSection", "Roles")}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {discordPreview.roles.map((r) => {
                      const isChecked = selectedRoleIds.has(String(r.discordId));
                      return (
                        <label
                          key={r.discordId}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs border cursor-pointer transition-colors",
                            isChecked
                              ? "bg-onicord-overlay/60 border-onicord-border text-onicord-text"
                              : "bg-transparent border-onicord-border/40 text-onicord-muted opacity-60"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={Boolean(busyAction)}
                            onChange={() => toggleRoleSelection(r.discordId)}
                            className="sr-only"
                          />
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: r.color || "#99aab5" }}
                          />
                          <span className="truncate max-w-[140px]">{r.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center gap-2.5 mt-4">
              <button
                type="button"
                disabled={Boolean(busyAction)}
                onClick={() => {
                  setDiscordPreview(null);
                  setError(null);
                }}
                className="onicord-btn-secondary h-10 px-4 bg-onicord-overlay/60 hover:bg-onicord-overlay border border-onicord-border text-onicord-text inline-flex items-center gap-1.5"
              >
                <MaterialIcon name="arrow_back" size="sm" />
                {t("addServerModal.discordBackButton", "Atrás")}
              </button>
              <button
                type="button"
                disabled={Boolean(busyAction) || !discordServerName.trim()}
                onClick={handleImportDiscord}
                className="onicord-btn-primary flex-1 h-10"
              >
                {busyAction === "importDiscord"
                  ? t("addServerModal.discordImporting", "Importando...")
                  : t("addServerModal.discordImportButton", "Importar servidor")}
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="onicord-error-banner mt-4 animate-fade-in">
            {error}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
