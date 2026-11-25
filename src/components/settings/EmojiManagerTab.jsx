import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ModalInput, ModalButton } from "../ui/ModalShell";
import MaterialIcon from "../icons/MaterialIcon";
import ConfirmDialogModal from "../modals/ConfirmDialogModal";
import Tooltip from "../ui/Tooltip";
import { getMediaUrl } from "../../lib/media";
import { refreshCustomEmojis } from "../../lib/emojiData";

const EMOJI_PACKS_KEY = "onicord_emoji_packs";
const MAX_GIF_BYTES = 2 * 1024 * 1024;
const EMOJI_CATALOG_URL =
  "https://raw.githubusercontent.com/OniverseDesign/onicord-emojis/main/index.json";

function sanitizeEmojiShortcode(raw, fallback = "emoji") {
  let cleaned = String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);

  if (!cleaned) return fallback;
  if (cleaned.length < 2) {
    cleaned = `${cleaned}_emoji`.slice(0, 32);
  }
  return cleaned;
}

function extractShortcodeFromFilename(fileName, fallback = "emoji") {
  const base = String(fileName || "").split(/[\\/]/).pop() || "";
  const noExt = base.includes(".") ? base.slice(0, base.lastIndexOf(".")) : base;
  const stripped = noExt.replace(
    /^\d+(?:\s*-\s*|\s*_\s*|\s+)(?=[a-zA-Z0-9\u00C0-\u017F])/,
    ""
  );
  return sanitizeEmojiShortcode(stripped, fallback);
}

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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function optimizeStaticDataUrl(rawUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, 128 / img.width, 128 / img.height);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        let outUrl = canvas.toDataURL("image/webp", 0.9);
        let outExt = "webp";
        if (!outUrl.startsWith("data:image/webp")) {
          outUrl = canvas.toDataURL("image/png");
          outExt = "png";
        }
        resolve({
          dataUrl: outUrl,
          previewUrl: outUrl,
          ext: outExt,
          animated: false,
        });
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error("Invalid image"));
    img.src = rawUrl;
  });
}

async function optimizeEmojiImage(file) {
  const isGif =
    file.type === "image/gif" || file.name.toLowerCase().endsWith(".gif");

  if (isGif) {
    if (file.size > MAX_GIF_BYTES) {
      return { tooLarge: true };
    }
    const dataUrl = await readFileAsDataUrl(file);
    return {
      dataUrl,
      previewUrl: dataUrl,
      ext: "gif",
      animated: true,
    };
  }

  const rawUrl = await readFileAsDataUrl(file);
  return optimizeStaticDataUrl(rawUrl);
}

