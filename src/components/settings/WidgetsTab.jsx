import React from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import { getCombinedConfigs } from "../dashboard/dashboardConfig";

const WIDGET_ICONS = {
  hora: "schedule",
  clima: "cloud",
  hardware: "memory",
  musica: "music_note",
  sketchpad: "draw",
  notas: "sticky_note_2",
};

export default function WidgetsTab({
  visibilidadWidgets,
  handleToggleWidget,
  handleResetBento,
}) {
  const { t } = useTranslation();
  const allWidgets = getCombinedConfigs();

  return (
    <div className="onicord-settings-container">
      {/* TARJETA Panel de Widgets */}
      <div className="onicord-settings-card">
        <h3 className="onicord-settings-section-title">
          <span>{t("settings.widgetsTab.title", "Panel de Widgets")}</span>
        </h3>
        <p className="onicord-settings-row-desc -mt-2 mb-3">
          {t("settings.widgetsTab.hint", "Activa o desactiva los widgets en tu Panel de Widgets.")}
        </p>

        <div className="space-y-2">
          {allWidgets.map((widget) => {
            const iconName = WIDGET_ICONS[widget.id] || "extension";
            const isActive = !!visibilidadWidgets[widget.id];

            return (
              <div
                key={widget.id}
                className="onicord-settings-row p-2.5 rounded-xl hover:bg-onicord-base/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 pr-4">
                  <div className={`onicord-icon-badge ${isActive ? "text-onicord-accent bg-onicord-base" : "text-onicord-muted bg-onicord-base/40"}`}>
                    <MaterialIcon name={iconName} size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="onicord-settings-row-title">
                      {t("widgets.badges." + widget.id, widget.badgeText || "Módulo")}
                    </p>
                    <p className="onicord-settings-row-desc">
                      {isActive
                        ? t("common.active", "Activo en el Panel de Widgets")
                        : t("common.disabled", "Desactivado")}
                    </p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer select-none shrink-0">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={() => handleToggleWidget(widget.id)}
                    className="sr-only peer"
                  />
                  <div className="onicord-toggle-slider" />
                </label>
              </div>
            );
          })}
        </div>

        <div className="pt-3 border-t border-white/5">
          <button
            type="button"
            onClick={handleResetBento}
            className="onicord-btn-danger-soft block w-full text-center py-2.5"
          >
            {t("settings.resetBento", "Restablecer posiciones por defecto del Panel de Widgets")}
          </button>
        </div>
      </div>
    </div>
  );
}
