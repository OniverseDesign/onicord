import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../../icons/MaterialIcon";
import { IconAttach, IconSticker } from "../../icons/StreamIcons";
import IconEstrella from "../../icons/Estrella.svg?react";
import { resolveAuthorDisplay } from "../../../lib/profileUtils";
import QuickSuggestions from "../QuickSuggestions";
import FloatingFormattingBar from "../FloatingFormattingBar";
import CommandsPopover from "../CommandsPopover";
import MentionsPopover from "../MentionsPopover";
import EmojiPickerPopover from "../../ui/EmojiPickerPopover";
import StickerPopover from "../StickerPopover";
import { soundEngine } from "../../../lib/soundEngine";

function formatBytes(bytes) {
  if (!bytes) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export default function ChatInputArea({
  channelName,
  placeholderOverride = null,
  hasSendMessages = true,
  input,
  setInput,
  pendingFile,
  setPendingFile,
  previewUrl,
  setPreviewUrl,
  replyTarget,
  setReplyTarget,
  typingUsers = {},
  visibleSuggestions = [],
  selection,
  isInputFocused,
  setIsInputFocused,
  applyFormatting,
  showCommandsPopup,
  setShowCommandsPopup,
  showMentionsPopup,
  setShowMentionsPopup,
  emojisTargetRect,
  setEmojisTargetRect,
  stickersTargetRect,
  setStickersTargetRect,
  profile,
  peers,
  server,
  tyrannyInputRef,
  fileInputRef,
  emojiButtonRef,
  stickerButtonRef,
  handleSend,
  handleInputChange,
  handleKeyDown,
  handlePaste,
  handleInputSelection,
  handleFileInputChange,
  handleAttachFileClick,
  handleSelectEmoji,
  onSelectSticker,
  onSharePackDirect,
  setContextMenu,
}) {
  const { t } = useTranslation();

  const [cachedReplyTarget, setCachedReplyTarget] = useState(replyTarget);
  useEffect(() => {
    if (replyTarget) {
      setCachedReplyTarget(replyTarget);
    }
  }, [replyTarget]);
  const displayReplyTarget = replyTarget || cachedReplyTarget;

  const [cachedPendingFile, setCachedPendingFile] = useState(pendingFile);
  const [cachedPreviewUrl, setCachedPreviewUrl] = useState(previewUrl);
  useEffect(() => {
    if (pendingFile) {
      setCachedPendingFile(pendingFile);
      setCachedPreviewUrl(previewUrl);
    }
  }, [pendingFile, previewUrl]);
  const displayPendingFile = pendingFile || cachedPendingFile;
  const displayPreviewUrl = previewUrl || cachedPreviewUrl;

  const renderTypingText = () => {
    const users = Object.values(typingUsers);
    if (users.length === 0) return null;
    if (users.length === 1)
      return (
        <>
          <span className="font-semibold text-onicord-text">
            {users[0].nickname}
          </span>{" "}
          {t("chat.isWriting")}
        </>
      );
    if (users.length === 2) {
      return (
        <>
          <span className="font-semibold text-onicord-text">
            {users[0].nickname}
          </span>
          {t("chat.writingAnd")}
          <span className="font-semibold text-onicord-text">
            {users[1].nickname}
          </span>{" "}
          {t("chat.areWriting")}
        </>
      );
    }
    return (
      <span className="font-semibold text-onicord-text">
        {t("chat.severalWriting")}
      </span>
    );
  };

  return (
    <div className="w-full relative shrink-0 px-2 pb-2 pt-0">
      {/* Typing indicator */}
      <div
        className="w-full overflow-hidden transition-all duration-200 ease-in-out"
        style={{
          height: Object.keys(typingUsers).length > 0 ? "20px" : "0px",
          opacity: Object.keys(typingUsers).length > 0 ? 1 : 0,
          marginBottom: Object.keys(typingUsers).length > 0 ? "2px" : "0px",
        }}
      >
        <div className="flex items-center gap-1.5 text-xs text-onicord-subtext h-5 select-none pl-3 z-30">
          {Object.keys(typingUsers).length > 0 && (
            <>
              <div className="flex items-center gap-0.5 pt-0.5 pr-1">
                <span className="h-1.5 w-1.5 rounded-full bg-onicord-muted animate-bounce [animation-delay:-0.3s]"></span>
                <span className="h-1.5 w-1.5 rounded-full bg-onicord-muted animate-bounce [animation-delay:-0.15s]"></span>
                <span className="h-1.5 w-1.5 rounded-full bg-onicord-muted animate-bounce"></span>
              </div>
              <p className="animate-fade-in truncate max-w-[400px]">
                {renderTypingText()}
              </p>
            </>
          )}
        </div>
      </div>

      <QuickSuggestions
        visibleSuggestions={visibleSuggestions}
        selection={selection}
        setInput={setInput}
        tyrannyInputRef={tyrannyInputRef}
      />

      <FloatingFormattingBar
        selection={selection}
        applyFormatting={applyFormatting}
        t={t}
      />

      {/* Replying banner */}
      <div
        className="w-full overflow-hidden transition-all duration-300 ease-in-out shrink-0"
        style={{
          height: replyTarget ? "32px" : "0px",
          marginBottom: replyTarget ? "4px" : "0px",
          opacity: replyTarget ? 1 : 0,
        }}
      >
        {displayReplyTarget && (() => {
          const usuarioCitado = resolveAuthorDisplay(
            displayReplyTarget.authorId,
            profile,
            peers,
            displayReplyTarget,
          );
          return (
            <div className="onicord-reply-bar !mx-0 !mb-0">
              <div className="flex items-center gap-1.5 truncate text-onicord-muted">
                <span>{t("chat.replyingTo")}</span>
                <div className="h-4 w-4 rounded-full bg-onicord-accent overflow-hidden shrink-0 flex items-center justify-center text-[9px] font-bold text-white">
                  {usuarioCitado.avatar === "bot-star" ||
                  (usuarioCitado.isComplement && !usuarioCitado.avatar) ? (
                    <IconEstrella className="w-2.5 h-2.5 text-white" />
                  ) : usuarioCitado.avatar ? (
                    <img
                      src={usuarioCitado.avatar}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span>
                      {(usuarioCitado.nickname || "?").charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <span className="font-bold text-onicord-text">
                  @{usuarioCitado.nickname}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playNav("close");
                  setReplyTarget(null);
                }}
                className="text-onicord-muted hover:text-onicord-danger transition-colors font-bold px-1 cursor-pointer"
                title={t("chat.cancelReply")}
              >
                ✕
              </button>
            </div>
          );
        })()}
      </div>

      <CommandsPopover
        showCommandsPopup={showCommandsPopup}
        input={input}
        setInput={setInput}
        setShowCommandsPopup={setShowCommandsPopup}
        tyrannyInputRef={tyrannyInputRef}
        serverPlugins={server?.plugins}
        t={t}
      />

      <MentionsPopover
        showMentionsPopup={showMentionsPopup}
        input={input}
        setInput={setInput}
        peers={peers}
        profile={profile}
        roles={server?.roles || []}
        setShowMentionsPopup={setShowMentionsPopup}
        tyrannyInputRef={tyrannyInputRef}
        t={t}
      />

      {emojisTargetRect && (
        <EmojiPickerPopover
          targetRect={emojisTargetRect}
          triggerRef={emojiButtonRef}
          onClose={() => setEmojisTargetRect(null)}
          onSelectEmoji={(emoji) => {
            handleSelectEmoji(emoji);
            setEmojisTargetRect(null);
          }}
        />
      )}

      {stickersTargetRect && (
        <StickerPopover
          targetRect={stickersTargetRect}
          onClose={() => setStickersTargetRect(null)}
          onSelectSticker={onSelectSticker}
          onSharePackDirect={onSharePackDirect}
        />
      )}

      <form
        onSubmit={handleSend}
        className="onicord-chat-input-bar relative"
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setContextMenu({
            type: "input",
            x: e.clientX,
            y: e.clientY,
            title: t("contextMenu.editOptions"),
            data: {},
          });
        }}
      >
        <div
          className={`w-full overflow-hidden transition-all duration-300 ease-in-out shrink-0 ${
            pendingFile
              ? "max-h-28 opacity-100 mb-2 pointer-events-auto"
              : "max-h-0 opacity-0 mb-0 pointer-events-none"
          }`}
        >
          {displayPendingFile && (
            <div className="onicord-pending-file-card group/pending relative overflow-hidden bg-onicord-base border border-white/5 p-2 flex items-center gap-3">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-black/50 overflow-hidden">
                {displayPreviewUrl ? (
                  displayPendingFile.type?.startsWith("video/") ? (
                    <video
                      src={displayPreviewUrl}
                      className="w-full h-full object-cover opacity-80"
                    />
                  ) : (
                    <img
                      src={displayPreviewUrl}
                      alt="preview"
                      className="w-full h-full object-cover"
                    />
                  )
                ) : (
                  <IconAttach size="lg" className="text-onicord-accent" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-onicord-text">
                  {displayPendingFile.name}
                </p>
                <p className="text-xs text-onicord-muted">
                  {formatBytes(displayPendingFile.size)} — Ready to send
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (previewUrl) URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(null);
                  setPendingFile(null);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-colors absolute top-2 right-2"
                title={t("chat.cancelSend")}
              >
                <span className="text-sm font-bold leading-none">✕</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-2">
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            onChange={handleFileInputChange}
            disabled={!hasSendMessages}
          />
          <button
            type="button"
            onClick={hasSendMessages ? handleAttachFileClick : undefined}
            className={`onicord-chat-toolbar-btn group ${!hasSendMessages ? "opacity-35 cursor-not-allowed pointer-events-none" : ""}`}
            disabled={!hasSendMessages}
            title={hasSendMessages ? t("chat.attachUnlimited") : t("chat.noPermissionShort", "Sin permisos")}
          >
            <IconAttach size="xl" />
          </button>

          <div className="relative flex-1 min-w-0 flex items-center h-full">
            <div
              contentEditable={hasSendMessages}
              ref={tyrannyInputRef}
              onInput={hasSendMessages ? handleInputChange : undefined}
              onKeyDown={hasSendMessages ? handleKeyDown : undefined}
              onPaste={hasSendMessages ? handlePaste : undefined}
              onSelect={hasSendMessages ? handleInputSelection : undefined}
              onKeyUp={hasSendMessages ? handleInputSelection : undefined}
              onMouseUp={hasSendMessages ? handleInputSelection : undefined}
              onFocus={hasSendMessages ? () => setIsInputFocused(true) : undefined}
              onBlur={hasSendMessages ? () => setIsInputFocused(false) : undefined}
              placeholder={
                !hasSendMessages
                  ? t("chat.noPermissionPlaceholder", "No tienes permisos para enviar mensajes en este canal")
                  : placeholderOverride
                    ? placeholderOverride
                    : pendingFile
                      ? `Comment on ${pendingFile.name}...`
                      : `${t("chat.placeholder").replace("#general...", `#${channelName || "general"}`)}`
              }
              className={`onicord-chat-input select-text outline-none overflow-x-hidden whitespace-pre-wrap pr-10 focus:outline-none ${
                !hasSendMessages ? "opacity-50 cursor-not-allowed select-none" : ""
              }`}
              style={{
                fontFamily: 'var(--font)',
                fontSize: '15px',
                lineHeight: '20px',
                minHeight: '20px',
                maxHeight: '120px',
                overflowY: 'auto',
                wordBreak: 'break-all',
              }}
            />
          </div>
          <button
            ref={emojiButtonRef}
            type="button"
            onClick={hasSendMessages ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (emojisTargetRect) {
                setEmojisTargetRect(null);
              } else {
                setStickersTargetRect(null);
                const rect = stickerButtonRef.current ? stickerButtonRef.current.getBoundingClientRect() : e.currentTarget.getBoundingClientRect();
                setEmojisTargetRect(rect);
              }
            } : undefined}
            className={`onicord-chat-toolbar-btn group ${!hasSendMessages ? "opacity-35 cursor-not-allowed pointer-events-none" : ""}`}
            disabled={!hasSendMessages}
            title={hasSendMessages ? t("chat.emoji", "Emoji") : t("chat.noPermissionShort", "Sin permisos")}
          >
            <MaterialIcon name="sentiment_satisfied" size="xl" />
          </button>
          <button
            ref={stickerButtonRef}
            type="button"
            onClick={hasSendMessages ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (stickersTargetRect) {
                setStickersTargetRect(null);
              } else {
                setEmojisTargetRect(null);
                setStickersTargetRect(e.currentTarget.getBoundingClientRect());
              }
            } : undefined}
            className={`onicord-chat-toolbar-btn group ${!hasSendMessages ? "opacity-35 cursor-not-allowed pointer-events-none" : ""}`}
            disabled={!hasSendMessages}
            title={hasSendMessages ? t("chat.sendSticker") : t("chat.noPermissionShort", "Sin permisos")}
          >
            <IconSticker size="xl" />
          </button>
        </div>
      </form>
    </div>
  );
}
