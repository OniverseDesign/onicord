import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../../icons/MaterialIcon";
import IconEstrella from "../../icons/Estrella.svg?react";
import { resolveAuthorDisplay } from "../../../lib/profileUtils";
import QuickSuggestions from "../QuickSuggestions";
import FloatingFormattingBar from "../FloatingFormattingBar";
import CommandsPopover from "../CommandsPopover";
import MentionsPopover from "../MentionsPopover";
import EmojiAutocompletePopover from "../EmojiAutocompletePopover";
import EmojiPickerPopover from "../../ui/EmojiPickerPopover";
import StickerPopover from "../StickerPopover";
import Tooltip from "../../ui/Tooltip";
import { soundEngine } from "../../../lib/soundEngine";
import {
  setSelectionOffsets,
  getSelectionCharacterOffsets,
  extractTextFromInput,
} from "../../../lib/inputFormatter";
import { getReadableSuggestionText } from "../composer/useQuickSuggestions";

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
  isForum = false,
  postTitle = "",
  setPostTitle,
  input,
  setInput,
  pendingFile,
  setPendingFile,
  pendingFiles = [],
  onRemovePendingFile = () => {},
  onClearPendingFiles = null,
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
  emojiQuery = null,
  setEmojiQuery,
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
  onTogglePendingFileNsfw = null,
  channelAllowsNsfw = false,
  isEphemeralMode = false,
  onToggleEphemeralMode = null,
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
  const [isTitleFocused, setIsTitleFocused] = useState(false);
  const blurTimeoutRef = useRef(null);
  const commandsPopoverRef = useRef(null);
  const mentionsPopoverRef = useRef(null);
  const emojiAutocompleteRef = useRef(null);

  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);

  useEffect(() => {
    setSelectedSuggestionIndex(0);
  }, [input, visibleSuggestions.length]);

  const safeSuggestionIndex =
    visibleSuggestions.length > 0
      ? Math.min(selectedSuggestionIndex, visibleSuggestions.length - 1)
      : 0;

  const isSuggestionsHidden =
    showCommandsPopup || showMentionsPopup || Boolean(emojiQuery);
  const hasPartialInput = Boolean(input && input.trim().length > 0);
  const canTabCompleteSuggestion =
    visibleSuggestions.length > 0 &&
    !selection &&
    !isSuggestionsHidden &&
    hasPartialInput;

  const acceptSuggestion = (item) => {
    if (!item) return;
    const textToInsert = item.insertText ?? item.displayText ?? "";
    setInput(textToInsert);
    requestAnimationFrame(() => {
      const el = tyrannyInputRef.current;
      if (el) {
        el.focus();
        setSelectionOffsets(el, textToInsert.length, textToInsert.length);
      }
    });
  };

  const handleContentKeyDown = (e) => {
    if (commandsPopoverRef.current?.handleKeyDown?.(e)) {
      return;
    }
    if (mentionsPopoverRef.current?.handleKeyDown?.(e)) {
      return;
    }
    if (emojiAutocompleteRef.current?.handleKeyDown?.(e)) {
      return;
    }
    if (canTabCompleteSuggestion && !e.ctrlKey && !e.metaKey) {
      if (e.key === "Tab" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        acceptSuggestion(visibleSuggestions[safeSuggestionIndex]);
        return;
      }
      if (
        (e.key === "Tab" && e.shiftKey && !e.altKey) ||
        (e.key === "ArrowRight" && e.altKey && !e.shiftKey)
      ) {
        e.preventDefault();
        setSelectedSuggestionIndex((prev) => (prev + 1) % visibleSuggestions.length);
        return;
      }
      if (e.key === "ArrowLeft" && e.altKey && !e.shiftKey) {
        e.preventDefault();
        setSelectedSuggestionIndex(
          (prev) => (prev - 1 + visibleSuggestions.length) % visibleSuggestions.length
        );
        return;
      }
    }
    handleKeyDown?.(e);
  };

  const handleInputFocus = () => {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    setIsInputFocused?.(true);
  };

  const handleCopy = (e) => {
    const el = tyrannyInputRef.current;
    if (!el || !e.clipboardData) return;
    const { start, end } = getSelectionCharacterOffsets(el);
    if (start === end) return;
    const selectedText = extractTextFromInput(el).slice(start, end);
    if (/<a?:[a-zA-Z0-9_-]{2,32}:[a-zA-Z0-9_-]{1,64}:(?:webp|png|gif|jpg|jpeg)>/i.test(selectedText)) {
      e.preventDefault();
      e.clipboardData.setData("text/plain", selectedText);
    }
  };

  const handleInputBlur = () => {
    blurTimeoutRef.current = setTimeout(() => {
      setIsInputFocused?.(false);
    }, 150);
  };

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (pendingFile) {
      setCachedPendingFile(pendingFile);
      setCachedPreviewUrl(previewUrl);
    }
  }, [pendingFile, previewUrl]);
  const displayPendingFile = pendingFile || cachedPendingFile;
  const displayPreviewUrl = previewUrl || cachedPreviewUrl;

  const isForumExpanded =
    isForum &&
    (isInputFocused ||
      isTitleFocused ||
      Boolean(postTitle && postTitle.trim().length > 0) ||
      Boolean(input && input.trim().length > 0) ||
      Boolean(pendingFiles && pendingFiles.length > 0) ||
      Boolean(pendingFile));

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
        className="w-full overflow-hidden transition-all duration-normal ease-in-out"
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
        isHidden={isSuggestionsHidden}
        hasPartialInput={hasPartialInput}
        selectedIndex={safeSuggestionIndex}
        onSelectSuggestion={acceptSuggestion}
        onContextMenuSuggestion={(e, item) => {
          setContextMenu?.({
            type: "quick-suggestion",
            x: e.clientX,
            y: e.clientY,
            title: getReadableSuggestionText(item.displayText),
            data: item,
          });
        }}
      />

      <FloatingFormattingBar
        selection={selection}
        applyFormatting={applyFormatting}
        t={t}
      />

      {/* Replying banner */}
      <div
        className="w-full overflow-hidden transition-all duration-relaxed ease-in-out shrink-0"
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
            server,
          );
          return (
            <div className="onicord-reply-bar !mx-0 !mb-0">
              <div className="flex items-center gap-1.5 truncate text-onicord-muted">
                <span>{t("chat.replyingTo")}</span>
                <div className="h-4 w-4 rounded-full bg-onicord-accent overflow-hidden shrink-0 flex items-center justify-center text-2xs font-bold text-onicord-on-accent">
                  {usuarioCitado.avatar === "bot-star" ||
                  (usuarioCitado.isComplement && !usuarioCitado.avatar) ? (
                    <IconEstrella className="w-2.5 h-2.5 text-onicord-on-accent" />
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
        ref={commandsPopoverRef}
        showCommandsPopup={showCommandsPopup}
        input={input}
        setInput={setInput}
        setShowCommandsPopup={setShowCommandsPopup}
        tyrannyInputRef={tyrannyInputRef}
        serverPlugins={server?.plugins}
        profile={profile}
        peers={peers}
        t={t}
      />

      <MentionsPopover
        ref={mentionsPopoverRef}
        showMentionsPopup={showMentionsPopup}
        input={input}
        setInput={setInput}
        peers={peers}
        profile={profile}
        server={server}
        roles={server?.roles || []}
        setShowMentionsPopup={setShowMentionsPopup}
        tyrannyInputRef={tyrannyInputRef}
        t={t}
      />

      <EmojiAutocompletePopover
        ref={emojiAutocompleteRef}
        emojiQuery={emojiQuery}
        input={input}
        setInput={setInput}
        setEmojiQuery={setEmojiQuery}
        tyrannyInputRef={tyrannyInputRef}
        profile={profile}
        peers={peers}
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
          className={`w-full overflow-hidden transition-all duration-relaxed ease-in-out shrink-0 ${
            (pendingFiles.length > 0 || pendingFile)
              ? "max-h-40 opacity-100 mb-2 pointer-events-auto"
              : "max-h-0 opacity-0 mb-0 pointer-events-none"
          }`}
        >
          {pendingFiles.length > 1 ? (
            <div className="flex items-center gap-2 overflow-x-auto py-1 px-1 minimal-scrollbar bg-black/20 rounded-lg p-1.5 border border-onicord-border">
              {pendingFiles.map((pf, idx) => {
                const isMedia =
                  pf.type?.startsWith("image/") ||
                  pf.type?.startsWith("video/") ||
                  /\.(png|jpe?g|gif|webp|avif|bmp|svg|mp4|webm|mov|mkv|avi)$/i.test(pf.name || "");
                const isNsfw = Boolean(pf.isNsfw);
                return (
                  <div
                    key={idx}
                    className="relative flex items-center gap-2 bg-onicord-base border border-onicord-border-strong rounded-lg p-1.5 shrink-0 pr-7 max-w-[230px] shadow"
                  >
                    <div className="w-10 h-10 rounded bg-black/50 overflow-hidden shrink-0 flex items-center justify-center relative">
                      {pf.previewUrl ? (
                        pf.type?.startsWith("video/") ? (
                          <video
                            src={pf.previewUrl}
                            className={`w-full h-full object-cover transition-all ${
                              isNsfw ? "blur-sm brightness-75" : ""
                            }`}
                          />
                        ) : (
                          <img
                            src={pf.previewUrl}
                            alt="preview"
                            className={`w-full h-full object-cover transition-all ${
                              isNsfw ? "blur-sm brightness-75" : ""
                            }`}
                          />
                        )
                      ) : (
                        <MaterialIcon name="attach_file" size="sm" className="text-onicord-accent" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-onicord-text" title={pf.name}>
                        {pf.name}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <p className="text-2xs text-onicord-muted truncate">{formatBytes(pf.size)}</p>
                        {isMedia && onTogglePendingFileNsfw && (
                          <button
                            type="button"
                            onClick={() => onTogglePendingFileNsfw(idx)}
                            title={
                              channelAllowsNsfw
                                ? t("chat.nsfwMarkTooltip", "Marcar archivo como contenido NSFW (+18)")
                                : t("chat.nsfwNotAllowedInChannel", "Este canal no tiene permitido el envío de contenido NSFW.")
                            }
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-semibold border transition-colors cursor-pointer shrink-0 ${
                              isNsfw
                                ? "bg-onicord-danger/20 text-onicord-danger border-onicord-danger/40"
                                : channelAllowsNsfw
                                  ? "bg-onicord-tint/5 text-onicord-muted border-onicord-border-strong hover:text-onicord-text hover:bg-onicord-hover"
                                  : "bg-onicord-tint/5 text-onicord-muted/50 border-onicord-border"
                            }`}
                          >
                            <MaterialIcon
                              name={isNsfw ? "check_box" : "check_box_outline_blank"}
                              size={11}
                            />
                            <span>{t("chat.nsfwBadge", "NSFW")}</span>
                          </button>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemovePendingFile(idx)}
                      className="w-5 h-5 flex items-center justify-center rounded-full bg-onicord-danger/10 text-onicord-danger hover:bg-onicord-danger hover:text-white transition-colors absolute top-1 right-1"
                      title={t("chat.cancelSend")}
                    >
                      <span className="text-xs font-bold leading-none">✕</span>
                    </button>
                  </div>
                );
              })}
            </div>
          ) : displayPendingFile ? (
            (() => {
              const activeFile = pendingFile || displayPendingFile;
              const isMedia =
                activeFile.type?.startsWith("image/") ||
                activeFile.type?.startsWith("video/") ||
                /\.(png|jpe?g|gif|webp|avif|bmp|svg|mp4|webm|mov|mkv|avi)$/i.test(activeFile.name || "");
              const isNsfw = Boolean(activeFile.isNsfw);
              return (
                <div className="onicord-pending-file-card group/pending relative overflow-hidden bg-onicord-base border border-onicord-border p-2 flex items-center gap-3">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-black/50 overflow-hidden">
                    {displayPreviewUrl ? (
                      displayPendingFile.type?.startsWith("video/") ? (
                        <video
                          src={displayPreviewUrl}
                          className={`w-full h-full object-cover opacity-80 transition-all ${
                            isNsfw ? "blur-sm brightness-75" : ""
                          }`}
                        />
                      ) : (
                        <img
                          src={displayPreviewUrl}
                          alt="preview"
                          className={`w-full h-full object-cover transition-all ${
                            isNsfw ? "blur-sm brightness-75" : ""
                          }`}
                        />
                      )
                    ) : (
                      <MaterialIcon name="attach_file" size="lg" className="text-onicord-accent" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 pr-10">
                    <p className="truncate text-sm font-bold text-onicord-text">
                      {displayPendingFile.name}
                    </p>
                    <p className="text-xs text-onicord-muted">
                      {formatBytes(displayPendingFile.size)}
                    </p>
                    {isMedia && onTogglePendingFileNsfw && (
                      <button
                        type="button"
                        onClick={() => onTogglePendingFileNsfw(0)}
                        title={
                          channelAllowsNsfw
                            ? t("chat.nsfwMarkTooltip", "Marcar archivo como contenido NSFW (+18)")
                            : t("chat.nsfwNotAllowedInChannel", "Este canal no tiene permitido el envío de contenido NSFW.")
                        }
                        className={`mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                          isNsfw
                            ? "bg-onicord-danger/20 text-onicord-danger border-onicord-danger/40"
                            : channelAllowsNsfw
                              ? "bg-onicord-surface/80 text-onicord-muted border-onicord-border-strong hover:text-onicord-text hover:bg-onicord-hover"
                              : "bg-onicord-surface/40 text-onicord-muted/50 border-onicord-border"
                        }`}
                      >
                        <MaterialIcon
                          name={isNsfw ? "check_box" : "check_box_outline_blank"}
                          size={14}
                        />
                        <span>{t("chat.nsfwLabel", "NSFW (+18)")}</span>
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (onClearPendingFiles) {
                        onClearPendingFiles();
                      } else {
                        if (previewUrl) URL.revokeObjectURL(previewUrl);
                        setPreviewUrl?.(null);
                        setPendingFile?.(null);
                      }
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-full bg-onicord-danger/10 text-onicord-danger hover:bg-onicord-danger hover:text-white transition-colors absolute top-2 right-2"
                    title={t("chat.cancelSend")}
                  >
                    <span className="text-sm font-bold leading-none">✕</span>
                  </button>
                </div>
              );
            })()
          ) : null}
        </div>

        <div className="flex items-center gap-2 px-2">
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            onChange={handleFileInputChange}
            disabled={!hasSendMessages}
            multiple
          />
          <Tooltip
            content={hasSendMessages ? t("chat.attachUnlimited") : t("chat.noPermissionShort", "Sin permisos")}
            side="top"
          >
            <button
              type="button"
              onClick={hasSendMessages ? handleAttachFileClick : undefined}
              className={`onicord-chat-toolbar-btn group ${!hasSendMessages ? "opacity-35 cursor-not-allowed pointer-events-none" : ""}`}
              disabled={!hasSendMessages}
            >
              <MaterialIcon name="attach_file" size="xl" />
            </button>
          </Tooltip>

          <div className="relative flex-1 min-w-0 flex flex-col justify-center">
            {/* Forum post title expansion input */}
            {isForum && (
              <div
                className={`w-full overflow-hidden transition-all duration-relaxed ease-out ${
                  isForumExpanded
                    ? "max-h-24 opacity-100 pt-2 mb-0.5 pointer-events-auto"
                    : "max-h-0 opacity-0 py-0 mb-0 pointer-events-none"
                }`}
              >
                <input
                  type="text"
                  value={postTitle}
                  onChange={(e) => setPostTitle?.(e.target.value)}
                  placeholder={t("chat.postTitlePlaceholder", "Título de la publicación...")}
                  onFocus={() => {
                    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
                    setIsTitleFocused(true);
                    setIsInputFocused?.(true);
                  }}
                  onBlur={() => {
                    setIsTitleFocused(false);
                    handleInputBlur();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      tyrannyInputRef.current?.focus();
                    }
                  }}
                  className="w-full bg-transparent text-base sm:text-lg font-bold text-onicord-text placeholder:text-onicord-muted outline-none px-1 py-1"
                />
              </div>
            )}

            {/* Main post body editable area */}
            <div
              contentEditable={hasSendMessages}
              ref={tyrannyInputRef}
              onInput={hasSendMessages ? handleInputChange : undefined}
              onKeyDown={hasSendMessages ? handleContentKeyDown : undefined}
              onPaste={hasSendMessages ? handlePaste : undefined}
              onCopy={hasSendMessages ? handleCopy : undefined}
              onSelect={hasSendMessages ? handleInputSelection : undefined}
              onKeyUp={hasSendMessages ? handleInputSelection : undefined}
              onMouseUp={hasSendMessages ? handleInputSelection : undefined}
              onFocus={hasSendMessages ? handleInputFocus : undefined}
              onBlur={hasSendMessages ? handleInputBlur : undefined}
              placeholder={
                !hasSendMessages
                  ? t("chat.noPermissionPlaceholder", "No tienes permisos para enviar mensajes en este canal")
                  : placeholderOverride
                    ? placeholderOverride
                    : isForum
                      ? isForumExpanded
                        ? t("chat.postBodyPlaceholder", "¿De qué trata tu publicación? Usa #hashtags...")
                        : t("chat.forumPostPlaceholder", "Escribe una nueva publicación...")
                      : pendingFile
                        ? t("chat.commentOnFile", { filename: pendingFile.name, defaultValue: `Comentar en ${pendingFile.name}...` })
                        : (() => {
                          const rawPlaceholder = t("chat.placeholder", {
                            channel: channelName || "general",
                            defaultValue: `Enviar mensaje en #${channelName || "general"}...`,
                          });
                          return rawPlaceholder.replace(/#[\w-]+\.\.\./, () => `#${channelName || "general"}...`);
                        })()
              }
              className={`onicord-chat-input select-text outline-none overflow-x-hidden whitespace-pre-wrap pr-10 focus:outline-none ${
                !hasSendMessages ? "opacity-50 cursor-not-allowed select-none" : ""
              }`}
              style={{
                fontFamily: 'var(--font)',
                fontSize: '15px',
                lineHeight: '20px',
                minHeight: isForum && isForumExpanded ? '32px' : '20px',
                maxHeight: '140px',
                overflowY: 'auto',
                wordBreak: 'break-all',
              }}
            />
          </div>

          {onToggleEphemeralMode && (
            <Tooltip
              content={
                hasSendMessages
                  ? t("chat.ephemeralToggle", "Mensaje efímero (se elimina en 60s)")
                  : t("chat.noPermissionShort", "Sin permisos")
              }
              side="top"
            >
              <button
                type="button"
                onClick={hasSendMessages && !window.__ONICORD_DEMO__ ? onToggleEphemeralMode : undefined}
                className={`onicord-chat-toolbar-btn group relative ${
                  !hasSendMessages
                    ? "opacity-35 cursor-not-allowed pointer-events-none"
                    : isEphemeralMode
                      ? "!border-onicord-warning/50 bg-onicord-warning/15 !text-onicord-warning"
                      : ""
                }`}
                disabled={!hasSendMessages}
              >
                <MaterialIcon name="timer" size="xl" />
              </button>
            </Tooltip>
          )}

          <Tooltip
            content={hasSendMessages ? t("chat.emoji", "Emoji") : t("chat.noPermissionShort", "Sin permisos")}
            side="top"
          >
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
                  const rect = stickerButtonRef?.current ? stickerButtonRef.current.getBoundingClientRect() : e.currentTarget.getBoundingClientRect();
                  setEmojisTargetRect(rect);
                }
              } : undefined}
              className={`onicord-chat-toolbar-btn group ${!hasSendMessages ? "opacity-35 cursor-not-allowed pointer-events-none" : ""}`}
              disabled={!hasSendMessages}
            >
              <MaterialIcon name="sentiment_satisfied" size="xl" />
            </button>
          </Tooltip>

          {/* Sticker picker button (hidden on root forum post, shown in threads and regular text channels) */}
          {!isForum && (
            <Tooltip
              content={hasSendMessages ? t("chat.sendSticker") : t("chat.noPermissionShort", "Sin permisos")}
              side="top"
            >
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
              >
                <MaterialIcon name="sticker" size="xl" />
              </button>
            </Tooltip>
          )}
        </div>
      </form>
    </div>
  );
}
