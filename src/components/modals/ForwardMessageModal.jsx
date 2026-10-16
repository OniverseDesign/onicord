import { useState } from "react";
import { useTranslation } from "react-i18next";
import ModalShell from "../ui/ModalShell";
import MaterialIcon from "../icons/MaterialIcon";

export default function ForwardMessageModal({
  message,
  server,
  currentChannelId,
  onForward,
  onClose,
}) {
  const { t } = useTranslation();
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [busy, setBusy] = useState(false);

  // Restrict to text channels of the CURRENT server only
  const availableChannels = (server?.channels || []).filter(
    (c) => c.type === "text" && c.id !== currentChannelId
  );

  const handleConfirm = async () => {
    if (!selectedChannelId || busy) return;
    setBusy(true);
    try {
      await onForward(message, selectedChannelId);
      onClose();
    } catch (err) {
      console.error("Error forwarding message:", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title={t("chat.forwardMessage", "Reenviar Mensaje")}
      onClose={onClose}
      maxWidth="max-w-md"
    >
      <div className="space-y-4 py-2">
        {/* Preview of message to be forwarded */}
        <div className="bg-onicord-base/60 p-3 rounded-lg border border-white/5 text-sm">
          <div className="text-xs font-semibold text-onicord-accent mb-1 flex items-center gap-1">
            <MaterialIcon name="shortcut" size={14} />
            <span>{message.authorNickname || "Usuario"}</span>
          </div>
          <p className="text-onicord-text truncate">
            {(() => {
              let textContent = message.text;
              if (typeof textContent === "string" && textContent.startsWith("[FORWARD_MESSAGE]:")) {
                try {
                  const parsed = JSON.parse(textContent.replace("[FORWARD_MESSAGE]:", ""));
                  if (parsed && parsed.text) textContent = parsed.text;
                } catch {}
              }
              if (typeof textContent === "string") {
                if (textContent.trim().startsWith('{"type":"sticker"')) return `[${t("common.sticker", "Sticker")}]`;
                if (textContent.includes("[FILE_ATTACHMENT]:")) return `[${t("chat.attachment", "Archivo adjunto")}]`;
                return textContent;
              }
              return "[Contenido multimedia]";
            })()}
          </p>
        </div>

        {/* Destination Channel Selector */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-onicord-muted mb-2">
            {t("chat.selectDestinationChannel", "Seleccionar canal de destino (mismo servidor)")}
          </label>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {availableChannels.length === 0 ? (
              <p className="text-xs text-onicord-muted py-2 italic">
                {t("chat.noOtherChannels", "No hay otros canales de texto en este servidor.")}
              </p>
            ) : (
              availableChannels.map((ch) => {
                const isSelected = ch.id === selectedChannelId;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => setSelectedChannelId(ch.id)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-lg text-left transition-all ${
                      isSelected
                        ? "bg-onicord-accent text-onicord-text-dark font-medium"
                        : "bg-onicord-surface/40 hover:bg-onicord-surface text-onicord-text"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <MaterialIcon name="tag" size={16} />
                      <span className="truncate">{ch.name}</span>
                    </div>
                    {isSelected && <MaterialIcon name="check" size={16} />}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-3 border-t border-white/5">
          <button
            type="button"
            onClick={onClose}
            className="onicord-btn-secondary px-4 py-2 text-sm"
          >
            {t("common.cancel", "Cancelar")}
          </button>
          <button
            type="button"
            disabled={!selectedChannelId || busy}
            onClick={handleConfirm}
            className="onicord-btn-primary px-5 py-2 text-sm disabled:opacity-50"
          >
            {busy ? t("common.sending", "Enviando...") : t("chat.forward", "Reenviar")}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
