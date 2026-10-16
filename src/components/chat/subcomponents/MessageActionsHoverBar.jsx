import React from "react";
import { useTranslation } from "react-i18next";
import { Delete, IconReply, IconAddReaction } from "../../icons/StreamIcons";
import MaterialIcon from "../../icons/MaterialIcon";

export default function MessageActionsHoverBar({
  isReplyPreview,
  isMyMessage,
  disableThreadAction,
  pickerTargetRect,
  setPickerTargetRect,
  msg,
  nickname,
  avatar,
  textContent,
  fileData,
  isStickerPayload,
  onReplyClick,
  onForwardClick,
  onOpenThread,
  onOpenDeleteModal,
}) {
  const { t } = useTranslation();

  if (isReplyPreview) {
    return null;
  }

  return (
    <div className="onicord-message-toolbar">
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (pickerTargetRect) {
            setPickerTargetRect(null);
          } else {
            setPickerTargetRect(e.currentTarget.getBoundingClientRect());
          }
        }}
        className="onicord-message-toolbar-btn onicord-message-toolbar-btn-divider"
        title={t("chat.addReaction")}
      >
        <IconAddReaction size="base" />
      </button>

      <button
        type="button"
        onClick={() =>
          onReplyClick({
            id: msg.id,
            authorId: msg.authorId,
            text: isStickerPayload
              ? `[${t("common.sticker")}]`
              : textContent || fileData?.name,
            authorNickname: nickname,
            authorAvatar: avatar,
            isComplement: msg.isComplement,
            complementName: msg.complementName,
          })
        }
        className="onicord-message-toolbar-btn onicord-message-toolbar-btn-divider"
        title={t("chat.reply", "Responder")}
      >
        <IconReply size="base" />
      </button>

      {/* Forward Message Button */}
      <button
        type="button"
        onClick={() => onForwardClick?.(msg)}
        className="onicord-message-toolbar-btn onicord-message-toolbar-btn-divider"
        title={t("chat.forwardMessage", "Reenviar mensaje")}
      >
        <MaterialIcon name="shortcut" size={16} />
      </button>

      {/* Thread Reply Button */}
      {!disableThreadAction && (
        <button
          type="button"
          onClick={() => onOpenThread?.(msg)}
          className="onicord-message-toolbar-btn onicord-message-toolbar-btn-divider"
          title={t("chat.threadReply", "Responder en hilo")}
        >
          <MaterialIcon name="forum" size={16} />
        </button>
      )}

      {isMyMessage && (
        <button
          type="button"
          onClick={(e) => onOpenDeleteModal(e, msg, nickname, avatar)}
          className="onicord-message-toolbar-btn onicord-message-toolbar-btn-danger"
          title={t("chat.deleteMessage")}
        >
          <Delete size="base" />
        </button>
      )}
    </div>
  );
}
