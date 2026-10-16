import { useTranslation } from "react-i18next";
import ModalShell from "../ui/ModalShell";
import MaterialIcon from "../icons/MaterialIcon";
import ChatMessageItem from "../chat/ChatMessageItem";

export default function PinnedMessagesModal({
  isOpen,
  onClose,
  pinnedMessages = [],
  onUnpinMessage,
  profile,
  peers,
  server,
}) {
  const { t } = useTranslation();

  const handleJumpToMessage = (msgId) => {
    onClose?.();
    setTimeout(() => {
      const el = document.getElementById(`msg-${msgId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("onicord-highlight-flash");
        setTimeout(() => {
          el.classList.remove("onicord-highlight-flash");
        }, 2000);
      }
    }, 150);
  };

  if (!isOpen) return null;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <MaterialIcon name="push_pin" size={20} className="text-onicord-accent" />
          <span>{t("chat.pinnedModalTitle", "Mensajes Fijados")}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-onicord-accent/20 text-onicord-accent font-semibold ml-2">
            {pinnedMessages.length}
          </span>
        </div>
      }
      maxWidth="max-w-2xl"
    >
      <div className="flex flex-col gap-2.5 my-2 max-h-[60vh] overflow-y-auto pr-1">
        {pinnedMessages.length === 0 ? (
          <div className="py-12 text-center text-onicord-muted flex flex-col items-center gap-2">
            <MaterialIcon name="push_pin" size={32} className="opacity-40" />
            <p className="font-semibold text-sm">
              {t("chat.noPinnedMessages", "No hay mensajes fijados en este canal.")}
            </p>
            <p className="text-xs text-onicord-muted/70">
              {t("chat.pinMessageTip", "Haz clic secundario sobre un mensaje para fijarlo aquí.")}
            </p>
          </div>
        ) : (
          pinnedMessages.map((msg) => (
            <div
              key={msg.id}
              onClick={() => handleJumpToMessage(msg.id)}
              className="relative group bg-onicord-mantle/70 border border-onicord-island rounded-onicord-inner pt-2 pb-3 pr-3 flex items-start justify-between gap-3 hover:border-onicord-accent/50 hover:bg-onicord-surface/60 transition-all cursor-pointer select-none"
              title={t("chat.jumpToMessage", "Ir al mensaje")}
            >
              <div className="flex-1 min-w-0 pointer-events-none">
                <ChatMessageItem
                  msg={msg}
                  isReplyPreview={true}
                  disableThreadAction={true}
                  profile={profile}
                  peers={peers}
                  server={server}
                />
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onUnpinMessage(msg.id);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-onicord-button bg-onicord-danger/0 text-onicord-danger hover:bg-onicord-danger hover:text-onicord-text opacity-70 hover:opacity-100 transition-all cursor-pointer shrink-0 mt-1"
                title={t("chat.unpin", "Desfijar")}
              >
                <MaterialIcon name="keep_off" size="base" />
              </button>
            </div>
          ))
        )}
      </div>
    </ModalShell>
  );
}
