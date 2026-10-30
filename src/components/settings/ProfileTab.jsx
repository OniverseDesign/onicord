import React, { useRef } from "react";
import { useTranslation } from "react-i18next";
import UserProfilePopout from "../ui/UserProfilePopout";
import RichPresenceCard from "../ui/RichPresenceCard";
import { IconLink } from "../icons/StreamIcons";
import MaterialIcon from "../icons/MaterialIcon";
import ColorPicker from "../ui/ColorPicker";
import { APP_COLORS } from "../../lib/colors";
import { ModalInput } from "../ui/ModalShell";

const MAX_AVATAR_SIZE = 512 * 1024;

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
}) {
  const { t } = useTranslation();
  const fileRef = useRef(null);

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
        t("profileTab.imageTooLarge", "La imagen no debe superar los 512 KB."),
      );
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAvatar(reader.result);
      setError(null);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const currentColorConfig = Object.values(APP_COLORS).find(
    (c) =>
      c.colorVar === profileColor ||
      c.rgbVar === profileColor ||
      c.key === profileColor,
  );
  const isLightBg = currentColorConfig
    ? currentColorConfig.isLight
    : profileColor
      ? true
      : false;
  const cutoutColor = profileColor || "rgb(var(--onicord-bg-mantle))";
  const cutoutColorDot = "rgb(var(--onicord-bg-mantle) / 0.3)";

  const textMain = isLightBg ? "text-onicord-dark" : "text-onicord-text";
  const textMuted = isLightBg
    ? "text-onicord-dark-muted font-bold"
    : "text-onicord-muted";
  const divider = isLightBg ? "border-black/10" : "border-white/5";
  const linkBg = isLightBg
    ? "bg-black/10 hover:bg-black/20 text-onicord-dark"
    : "bg-black/20 hover:bg-black/30 text-onicord-accent";

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
                  {t("profileTab.nicknameLabel", "Apodo o Nombre de Usuario")}
                </label>
                <ModalInput
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={32}
                  placeholder={t("profileTab.yourNamePlaceholder", "Tu Apodo")}
                  className="h-10 text-xs"
                />
              </div>

              {/* Estado Personalizado */}
              <div>
                <label className="text-xs font-semibold text-onicord-text block mb-1.5">
                  {t("profileTab.statusLabel", "Estado Personalizado")}
                </label>
                <ModalInput
                  value={customStatus}
                  onChange={(e) => setCustomStatus(e.target.value)}
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
                  value={customLink}
                  onChange={(e) => setCustomLink(e.target.value)}
                  placeholder={t(
                    "profileTab.addLinkPlaceholder",
                    "twitter.com/tu_usuario",
                  )}
                  className="h-10 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Activity and presence visibility */}
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
                {t("profileTab.backgroundColor", "Color de Fondo del Perfil")}
              </span>
            </h3>
            <div className="pt-1 flex justify-start">
              <ColorPicker
                selectedColor={profileColor || "default"}
                onSelectColor={(key, info) => {
                  if (key === "default") {
                    setProfileColor("");
                  } else {
                    setProfileColor(info.colorVar);
                  }
                }}
                showStructures={true}
              />
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: LIVE PREVIEW (5/12) */}
        <div className="md:col-span-6">
          <div className="onicord-settings-card flex flex-col items-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-onicord-muted mb-3 flex items-center gap-1.5 self-start">
              <MaterialIcon name="visibility" size={14} />
              <span>{t("settings.theme.preview", "Vista Previa en Vivo")}</span>
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
                nickname:
                  nickname || t("profileTab.yourNamePlaceholder", "Tu Apodo"),
                avatar: avatar,
                customStatus: customStatus,
                customLink: customLink,
                profileColor: profileColor,
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
                { id: "owner", name: t("common.owner", "Propietario"), color: "#FFD700" },
                { id: "role-1", name: t("settings.profile.vipMember", "Miembro VIP"), color: "#89b4fa" },
              ]}
              onAvatarClick={() => fileRef.current?.click()}
              onRemoveAvatar={() => setAvatar(null)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
