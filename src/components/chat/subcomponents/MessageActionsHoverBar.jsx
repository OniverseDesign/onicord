import React from "react";
import { useTranslation } from "react-i18next";
import { Delete, IconReply, IconAddReaction } from "../../icons/StreamIcons";
import MaterialIcon from "../../icons/MaterialIcon";
import Tooltip from "../../ui/Tooltip";

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
      <Tooltip content={t("chat.addReaction")} side="top">
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
        >
          <IconAddReaction size="base" />
        </button>
      </Tooltip>

      <Tooltip content={t("chat.reply", "Responder")} side="top">
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
        >
          <IconReply size="base" />
        </button>
      </Tooltip>

      {/* Forward Message Button */}
      <Tooltip content={t("chat.forwardMessage", "Reenviar mensaje")} side="top">
        <button
          type="button"
          onClick={() => onForwardClick?.(msg)}
          className="onicord-message-toolbar-btn onicord-message-toolbar-btn-divider"
        >
          <MaterialIcon name="shortcut" size={16} />
        </button>
      </Tooltip>

      {/* Thread Reply Button */}
      {!disableThreadAction && (
        <Tooltip content={t("chat.threadReply", "Responder en hilo")} side="top">
          <button
            type="button"
            onClick={() => onOpenThread?.(msg)}
            className="onicord-message-toolbar-btn onicord-message-toolbar-btn-divider"
          >
            <MaterialIcon name="forum" size={16} />
          </button>
        </Tooltip>
      )}

      {isMyMessage && (
        <Tooltip content={t("chat.deleteMessage")} side="top">
          <button
            type="button"
            onClick={(e) => onOpenDeleteModal(e, msg, nickname, avatar)}
            className="onicord-message-toolbar-btn onicord-message-toolbar-btn-danger"
          >
            <Delete size="base" />
          </button>
        </Tooltip>
      )}
    </div>
  );
}
