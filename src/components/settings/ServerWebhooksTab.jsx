import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../icons/MaterialIcon";
import { ModalInput } from "../ui/ModalShell";
import ConfirmDialogModal from "../modals/ConfirmDialogModal";

export default function ServerWebhooksTab({ server, onUpdateServer, profile }) {
  const { t } = useTranslation();
  const roomCode = server?.roomCode || server?.id;

  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState(null);
  const [newWebhookTokenInfo, setNewWebhookTokenInfo] = useState(null);
  const [copiedUrlId, setCopiedUrlId] = useState(null);
  const [testingId, setTestingId] = useState(null);
  const [testSuccessId, setTestSuccessId] = useState(null);
  const [pollingId, setPollingId] = useState(null);
  const [pollSuccessId, setPollSuccessId] = useState(null);

  // Form state for creating or editing inline
  const [editingWebhook, setEditingWebhook] = useState(null);
  const [webhookToDelete, setWebhookToDelete] = useState(null);
  const [webhookToRegenerate, setWebhookToRegenerate] = useState(null);

  const [formName, setFormName] = useState("");
  const [formChannelId, setFormChannelId] = useState("");
  const [formAvatar, setFormAvatar] = useState("");
  const [formType, setFormType] = useState("incoming");
  const [formTargetUrl, setFormTargetUrl] = useState("");
  const [formInterval, setFormInterval] = useState(300);

  const textChannels = useMemo(() => {
    return (server?.channels || []).filter(
      (c) => c.type !== "voice" && c.type !== "category"
    );
  }, [server?.channels]);

  // Set default channel when channels load
  useEffect(() => {
    if (!formChannelId && textChannels.length > 0) {
      setFormChannelId(textChannels[0].id);
    }
  }, [textChannels, formChannelId]);

  const loadWebhooks = async () => {
    if (!roomCode || !window.electronAPI?.listWebhooks) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await window.electronAPI.listWebhooks(roomCode);
      setWebhooks(list || []);
    } catch (err) {
      console.error("[ServerWebhooksTab] Error loading webhooks:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWebhooks();
  }, [roomCode]);

  const resetForm = () => {
    setEditingWebhook(null);
    setFormName("");
    setFormChannelId(textChannels[0]?.id || "general");
    setFormAvatar("");
    setFormType("incoming");
    setFormTargetUrl("");
    setFormInterval(300);
  };

  const startEditing = (wh) => {
    setEditingWebhook(wh);
    setFormName(wh.name || "");
    setFormChannelId(wh.channelId || textChannels[0]?.id || "general");
    setFormAvatar(wh.avatar || "");
    setFormType(wh.type || "incoming");
    setFormTargetUrl(wh.targetUrl || "");
    setFormInterval(wh.intervalSeconds || 300);
  };

  const handleSaveWebhook = async (e) => {
    e?.preventDefault();
    if (!formName.trim()) return;

    try {
      if (editingWebhook) {
        await window.electronAPI.updateWebhook(roomCode, editingWebhook.id, {
          name: formName.trim(),
          channelId: formChannelId,
          avatar: formAvatar.trim() || null,
          type: formType,
          targetUrl: formTargetUrl.trim() || null,
          intervalSeconds: parseInt(formInterval, 10) || 300,
        });
        setStatusMsg({
          type: "success",
          text: t("serverSettings.webhooks.updatedSuccess", "Webhook actualizado correctamente."),
        });
        resetForm();
      } else {
        const res = await window.electronAPI.createWebhook(roomCode, {
          name: formName.trim(),
          channelId: formChannelId,
          avatar: formAvatar.trim() || null,
          type: formType,
          targetUrl: formTargetUrl.trim() || null,
          intervalSeconds: parseInt(formInterval, 10) || 300,
        });

        if (res?.success) {
          if (formType === "incoming") {
            setNewWebhookTokenInfo({
              name: res.webhook.name,
              rawToken: res.rawToken,
              fullUrl: res.fullUrl,
            });
            setStatusMsg({
              type: "success",
              text: t("serverSettings.webhooks.createdSuccess", "Webhook creado con éxito."),
            });
          } else {
            setStatusMsg({
              type: "success",
              text: t(
                "serverSettings.webhooks.pollerSuccess",
                "Sondeo P2P activado con éxito. Se consultará automáticamente en segundo plano."
              ),
            });
            if (window.electronAPI.pollWebhookNow) {
              window.electronAPI.pollWebhookNow(roomCode, res.webhook.id).catch(() => {});
            }
          }
          resetForm();
        }
      }
      await loadWebhooks();
    } catch (err) {
      console.error("[ServerWebhooksTab] Error saving webhook:", err);
      setStatusMsg({
        type: "error",
        text: t("serverSettings.webhooks.saveError", "Error al guardar webhook: ") + err.message,
      });
    }
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const handlePollNow = async (wh) => {
    setPollingId(wh.id);
    try {
      const res = await window.electronAPI.pollWebhookNow(roomCode, wh.id);
      if (res?.success) {
        setPollSuccessId(wh.id);
        setTimeout(() => setPollSuccessId(null), 3000);
        const targetChan = textChannels.find((c) => c.id === wh.channelId);
        setStatusMsg({
          type: "success",
          text: res.seeded
            ? t("serverSettings.webhooks.feedSeeded", 'Feed "{{name}}" indexado con éxito.', { name: wh.name })
            : t("serverSettings.webhooks.feedChecked", 'Feed comprobado con éxito. Si había novedades, se publicaron en #{{channel}}.', { channel: targetChan?.name || "canal" }),
        });
      } else {
        setStatusMsg({ type: "error", text: "Error: " + (res?.error || "Desconocido") });
      }
    } catch (err) {
      console.error("[ServerWebhooksTab] Error polling feed:", err);
      setStatusMsg({ type: "error", text: "Error: " + err.message });
    } finally {
      setPollingId(null);
      setTimeout(() => setStatusMsg(null), 4000);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!webhookToDelete) return;
    try {
      await window.electronAPI.deleteWebhook(roomCode, webhookToDelete.id);
      if (editingWebhook?.id === webhookToDelete.id) {
        resetForm();
      }
      setWebhookToDelete(null);
      setStatusMsg({
        type: "success",
        text: t("serverSettings.webhooks.deletedSuccess", "Webhook eliminado."),
      });
      await loadWebhooks();
    } catch (err) {
      console.error("[ServerWebhooksTab] Error deleting webhook:", err);
      setStatusMsg({ type: "error", text: "Error: " + err.message });
    }
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const handleRegenerateConfirm = async () => {
    if (!webhookToRegenerate) return;
    try {
      const res = await window.electronAPI.regenerateWebhookToken(roomCode, webhookToRegenerate.id);
      setWebhookToRegenerate(null);
      if (res?.success) {
        setNewWebhookTokenInfo({
          name: res.webhook.name,
          rawToken: res.rawToken,
          fullUrl: res.fullUrl,
        });
        setStatusMsg({
          type: "success",
          text: t("serverSettings.webhooks.tokenRegeneratedSuccess", "Token regenerado con éxito."),
        });
      }
      await loadWebhooks();
    } catch (err) {
      console.error("[ServerWebhooksTab] Error regenerating token:", err);
      setStatusMsg({ type: "error", text: "Error: " + err.message });
    }
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const handleCopy = (text, id) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedUrlId(id);
      setTimeout(() => setCopiedUrlId(null), 2000);
    }
  };

  const handleTestWebhook = async (wh) => {
    setTestingId(wh.id);
    try {
      await window.electronAPI.testWebhook(roomCode, wh.id);
      setTestSuccessId(wh.id);
      setTimeout(() => setTestSuccessId(null), 3000);
    } catch (err) {
      console.error("[ServerWebhooksTab] Error testing webhook:", err);
      setStatusMsg({ type: "error", text: "Error: " + err.message });
      setTimeout(() => setStatusMsg(null), 4000);
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="onicord-settings-container space-y-4">
      {/* Toast de Estado */}
      {statusMsg && (
        <div
          className={`flex items-center justify-between p-3 rounded-2xl text-xs font-semibold border ${
            statusMsg.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
              : "bg-rose-500/10 border-rose-500/20 text-rose-400"
          }`}
        >
          <div className="flex items-center gap-2">
            <MaterialIcon
              name={statusMsg.type === "success" ? "check_circle" : "error"}
              size={16}
            />
            <span>{statusMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMsg(null)}
            className="text-white/40 hover:text-white transition cursor-pointer p-1"
          >
            <MaterialIcon name="close" size={14} />
          </button>
        </div>
      )}

      {/* Alerta de Token Generado */}
      {newWebhookTokenInfo && (
        <div className="onicord-settings-card !border-amber-500/30 !bg-amber-500/10 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MaterialIcon name="key" size={18} className="text-amber-400" />
              <span className="font-bold text-xs text-amber-300">
                {t("serverSettings.webhooks.tokenGeneratedTitle", 'URL de Webhook generada para "{{name}}"', {
                  name: newWebhookTokenInfo.name,
                })}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setNewWebhookTokenInfo(null)}
              className="text-white/40 hover:text-white transition cursor-pointer p-1"
            >
              <MaterialIcon name="close" size={14} />
            </button>
          </div>
          <p className="text-[11px] text-onicord-muted">
            {t(
              "serverSettings.webhooks.tokenWarning",
              "Copia esta URL completa ahora. Por seguridad criptográfica, el token secreto se almacena en hash y no volverá a mostrarse en texto plano."
            )}
          </p>
          <div className="flex items-center gap-2 bg-onicord-base/90 p-2 rounded-xl border border-white/10 font-mono text-xs">
            <input
              type="text"
              readOnly
              value={newWebhookTokenInfo.fullUrl}
              className="bg-transparent text-onicord-text flex-1 outline-none select-all truncate text-xs font-mono px-2"
            />
            <button
              type="button"
              onClick={() => handleCopy(newWebhookTokenInfo.fullUrl, "new-token")}
              className="h-8 px-3 rounded-lg bg-onicord-accent hover:opacity-90 text-onicord-dark font-semibold text-xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0 shadow-sm active:scale-[0.98] select-none"
            >
              <MaterialIcon
                name={copiedUrlId === "new-token" ? "check" : "content_copy"}
                size={14}
              />
              <span>{copiedUrlId === "new-token" ? t("serverSettings.webhooks.copied", "¡Copiada!") : t("serverSettings.webhooks.copy", "Copiar")}</span>
            </button>
          </div>
        </div>
      )}

      {/* TARJETA 1: FORMULARIO DIRECTO PARA CREAR / EDITAR WEBHOOK */}
      <div className="onicord-settings-card space-y-3.5">
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center gap-2">
            <h3 className="onicord-settings-section-title !mb-0">
              <span>{editingWebhook ? t("serverSettings.webhooks.editTitle", "Editar Webhook: {{name}}", { name: editingWebhook.name }) : t("serverSettings.webhooks.createTitle", "Crear Nuevo Webhook")}</span>
            </h3>
          </div>
          {editingWebhook && (
            <button
              type="button"
              onClick={resetForm}
              className="h-7 px-2.5 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-onicord-muted hover:text-white border border-white/10 transition cursor-pointer"
            >
              {t("serverSettings.webhooks.cancelEdit", "Cancelar edición")}
            </button>
          )}
        </div>

        <form onSubmit={handleSaveWebhook} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-onicord-text block mb-1">
                {t("serverSettings.webhooks.nameLabel", "Nombre del Webhook")}
              </label>
              <ModalInput
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={t("serverSettings.webhooks.namePlaceholder", "Ej: LoL Worlds 26, GitHub CI, Monitor")}
                maxLength={48}
                required
                className="h-9 text-xs"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-onicord-text block mb-1">
                {t("serverSettings.webhooks.targetChannel", "Canal de destino")}
              </label>
              <select
                value={formChannelId}
                onChange={(e) => setFormChannelId(e.target.value)}
                className="onicord-input h-9 text-xs w-full cursor-pointer"
              >
                {textChannels.map((c) => (
                  <option key={c.id} value={c.id}>
                    #{c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-onicord-text block mb-1">
                {t("serverSettings.webhooks.typeLabel", "Tipo de Webhook")}
              </label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                className="onicord-input h-9 text-xs w-full cursor-pointer"
              >
                <option value="incoming">{t("serverSettings.webhooks.typeIncoming", "Ingress Directo HTTP (Push - Scripts / Bots)")}</option>
                <option value="pull_poller">{t("serverSettings.webhooks.typePoller", "Sondeo P2P (Pull Feed RSS/Atom/JSON)")}</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-onicord-text block mb-1">
                {t("serverSettings.webhooks.avatarUrl", "URL de Avatar (Opcional)")}
              </label>
              <ModalInput
                type="url"
                value={formAvatar}
                onChange={(e) => setFormAvatar(e.target.value)}
                placeholder="https://ejemplo.com/avatar.png"
                className="h-9 text-xs"
              />
            </div>
          </div>

          {formType === "pull_poller" && (
            <div className="p-3 rounded-xl bg-onicord-base/40 border border-white/5 space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-onicord-text block mb-1">
                    {t("serverSettings.webhooks.feedUrl", "URL del Feed RSS / Atom / JSON")}
                  </label>
                  <ModalInput
                    type="url"
                    required
                    value={formTargetUrl}
                    onChange={(e) => setFormTargetUrl(e.target.value)}
                    placeholder="https://news.google.com/rss/search?q=Worlds+LoL..."
                    className="h-9 text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-onicord-text block mb-1">
                    {t("serverSettings.webhooks.interval", "Intervalo (segundos)")}
                  </label>
                  <ModalInput
                    type="number"
                    min={30}
                    max={3600}
                    value={formInterval}
                    onChange={(e) => setFormInterval(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            {editingWebhook && (
              <button
                type="button"
                onClick={resetForm}
                className="h-8 px-3 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-onicord-muted hover:text-white border border-white/10 transition cursor-pointer"
              >
                {t("common.cancel", "Cancelar")}
              </button>
            )}
            <button
              type="submit"
              className="h-8 px-4 rounded-lg text-xs font-semibold bg-onicord-accent hover:opacity-90 text-onicord-dark transition-all cursor-pointer shadow-sm active:scale-[0.98] select-none flex items-center gap-1.5"
            >
              <MaterialIcon name={editingWebhook ? "check" : "add"} size={16} />
              <span>{editingWebhook ? t("serverSettings.webhooks.saveChanges", "Guardar Cambios") : t("serverSettings.webhooks.createButton", "Crear Webhook")}</span>
            </button>
          </div>
        </form>
      </div>

      {/* TARJETA 2: LISTA DE WEBHOOKS EXISTENTES */}
      <div className="onicord-settings-card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="onicord-settings-section-title mb-0 flex items-center gap-2">
            <span>{t("serverSettings.webhooks.titleCount", "Webhooks del Servidor ({{count}})", { count: webhooks.length })}</span>
          </h3>
        </div>

        <p className="onicord-settings-row-desc pb-3">
          {t("serverSettings.webhooks.desc", "Permite recibir mensajes automatizados desde GitHub, herramientas de CI/CD, servidores de juegos o consultar feeds RSS/Atom directamente en los canales de este servidor sin intermediarios.")}
        </p>

        {loading ? (
          <div className="py-8 text-center border border-white/5 rounded-2xl p-4 bg-onicord-base/20">
            <span className="loading loading-spinner loading-sm text-onicord-accent mb-2"></span>
            <p className="text-xs text-onicord-muted italic">{t("serverSettings.webhooks.loading", "Cargando webhooks...")}</p>
          </div>
        ) : webhooks.length === 0 ? (
          <div className="py-8 text-center border border-white/5 rounded-2xl p-4 bg-onicord-base/20">
            <MaterialIcon
              name="hub"
              size={32}
              className="mx-auto text-onicord-muted/40 mb-2"
            />
            <p className="text-xs text-onicord-muted italic">
              {t("serverSettings.webhooks.empty", "No hay webhooks configurados en este servidor.")}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {webhooks.map((wh) => {
              const targetChannel = textChannels.find((c) => c.id === wh.channelId);
              const isCurrentlyEditing = editingWebhook?.id === wh.id;

              return (
                <li
                  key={wh.id}
                  className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 rounded-2xl border transition-colors ${
                    isCurrentlyEditing
                      ? "bg-onicord-accent/10 border-onicord-accent/40"
                      : "bg-onicord-base/60 border-white/5 hover:border-white/10"
                  }`}
                >
                  {/* Avatar + Info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-onicord-accent/10 text-onicord-accent flex items-center justify-center shrink-0 overflow-hidden border border-onicord-accent/20">
                      {wh.avatar ? (
                        <img
                          src={wh.avatar}
                          alt=""
                          className="w-full h-full object-cover rounded-full"
                          onError={(e) => { e.currentTarget.style.display = "none"; }}
                        />
                      ) : (
                        <MaterialIcon name={wh.type === "pull_poller" ? "rss_feed" : "hub"} size={16} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-onicord-text truncate">
                          {wh.name}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-onicord-surface text-onicord-muted border border-white/5">
                          {wh.type === "pull_poller" ? t("serverSettings.webhooks.p2pPoller", "Sondeo P2P ({{minutes}}m)", { minutes: Math.round((wh.intervalSeconds || 300) / 60) }) : t("serverSettings.webhooks.httpIngress", "Ingress HTTP")}
                        </span>
                        {isCurrentlyEditing && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold text-onicord-accent bg-onicord-accent/20 border border-onicord-accent/30">
                            {t("serverSettings.webhooks.editing", "Editando")}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-onicord-muted truncate">
                        <span className="flex items-center gap-0.5 text-onicord-accent font-medium shrink-0">
                          <MaterialIcon name="tag" size={12} />
                          {targetChannel?.name || wh.channelId || "general"}
                        </span>
                        <span>•</span>
                        {wh.type === "pull_poller" && wh.targetUrl ? (
                          <span className="truncate max-w-[200px] sm:max-w-[260px] text-white/50" title={wh.targetUrl}>
                            {wh.targetUrl}
                          </span>
                        ) : (
                          <span>{new Date(wh.createdAt || Date.now()).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end shrink-0">
                    {wh.type === "pull_poller" ? (
                      <>
                        <button
                          type="button"
                          disabled={pollingId === wh.id}
                          onClick={() => handlePollNow(wh)}
                          className="h-8 px-3 rounded-lg text-xs font-semibold bg-onicord-accent/15 hover:bg-onicord-accent/25 text-onicord-accent border border-onicord-accent/30 transition-all flex items-center gap-1.5 cursor-pointer shrink-0 select-none"
                          title={t("serverSettings.webhooks.pollNowTitle", "Consultar feed RSS/Atom ahora mismo y publicar novedades")}
                        >
                          <MaterialIcon
                            name={pollSuccessId === wh.id ? "check" : "sync"}
                            size={15}
                            className={`${pollingId === wh.id ? "animate-spin" : ""} ${pollSuccessId === wh.id ? "text-green-400" : ""}`}
                          />
                          <span>{pollingId === wh.id ? t("serverSettings.webhooks.polling", "Sondeando...") : pollSuccessId === wh.id ? t("serverSettings.webhooks.polled", "¡Comprobado!") : t("serverSettings.webhooks.pollNow", "Sondear ahora")}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopy(wh.targetUrl || "", wh.id)}
                          className="h-8 px-3 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-onicord-text border border-white/10 transition-all flex items-center gap-1.5 cursor-pointer shrink-0 select-none"
                          title={t("serverSettings.webhooks.copyFeedTitle", "Copiar URL del feed")}
                        >
                          <MaterialIcon
                            name={copiedUrlId === wh.id ? "check" : "content_copy"}
                            size={14}
                            className={copiedUrlId === wh.id ? "text-green-400" : ""}
                          />
                          <span>{copiedUrlId === wh.id ? t("serverSettings.webhooks.copied", "¡Copiada!") : t("serverSettings.webhooks.copyFeed", "Copiar Feed")}</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleCopy(wh.urlTemplate || "", wh.id)}
                          className="h-8 px-3 rounded-lg text-xs font-semibold bg-onicord-accent/10 hover:bg-onicord-accent/20 text-onicord-accent border border-onicord-accent/20 transition-all flex items-center gap-1.5 cursor-pointer shrink-0 select-none"
                          title={t("serverSettings.webhooks.copyBaseUrlTitle", "Copiar URL base del Webhook")}
                        >
                          <MaterialIcon
                            name={copiedUrlId === wh.id ? "check" : "content_copy"}
                            size={14}
                            className={copiedUrlId === wh.id ? "text-green-400" : ""}
                          />
                          <span>{copiedUrlId === wh.id ? t("serverSettings.webhooks.copied", "¡Copiada!") : t("serverSettings.webhooks.copyUrl", "Copiar URL")}</span>
                        </button>

                        <button
                          type="button"
                          disabled={testingId === wh.id}
                          onClick={() => handleTestWebhook(wh)}
                          className="h-8 px-3 rounded-lg text-xs font-semibold bg-white/5 hover:bg-white/10 text-onicord-text border border-white/10 transition-all flex items-center gap-1.5 cursor-pointer shrink-0 select-none"
                          title={t("serverSettings.webhooks.testTitle", "Probar webhook enviando un mensaje")}
                        >
                          <MaterialIcon
                            name={testSuccessId === wh.id ? "check" : "play_arrow"}
                            size={15}
                            className={testSuccessId === wh.id ? "text-green-400" : ""}
                          />
                          <span>{testSuccessId === wh.id ? t("serverSettings.webhooks.tested", "Enviado") : t("serverSettings.webhooks.test", "Probar")}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setWebhookToRegenerate(wh)}
                          className="h-8 w-8 rounded-lg bg-white/5 hover:bg-white/10 text-onicord-muted hover:text-amber-400 border border-white/10 transition-all flex items-center justify-center cursor-pointer shrink-0 select-none"
                          title={t("serverSettings.webhooks.regenerateToken", "Regenerar Token")}
                        >
                          <MaterialIcon name="refresh" size={16} />
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => startEditing(wh)}
                      className={`h-8 w-8 rounded-lg border transition-all flex items-center justify-center cursor-pointer shrink-0 select-none ${
                        isCurrentlyEditing
                          ? "bg-onicord-accent text-onicord-dark border-onicord-accent"
                          : "bg-white/5 hover:bg-white/10 text-onicord-muted hover:text-white border border-white/10"
                      }`}
                      title={isCurrentlyEditing ? t("serverSettings.webhooks.currentlyEditing", "Editando actualmente") : t("serverSettings.webhooks.editTooltip", "Editar Webhook")}
                    >
                      <MaterialIcon name="edit" size={16} />
                    </button>

                    <button
                      type="button"
                      onClick={() => setWebhookToDelete(wh)}
                      className="h-8 w-8 rounded-lg bg-white/5 hover:bg-onicord-danger/20 text-onicord-muted hover:text-onicord-danger border border-white/10 hover:border-onicord-danger/30 transition-all flex items-center justify-center cursor-pointer shrink-0 select-none"
                      title={t("serverSettings.webhooks.deleteWebhook", "Eliminar Webhook")}
                    >
                      <MaterialIcon name="delete" size={16} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Modal de Confirmación de Eliminación */}
      {webhookToDelete && (
        <ConfirmDialogModal
          isOpen={true}
          title={t("serverSettings.webhooks.deleteConfirmTitle", "Eliminar Webhook")}
          message={t("serverSettings.webhooks.deleteConfirmMsg", '¿Estás seguro de que deseas eliminar el webhook "{{name}}"? Los servicios externos que envíen peticiones a esta URL dejarán de funcionar.', { name: webhookToDelete.name })}
          confirmText={t("common.delete", "Eliminar")}
          confirmStyle="danger"
          onConfirm={handleDeleteConfirm}
          onCancel={() => setWebhookToDelete(null)}
        />
      )}

      {/* Modal de Confirmación de Regeneración */}
      {webhookToRegenerate && (
        <ConfirmDialogModal
          isOpen={true}
          title={t("serverSettings.webhooks.regenerateConfirmTitle", "Regenerar Token de Webhook")}
          message={t("serverSettings.webhooks.regenerateConfirmMsg", '¿Deseas regenerar el token para "{{name}}"? El token anterior quedará invalidado inmediatamente.', { name: webhookToRegenerate.name })}
          confirmText={t("serverSettings.webhooks.regenerateToken", "Regenerar")}
          confirmStyle="primary"
          onConfirm={handleRegenerateConfirm}
          onCancel={() => setWebhookToRegenerate(null)}
        />
      )}
    </div>
  );
}
