import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { ModalInput, ModalButton } from "../ui/ModalShell";
import { Delete } from "../icons/StreamIcons";
import MaterialIcon from "../icons/MaterialIcon";
import DeleteStickerModal from "../modals/DeleteStickerModal";
import ConfirmDialogModal from "../modals/ConfirmDialogModal";
import { getMediaUrl } from "../../lib/media";

const PACKS_KEY = "onicord_stickers_packs";

function isNewerVersion(catalogVer, installedVer) {
  if (!catalogVer || !installedVer) return false;
  const clean = (v) =>
    String(v)
      .replace(/^v/i, "")
      .trim()
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const v1 = clean(catalogVer);
  const v2 = clean(installedVer);
  for (let i = 0; i < Math.max(v1.length, v2.length); i++) {
    const num1 = v1[i] || 0;
    const num2 = v2[i] || 0;
    if (num1 > num2) return true;
    if (num1 < num2) return false;
  }
  return false;
}

export default function StickerManagerTab() {
  const { t } = useTranslation();
  const [misStickers, setMisStickers] = useState([]);
  const [packs, setPacks] = useState({});
  const [nuevoPackName, setNuevoPackName] = useState("");
  const [loading, setLoading] = useState(true);
  const [stickerToDelete, setStickerToDelete] = useState(null);
  const [isuploadingMassive, setIsuploadingMassive] = useState(false);
  const [packToDestroy, setPackToDestroy] = useState(null);

  const [catalogPacks, setCatalogPacks] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [downloadingPackId, setDownloadingPackId] = useState(null);
  const [failedIcons, setFailedIcons] = useState({});
  const [currentUserNickname, setCurrentUserNickname] = useState("");

  const [alertModal, setAlertModal] = useState({
    isOpen: false,
    title: "",
    msg: "",
  });

  const [selectedStickerIds, setSelectedStickerIds] = useState([]);
  const [editingPackOriginalName, setEditingPackOriginalName] = useState(null);

  const cargarDatos = () => {
    window.electronAPI.listLocalStickers().then((list) => {
      setMisStickers(list || []);
      const savedPacks = JSON.parse(localStorage.getItem(PACKS_KEY) || "{}");
      setPacks(savedPacks);
      setLoading(false);
    });

    if (window.electronAPI?.getProfile) {
      window.electronAPI.getProfile().then((prof) => {
        if (prof && prof.nickname) {
          setCurrentUserNickname(prof.nickname);
        }
      });
    }
  };

  useEffect(() => {
    cargarDatos();

    // Fetch official stickers catalog from GitHub
    setLoadingCatalog(true);
    fetch(
      "https://raw.githubusercontent.com/OniverseDesign/onicord-stickers/main/index.json",
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.packs)) {
          setCatalogPacks(data.packs);
        }
      })
      .catch((err) => {
        console.warn(
          "No se pudo cargar el catálogo de stickers de GitHub:",
          err,
        );
      })
      .finally(() => {
        setLoadingCatalog(false);
      });
  }, []);

  const handleAddStickersMultiple = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsuploadingMassive(true);

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop().toLowerCase();

      if (ext === "opk") {
        await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              const response = await window.electronAPI.importStickerPackRaw(
                reader.result,
              );

              if (response && response.success) {
                const copiaPacks = { ...packs };
                copiaPacks[response.name] = response.ids;

                localStorage.setItem(PACKS_KEY, JSON.stringify(copiaPacks));
                setPacks(copiaPacks);

                setAlertModal({
                  isOpen: true,
                  title: t("common.installationSuccess", "Instalación exitosa"),
                  msg: t("settings.stickers.packSuccessMsg", {
                    name: response.name,
                    count: response.count,
                  }),
                });
              }
            } catch (err) {
              setAlertModal({
                isOpen: true,
                title: "Error de formato",
                msg: "No se pudo procesar el archivo .opk.",
              });
            }
            resolve();
          };
          reader.readAsText(file);
        });
      } else {
        await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = async () => {
            try {
              await window.electronAPI.saveStickerLocally({
                dataUrl: reader.result,
                filename: file.name,
              });
            } catch (err) {
              console.error("Error saving image sticker:", err);
            }
            resolve();
          };
          reader.readAsDataURL(file);
        });
      }
    }

    setIsuploadingMassive(false);
    cargarDatos();
  };

  const handleDownloadCatalogPack = async (pack) => {
    setDownloadingPackId(pack.id);
    try {
      if (window.electronAPI?.downloadAndInstallStickerPack) {
        const res = await window.electronAPI.downloadAndInstallStickerPack(
          pack.downloadUrl,
        );
        if (res && res.success) {
          const copiaPacks = { ...packs };
          copiaPacks[res.name] = res.ids;
          localStorage.setItem(PACKS_KEY, JSON.stringify(copiaPacks));
          setPacks(copiaPacks);
          cargarDatos();

          setAlertModal({
            isOpen: true,
            title: "Instalación Exitosa",
            msg: `Pack '${res.name}' con ${res.count} stickers instalado con éxito desde la tienda.`,
          });
        }
      }
    } catch (err) {
      console.error("Error al descargar pack de stickers de la tienda:", err);
      setAlertModal({
        isOpen: true,
        title: "Error de descarga",
        msg: "No se pudo descargar el pack de stickers desde GitHub.",
      });
    } finally {
      setDownloadingPackId(null);
    }
  };

  const handleExportOPK = async (packName) => {
    const ids = packs[packName];
    if (!ids || ids.length === 0) return;

    try {
      // Resolve sticker IDs to full objects { id, ext, name } from local catalog
      const stickersList = ids
        .map((id) => misStickers.find((s) => s.id === id))
        .filter(Boolean);

      if (stickersList.length === 0) {
        throw new Error(
          t(
            "settings.stickers.noStickersFound",
            "No se encontraron stickers en este paquete.",
          ),
        );
      }

      const res = await window.electronAPI.exportStickerPack({
        packName,
        stickersList,
      });

      if (res && res.finalPath) {
        setAlertModal({
          isOpen: true,
          title: t("settings.stickers.exportSuccessTitle", "Paquete Exportado"),
          msg: t("settings.stickers.exportSuccessMsg", {
            path: res.finalPath,
            defaultValue: `Guardado en: ${res.finalPath}`,
          }),
        });
      }
    } catch (err) {
      setAlertModal({
        isOpen: true,
        title: "Error",
        msg: err.message || "Error exportando el paquete.",
      });
    }
  };

  const toggleSelectStickerForPack = (id) => {
    if (selectedStickerIds.includes(id)) {
      setSelectedStickerIds(selectedStickerIds.filter((item) => item !== id));
    } else {
      setSelectedStickerIds([...selectedStickerIds, id]);
    }
  };

  const handleSavePack = () => {
    if (!nuevoPackName.trim() || selectedStickerIds.length === 0) return;

    const nombreLimpio = nuevoPackName.trim();
    const copiaPacks = { ...packs };

    if (editingPackOriginalName && editingPackOriginalName !== nombreLimpio) {
      delete copiaPacks[editingPackOriginalName];
    }

    copiaPacks[nombreLimpio] = selectedStickerIds;

    localStorage.setItem(PACKS_KEY, JSON.stringify(copiaPacks));
    setPacks(copiaPacks);
    setNuevoPackName("");
    setSelectedStickerIds([]);
    setEditingPackOriginalName(null);
  };

  const handleEditPackInit = (packName) => {
    setNuevoPackName(packName);
    setSelectedStickerIds(packs[packName] || []);
    setEditingPackOriginalName(packName);

    const el = document.getElementById("sticker-io-block");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  const handleDeletePackGroup = (packName) => {
    setPackToDestroy(packName);
  };

  const handleDeleteStickerClick = (e, stk) => {
    e.stopPropagation();
    setStickerToDelete(stk);
  };

  const handleConfirmDelete = async () => {
    if (!stickerToDelete) return;
    try {
      await window.electronAPI.deleteLocalSticker(stickerToDelete.id);
      setStickerToDelete(null);
      cargarDatos();
    } catch (err) {
      console.error("Error al eliminar sticker:", err);
    }
  };

  return (
    <div className="onicord-settings-container">

      {/* TARJETA 2: PAQUETES INSTALADOS */}
      <div className="onicord-settings-card">
        <h3 className="onicord-settings-section-title mb-3 flex items-center justify-between">
          <span>{t("settings.stickers.installedPacksCount", "Paquetes Instalados ({{count}})", { count: Object.keys(packs).length })}</span>
        </h3>

        {Object.keys(packs).length === 0 ? (
          <div className="py-8 text-center border border-white/5 rounded-2xl p-4 bg-onicord-base/20">
            <MaterialIcon
              name="collections"
              size={32}
              className="mx-auto text-onicord-muted/40 mb-2"
            />
            <p className="text-xs text-onicord-muted italic">
              {t("settings.stickers.noPacksInstalled", "No tienes paquetes de stickers instalados o creados en tu equipo.")}
            </p>
          </div>
        ) : (
          <ul className="space-y-3 pt-1">
            {Object.keys(packs).map((packTitle) => {
              const stickerIds = packs[packTitle] || [];
              const packStickers = stickerIds
                .map((id) => misStickers.find((s) => s.id === id))
                .filter(Boolean);

              const firstStk = packStickers[0];
              const catalogMatch = catalogPacks.find(
                (cp) => cp.name.toLowerCase() === packTitle.toLowerCase(),
              );
              const author =
                catalogMatch?.author || currentUserNickname || t("common.user", "Usuario");
              const version = catalogMatch?.version || "1.0.0";

              return (
                <li
                  key={`pack-group-${packTitle}`}
                  className="flex flex-col bg-onicord-base/60 border border-white/5 p-3.5 rounded-2xl hover:border-white/10 transition-colors space-y-3"
                >
                  {/* Encabezado del Paquete Instalado */}
                  <div className="flex items-center gap-3 w-full">
                    {/* Icono del Pack */}
                    <div className="w-8 h-8 rounded-full bg-onicord-accent/10 text-onicord-accent flex items-center justify-center shrink-0 overflow-hidden border border-white/5">
                      {firstStk ? (
                        <img
                          src={getMediaUrl(firstStk.localPath)}
                          alt=""
                          className="w-full h-full object-cover rounded-xl"
                        />
                      ) : (
                        <MaterialIcon name="collections" size={18} />
                      )}
                    </div>

                    {/* Titulo, Versión, Cantidad y Creador */}
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-onicord-text truncate">
                          {packTitle}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-white/5 text-onicord-muted">
                          v{version}
                        </span>
                        <span className="text-[10px] text-onicord-accent font-medium">
                          {stickerIds.length} stickers
                        </span>
                        <span className="text-[10px] text-onicord-muted/70 truncate">
                          por {author}
                        </span>
                      </div>
                      <p className="text-[11px] text-onicord-muted truncate mt-0.5">
                        {catalogMatch?.description ||
                          t("settings.stickers.localPackDesc", "Paquete de stickers local.")}
                      </p>
                    </div>

                    {/* Acciones: Exportar, Editar, Desarmar */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleExportOPK(packTitle)}
                        className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-onicord-text text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                        title={t("stickers.exportPackTitle", "Exportar paquete .opk")}
                      >
                        <MaterialIcon name="download" size={14} />
                        <span>{t("common.export", "Exportar")}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEditPackInit(packTitle)}
                        className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-onicord-text text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                        title={t("stickers.editGroupTitle", "Editar grupo de stickers")}
                      >
                        <MaterialIcon name="edit" size={14} />
                        <span>{t("common.edit", "Editar")}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePackGroup(packTitle)}
                        className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-onicord-danger/20 text-onicord-muted hover:text-onicord-danger transition-colors cursor-pointer"
                        title={t("stickers.unpackGroupTitle", "Desarmar paquete")}
                      >
                        <Delete size="sm" />
                      </button>
                    </div>
                  </div>

                  {/* Vista Previa Horizontal de Stickers del Paquete */}
                  <div className="flex gap-2 overflow-x-auto minimal-scrollbar py-1.5 bg-black/20 p-2 rounded-xl border border-white/5">
                    {packStickers.map((stk) => (
                      <div
                        key={`pack-thumb-${packTitle}-${stk.id}`}
                        className="w-11 h-11 rounded-lg bg-onicord-surface border border-white/5 shrink-0 flex items-center justify-center overflow-hidden"
                      >
                        <img
                          src={getMediaUrl(stk.localPath)}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* TARJETA 3: PAQUETES DISPONIBLES */}
      <div className="onicord-settings-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="onicord-settings-section-title mb-0 flex items-center gap-2">
            <span>{t("settings.stickers.availablePacksTitle", "Paquetes Disponibles")}</span>
          </h3>
        </div>

        {loadingCatalog ? (
          <div className="py-6 text-center text-onicord-muted text-xs flex items-center justify-center gap-2">
            <span className="loading loading-spinner loading-xs"></span>
            <span>{t("settings.stickers.loadingPacksCatalog", "Cargando catálogo de paquetes disponibles...")}</span>
          </div>
        ) : catalogPacks.length === 0 ? (
          <div className="py-6 text-center border border-white/5 rounded-2xl p-4 bg-onicord-base/20">
            <p className="text-xs text-onicord-muted italic">
              {t("settings.stickers.noRemotePacks", "No hay paquetes de stickers disponibles en el catálogo remoto.")}
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {catalogPacks.map((pack) => {
              const installedPackIds = packs[pack.name];
              const isInstalled = Boolean(
                installedPackIds && installedPackIds.length > 0,
              );
              const hasUpdate =
                isInstalled && isNewerVersion(pack.version, "1.0.0");
              const isDownloading = downloadingPackId === pack.id;

              return (
                <li
                  key={pack.id}
                  className="flex items-center gap-3 bg-onicord-base/60 border border-white/5 p-3.5 rounded-2xl hover:border-white/10 transition-colors"
                >
                  {/* Portada / Icono del pack */}
                  <div className="w-8 h-8 rounded-full bg-onicord-accent/10 text-onicord-accent flex items-center justify-center shrink-0 overflow-hidden border border-white/5">
                    {pack.icon && !failedIcons[pack.id] ? (
                      <img
                        src={pack.icon}
                        alt=""
                        className="w-full h-full object-cover rounded-xl"
                        onError={() =>
                          setFailedIcons((prev) => ({
                            ...prev,
                            [pack.id]: true,
                          }))
                        }
                      />
                    ) : (
                      <MaterialIcon name="collections" size={18} />
                    )}
                  </div>

                  {/* Detalles: Nombre, Versión, Creador, Descripción */}
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-onicord-text truncate">
                        {pack.name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-white/5 text-onicord-muted">
                        v{pack.version || "1.0"}
                      </span>
                      <span className="text-[10px] text-onicord-accent font-medium">
                        {pack.stickersCount || "?"} stickers
                      </span>
                      {pack.author && (
                        <span className="text-[10px] text-onicord-muted/70 truncate">
                          por {pack.author}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-onicord-muted truncate mt-0.5">
                      {pack.description || t("common.noDescription", "Sin descripción disponible.")}
                    </p>
                  </div>

                  {/* Botón de Acción: Actualizar, Instalado o Descargar */}
                  {hasUpdate ? (
                    <button
                      type="button"
                      onClick={() => handleDownloadCatalogPack(pack)}
                      disabled={isDownloading}
                      className="px-3.5 py-1.5 rounded-onicord-button bg-amber-500 text-black text-xs font-bold hover:opacity-90 transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
                      title={t("stickers.updatePackToVer", "Actualizar pack a v{{ver}}", { ver: pack.version })}
                    >
                      <MaterialIcon
                        name={isDownloading ? "sync" : "update"}
                        size={15}
                        className={isDownloading ? "animate-spin" : ""}
                      />
                      <span>
                        {isDownloading ? t("common.updating", "Actualizando...") : t("common.update", "Actualizar")}
                      </span>
                    </button>
                  ) : isInstalled ? (
                    <div className="px-3 py-1.5 rounded-onicord-button bg-onicord-accent/10 border border-onicord-accent/20 text-onicord-accent text-xs font-semibold flex items-center gap-1.5 shrink-0 select-none">
                      <MaterialIcon name="check_circle" size={15} />
                      <span>{t("settings.stickers.installed", "Instalado")}</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleDownloadCatalogPack(pack)}
                      disabled={isDownloading}
                      className="px-3.5 py-1.5 rounded-onicord-button bg-onicord-accent text-onicord-dark text-xs font-semibold hover:opacity-90 transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
                    >
                      <MaterialIcon
                        name={isDownloading ? "sync" : "download"}
                        size={15}
                        className={isDownloading ? "animate-spin" : ""}
                      />
                      <span>
                        {isDownloading ? t("common.installing", "Instalando...") : t("settings.stickers.downloadPack", "Descargar Pack")}
                      </span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <label className="onicord-btn-secondary w-full py-3 text-xs font-bold flex items-center justify-center gap-2 rounded-2xl border border-white/10 hover:bg-onicord-surface transition cursor-pointer">
        <MaterialIcon name="add" size={16} />
        <span>
          {isuploadingMassive
            ? t("common.saving", "Importando...")
            : t("settings.stickers.loadLocalOpk", "Cargar paquete local (.opk) o imágenes")}
        </span>
        <input
          type="file"
          multiple
          accept="image/*,.opk"
          className="hidden"
          onChange={handleAddStickersMultiple}
          disabled={isuploadingMassive}
        />
      </label>

      {/* TARJETA 3: BIBLIOTECA GENERAL Y SELECCIÓN */}
      <div id="sticker-io-block" className="onicord-settings-card">
        <div className="flex items-center justify-between">
          <h3 className="onicord-settings-section-title !mb-0">
            <span>
              {t(
                "settings.stickers.yourLibraryTitle",
                "Biblioteca General de Stickers",
              )}
            </span>
          </h3>
          {editingPackOriginalName && (
            <button
              type="button"
              onClick={() => {
                setNuevoPackName("");
                setSelectedStickerIds([]);
                setEditingPackOriginalName(null);
              }}
              className="text-xs text-onicord-accent font-semibold hover:underline cursor-pointer"
            >
              {t("common.cancel", "Cancelar Edición")}
            </button>
          )}
        </div>
        <p className="onicord-settings-row-desc">
          {t(
            "settings.stickers.libraryHelp",
            "Haz clic en una imagen para seleccionarla. Posiciona el cursor para eliminar de la biblioteca.",
          )}
        </p>

        {/* INPUT DE NOMBRE Y GUARDADO */}
        <div className="flex gap-2 pt-2">
          <ModalInput
            value={nuevoPackName}
            onChange={(e) => setNuevoPackName(e.target.value)}
            placeholder={t(
              "settings.stickers.groupNamePlaceholder",
              "Nombre del paquete (ej. Emotes Gaming)",
            )}
            className="flex-1 h-9 text-xs"
          />
          <ModalButton
            variant="primary"
            onClick={handleSavePack}
            disabled={!nuevoPackName.trim() || selectedStickerIds.length === 0}
            className="shrink-0 h-9 px-4 text-xs font-bold"
          >
            {editingPackOriginalName
              ? t("common.update", "Actualizar")
              : t("common.save", "Guardar Grupo")}{" "}
            ({selectedStickerIds.length})
          </ModalButton>
        </div>

        {/* REJILLA GENERAL */}
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3 pt-2">
          {misStickers.map((stk) => {
            const isSelected = selectedStickerIds.includes(stk.id);
            return (
              <div
                key={`unified-pool-${stk.id}`}
                onClick={() => toggleSelectStickerForPack(stk.id)}
                className={`relative aspect-square rounded-onicord-button overflow-hidden bg-onicord-base/60 border cursor-pointer flex items-center justify-center group transition-all ${
                  isSelected
                    ? " border-2 border-onicord-accent bg-onicord-accent/10"
                    : "border-onicord-island hover:border-white/20"
                }`}
              >
                <button
                  type="button"
                  onClick={(e) => handleDeleteStickerClick(e, stk)}
                  className="absolute top-1.5 right-1.5 h-6 w-6 flex items-center justify-center rounded-lg bg-onicord-base text-onicord-muted border border-white/10 hover:text-white hover:bg-onicord-danger hover:border-onicord-danger/20 shadow-md opacity-0 group-hover:opacity-100 transition-all cursor-pointer z-30"
                  title={t("common.delete", "Eliminar sticker")}
                >
                  <Delete size="sm" />
                </button>

                <div className="w-full h-full flex items-center justify-center pointer-events-none">
                  <img
                    src={getMediaUrl(stk.localPath)}
                    alt=""
                    loading="lazy"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
              </div>
            );
          })}

          {misStickers.length === 0 && (
            <p className="col-span-full text-center text-xs text-onicord-muted py-10 font-medium">
              {t(
                "settings.stickers.emptyLibraryHelp",
                "No tienes stickers cargados. Utiliza la zona de carga para añadir imágenes.",
              )}
            </p>
          )}
        </div>
      </div>

      {/* MODALES DE CONFIRMACIÓN */}
      <ConfirmDialogModal
        isOpen={Boolean(packToDestroy)}
        title={t("common.delete", "Desarmar Paquete")}
        message={t("settings.stickers.dismantleConfirm", {
          name: packToDestroy,
        })}
        warningMessage={t(
          "settings.stickers.dismantleWarning",
          "Los stickers no serán eliminados de la biblioteca.",
        )}
        confirmLabel={t("common.confirm", "Confirmar")}
        onConfirm={() => {
          const copiaPacks = { ...packs };
          delete copiaPacks[packToDestroy];
          localStorage.setItem(PACKS_KEY, JSON.stringify(copiaPacks));
          setPacks(copiaPacks);

          if (editingPackOriginalName === packToDestroy) {
            setNuevoPackName("");
            setSelectedStickerIds([]);
            setEditingPackOriginalName(null);
          }
          setPackToDestroy(null);
        }}
        onCancel={() => setPackToDestroy(null)}
      />

      {stickerToDelete && (
        <DeleteStickerModal
          sticker={stickerToDelete}
          onClose={() => setStickerToDelete(null)}
          onConfirm={handleConfirmDelete}
        />
      )}

      <ConfirmDialogModal
        isOpen={alertModal.isOpen}
        title={alertModal.title}
        message={alertModal.msg}
        confirmLabel={t("common.understand", "Entendido")}
        type="alert"
        onConfirm={() => setAlertModal({ isOpen: false, title: "", msg: "" })}
      />
    </div>
  );
}
