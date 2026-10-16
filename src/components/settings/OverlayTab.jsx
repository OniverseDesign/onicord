import { useState } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";

const POSITIONS = [
  { id: "top-left", row: 0, col: 0 },
  { id: "top-center", row: 0, col: 1 },
  { id: "top-right", row: 0, col: 2 },
  { id: "center-left", row: 1, col: 0 },
  // center is empty
  { id: "center-right", row: 1, col: 2 },
  { id: "bottom-left", row: 2, col: 0 },
  { id: "bottom-center", row: 2, col: 1 },
  { id: "bottom-right", row: 2, col: 2 },
];

const POSITION_LABELS = {
  "top-left": "Superior Izquierda",
  "top-center": "Superior Centro",
  "top-right": "Superior Derecha",
  "center-left": "Centro Izquierda",
  "center-right": "Centro Derecha",
  "bottom-left": "Inferior Izquierda",
  "bottom-center": "Inferior Centro",
  "bottom-right": "Inferior Derecha",
};

export default function OverlayTab({ overlay, setOverlay }) {
  const { t } = useTranslation();
  const [isTesting, setIsTesting] = useState(false);

  const enabled = overlay?.enabled ?? true;
  const position = overlay?.position ?? "top-left";
  const opacity = overlay?.opacity ?? 0.6;
  const autoHideWhenQuiet = overlay?.autoHideWhenQuiet ?? false;
  const avatarOnly = overlay?.avatarOnly ?? false;
  const showNameOnlyWhenSpeaking = overlay?.showNameOnlyWhenSpeaking ?? false;

  const updateField = (field, value) => {
    setOverlay((prev) => ({ ...prev, [field]: value }));
  };

  const handleTestOverlay = async () => {
    if (!window.electronAPI?.triggerTestOverlay) return;
    setIsTesting(true);
    try {
      await window.electronAPI.triggerTestOverlay(10000);
      setTimeout(() => {
        setIsTesting(false);
      }, 10000);
    } catch (e) {
      setIsTesting(false);
    }
  };

  return (
    <div className="onicord-settings-container">
      {/* SECCIÓN 1: ESTADO GENERAL DEL OVERLAY */}
      <div className="onicord-settings-card">
        <h3 className="onicord-settings-section-title">
          <span>{t("settings.overlay.title", "Overlay de Voz en Juego")}</span>
        </h3>

        <div className="onicord-settings-row">
          <div className="min-w-0 pr-4">
            <p className="onicord-settings-row-title">
              {t("settings.overlay.enableOverlay", "Habilitar Overlay en Juego")}
            </p>
            <p className="onicord-settings-row-desc">
              {t(
                "settings.overlay.enableDesc",
                "Muestra los usuarios conectados al canal de voz sobre tus juegos cuando se detecte un juego activo."
              )}
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => updateField("enabled", e.target.checked)}
              className="sr-only peer"
            />
            <div className="onicord-toggle-slider" />
          </label>
        </div>

        {/* Probar Overlay en Pantalla */}
        <div
          className={`pt-3 mt-3 border-t border-white/5 flex items-center justify-between transition-opacity ${
            !enabled ? "opacity-40 pointer-events-none" : ""
          }`}
        >
          <div className="min-w-0 pr-4">
            <p className="onicord-settings-row-title">
              {t("settings.overlay.testTitle", "Probar Overlay en Pantalla")}
            </p>
            <p className="onicord-settings-row-desc">
              {t(
                "settings.overlay.testDesc",
                "Muestra el overlay real en la posición seleccionada durante 10 segundos para verificar cómo se ve sobre tu escritorio o juego."
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={handleTestOverlay}
            disabled={!enabled || isTesting}
            className="px-4 py-2 rounded-onicord-button bg-onicord-overlay hover:bg-white/10 text-white text-xs font-semibold flex items-center gap-2 border border-white/10 transition-all cursor-pointer disabled:opacity-50 shrink-0"
          >
            <MaterialIcon name={isTesting ? "timer" : "visibility"} size={16} />
            <span>
              {isTesting
                ? t("settings.overlay.testing", "Mostrando (10s)...")
                : t("settings.overlay.testBtn", "Probar en Pantalla")}
            </span>
          </button>
        </div>

        {/* Nota informativa */}
        <div className="mt-3 p-2.5 rounded-xl bg-onicord-base/40 border border-white/5 flex items-start gap-2 text-[11px] text-onicord-muted">
          <MaterialIcon
            name="info"
            size={15}
            className="text-onicord-accent shrink-0 mt-0.5"
          />
          <span>
            {t(
              "settings.overlay.gameInfo",
              "Durante el uso normal, el overlay se activará automáticamente cuando estés en un canal de voz y se detecte un juego en ejecución (con Onicord en segundo plano)."
            )}
          </span>
        </div>
      </div>

      {/* SECCIÓN 2: POSICIÓN Y DISPOSICIÓN */}
      <div className={`onicord-settings-card transition-opacity ${!enabled ? "opacity-40 pointer-events-none" : ""}`}>
        <h3 className="onicord-settings-section-title">
          <span>{t("settings.overlay.positionTitle", "Posición en Pantalla")}</span>
        </h3>

        <div className="mb-4">
          <p className="onicord-settings-row-title mb-1">
            {t("settings.overlay.positionSelect", "Ubicación del Overlay")}
          </p>
          <p className="onicord-settings-row-desc">
            {t(
              "settings.overlay.positionDesc",
              "Selecciona en qué zona de la pantalla aparecerá el overlay. Siempre se mantendrá pegado al borde más cercano."
            )}
          </p>
        </div>

        {/* Mockup interactivo 3x3 */}
        <div className="flex flex-col items-center justify-center pt-2 pb-1">
          <div className="relative w-[260px] h-[165px] bg-onicord-base/60 rounded-xl border border-white/10 overflow-hidden shadow-inner">
            {/* Grid background lines */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[1px] h-full bg-white/5 absolute left-1/3" />
              <div className="w-[1px] h-full bg-white/5 absolute left-2/3" />
              <div className="h-[1px] w-full bg-white/5 absolute top-1/3" />
              <div className="h-[1px] w-full bg-white/5 absolute top-2/3" />
            </div>

            {/* Position buttons */}
            {POSITIONS.map((pos) => {
              const isSelected = position === pos.id;
              const left =
                pos.col === 0 ? "8px" : pos.col === 1 ? "calc(50% - 20px)" : "calc(100% - 48px)";
              const top =
                pos.row === 0 ? "8px" : pos.row === 1 ? "calc(50% - 15px)" : "calc(100% - 38px)";

              return (
                <button
                  key={pos.id}
                  type="button"
                  onClick={() => updateField("position", pos.id)}
                  className={`absolute w-[40px] h-[30px] rounded-lg border transition-all duration-200 cursor-pointer flex items-center justify-center ${
                    isSelected
                      ? "bg-onicord-accent/30 border-onicord-accent shadow-[0_0_10px_rgba(var(--onicord-accent),0.4)]"
                      : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
                  }`}
                  style={{ left, top }}
                  title={POSITION_LABELS[pos.id]}
                >
                  {isSelected && (
                    <div className="w-2.5 h-2.5 rounded-full bg-onicord-accent animate-pulse" />
                  )}
                </button>
              );
            })}

            {/* Center screen label */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] text-onicord-muted/40 font-bold uppercase tracking-widest pointer-events-none select-none">
              {t("settings.overlay.screen", "Pantalla")}
            </div>
          </div>

          <p className="text-xs text-onicord-accent font-semibold mt-3 flex items-center gap-1.5">
            <MaterialIcon name="place" size={14} />
            <span>{POSITION_LABELS[position] || position}</span>
          </p>
        </div>
      </div>

      {/* SECCIÓN 3: OPCIONES DE VISUALIZACIÓN DE NOMBRES */}
      <div className={`onicord-settings-card transition-opacity ${!enabled ? "opacity-40 pointer-events-none" : ""}`}>
        <h3 className="onicord-settings-section-title">
          <span>{t("settings.overlay.displayTitle", "Visualización de Usuarios y Nombres")}</span>
        </h3>

        {/* Solo imagen de perfil */}
        <div className="onicord-settings-row">
          <div className="min-w-0 pr-4">
            <p className="onicord-settings-row-title">
              {t("settings.overlay.avatarOnly", "Solo imagen de perfil")}
            </p>
            <p className="onicord-settings-row-desc">
              {t(
                "settings.overlay.avatarOnlyDesc",
                "Muestra únicamente las fotos de perfil circulares con su aro indicador de voz, ocultando los nombres."
              )}
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
            <input
              type="checkbox"
              checked={avatarOnly}
              onChange={(e) => updateField("avatarOnly", e.target.checked)}
              className="sr-only peer"
            />
            <div className="onicord-toggle-slider" />
          </label>
        </div>

        {/* Mostrar nombre solo al hablar */}
        <div className={`onicord-settings-row ${avatarOnly ? "opacity-40 pointer-events-none" : ""}`}>
          <div className="min-w-0 pr-4">
            <p className="onicord-settings-row-title">
              {t("settings.overlay.showNameOnlySpeaking", "Mostrar nombre solo cuando esa persona está hablando")}
            </p>
            <p className="onicord-settings-row-desc">
              {t(
                "settings.overlay.showNameOnlySpeakingDesc",
                "Mantiene el nombre oculto si el usuario está en silencio (solo se ve su avatar) y lo muestra automáticamente cuando habla."
              )}
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
            <input
              type="checkbox"
              checked={showNameOnlyWhenSpeaking}
              onChange={(e) => updateField("showNameOnlyWhenSpeaking", e.target.checked)}
              className="sr-only peer"
              disabled={avatarOnly}
            />
            <div className="onicord-toggle-slider" />
          </label>
        </div>
      </div>

      {/* SECCIÓN 4: APARIENCIA Y COMPORTAMIENTO */}
      <div className={`onicord-settings-card transition-opacity ${!enabled ? "opacity-40 pointer-events-none" : ""}`}>
        <h3 className="onicord-settings-section-title">
          <span>{t("settings.overlay.appearanceTitle", "Apariencia y Comportamiento")}</span>
        </h3>

        {/* Opacidad del fondo (Fila con slider) */}
        <div className="onicord-settings-slider-row">
          <div className="flex justify-between items-center">
            <div className="min-w-0 pr-2">
              <p className="onicord-settings-row-title">
                {t("settings.overlay.opacity", "Opacidad del Fondo")}
              </p>
              <p className="onicord-settings-row-desc">
                {t(
                  "settings.overlay.opacityDesc",
                  "Ajusta la transparencia del contenedor del overlay. Puedes establecerlo en 0% para un fondo completamente transparente."
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-onicord-base/40 p-2.5 rounded-xl border border-white/5 mt-1">
            <span className="text-[11px] text-onicord-muted font-mono font-bold select-none min-w-[32px]">
              0%
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={Math.round(opacity * 100)}
              onChange={(e) =>
                updateField("opacity", Number(e.target.value) / 100)
              }
              className="onicord-range-input flex-1"
            />
            <span className="text-[11px] text-onicord-accent font-mono font-bold select-none min-w-[36px] text-right">
              {Math.round(opacity * 100)}%
            </span>
          </div>

          {/* Dynamic Live Preview Box */}
          <div className="mt-4 flex justify-center">
            <div
              className="rounded-xl p-2.5 flex flex-col gap-2 border border-white/10 transition-all shadow-md min-w-[170px]"
              style={{ background: `rgba(0, 0, 0, ${opacity})` }}
            >
              {/* Demo Member 1: Speaking (Green ring #a6e3a1) */}
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-full bg-onicord-accent flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                  style={{ boxShadow: "0 0 0 2px #a6e3a1" }}
                >
                  A
                </div>
                {!avatarOnly && (
                  <span className="text-xs font-semibold text-[#a6e3a1] truncate">
                    Alex (Hablando)
                  </span>
                )}
              </div>

              {/* Demo Member 2: Silent / Muted (Red ring #f38ba8) */}
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-full bg-onicord-faded flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                  style={{ boxShadow: "0 0 0 2px #f38ba8" }}
                >
                  S
                </div>
                {!avatarOnly && !showNameOnlyWhenSpeaking && (
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="text-xs font-medium text-white/80">
                      Sam
                    </span>
                    <span className="text-[#f38ba8] text-[10px]">🔇</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Auto-hide */}
        <div className="onicord-settings-row">
          <div className="min-w-0 pr-4">
            <p className="onicord-settings-row-title">
              {t("settings.overlay.autoHide", "Ocultar cuando nadie habla")}
            </p>
            <p className="onicord-settings-row-desc">
              {t(
                "settings.overlay.autoHideDesc",
                "El overlay se desvanece automáticamente tras 5 segundos sin actividad de voz y reaparece cuando alguien habla."
              )}
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
            <input
              type="checkbox"
              checked={autoHideWhenQuiet}
              onChange={(e) => updateField("autoHideWhenQuiet", e.target.checked)}
              className="sr-only peer"
            />
            <div className="onicord-toggle-slider" />
          </label>
        </div>
      </div>
    </div>
  );
}