export default function EmojiManagerTab() {
  const { t } = useTranslation();
  const [myEmojis, setMyEmojis] = useState([]);
  const [packs, setPacks] = useState({});
  const [newPackName, setNewPackName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [pendingUploads, setPendingUploads] = useState([]);
  const [stagingPackName, setStagingPackName] = useState("");
  const [packToDestroy, setPackToDestroy] = useState(null);
  const [emojiToDelete, setEmojiToDelete] = useState(null);

  const [catalogPacks, setCatalogPacks] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [downloadingPackId, setDownloadingPackId] = useState(null);
  const [failedIcons, setFailedIcons] = useState({});
  const [currentUserNickname, setCurrentUserNickname] = useState("");

  const [selectedEmojiIds, setSelectedEmojiIds] = useState([]);
  const [editingPackOriginalName, setEditingPackOriginalName] = useState(null);
  const [editingEmojiId, setEditingEmojiId] = useState(null);
  const [editingShortcodeValue, setEditingShortcodeValue] = useState("");

  const [alertModal, setAlertModal] = useState({
    isOpen: false,
    title: "",
    msg: "",
  });

  const libraryContainerRef = useRef(null);
  const COLUMNS = 5;
  const emojiRows = useMemo(() => {
    const rows = [];
    for (let i = 0; i < myEmojis.length; i += COLUMNS) {
      rows.push(myEmojis.slice(i, i + COLUMNS));
    }
    return rows;
  }, [myEmojis]);

  const rowVirtualizer = useVirtualizer({
    count: emojiRows.length,
    getScrollElement: () => libraryContainerRef.current,
    estimateSize: () => 132,
    overscan: 3,
  });

  const loadData = () => {
    if (!window.electronAPI?.listLocalEmojis) return;
    window.electronAPI.listLocalEmojis().then((list) => {
      setMyEmojis(list || []);
      try {
        const savedPacks = JSON.parse(
          localStorage.getItem(EMOJI_PACKS_KEY) || "{}"
        );
        setPacks(savedPacks);
      } catch {
        setPacks({});
      }
      refreshCustomEmojis();
    });

    if (window.electronAPI?.getProfile) {
      window.electronAPI.getProfile().then((prof) => {
        if (prof?.nickname) {
          setCurrentUserNickname(prof.nickname);
        }
      });
    }
  };

  useEffect(() => {
    loadData();

    setLoadingCatalog(true);
    fetch(EMOJI_CATALOG_URL)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.packs)) {
          setCatalogPacks(data.packs);
        }
      })
      .catch(() => {
        // Remote catalog unavailable or offline
      })
      .finally(() => {
        setLoadingCatalog(false);
      });
  }, []);

  const handleAddFiles = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setIsUploading(true);

    const stagedBatch = [];
    const usedCodes = new Set(
      [
        ...myEmojis.map((item) => item.shortcode),
        ...pendingUploads.map((item) => item.shortcode),
      ].filter(Boolean)
    );
    let skippedLargeGif = 0;

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop().toLowerCase();

      if (ext === "onipkg") {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const response = await window.electronAPI.importEmojiPackRaw(
            new Uint8Array(arrayBuffer)
          );
          if (response && response.success) {
            const nextPacks = { ...packs, [response.name]: response.ids || [] };
            localStorage.setItem(EMOJI_PACKS_KEY, JSON.stringify(nextPacks));
            setPacks(nextPacks);
            setAlertModal({
              isOpen: true,
              title: t("common.installationSuccess", "Instalación exitosa"),
              msg: t("settings.emojis.packSuccessMsg", {
                name: response.name,
                count: response.count,
              }),
            });
          }
        } catch {
          setAlertModal({
            isOpen: true,
            title: t("settings.emojis.formatErrorTitle", "Error de formato"),
            msg: t(
              "settings.emojis.packErrorMsg",
              "No se pudo procesar el archivo .onipkg."
            ),
          });
        }
      } else if (ext === "zip") {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const res = await window.electronAPI?.extractEmojiZip?.({
            data: new Uint8Array(arrayBuffer),
            fileName: file.name,
          });
          if (!res?.success || !Array.isArray(res.items) || res.items.length === 0) {
            setAlertModal({
              isOpen: true,
              title: t("settings.emojis.formatErrorTitle", "Error de formato"),
              msg: t(
                "settings.emojis.zipEmptyMsg",
                "No se encontraron imágenes válidas dentro del archivo .zip."
              ),
            });
            continue;
          }

          if (res.skippedTooLarge) {
            skippedLargeGif += res.skippedTooLarge;
          }

          for (const item of res.items) {
            try {
              const optimized = item.animated
                ? {
                    dataUrl: item.dataUrl,
                    previewUrl: item.dataUrl,
                    ext: "gif",
                    animated: true,
                  }
                : await optimizeStaticDataUrl(item.dataUrl);

              const baseCode =
                item.shortcode || extractShortcodeFromFilename(item.fileName);
              let uniqueCode = baseCode;
              let suffix = 2;
              while (usedCodes.has(uniqueCode)) {
                uniqueCode = `${baseCode.slice(0, 28)}_${suffix}`;
                suffix += 1;
              }
              usedCodes.add(uniqueCode);

              stagedBatch.push({
                tempId: `tmp_${crypto.randomUUID().slice(0, 8)}`,
                fileName: item.fileName,
                previewUrl: optimized.previewUrl,
                dataUrl: optimized.dataUrl,
                ext: optimized.ext,
                animated: optimized.animated,
                shortcode: uniqueCode,
              });
            } catch (err) {
              console.error("Error optimizing zip emoji:", err);
            }
          }

          if (res.suggestedPackName) {
            setStagingPackName((prev) => (prev.trim() ? prev : res.suggestedPackName));
          }
        } catch {
          setAlertModal({
            isOpen: true,
            title: t("settings.emojis.formatErrorTitle", "Error de formato"),
            msg: t(
              "settings.emojis.zipErrorMsg",
              "No se pudo procesar el archivo .zip."
            ),
          });
        }
      } else {
        try {
          const optimized = await optimizeEmojiImage(file);
          if (optimized?.tooLarge) {
            skippedLargeGif += 1;
            continue;
          }
          const baseCode = extractShortcodeFromFilename(file.name);
          let uniqueCode = baseCode;
          let suffix = 2;
          while (usedCodes.has(uniqueCode)) {
            uniqueCode = `${baseCode.slice(0, 28)}_${suffix}`;
            suffix += 1;
          }
          usedCodes.add(uniqueCode);

          stagedBatch.push({
            tempId: `tmp_${crypto.randomUUID().slice(0, 8)}`,
            fileName: file.name,
            previewUrl: optimized.previewUrl,
            dataUrl: optimized.dataUrl,
            ext: optimized.ext,
            animated: optimized.animated,
            shortcode: uniqueCode,
          });
        } catch (err) {
          console.error("Error optimizing emoji image:", err);
        }
      }
    }

    if (stagedBatch.length > 0) {
      setPendingUploads((prev) => [...prev, ...stagedBatch]);
    }
    if (skippedLargeGif > 0) {
      setAlertModal({
        isOpen: true,
        title: t("settings.emojis.fileTooLargeTitle", "Archivo demasiado grande"),
        msg: t(
          "settings.emojis.gifTooLargeMsg",
          "Algunos GIFs animados superan el límite de 2 MB y fueron omitidos."
        ),
      });
    }

    e.target.value = "";
    setIsUploading(false);
    loadData();
  };

  const handleConfirmPendingUploads = async () => {
    if (pendingUploads.length === 0) return;
    setIsUploading(true);

    const savedIds = [];
    const targetPackName = stagingPackName.trim();
    const targetPackId = targetPackName
      ? targetPackName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "") || null
      : null;

    try {
      for (const item of pendingUploads) {
        const cleanCode = sanitizeEmojiShortcode(item.shortcode);
        const generatedId = `emj_${crypto.randomUUID().slice(0, 8)}`;
        const res = await window.electronAPI?.saveEmojiLocal?.({
          id: generatedId,
          shortcode: cleanCode,
          ext: item.ext,
          animated: item.animated,
          base64Data: item.dataUrl,
          packId: targetPackId,
          packName: targetPackName || null,
        });
        if (res?.success) {
          savedIds.push(res.id || generatedId);
        }
      }

      if (targetPackName && savedIds.length > 0) {
        const nextPacks = { ...packs };
        const existingIds = Array.isArray(nextPacks[targetPackName])
          ? nextPacks[targetPackName]
          : [];
        nextPacks[targetPackName] = Array.from(
          new Set([...existingIds, ...savedIds])
        );
        localStorage.setItem(EMOJI_PACKS_KEY, JSON.stringify(nextPacks));
        setPacks(nextPacks);
      }

      setPendingUploads([]);
      setStagingPackName("");
      loadData();
    } catch (err) {
      console.error("Error saving staged emojis:", err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownloadCatalogPack = async (pack) => {
    setDownloadingPackId(pack.id);
    try {
      if (window.electronAPI?.downloadAndInstallEmojiPack) {
        const res = await window.electronAPI.downloadAndInstallEmojiPack(
          pack.downloadUrl
        );
        if (res && res.success) {
          const nextPacks = { ...packs, [res.name]: res.ids || [] };
          localStorage.setItem(EMOJI_PACKS_KEY, JSON.stringify(nextPacks));
          setPacks(nextPacks);
          loadData();

          setAlertModal({
            isOpen: true,
            title: t("common.installationSuccess", "Instalación exitosa"),
            msg: t("settings.emojis.packSuccessMsg", {
              name: res.name,
              count: res.count,
            }),
          });
        }
      }
    } catch {
      setAlertModal({
        isOpen: true,
        title: t("settings.emojis.downloadErrorTitle", "Error de descarga"),
        msg: t(
          "settings.emojis.downloadErrorMsg",
          "No se pudo descargar el pack de emojis desde GitHub."
        ),
      });
    } finally {
      setDownloadingPackId(null);
    }
  };

  const handleExportOPK = async (packName) => {
    const ids = packs[packName];
    if (!ids || ids.length === 0) return;

    try {
      const emojisList = ids
        .map((id) => myEmojis.find((em) => em.id === id))
        .filter(Boolean);

      if (emojisList.length === 0) {
        throw new Error(
          t(
            "settings.emojis.noEmojisFound",
            "No se encontraron emojis en este paquete."
          )
        );
      }

      const res = await window.electronAPI.exportEmojiPack({
        packName,
        emojisList,
      });

      if (res?.finalPath) {
        setAlertModal({
          isOpen: true,
          title: t("settings.emojis.exportSuccessTitle", "Paquete Exportado"),
          msg: t("settings.emojis.exportSuccessMsg", {
            path: res.finalPath,
            defaultValue: `Guardado en: ${res.finalPath}`,
          }),
        });
      }
    } catch (err) {
      setAlertModal({
        isOpen: true,
        title: t("common.error", "Error"),
        msg: err.message || t("settings.emojis.exportErrorMsg", "Error exportando el paquete."),
      });
    }
  };

  const toggleSelectEmojiForPack = (id) => {
    setSelectedEmojiIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSavePack = () => {
    if (!newPackName.trim() || selectedEmojiIds.length === 0) return;
    const cleanName = newPackName.trim();
    const nextPacks = { ...packs };

    if (editingPackOriginalName && editingPackOriginalName !== cleanName) {
      delete nextPacks[editingPackOriginalName];
    }

    nextPacks[cleanName] = selectedEmojiIds;
    localStorage.setItem(EMOJI_PACKS_KEY, JSON.stringify(nextPacks));
    setPacks(nextPacks);
    setNewPackName("");
    setSelectedEmojiIds([]);
    setEditingPackOriginalName(null);
  };

  const handleEditPackInit = (packName) => {
    setNewPackName(packName);
    setSelectedEmojiIds(packs[packName] || []);
    setEditingPackOriginalName(packName);
    const el = document.getElementById("emoji-io-block");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  const handleConfirmDeleteEmoji = async () => {
    if (!emojiToDelete) return;
    try {
      await window.electronAPI?.deleteEmojiLocal?.({ id: emojiToDelete.id });
      const nextPacks = { ...packs };
      let changed = false;
      for (const packTitle of Object.keys(nextPacks)) {
        if (Array.isArray(nextPacks[packTitle]) && nextPacks[packTitle].includes(emojiToDelete.id)) {
          nextPacks[packTitle] = nextPacks[packTitle].filter(
            (id) => id !== emojiToDelete.id
          );
          changed = true;
        }
      }
      if (changed) {
        localStorage.setItem(EMOJI_PACKS_KEY, JSON.stringify(nextPacks));
        setPacks(nextPacks);
      }
      setEmojiToDelete(null);
      loadData();
    } catch (err) {
      console.error("Error deleting custom emoji:", err);
    }
  };

  const handleSaveShortcodeEdit = async (emojiId) => {
    const cleaned = sanitizeEmojiShortcode(editingShortcodeValue, "");
    if (!cleaned) {
      setEditingEmojiId(null);
      return;
    }
    try {
      await window.electronAPI?.updateEmojiShortcode?.({
        id: emojiId,
        shortcode: cleaned,
      });
      setEditingEmojiId(null);
      loadData();
    } catch (err) {
      console.error("Error updating shortcode:", err);
    }
  };

  return (
    <div className="onicord-settings-container">
      {/* Staging Preview Card for newly picked image files */}
      {pendingUploads.length > 0 && (
        <div className="onicord-settings-card border-onicord-accent/40 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="onicord-settings-section-title !mb-0.5">
                {t("settings.emojis.stagingTitle", "Preparar Emojis ({{count}})", {
                  count: pendingUploads.length,
                })}
              </h3>
              <p className="onicord-settings-row-desc">
                {t(
                  "settings.emojis.stagingDesc",
                  "Define la :clave: de cada emoji antes de guardarlo en tu biblioteca."
                )}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-60 overflow-y-auto minimal-scrollbar pr-1">
            {pendingUploads.map((item) => (
              <div
                key={item.tempId}
                className="flex flex-col gap-2 p-2.5 rounded-xl bg-onicord-base/70 border border-onicord-border relative"
              >
                <button
                  type="button"
                  onClick={() =>
                    setPendingUploads((prev) =>
                      prev.filter((u) => u.tempId !== item.tempId)
                    )
                  }
                  className="absolute top-1.5 right-1.5 w-5 h-5 rounded-md flex items-center justify-center text-onicord-muted hover:text-onicord-danger hover:bg-onicord-danger/15 transition-colors cursor-pointer"
                  title={t("common.remove", "Quitar")}
                >
                  <MaterialIcon name="close" size="xs" />
                </button>
                <div className="w-12 h-12 mx-auto rounded-lg bg-onicord-surface/80 border border-onicord-border flex items-center justify-center overflow-hidden">
                  <img
                    src={item.previewUrl}
                    alt={item.shortcode}
                    className="w-10 h-10 object-contain"
                  />
                </div>
                <div className="flex items-center gap-0.5 bg-onicord-mantle border border-onicord-border rounded-lg px-2 py-1 focus-within:border-onicord-accent">
                  <span className="text-xs font-mono text-onicord-muted">:</span>
                  <input
                    type="text"
                    value={item.shortcode}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPendingUploads((prev) =>
                        prev.map((u) =>
                          u.tempId === item.tempId ? { ...u, shortcode: val } : u
                        )
                      );
                    }}
                    onBlur={() => {
                      setPendingUploads((prev) =>
                        prev.map((u) =>
                          u.tempId === item.tempId
                            ? {
                                ...u,
                                shortcode: sanitizeEmojiShortcode(u.shortcode),
                              }
                            : u
                        )
                      );
                    }}
                    placeholder={t("settings.emojis.shortcodePlaceholder", "clave")}
                    className="w-full bg-transparent text-xs font-mono text-onicord-text outline-none min-w-0"
                  />
                  <span className="text-xs font-mono text-onicord-muted">:</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <ModalInput
              value={stagingPackName}
              onChange={(e) => setStagingPackName(e.target.value)}
              placeholder={t(
                "settings.emojis.optionalPackNamePlaceholder",
                "Nombre del paquete (opcional, ej. Memes)"
              )}
              className="flex-1 h-9 text-xs"
            />
            <div className="flex items-center gap-2 shrink-0">
              <ModalButton
                variant="secondary"
                onClick={() => {
                  setPendingUploads([]);
                  setStagingPackName("");
                }}
                disabled={isUploading}
                className="h-9 px-3 text-xs"
              >
                {t("common.cancel", "Cancelar")}
              </ModalButton>
              <ModalButton
                variant="primary"
                onClick={handleConfirmPendingUploads}
                disabled={isUploading}
                className="h-9 px-4 text-xs font-bold"
              >
                {t("settings.emojis.saveStagedBtn", "Guardar emojis")} ({pendingUploads.length})
              </ModalButton>
            </div>
          </div>
        </div>
      )}

      {/* Installed emoji packs */}
      <div data-setting-id="emojiPacks" className="onicord-settings-card">
        <h3 className="onicord-settings-section-title mb-3 flex items-center justify-between">
          <span>
            {t("settings.emojis.installedPacksCount", "Paquetes Instalados ({{count}})", {
              count: Object.keys(packs).length,
            })}
          </span>
        </h3>

        {Object.keys(packs).length === 0 ? (
          <div className="py-8 text-center border border-onicord-border rounded-2xl p-4 bg-onicord-base/20">
            <MaterialIcon
              name="mood"
              size={32}
              className="mx-auto text-onicord-muted/40 mb-2"
            />
            <p className="text-xs text-onicord-muted italic">
              {t(
                "settings.emojis.noPacksInstalled",
                "No tienes paquetes de emojis instalados o creados en tu equipo."
              )}
            </p>
          </div>
        ) : (
          <ul className="space-y-3 pt-1">
            {Object.keys(packs).map((packTitle) => {
              const emojiIds = packs[packTitle] || [];
              const packEmojis = emojiIds
                .map((id) => myEmojis.find((em) => em.id === id))
                .filter(Boolean);
              const firstEm = packEmojis[0];
              const catalogMatch = catalogPacks.find(
                (cp) => cp.name?.toLowerCase() === packTitle.toLowerCase()
              );
              const author =
                catalogMatch?.author ||
                currentUserNickname ||
                t("common.user", "Usuario");
              const version = catalogMatch?.version || "1.0.0";

              return (
                <li
                  key={`emoji-pack-${packTitle}`}
                  className="flex flex-col bg-onicord-base/60 border border-onicord-border p-3.5 rounded-2xl hover:border-onicord-border-strong transition-colors space-y-3"
                >
                  <div className="flex items-center gap-3 w-full">
                    <div className="w-8 h-8 rounded-full bg-onicord-accent/10 text-onicord-accent flex items-center justify-center shrink-0 overflow-hidden border border-onicord-border">
                      {firstEm ? (
                        <img
                          src={getMediaUrl(firstEm.localPath)}
                          alt={firstEm.shortcode}
                          loading="lazy"
                          decoding="async"
                          className="w-6 h-6 object-contain"
                        />
                      ) : (
                        <MaterialIcon name="mood" size={18} />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-onicord-text truncate">
                          {packTitle}
                        </span>
                        <span className="text-2xs px-1.5 py-0.2 rounded-md bg-onicord-tint/5 text-onicord-muted">
                          v{version}
                        </span>
                        <span className="text-2xs text-onicord-accent font-medium">
                          {t("settings.emojis.packCountLabel", "{{count}} emojis", {
                            count: emojiIds.length,
                          })}
                        </span>
                        <span className="text-2xs text-onicord-muted/70 truncate">
                          {t("settings.emojis.byAuthor", "por {{author}}", {
                            author,
                          })}
                        </span>
                      </div>
                      <p className="text-xs text-onicord-muted truncate mt-0.5">
                        {catalogMatch?.description ||
                          t(
                            "settings.emojis.localPackDesc",
                            "Paquete de emojis personalizado local."
                          )}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleExportOPK(packTitle)}
                        className="px-2.5 py-1.5 rounded-xl bg-onicord-tint/5 hover:bg-onicord-hover text-onicord-text text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                        title={t(
                          "settings.emojis.exportPackTitle",
                          "Exportar paquete .onipkg"
                        )}
                      >
                        <MaterialIcon name="download" size={14} />
                        <span>{t("common.export", "Exportar")}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEditPackInit(packTitle)}
                        className="px-2.5 py-1.5 rounded-xl bg-onicord-tint/5 hover:bg-onicord-hover text-onicord-text text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                        title={t(
                          "settings.emojis.editGroupTitle",
                          "Editar paquete de emojis"
                        )}
                      >
                        <MaterialIcon name="edit" size={14} />
                        <span>{t("common.edit", "Editar")}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPackToDestroy(packTitle)}
                        className="w-7 h-7 flex items-center justify-center rounded-xl hover:bg-onicord-danger/20 text-onicord-muted hover:text-onicord-danger transition-colors cursor-pointer"
                        title={t(
                          "settings.emojis.unpackGroupTitle",
                          "Desarmar paquete"
                        )}
                      >
                        <MaterialIcon name="delete" size="sm" />
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2 overflow-x-auto minimal-scrollbar py-1.5 bg-onicord-base/50 p-2 rounded-xl border border-onicord-border">
                    {packEmojis.map((em) => {
                      const codeLabel = `:${em.shortcode}:`;
                      return (
                        <Tooltip
                          key={`pack-emoji-thumb-${packTitle}-${em.id}`}
                          side="top"
                          content={<span className="font-mono text-xs">{codeLabel}</span>}
                        >
                          <div className="w-9 h-9 rounded-lg bg-onicord-surface border border-onicord-border shrink-0 flex items-center justify-center overflow-hidden">
                            <img
                              src={getMediaUrl(em.localPath)}
                              alt={codeLabel}
                              loading="lazy"
                              decoding="async"
                              className="w-6 h-6 object-contain"
                            />
                          </div>
                        </Tooltip>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Available remote catalog packs */}
      <div className="onicord-settings-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="onicord-settings-section-title mb-0 flex items-center gap-2">
            <span>
              {t("settings.emojis.availablePacksTitle", "Paquetes Disponibles")}
            </span>
          </h3>
        </div>

        {loadingCatalog ? (
          <div className="py-6 text-center text-onicord-muted text-xs flex items-center justify-center gap-2">
            <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
            <span>
              {t(
                "settings.emojis.loadingPacksCatalog",
                "Cargando catálogo de emojis disponibles..."
              )}
            </span>
          </div>
        ) : catalogPacks.length === 0 ? (
          <div className="py-6 text-center border border-onicord-border rounded-2xl p-4 bg-onicord-base/20">
            <p className="text-xs text-onicord-muted italic">
              {t(
                "settings.emojis.noRemotePacks",
                "No hay paquetes de emojis disponibles en el catálogo remoto."
              )}
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {catalogPacks.map((pack) => {
              const installedPackIds = packs[pack.name];
              const isInstalled = Boolean(
                installedPackIds && installedPackIds.length > 0
              );
              const hasUpdate =
                isInstalled && isNewerVersion(pack.version, "1.0.0");
              const isDownloading = downloadingPackId === pack.id;

              return (
                <li
                  key={pack.id}
                  className="flex items-center gap-3 bg-onicord-base/60 border border-onicord-border p-3.5 rounded-2xl hover:border-onicord-border-strong transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-onicord-accent/10 text-onicord-accent flex items-center justify-center shrink-0 overflow-hidden border border-onicord-border">
                    {pack.icon && !failedIcons[pack.id] ? (
                      <img
                        src={pack.icon}
                        alt={pack.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover rounded-xl"
                        onError={() =>
                          setFailedIcons((prev) => ({
                            ...prev,
                            [pack.id]: true,
                          }))
                        }
                      />
                    ) : (
                      <MaterialIcon name="mood" size={18} />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-onicord-text truncate">
                        {pack.name}
                      </span>
                      <span className="text-2xs px-1.5 py-0.2 rounded-md bg-onicord-tint/5 text-onicord-muted">
                        v{pack.version || "1.0"}
                      </span>
                      <span className="text-2xs text-onicord-accent font-medium">
                        {t("settings.emojis.packCountLabel", "{{count}} emojis", {
                          count: pack.emojisCount || pack.count || "?",
                        })}
                      </span>
                      {pack.author && (
                        <span className="text-2xs text-onicord-muted/70 truncate">
                          {t("settings.emojis.byAuthor", "por {{author}}", {
                            author: pack.author,
                          })}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-onicord-muted truncate mt-0.5">
                      {pack.description ||
                        t("common.noDescription", "Sin descripción disponible.")}
                    </p>
                  </div>

                  {hasUpdate ? (
                    <button
                      type="button"
                      onClick={() => handleDownloadCatalogPack(pack)}
                      disabled={isDownloading}
                      className="px-3.5 py-1.5 rounded-onicord-button bg-onicord-warning text-black text-xs font-bold hover:opacity-90 transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
                      title={t("settings.emojis.updatePackToVer", "Actualizar pack a v{{ver}}", {
                        ver: pack.version,
                      })}
                    >
                      <MaterialIcon
                        name={isDownloading ? "sync" : "update"}
                        size={15}
                        className={isDownloading ? "animate-spin" : ""}
                      />
                      <span>
                        {isDownloading
                          ? t("common.updating", "Actualizando...")
                          : t("common.update", "Actualizar")}
                      </span>
                    </button>
                  ) : isInstalled ? (
                    <div className="px-3 py-1.5 rounded-onicord-button bg-onicord-accent/10 border border-onicord-accent/20 text-onicord-accent text-xs font-semibold flex items-center gap-1.5 shrink-0 select-none">
                      <MaterialIcon name="check_circle" size={15} />
                      <span>{t("settings.emojis.installed", "Instalado")}</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleDownloadCatalogPack(pack)}
                      disabled={isDownloading}
                      className="px-3.5 py-1.5 rounded-onicord-button bg-onicord-accent text-onicord-on-accent text-xs font-semibold hover:opacity-90 transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm active:scale-95 disabled:opacity-50"
                    >
                      <MaterialIcon
                        name={isDownloading ? "sync" : "download"}
                        size={15}
                        className={isDownloading ? "animate-spin" : ""}
                      />
                      <span>
                        {isDownloading
                          ? t("common.installing", "Instalando...")
                          : t("settings.emojis.downloadPack", "Descargar Pack")}
                      </span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Upload / Import button */}
      <label
        data-setting-id="importEmojis"
        className="onicord-btn-secondary w-full py-3 text-xs font-bold flex items-center justify-center gap-2 rounded-2xl border border-onicord-border-strong hover:bg-onicord-surface transition cursor-pointer"
      >
        <MaterialIcon name="add" size={16} />
        <span>
          {isUploading
            ? t("common.saving", "Importando...")
            : t(
                "settings.emojis.loadLocalOpk",
                "Cargar imágenes, .zip o paquete .onipkg"
              )}
        </span>
        <input
          type="file"
          multiple
          accept="image/*,.onipkg,.zip"
          className="hidden"
          onChange={handleAddFiles}
          disabled={isUploading}
        />
      </label>

      {/* General Emoji Library Card */}
      <div id="emoji-io-block" className="onicord-settings-card">
        <div className="flex items-center justify-between">
          <h3 className="onicord-settings-section-title !mb-0">
            <span>
              {t(
                "settings.emojis.yourLibraryTitle",
                "Biblioteca General de Emojis"
              )}
            </span>
          </h3>
          {editingPackOriginalName && (
            <button
              type="button"
              onClick={() => {
                setNewPackName("");
                setSelectedEmojiIds([]);
                setEditingPackOriginalName(null);
              }}
              className="text-xs text-onicord-accent font-semibold hover:underline cursor-pointer"
            >
              {t("common.cancel", "Cancelar")}
            </button>
          )}
        </div>
        <p className="onicord-settings-row-desc">
          {t(
            "settings.emojis.libraryHelp",
            "Haz clic en un emoji para seleccionarlo en un paquete, edita su :clave: o elimínalo de la biblioteca."
          )}
        </p>

        <div className="flex gap-2 pt-2">
          <ModalInput
            value={newPackName}
            onChange={(e) => setNewPackName(e.target.value)}
            placeholder={t(
              "settings.emojis.groupNamePlaceholder",
              "Nombre del paquete (ej. Reacciones)"
            )}
            className="flex-1 h-9 text-xs"
          />
          <ModalButton
            variant="primary"
            onClick={handleSavePack}
            disabled={!newPackName.trim() || selectedEmojiIds.length === 0}
            className="shrink-0 h-9 px-4 text-xs font-bold"
          >
            {editingPackOriginalName
              ? t("common.update", "Actualizar")
              : t("common.save", "Guardar")}{" "}
            ({selectedEmojiIds.length})
          </ModalButton>
        </div>

        <div
          ref={libraryContainerRef}
          className="max-h-[400px] overflow-y-auto minimal-scrollbar pt-2 pr-1"
        >
          {emojiRows.length > 0 ? (
            <div
              className="relative w-full"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = emojiRows[virtualRow.index];
                return (
                  <div
                    key={virtualRow.index}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 pb-3"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    {row.map((em) => {
                      const isSelected = selectedEmojiIds.includes(em.id);
                      const isEditingCode = editingEmojiId === em.id;
                      const codeLabel = `:${em.shortcode}:`;

                      return (
                        <div
                          key={`emoji-lib-${em.id}`}
                          onClick={() => toggleSelectEmojiForPack(em.id)}
                          className={`relative rounded-onicord-button p-2 bg-onicord-base/60 border cursor-pointer flex flex-col items-center gap-1.5 group transition-all ${
                            isSelected
                              ? "border-2 border-onicord-accent bg-onicord-accent/10"
                              : "border-onicord-island hover:border-onicord-border-strong"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEmojiToDelete(em);
                            }}
                            className="absolute top-1 right-1 h-5 w-5 flex items-center justify-center rounded-md bg-onicord-base text-onicord-muted border border-onicord-border-strong hover:text-onicord-text hover:bg-onicord-danger hover:border-onicord-danger/20 shadow-md opacity-0 group-hover:opacity-100 transition-all cursor-pointer z-30"
                            title={t("settings.emojis.deleteTitle", "Eliminar emoji")}
                          >
                            <MaterialIcon name="delete" size="xs" />
                          </button>

                          <div className="w-12 h-12 flex items-center justify-center pointer-events-none">
                            <img
                              src={getMediaUrl(em.localPath)}
                              alt={codeLabel}
                              loading="lazy"
                              decoding="async"
                              className="w-10 h-10 object-contain"
                            />
                          </div>

                          {isEditingCode ? (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="w-full flex items-center gap-0.5 bg-onicord-mantle border border-onicord-accent rounded px-1.5 py-0.5"
                            >
                              <input
                                type="text"
                                autoFocus
                                value={editingShortcodeValue}
                                onChange={(e) =>
                                  setEditingShortcodeValue(e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleSaveShortcodeEdit(em.id);
                                  } else if (e.key === "Escape") {
                                    e.stopPropagation();
                                    setEditingEmojiId(null);
                                  }
                                }}
                                onBlur={() => handleSaveShortcodeEdit(em.id)}
                                className="w-full bg-transparent text-2xs font-mono text-onicord-text outline-none min-w-0 text-center"
                              />
                            </div>
                          ) : (
                            <div className="w-full flex items-center justify-center gap-1 min-w-0">
                              <Tooltip
                                side="top"
                                content={<span className="font-mono text-xs">{codeLabel}</span>}
                              >
                                <span className="text-2xs font-mono text-onicord-muted truncate">
                                  {codeLabel}
                                </span>
                              </Tooltip>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingEmojiId(em.id);
                                  setEditingShortcodeValue(em.shortcode);
                                }}
                                className="opacity-0 group-hover:opacity-100 text-onicord-muted hover:text-onicord-accent transition-opacity cursor-pointer shrink-0"
                                title={t(
                                  "settings.emojis.renameShortcode",
                                  "Editar :clave:"
                                )}
                              >
                                <MaterialIcon name="edit" size="xs" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-center text-xs text-onicord-muted py-10 font-medium">
              {t(
                "settings.emojis.emptyLibraryHelp",
                "No tienes emojis personalizados cargados. Usa el botón de arriba para importar imágenes o paquetes."
              )}
            </p>
          )}
        </div>
      </div>

      {/* Confirm dismantle pack */}
      <ConfirmDialogModal
        isOpen={Boolean(packToDestroy)}
        title={t("settings.emojis.disassembleGroup", "Desarmar Paquete")}
        message={t("settings.emojis.dismantleConfirm", {
          name: packToDestroy,
        })}
        warningMessage={t(
          "settings.emojis.dismantleWarning",
          "Los emojis no serán eliminados de tu biblioteca."
        )}
        confirmLabel={t("common.confirm", "Confirmar")}
        onConfirm={() => {
          const nextPacks = { ...packs };
          delete nextPacks[packToDestroy];
          localStorage.setItem(EMOJI_PACKS_KEY, JSON.stringify(nextPacks));
          setPacks(nextPacks);

          if (editingPackOriginalName === packToDestroy) {
            setNewPackName("");
            setSelectedEmojiIds([]);
            setEditingPackOriginalName(null);
          }
          setPackToDestroy(null);
        }}
        onCancel={() => setPackToDestroy(null)}
      />

      {/* Confirm delete emoji */}
      <ConfirmDialogModal
        isOpen={Boolean(emojiToDelete)}
        title={t("settings.emojis.deleteTitle", "Eliminar emoji")}
        message={t("settings.emojis.deleteConfirm", {
          shortcode: emojiToDelete?.shortcode || "",
          defaultValue: `¿Eliminar :${emojiToDelete?.shortcode || ""}: de tu biblioteca local?`,
        })}
        confirmLabel={t("common.delete", "Eliminar")}
        onConfirm={handleConfirmDeleteEmoji}
        onCancel={() => setEmojiToDelete(null)}
      />

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
