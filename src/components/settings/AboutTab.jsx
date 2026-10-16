import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import OnicordLogo from "../icons/Onicord.svg?react";
import MaterialIcon from "../icons/MaterialIcon";
import { copyTextToClipboard } from "../../lib/clipboard";

export default function AboutTab() {
  const { t } = useTranslation();
  const [copiedDebug, setCopiedDebug] = useState(false);
  const [showThirdPartyLicenses, setShowThirdPartyLicenses] = useState(false);
  const [diagInfo, setDiagInfo] = useState(null);

  // ESTADO DE ACTUALIZACIONES AUTOMÁTICAS
  const [updateState, setUpdateState] = useState({
    status: "idle",
    version: null,
    percent: 0,
    bytesPerSecond: 0,
    error: null,
    isPortable: false,
  });

  const APP_VERSION = diagInfo?.version || "0.1.0";
  const GITHUB_REPO_URL = "https://github.com/OniverseDesign/onicord";
  const GITHUB_ISSUES_URL = "https://github.com/OniverseDesign/onicord/issues";
  const OFFICIAL_SITE_URL = "https://github.com/OniverseDesign/onicord";
  const KOFI_URL = "https://ko-fi.com/oniversedesign";

  const OPEN_SOURCE_PROJECTS = [
    {
      name: "uisfx",
      author: "Romain Simon / Yuki Capital",
      license: "CC0-1.0 · MIT",
      descKey: "settings.about.credits.uisfxDesc",
      descFallback: "Motor acústico y diseño de efectos de sonido para la interfaz.",
      url: "https://github.com/romainsimon/uisfx",
      icon: "volume_up",
    },
    {
      name: "Hyperswarm",
      author: "Holepunch",
      license: "Apache-2.0",
      descKey: "settings.about.credits.hyperswarmDesc",
      descFallback: "Red P2P distribuida, DHT y descubrimiento seguro de pares criptográficos.",
      url: "https://github.com/holepunchto/hyperswarm",
      icon: "hub",
    },
    {
      name: "Electron",
      author: "OpenJS Foundation",
      license: "MIT",
      descKey: "settings.about.credits.electronDesc",
      descFallback: "Framework multiplataforma para ejecución nativa con Chromium y Node.js.",
      url: "https://www.electronjs.org",
      icon: "desktop_windows",
    },
    {
      name: "React",
      author: "Meta Platforms & Community",
      license: "MIT",
      descKey: "settings.about.credits.reactDesc",
      descFallback: "Biblioteca para construcción declarativa de interfaces de usuario.",
      url: "https://react.dev",
      icon: "widgets",
    },
    {
      name: "Tailwind CSS & daisyUI",
      author: "Tailwind Labs & Pouya Saadeghi",
      license: "MIT",
      descKey: "settings.about.credits.tailwindDesc",
      descFallback: "Framework de utilidades y sistema de componentes para la interfaz.",
      url: "https://tailwindcss.com",
      icon: "palette",
    },
    {
      name: "i18next",
      author: "i18next Community",
      license: "MIT",
      descKey: "settings.about.credits.i18nDesc",
      descFallback: "Marco internacional de localización y gestión de traducciones en tiempo real.",
      url: "https://www.i18next.com",
      icon: "translate",
    },
  ];

  const THIRD_PARTY_LIBRARIES = [
    { name: "uisfx", license: "CC0-1.0 (Audio) / MIT (Code)", purpose: "Sound Effects & Audio FX" },
    { name: "hyperswarm", license: "Apache-2.0", purpose: "P2P Swarm & DHT" },
    { name: "b4a", license: "Apache-2.0", purpose: "Buffer Utilities for P2P" },
    { name: "electron", license: "MIT", purpose: "Desktop Runtime Framework" },
    { name: "react & react-dom", license: "MIT", purpose: "User Interface Library" },
    { name: "react-resizable-panels", license: "MIT", purpose: "Flexible Layout Resizing" },
    { name: "react-icons", license: "MIT", purpose: "Vector Icon System" },
    { name: "tailwindcss & daisyui", license: "MIT", purpose: "Styling & Design System" },
    { name: "i18next & react-i18next", license: "MIT", purpose: "Localization & Multi-Language" },
    { name: "pdfjs-dist", license: "Apache-2.0", purpose: "In-App PDF Document Viewer" },
    { name: "adm-zip", license: "MIT", purpose: "ZIP Archive & Addon Compression" },
    { name: "uiohook-napi", license: "GPL-3.0", purpose: "Global Shortcuts & Overlay Hooks" },
    { name: "clsx & tailwind-merge", license: "MIT", purpose: "Dynamic Class Merging" },
    { name: "find-process", license: "MIT", purpose: "Rich Presence Process Discovery" },
    { name: "electron-updater", license: "MIT", purpose: "Differential Desktop Updates" },
  ];

  useEffect(() => {
    let isMounted = true;

    if (window.electronAPI?.isPortableBuild) {
      window.electronAPI.isPortableBuild().then((isPortable) => {
        if (isMounted) setUpdateState((prev) => ({ ...prev, isPortable }));
      });
    }

    if (window.electronAPI?.onUpdateStatus) {
      const unsubscribe = window.electronAPI.onUpdateStatus((data) => {
        if (isMounted) {
          setUpdateState((prev) => ({
            ...prev,
            ...data,
          }));
        }
      });
      return () => unsubscribe();
    }
    return () => {
      isMounted = false;
    };
  }, []);

  const handleCheckUpdates = async () => {
    setUpdateState((prev) => ({ ...prev, status: "checking", error: null }));
    if (window.electronAPI?.checkForUpdates) {
      const res = await window.electronAPI.checkForUpdates();
      if (res?.status === "dev-mode") {
        setUpdateState((prev) => ({
          ...prev,
          status: "dev-mode",
          error: res.message,
        }));
      }
    } else {
      setUpdateState((prev) => ({
        ...prev,
        status: "dev-mode",
        error: t("settings.about.desktopOnlyUpdates", "Las actualizaciones solo están disponibles en la aplicación de escritorio."),
      }));
    }
  };

  const handleStartDownload = async () => {
    if (window.electronAPI?.downloadUpdate) {
      await window.electronAPI.downloadUpdate();
    }
  };

  const handleInstallNow = () => {
    if (window.electronAPI?.installUpdate) {
      window.electronAPI.installUpdate();
    }
  };

  const formatSpeed = (bytesPerSec) => {
    if (!bytesPerSec) return "0 KB/s";
    const mb = bytesPerSec / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(2)} MB/s`;
    return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  };

  useEffect(() => {
    let isMounted = true;
    const loadDiagnostics = async () => {
      let data = null;
      if (window.electronAPI?.getDiagnostics) {
        try {
          data = await window.electronAPI.getDiagnostics();
        } catch (err) {
          console.error("Failed to load real system diagnostics via IPC:", err);
        }
      }

      if (!data) {
        data = {
          app: "onicord",
          version: "0.1.0",
          buildType: "Web P2P",
          electron: "N/A (Web)",
          chromium: navigator.userAgent.includes("Chrome")
            ? (navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] || "N/A")
            : "N/A",
          node: "N/A (Web)",
          v8: "N/A",
          platform: navigator.platform,
          arch: navigator.userAgent.includes("Win64") || navigator.userAgent.includes("x86_64") ? "x64" : "x86",
          osName: navigator.platform,
          cpuCores: navigator.hardwareConcurrency || 1,
          hyperswarmVersion: "4.9.0",
        };
      }

      if (isMounted) {
        setDiagInfo(data);
      }
    };

    loadDiagnostics();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleOpenLink = (url) => {
    if (window.electronAPI?.openExternalLink) {
      window.electronAPI.openExternalLink(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const handleCopyDebugInfo = async () => {
    const debugInfo = {
      app: diagInfo?.app || "Onicord",
      version: diagInfo?.version || APP_VERSION,
      buildType: diagInfo?.buildType || "Standalone P2P",
      electron: diagInfo?.electron || "Desconocido",
      chromium: diagInfo?.chromium || "Desconocido",
      node: diagInfo?.node || "Desconocido",
      v8: diagInfo?.v8 || "Desconocido",
      react: React.version,
      hyperswarm: diagInfo?.hyperswarmVersion || "4.9.0",
      platform: diagInfo?.platform || navigator.platform,
      arch: diagInfo?.arch || "x64",
      os: diagInfo?.osName || navigator.platform,
      cpu: diagInfo?.cpuModel ? `${diagInfo.cpuModel} (${diagInfo.cpuCores} cores)` : `${diagInfo?.cpuCores || 1} cores`,
      ram: diagInfo?.totalRamGB ? `${diagInfo.processRamMB || "0 MB"} / ${diagInfo.totalRamGB}` : undefined,
      userAgent: navigator.userAgent,
      language: navigator.language,
      timestamp: new Date().toISOString(),
    };

    try {
      await copyTextToClipboard(JSON.stringify(debugInfo, null, 2));
      setCopiedDebug(true);
      setTimeout(() => setCopiedDebug(false), 2500);
    } catch (err) {
      console.error("Failed to copy debug info:", err);
    }
  };

  return (
    <div className="onicord-settings-container">
      {/* HEADER DE MARCA (ONICORD LOGO) */}
      <div className="onicord-settings-card flex flex-col items-center justify-center text-center relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-36 h-36 bg-onicord-accent/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="cursor-pointer group py-1" onClick={() => handleOpenLink(OFFICIAL_SITE_URL)}>
          <OnicordLogo className="h-8 w-auto text-white group-hover:text-onicord-accent transition duration-300 drop-shadow-[0_0_12px_rgba(168,85,247,0.3)]" />
        </div>
        <p className="text-xs text-onicord-muted font-medium mt-1.5">
          {t("settings.about.tagline", "Chat de Voz y Texto P2P Abierto y Descentralizado")}
        </p>
      </div>

      {/* TARJETA DE ESTADO DE ACTUALIZACIÓN */}
      <div className="onicord-settings-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-top gap-3.5 min-w-0">
            <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
              updateState.status === "available" || updateState.status === "downloaded"
                ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
                : "bg-onicord-accent/15 border-onicord-accent/30 text-onicord-accent"
            }`}>
              <MaterialIcon
                name={
                  updateState.status === "checking" || updateState.status === "downloading"
                    ? "sync"
                    : updateState.status === "downloaded"
                    ? "system_update_alt"
                    : updateState.status === "available"
                    ? "download"
                    : "system_update_alt"
                }
                size={22}
                className={
                  updateState.status === "checking" || updateState.status === "downloading"
                    ? "animate-spin-reverse"
                    : ""
                }
              />
            </div>

            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-onicord-text flex items-center gap-2">
                <span>{t("settings.about.updateTitle", "Actualizaciones del Sistema")}</span>
                {updateState.isPortable && (
                  <span className="px-2 py-0.5 text-[10px] uppercase font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-md">
                    Portable
                  </span>
                )}
              </h3>

              <p className="text-xs text-onicord-muted mt-0.5 truncate">
                {updateState.status === "idle" && `Versión instalada: v${APP_VERSION}`}
                {updateState.status === "checking" && t("settings.about.checking", "Buscando actualizaciones en GitHub...")}
                {updateState.status === "not-available" && t("settings.about.upToDate", "¡Onicord está en su última versión!")}
                {updateState.status === "available" && `Nueva versión v${updateState.version} disponible.`}
                {updateState.status === "downloading" && `Descargando v${updateState.version}... ${updateState.percent}%`}
                {updateState.status === "downloaded" && `Actualización v${updateState.version} lista para instalar.`}
                {updateState.status === "dev-mode" && (updateState.error || "Entorno de desarrollo")}
                {updateState.status === "error" && `Error: ${updateState.error}`}
              </p>
            </div>
          </div>

          {/* ACCIONES SEGÚN EL ESTADO */}
          <div className="shrink-0">
            {(updateState.status === "idle" || updateState.status === "not-available" || updateState.status === "error" || updateState.status === "dev-mode") && (
              <button
                type="button"
                onClick={handleCheckUpdates}
                disabled={updateState.status === "checking"}
                className="h-9 px-4 rounded-onicord-button bg-onicord-accent/20 hover:bg-onicord-accent/30 border border-onicord-accent/40 text-onicord-accent text-xs font-bold transition active:scale-95 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <MaterialIcon name="refresh" size={16} />
                <span>{t("settings.about.checkBtn", "Buscar Actualizaciones")}</span>
              </button>
            )}

            {updateState.status === "available" && !updateState.isPortable && (
              <button
                type="button"
                onClick={handleStartDownload}
                className="h-9 px-4 rounded-onicord-button bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-bold transition active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <MaterialIcon name="download" size={16} />
                <span>{t("settings.about.downloadBtn", "Descargar e Instalar")}</span>
              </button>
            )}

            {updateState.status === "available" && updateState.isPortable && (
              <button
                type="button"
                onClick={() => handleOpenLink(`https://github.com/OniverseDesign/onicord/releases/tag/v${updateState.version}`)}
                className="h-9 px-4 rounded-onicord-button bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 text-xs font-bold transition active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <span>{t("settings.about.getPortableBtn", "Obtener EXE Portable")}</span>
                <MaterialIcon name="open_in_new" size={14} />
              </button>
            )}

            {updateState.status === "downloaded" && (
              <button
                type="button"
                onClick={handleInstallNow}
                className="h-9 px-4 rounded-onicord-button bg-emerald-500 text-black hover:bg-emerald-400 font-extrabold text-xs transition active:scale-95 cursor-pointer shadow-lg shadow-emerald-500/20 flex items-center gap-1.5"
              >
                <MaterialIcon name="restart_alt" size={16} />
                <span>{t("settings.about.restartBtn", "Reiniciar y Aplicar")}</span>
              </button>
            )}
          </div>
        </div>

        {/* BARRA DE PROGRESO DE DESCARGA */}
        {updateState.status === "downloading" && (
          <div className="mt-4 space-y-1.5 animate-fade-in">
            <div className="w-full h-2 rounded-full bg-onicord-base overflow-hidden border border-white/5">
              <div
                className="h-full bg-gradient-to-r from-onicord-accent to-emerald-400 transition-all duration-300 rounded-full"
                style={{ width: `${updateState.percent}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-onicord-muted font-mono">
              <span>{updateState.percent}% completado</span>
              <span>{formatSpeed(updateState.bytesPerSecond)}</span>
            </div>
          </div>
        )}
      </div>

      {/* SECCIÓN DE DONACIONES */}
      <div className="onicord-settings-card relative overflow-hidden bg-gradient-to-r from-purple-950/20 via-indigo-950/15 to-amber-950/20 border border-amber-500/20 rounded-2xl p-4 sm:p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-top gap-3.5 min-w-0">
            <div className="w-10 h-10 min-w-[40px] min-h-[40px] aspect-square rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-300 shrink-0 shadow-sm">
              <MaterialIcon name="coffee" size={22} className="leading-none" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-onicord-text flex items-center gap-2">
                <span>{t("settings.about.donationTitle", "Apoya el Desarrollo de Onicord")}</span>
              </h3>
              <p className="text-xs text-onicord-muted mt-0.5 leading-relaxed">
                {t(
                  "settings.about.donationDesc",
                  "Onicord es un proyecto independiente, libre y de código abierto creado por Oniverse. Si disfrutas usando Onicord y quieres apoyar el desarrollo de herramientas digitales independientes, considera comprarme un café."
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => handleOpenLink(KOFI_URL)}
            className="h-10 flex items-center justify-center gap-2 px-5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-bold transition duration-150 active:scale-95 cursor-pointer shrink-0 shadow-sm hover:shadow-amber-500/10"
          >
            <MaterialIcon name="coffee" size={18} className="shrink-0 text-amber-300" />
            <span>{t("settings.about.buyMeACoffee", "Cómprame un café")}</span>
            <MaterialIcon name="open_in_new" size={14} className="opacity-70" />
          </button>
        </div>
      </div>

      {/* ENLACES ÚTILES Y COMUNIDAD */}
      <div className="onicord-settings-card">
        <h4 className="text-[11px] font-bold text-onicord-muted uppercase tracking-wider mb-3">
          {t("settings.about.linksTitle", "Enlaces y Comunidad")}
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => handleOpenLink(GITHUB_REPO_URL)}
            className="flex items-center gap-3 p-3 rounded-xl bg-onicord-base/50 hover:bg-onicord-base/90 border border-white/5 hover:border-onicord-accent/30 transition text-left group cursor-pointer"
          >
            <div className="w-10 h-10 min-w-[40px] min-h-[40px] aspect-square rounded-xl bg-onicord-surface border border-white/5 flex items-center justify-center text-onicord-text group-hover:text-onicord-accent transition shrink-0">
              <MaterialIcon name="code" size={20} className="leading-none" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-onicord-text group-hover:text-onicord-accent transition flex items-center justify-between">
                <span>{t("settings.about.githubRepo", "Repositorio en GitHub")}</span>
                <MaterialIcon name="open_in_new" size={14} className="opacity-0 group-hover:opacity-100 transition" />
              </p>
              <p className="text-[11px] text-onicord-muted leading-tight mt-0.5 line-clamp-1">
                {t("settings.about.githubRepoDesc", "Revisa el código fuente y contribuye al proyecto")}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleOpenLink(GITHUB_ISSUES_URL)}
            className="flex items-center gap-3 p-3 rounded-xl bg-onicord-base/50 hover:bg-onicord-base/90 border border-white/5 hover:border-onicord-accent/30 transition text-left group cursor-pointer"
          >
            <div className="w-10 h-10 min-w-[40px] min-h-[40px] aspect-square rounded-xl bg-onicord-surface border border-white/5 flex items-center justify-center text-onicord-text group-hover:text-onicord-accent transition shrink-0">
              <MaterialIcon name="bug_report" size={20} className="leading-none" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-onicord-text group-hover:text-onicord-accent transition flex items-center justify-between">
                <span>{t("settings.about.reportIssue", "Reportar un Problema")}</span>
                <MaterialIcon name="open_in_new" size={14} className="opacity-0 group-hover:opacity-100 transition" />
              </p>
              <p className="text-[11px] text-onicord-muted leading-tight mt-0.5 line-clamp-1">
                {t("settings.about.reportIssueDesc", "Reporta errores o sugiere nuevas características")}
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleOpenLink(OFFICIAL_SITE_URL)}
            className="flex items-center gap-3 p-3 rounded-xl bg-onicord-base/50 hover:bg-onicord-base/90 border border-white/5 hover:border-onicord-accent/30 transition text-left group cursor-pointer sm:col-span-2"
          >
            <div className="w-10 h-10 min-w-[40px] min-h-[40px] aspect-square rounded-xl bg-onicord-surface border border-white/5 flex items-center justify-center text-onicord-text group-hover:text-onicord-accent transition shrink-0">
              <MaterialIcon name="language" size={20} className="leading-none" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-onicord-text group-hover:text-onicord-accent transition flex items-center justify-between">
                <span>{t("settings.about.officialWebsite", "Sitio Web Oficial")}</span>
                <MaterialIcon name="open_in_new" size={14} className="opacity-0 group-hover:opacity-100 transition" />
              </p>
              <p className="text-[11px] text-onicord-muted leading-tight mt-0.5 line-clamp-1">
                {t("settings.about.officialWebsiteDesc", "Conoce más sobre mis proyectos y herramientas en Oniverse")}
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* SOFTWARE DE CODIGO ABIERTO Y CREDITOS */}
      <div className="onicord-settings-card">
        <div className="border-b border-white/5 pb-2.5 mb-3.5">
          <div className="flex items-center gap-2">
            <MaterialIcon name="code" size={18} className="text-onicord-accent shrink-0" />
            <h4 className="text-xs font-bold text-onicord-text uppercase tracking-wider">
              {t("settings.about.creditsTitle", "Software de Código Abierto y Créditos")}
            </h4>
          </div>
          <p className="text-xs text-onicord-muted mt-1">
            {t("settings.about.creditsDesc", "Onicord se construye con orgullo sobre tecnologías abiertas extraordinarias.")}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {OPEN_SOURCE_PROJECTS.map((project) => (
            <button
              key={project.name}
              type="button"
              onClick={() => handleOpenLink(project.url)}
              className="flex items-start gap-3 p-3 rounded-xl bg-onicord-base/40 hover:bg-onicord-base/80 border border-white/5 hover:border-onicord-accent/30 transition text-left group cursor-pointer"
            >
              <div className="w-9 h-9 min-w-[36px] min-h-[36px] aspect-square rounded-xl bg-onicord-surface border border-white/5 flex items-center justify-center text-onicord-text group-hover:text-onicord-accent transition shrink-0 mt-0.5">
                <MaterialIcon name={project.icon} size={18} className="leading-none" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-bold text-onicord-text group-hover:text-onicord-accent transition truncate">
                    {project.name}
                  </span>
                  <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-white/5 text-onicord-muted shrink-0">
                    {project.license}
                  </span>
                </div>
                <p className="text-[10px] text-onicord-muted/70 font-mono mt-0.5 truncate">
                  {project.author}
                </p>
                <p className="text-[11px] text-onicord-muted leading-tight mt-1 line-clamp-2">
                  {t(project.descKey, project.descFallback)}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* LISTA COMPLETA DE DEPENDENCIAS / LICENCIAS */}
        <div className="mt-3.5 pt-3 border-t border-white/5">
          <button
            type="button"
            onClick={() => setShowThirdPartyLicenses((prev) => !prev)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-onicord-base/40 hover:bg-onicord-base/70 border border-white/5 text-xs text-onicord-muted hover:text-onicord-text transition cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <MaterialIcon name="policy" size={16} className="text-onicord-muted shrink-0" />
              <span>
                {showThirdPartyLicenses
                  ? t("settings.about.hideLicenses", "Ocultar lista de librerías")
                  : t("settings.about.showLicenses", "Ver lista completa de librerías y dependencias de terceros")}
              </span>
            </div>
            <MaterialIcon
              name={showThirdPartyLicenses ? "expand_less" : "expand_more"}
              size={18}
              className="text-onicord-muted shrink-0"
            />
          </button>

          {showThirdPartyLicenses && (
            <div className="mt-2.5 p-3 rounded-lg bg-onicord-base/60 border border-white/5 text-[11px] space-y-2 animate-fadeIn">
              <p className="text-onicord-muted text-[11px] leading-relaxed">
                {t(
                  "settings.about.thirdPartyNotice",
                  "Agradecemos profundamente a la comunidad de código abierto por hacer posible el ecosistema de Onicord."
                )}
              </p>
              <div className="divide-y divide-white/5 border border-white/5 rounded-md overflow-hidden bg-onicord-surface/40">
                {THIRD_PARTY_LIBRARIES.map((lib) => (
                  <div
                    key={lib.name}
                    className="flex items-center justify-between px-3 py-1.5 text-[11px] font-mono hover:bg-white/[0.02] transition"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="font-semibold text-onicord-text truncate">{lib.name}</span>
                      <span className="text-onicord-muted/60 text-[10px] hidden sm:inline truncate">
                        {`(${lib.purpose})`}
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold text-onicord-muted px-1.5 py-0.5 rounded bg-white/5 shrink-0">
                      {lib.license}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* DATOS DE SISTEMA */}
      <div className="onicord-settings-card">
        <div className="flex items-center justify-between border-b border-white/5 pb-2.5 mb-2.5">
          <h4 className="text-[11px] font-bold text-onicord-muted uppercase tracking-wider">
            {t("settings.about.systemDebug", "Información de Diagnóstico")}
          </h4>
          <button
            type="button"
            onClick={handleCopyDebugInfo}
            className="h-8 inline-flex items-center justify-center gap-1.5 px-3 rounded-lg bg-onicord-base hover:bg-onicord-overlay border border-white/10 text-onicord-text text-xs font-semibold transition active:scale-95 cursor-pointer"
          >
            <MaterialIcon
              name={copiedDebug ? "check" : "content_copy"}
              size={14}
              className={copiedDebug ? "text-emerald-400 shrink-0" : "shrink-0"}
            />
            <span>
              {copiedDebug
                ? t("settings.about.copiedToast", "¡Datos copiados!")
                : t("settings.about.copyDebug", "Copiar datos de depuración")}
            </span>
          </button>
        </div>

        <div className="text-[11px] font-mono text-onicord-muted/80 leading-relaxed space-y-1 pl-0.5">
          <p>
            onicord {diagInfo?.version || APP_VERSION} ({diagInfo?.buildType || "Standalone P2P"}) · {diagInfo?.arch || "x64"}
          </p>
          <p>
            Electron {diagInfo?.electron || "..."} · Chromium {diagInfo?.chromium || "..."} · Node {diagInfo?.node || "..."}
          </p>
          <p>
            React {React.version} · Hyperswarm P2P {diagInfo?.hyperswarmVersion || "4.9.0"}
          </p>
          {diagInfo?.osName && (
            <p className="text-onicord-muted/90 pt-0.5">
              SO: {diagInfo.osName} {diagInfo.cpuModel ? `· ${diagInfo.cpuModel} (${diagInfo.cpuCores} cores)` : ""} {diagInfo.totalRamGB ? `· RAM: ${diagInfo.processRamMB || ""}${diagInfo.processRamMB ? " / " : ""}${diagInfo.totalRamGB}` : ""}
            </p>
          )}
          <p className="text-onicord-muted/60 pt-1">
            {t("settings.about.copyright", "Licencia GNU GPL v3 — Copyright © 2026 Oniverse")}
          </p>
        </div>
      </div>
    </div>
  );
}
