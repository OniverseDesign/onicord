import React, { useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import UserProfilePopout from "../ui/UserProfilePopout";
import Select from "../ui/Select";
import RichPresenceCard from "../ui/RichPresenceCard";
import { IconLink } from "../icons/StreamIcons";
import MaterialIcon from "../icons/MaterialIcon";
import ColorPicker from "../ui/ColorPicker";
import { APP_COLORS } from "../../lib/colors";
import { ModalInput } from "../ui/ModalShell";

const MAX_AVATAR_SIZE = 8 * 1024 * 1024;

export default function ProfileTab({
  nickname,
  setNickname,
  avatar,
  setAvatar,
  customLink,
  setCustomLink,
  profileColor,
  setProfileColor,
  showRichPresence,
  setShowRichPresence,
  customStatus,
  setCustomStatus,
  setError,
  servers = [],
  currentServer = null,
  serverProfiles = {},
  selectedScope = "global",
  onScopeChange,
  onUpdateServerProfile,
  onResetServerProfile,
}) {
  const { t } = useTranslation();
  const fileRef = useRef(null);

  // Canonical key for the server we are currently in (uppercase roomCode preferred)
  const currentServerKey = useMemo(() => {
    if (!currentServer) return null;
    return String(currentServer.roomCode || currentServer.id || "")
      .trim()
      .toUpperCase();
  }, [currentServer]);

  const isServerScope = Boolean(selectedScope && selectedScope !== "global");
  const activeScopeKey = isServerScope
    ? selectedScope || currentServerKey
    : null;
  const currentServerOverride = activeScopeKey
    ? serverProfiles[activeScopeKey] ||
      serverProfiles[activeScopeKey.toUpperCase()] ||
      {}
    : {};

  const currentNick = isServerScope
    ? (currentServerOverride.nickname ?? "")
    : nickname;
  const currentAvatar = isServerScope
    ? currentServerOverride.avatar !== undefined
      ? currentServerOverride.avatar
      : null
    : avatar;
  const currentLink = isServerScope
    ? (currentServerOverride.customLink ?? "")
    : customLink;
  const currentColor = isServerScope
    ? (currentServerOverride.profileColor ?? "")
    : profileColor;
  const currentStatus = isServerScope
    ? (currentServerOverride.customStatus ?? "")
    : customStatus;

  const handleScopeSelectChange = (e) => {
    const val = e.target.value;
    if (val === "global") {
      onScopeChange?.("global");
    } else {
      if (currentServerKey) {
        onScopeChange?.(currentServerKey);
      }
    }
  };

  const scopeOptions = useMemo(
    () => [
      {
        value: "global",
        label: t("profileTab.mainProfile", "Perfil Principal"),
      },
      {
        value: "server",
        label: t("profileTab.serverProfile", "Perfil del Servidor"),
        disabled: !currentServerKey,
      },
    ],
    [t, currentServerKey],
  );

  const handleNickChange = (val) => {
    if (isServerScope && activeScopeKey) {
      onUpdateServerProfile?.(activeScopeKey, { nickname: val });
    } else {
      setNickname(val);
    }
  };

  const handleStatusChange = (val) => {
    if (isServerScope && activeScopeKey) {
      onUpdateServerProfile?.(activeScopeKey, { customStatus: val });
    } else {
      setCustomStatus(val);
    }
  };

  const handleLinkChange = (val) => {
    if (isServerScope && activeScopeKey) {
      onUpdateServerProfile?.(activeScopeKey, { customLink: val });
    } else {
      setCustomLink(val);
    }
  };

  const handleColorChange = (val) => {
    if (isServerScope && activeScopeKey) {
      onUpdateServerProfile?.(activeScopeKey, { profileColor: val });
    } else {
      setProfileColor(val);
    }
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t("profileTab.invalidImage", "Selecciona una imagen válida."));
      e.target.value = "";
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setError(
        t("profileTab.imageTooLarge", "La imagen no debe superar los 8 MB."),
      );
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (isServerScope && activeScopeKey) {
        onUpdateServerProfile?.(activeScopeKey, { avatar: dataUrl });
      } else {
        setAvatar(dataUrl);
      }
      setError(null);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleRemoveAvatar = () => {
    if (isServerScope && activeScopeKey) {
      onUpdateServerProfile?.(activeScopeKey, { avatar: null });
    } else {
      setAvatar(null);
    }
  };

  const previewNickname = isServerScope
    ? currentNick.trim() ||
      nickname ||
      t("profileTab.yourNamePlaceholder", "Tu Apodo")
    : nickname || t("profileTab.yourNamePlaceholder", "Tu Apodo");

  const previewAvatar = isServerScope
    ? currentAvatar !== null && currentAvatar !== undefined
      ? currentAvatar
      : avatar
    : avatar;

  const previewCustomStatus = isServerScope ? currentStatus : customStatus;

  const previewCustomLink = isServerScope ? currentLink : customLink;

  const previewProfileColor = isServerScope
    ? currentColor || profileColor
    : profileColor;

  return (
    <div className="onicord-settings-container">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
        {/* Left column: Profile controls */}
        <div className="md:col-span-6 space-y-4">
          {/* Personal profile info */}
          <div className="onicord-settings-card">
            <h3 className="onicord-settings-section-title">
              <span>{t("profileTab.title", "Información Personal")}</span>
            </h3>

            <div className="space-y-3.5 pt-1">
              {/* Apodo */}
              <div>
                <label className="text-xs font-semibold text-onicord-text block mb-1.5">
                  {isServerScope
                    ? t(
                        "profileTab.serverNicknameLabel",
                        "Apodo en este Servidor",
                      )
                    : t(
                        "profileTab.nicknameLabel",
                        "Apodo o Nombre de Usuario",
                      )}
                </label>
                <ModalInput
                  value={currentNick}
                  onChange={(e) => handleNickChange(e.target.value)}
                  maxLength={32}
                  placeholder={
                    isServerScope
                      ? nickname ||
                        t("profileTab.yourNamePlaceholder", "Tu Apodo")
                      : t("profileTab.yourNamePlaceholder", "Tu Apodo")
                  }
                  className="h-10 text-xs"
                />
              </div>

              {/* Estado Personalizado */}
              <div>
                <label className="text-xs font-semibold text-onicord-text block mb-1.5">
                  {t("profileTab.statusLabel", "Estado Personalizado")}
                </label>
                <ModalInput
                  value={currentStatus}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  maxLength={64}
                  placeholder={t(
                    "profileTab.statusPlaceholder",
                    "Ej. En llamada de voz / Programando...",
                  )}
                  className="h-10 text-xs"
                />
              </div>

              {/* Enlace Personalizado */}
              <div>
                <label className="text-xs font-semibold text-onicord-text block mb-1.5">
                  {t("profileTab.linkLabel", "Enlace o Red Social")}
                </label>
                <ModalInput
                  value={currentLink}
                  onChange={(e) => handleLinkChange(e.target.value)}
                  placeholder={
                    isServerScope
                      ? customLink || t("profileTab.addLinkPlaceholder", "https://...")
                      : t(
                          "profileTab.addLinkPlaceholder",
                          "https://...",
                        )
                  }
                  className="h-10 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Activity and presence visibility (solo en global) */}

          <div className="onicord-settings-card">
            <h3 className="onicord-settings-section-title">
              <span>
                {t("profileTab.activitySettings", "Actividad y Presencia")}
              </span>
            </h3>

            <div className="onicord-settings-row">
              <div className="min-w-0 pr-4">
                <p className="onicord-settings-row-title">
                  {t("profileTab.currentActivity", "Mostrar Actividad Actual")}
                </p>
                <p className="onicord-settings-row-desc">
                  {t(
                    "profileTab.showGameStatusTitle",
                    "Muestra tu estado en canales de voz o juegos en tiempo real.",
                  )}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                <input
                  type="checkbox"
                  checked={showRichPresence}
                  onChange={(e) => setShowRichPresence(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="onicord-toggle-slider" />
              </label>
            </div>
          </div>

          {/* Profile background color */}
          <div className="onicord-settings-card">
            <h3 className="onicord-settings-section-title">
              <span>
                {isServerScope
                  ? t(
                      "profileTab.serverBackgroundColor",
                      "Color de Perfil para este Servidor",
                    )
                  : t(
                      "profileTab.backgroundColor",
                      "Color de Fondo del Perfil",
                    )}
              </span>
            </h3>
            <div className="pt-1 flex justify-start">
              <ColorPicker
                selectedColor={currentColor || "default"}
                onSelectColor={(key, info) => {
                  if (key === "default") {
                    handleColorChange("");
                  } else {
                    handleColorChange(info.colorVar);
                  }
                }}
                showStructures={true}
              />
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: SCOPE SELECTOR & LIVE PREVIEW */}
        <div className="md:col-span-6 space-y-4">
          {/* Scope Selector Card using custom Select */}
          <div className="onicord-settings-card space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-onicord-text">
                {t("profileTab.scopeLabel", "Ámbito de Edición")}
              </label>
              {isServerScope && (
                <button
                  type="button"
                  onClick={() => onResetServerProfile?.(activeScopeKey)}
                  className="text-[10px] font-bold text-onicord-accent bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                >
                  {t(
                    "profileTab.resetToServerDefault",
                    "Restablecer al perfil principal",
                  )}
                </button>
              )}
            </div>

            <Select
              className="w-full"
              value={isServerScope ? "server" : "global"}
              onChange={handleScopeSelectChange}
              options={scopeOptions}
            />
          </div>

          {/* Live Preview Card */}
          <div className="onicord-settings-card flex flex-col items-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-onicord-muted mb-3 flex items-center gap-1.5 self-start">
              <MaterialIcon name="visibility" size={14} />
              <span>
                {isServerScope
                  ? t(
                      "settings.theme.previewServer",
                      "Vista Previa en Servidor",
                    )
                  : t("settings.theme.preview", "Vista Previa en Vivo")}
              </span>
            </span>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />

            <UserProfilePopout
              className="!shadow-none"
              isInlinePreview={true}
              member={{
                id: "preview-user",
                nickname: previewNickname,
                globalNickname:
                  isServerScope &&
                  currentNick.trim() &&
                  currentNick.trim() !== nickname
                    ? nickname
                    : null,
                avatar: previewAvatar,
                customStatus: previewCustomStatus,
                customLink: previewCustomLink,
                profileColor: previewProfileColor,
                flame: {
                  currentStreak: 5,
                  highestStreak: 12,
                  interactedToday: true,
                },
                activity: showRichPresence
                  ? {
                      name: "Spotify - In the End",
                      type: "music",
                      startTime: Date.now() - 3600000,
                    }
                  : null,
                showRichPresence: showRichPresence,
                online: true,
                isSelf: true,
              }}
              userRolesList={[
                {
                  id: "owner",
                  name: t("common.owner", "Propietario"),
                  color: "#FFD700",
                },
                {
                  id: "role-1",
                  name: t("settings.profile.vipMember", "Miembro VIP"),
                  color: "#89b4fa",
                },
              ]}
              onAvatarClick={() => fileRef.current?.click()}
              onRemoveAvatar={handleRemoveAvatar}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
