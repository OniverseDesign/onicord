import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import { IconJoystick, Delete, IconAdd } from "../icons/StreamIcons";

export default function GamesActivityTab({
  showRichPresence,
  setShowRichPresence,
  customGames = [],
  setCustomGames,
}) {
  const { t } = useTranslation();
  const [activeGame, setActiveGame] = useState({ name: null, cover: null, type: "game", startTime: null });
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [notification, setNotification] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState("");

  // Suscribirse a la actividad del cliente local
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    if (api.getCurrentGame) {
      api.getCurrentGame().then((st) => {
        if (st) setActiveGame(st);
      });
    }

    const unsub = api.onGameActivityChanged?.((st) => {
      if (st) setActiveGame(st);
    });

    return () => unsub?.();
  }, []);

  // Agregar juego o software automáticamente con el explorador nativo
  const handleAddProgram = async () => {
    const api = window.electronAPI;
    if (!api?.openExecutableDialog) return;

    setIsBrowsing(true);
    setNotification(null);

    try {
      const result = await api.openExecutableDialog();
      if (!result || !result.fileName) {
        setIsBrowsing(false);
        return;
      }

      const cleanExe = result.fileName.trim();
      const finalTitle = result.title || cleanExe.replace(/\.exe$/i, "");
      const finalType = result.type || "game";

      // Verificar si ya existe en la lista
      const exists = customGames.some(
        (g) => g.exe.toLowerCase() === cleanExe.toLowerCase()
      );

      if (exists) {
        setNotification({
          type: "warning",
          text: t("gamesTab.alreadyRegistered", `"${finalTitle}" ya está en tu lista de actividad.`),
        });
        setIsBrowsing(false);
        return;
      }

      const newEntry = {
        id: crypto.randomUUID(),
        exe: cleanExe,
        title: finalTitle,
        type: finalType,
        cover: result.icon || null,
        enabled: true,
        priority: 85,
      };

      setCustomGames((prev) => [...prev, newEntry]);

      setNotification({
        type: "success",
        text: t("gamesTab.addedSuccess", `"${finalTitle}" añadido automáticamente como ${finalType === "app" ? "Software" : "Videojuego"}.`),
      });

      setTimeout(() => setNotification(null), 4000);
    } catch (err) {
      console.warn("Error al agregar juego o software:", err);
      setNotification({
        type: "error",
        text: t("gamesTab.errorBrowse", "No se pudo leer el archivo seleccionado."),
      });
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleToggleGame = (id) => {
    setCustomGames((prev) =>
      prev.map((g) => (g.id === id ? { ...g, enabled: !g.enabled } : g))
    );
  };

  const handleToggleType = (id) => {
    setCustomGames((prev) =>
      prev.map((g) => {
        if (g.id !== id) return g;
        const nextType = g.type === "app" ? "game" : "app";
        return { ...g, type: nextType };
      })
    );
  };

  const handleDeleteGame = (id) => {
    setCustomGames((prev) => prev.filter((g) => g.id !== id));
  };

  const handleStartRename = (game) => {
    setEditingId(game.id);
    setEditTitle(game.title);
  };

  const handleSaveRename = (id) => {
    if (editTitle.trim()) {
      setCustomGames((prev) =>
        prev.map((g) => (g.id === id ? { ...g, title: editTitle.trim() } : g))
      );
    }
    setEditingId(null);
  };

  return (
    <div className="onicord-settings-container space-y-5 animate-fade-in">
      {/* TARJETA 1: ESTADO Y JUEGO ACTUAL */}
      <div className="onicord-settings-card">
        <h3 className="onicord-settings-section-title">
          <span>{t("gamesTab.masterTitle", "Actividad y Presencia")}</span>
        </h3>

        <div className="onicord-settings-row">
          <div className="min-w-0 pr-4">
            <p className="onicord-settings-row-title">
              {t("gamesTab.showRichPresence", "Mostrar a qué estás jugando o qué aplicación usas")}
            </p>
            <p className="onicord-settings-row-desc">
              {t(
                "gamesTab.showRichPresenceDesc",
                "Permite que tus amigos en salas y canales de voz vean tu actividad en tiempo real. Protegido mediante lista blanca estricta (Allowlist)."
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

        {/* JUEGO ACTUAL */}
        {showRichPresence && (
          <div className="mt-4 pt-4 border-t border-white/5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-onicord-muted block mb-2.5">
              {t("gamesTab.currentGame", "Juego actual")}
            </span>

            <div className="flex items-center gap-3.5 p-3 rounded-xl bg-onicord-surface/30 border border-white/5">
              <div className="relative w-12 h-12 shrink-0">
                <div className="w-full h-full rounded-lg bg-onicord-base border border-white/10 flex items-center justify-center overflow-hidden">
                  {activeGame?.cover ? (
                    <img src={activeGame.cover} alt={activeGame.name} className="w-full h-full object-cover" />
                  ) : (
                    <MaterialIcon
                      name={activeGame?.type === "app" ? "apps" : activeGame?.type === "music" ? "music_note" : "sports_esports"}
                      size={24}
                      className="text-onicord-muted"
                    />
                  )}
                </div>

                {activeGame?.smallCover && (
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full overflow-hidden border border-onicord-base bg-onicord-surface shadow-sm flex items-center justify-center">
                    <img src={activeGame.smallCover} alt="Sub-icon" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-onicord-text truncate">
                  {activeGame?.name || t("gamesTab.noActiveGame", "Ningún juego o aplicación detectada")}
                </p>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-onicord-subtext flex-wrap">
                  <span className="flex items-center gap-1">
                    <MaterialIcon
                      name={activeGame?.type === "app" ? "apps" : activeGame?.type === "music" ? "headphones" : "sports_esports"}
                      size={13}
                    />
                    <span>
                      {activeGame?.type === "app"
                        ? t("gamesTab.typeApp", "Software / Aplicación")
                        : activeGame?.type === "music"
                        ? t("gamesTab.typeMusic", "Música")
                        : t("gamesTab.typeGame", "Videojuego")}
                    </span>
                  </span>

                  {(activeGame?.state || activeGame?.details) && (
                    <>
                      <span>•</span>
                      <span className="text-onicord-text/80 truncate">
                        {activeGame.state || activeGame.details}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* TARJETA 2: AGREGAR Y ADMINISTRAR JUEGOS / SOFTWARE */}
      <div className="onicord-settings-card">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div>
            <h3 className="onicord-settings-section-title !m-0">
              <span>{t("gamesTab.customGamesTitle", "Tus Juegos y Software Registrados")}</span>
            </h3>
            <p className="text-[11px] text-onicord-muted mt-1 leading-relaxed">
              {t(
                "gamesTab.customGamesDescShort",
                "Selecciona cualquier ejecutable o acceso directo (.lnk/.exe) y Onicord configurará automáticamente su nombre e icono."
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={handleAddProgram}
            disabled={isBrowsing}
            className="px-4 py-2 text-xs font-bold rounded-lg bg-onicord-accent text-onicord-dark hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1.5 shadow-sm shrink-0"
          >
            <MaterialIcon name="add" size={16} weight={700} />
            <span>{isBrowsing ? t("common.loading", "Procesando...") : t("gamesTab.addProgramBtn", "Agregar juego o software")}</span>
          </button>
        </div>

        {/* NOTIFICACIÓN DISCRETA */}
        {notification && (
          <div
            className={`mt-3.5 p-3 rounded-lg text-xs flex items-center gap-2 border animate-fade-in ${
              notification.type === "success"
                ? "bg-onicord-success/10 border-onicord-success/20 text-onicord-success"
                : notification.type === "warning"
                ? "bg-amber-500/10 border-amber-500/20 text-amber-300"
                : "bg-onicord-danger/10 border-onicord-danger/20 text-onicord-danger"
            }`}
          >
            <MaterialIcon
              name={notification.type === "success" ? "check_circle" : notification.type === "warning" ? "info" : "error"}
              size={16}
            />
            <span className="flex-1">{notification.text}</span>
            <button
              type="button"
              onClick={() => setNotification(null)}
              className="opacity-70 hover:opacity-100 cursor-pointer"
            >
              <MaterialIcon name="close" size={14} />
            </button>
          </div>
        )}

        {/* LISTA DE JUEGOS Y SOFTWARE */}
        {customGames.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-onicord-muted space-y-2">
            <MaterialIcon name="sports_esports" size={38} className="opacity-40" />
            <p className="text-xs font-semibold">{t("profileTab.noCustomGames", "No tienes juegos o software registrados.")}</p>
            <p className="text-[10px] text-onicord-muted/70 max-w-sm">
              {t(
                "gamesTab.emptyHintSimple",
                "Haz clic en 'Agregar juego o software' arriba para añadir cualquier juego o programa desde tu escritorio o disco."
              )}
            </p>
          </div>
        ) : (
          <div className="pt-2 divide-y divide-white/5">
            {customGames.map((game) => {
              const isEditing = editingId === game.id;
              return (
                <div key={game.id || game.exe} className="flex items-center justify-between py-3 gap-3.5 group">
                  {/* Icono + Nombre + Exe */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-lg bg-onicord-base border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                      {game.cover ? (
                        <img src={game.cover} alt={game.title} className="w-full h-full object-cover" />
                      ) : (
                        <MaterialIcon
                          name={game.type === "app" ? "apps" : "sports_esports"}
                          size={20}
                          className="text-onicord-muted"
                        />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5 max-w-xs">
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveRename(game.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            autoFocus
                            className="onicord-input text-xs py-1 px-2 w-full"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveRename(game.id)}
                            className="p-1 text-onicord-success hover:bg-white/5 rounded cursor-pointer"
                          >
                            <MaterialIcon name="check" size={16} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <p
                            onClick={() => handleStartRename(game)}
                            className="text-xs font-bold text-onicord-text truncate cursor-pointer hover:underline"
                            title={t("gamesTab.clickToRename", "Clic para editar nombre")}
                          >
                            {game.title}
                          </p>
                          {/* Badge interactivo para cambiar tipo en 1 clic */}
                          <button
                            type="button"
                            onClick={() => handleToggleType(game.id)}
                            className="text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-white/5 hover:bg-white/10 text-onicord-subtext hover:text-white border border-white/5 cursor-pointer transition-colors"
                            title={t("gamesTab.clickToToggleType", "Clic para alternar entre Juego y Software")}
                          >
                            {game.type === "app" ? t("gamesTab.badgeApp", "App") : t("gamesTab.badgeGame", "Juego")}
                          </button>
                        </div>
                      )}
                      <p className="text-[10px] font-mono text-onicord-muted/70 truncate">{game.exe}</p>
                    </div>
                  </div>

                  {/* Switch Activo/Pausado + Eliminar */}
                  <div className="flex items-center gap-3 shrink-0">
                    <label className="relative inline-flex items-center cursor-pointer select-none" title={t("gamesTab.toggleTooltip", "Activar o pausar detección")}>
                      <input
                        type="checkbox"
                        checked={game.enabled !== false}
                        onChange={() => handleToggleGame(game.id)}
                        className="sr-only peer"
                      />
                      <div className="onicord-toggle-slider" />
                    </label>

                    <button
                      type="button"
                      onClick={() => handleDeleteGame(game.id)}
                      className="p-1.5 text-onicord-muted hover:text-onicord-danger transition-colors cursor-pointer rounded-lg hover:bg-onicord-danger/10"
                      title={t("common.delete", "Eliminar")}
                    >
                      <Delete size="sm" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
