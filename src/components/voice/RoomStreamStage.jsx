import React from "react";
import { useTranslation } from "react-i18next";
import StreamDisplay from "./StreamDisplay";

export default function RoomStreamStage({
  localStream,
  remoteStream,
  activeStreamUserId,
  isStreamFloating,
  isStreamFullscreen,
  setIsStreamFloating,
  setIsStreamFullscreen,
  voiceMembersDisplay = [],
  onStopScreenShare,
  onResetRemoteStream,
}) {
  const { t } = useTranslation();

  const hasStream = Boolean(localStream || remoteStream);
  if (!hasStream) return null;

  const currentStream = activeStreamUserId ? remoteStream : (remoteStream || localStream);
  const isLocal = !activeStreamUserId && !remoteStream;
  const streamAuthorName = !isLocal
    ? voiceMembersDisplay.find((m) => m.peerId === activeStreamUserId)?.nickname
    : t("common.you");

  const isMini = isStreamFloating && !isStreamFullscreen;
  const isFullscreen = isStreamFullscreen;

  const handleStopStream = () => {
    if (isFullscreen) {
      setIsStreamFullscreen(false);
      window.electronAPI?.setFullscreen?.(false);
    }
    if (remoteStream) {
      onResetRemoteStream?.();
    } else {
      onStopScreenShare?.();
      window.electronAPI?.setStreaming?.(false);
    }
  };

  const handleToggleFullscreen = () => {
    if (isFullscreen) {
      setIsStreamFullscreen(false);
      window.electronAPI?.setFullscreen?.(false);
    } else {
      setIsStreamFloating(false);
      setIsStreamFullscreen(true);
      window.electronAPI?.setFullscreen?.(true);
    }
  };

  const handleToggleSize = () => {
    if (isFullscreen) {
      setIsStreamFullscreen(false);
      window.electronAPI?.setFullscreen?.(false);
      setIsStreamFloating(true);
    } else {
      setIsStreamFloating((prev) => !prev);
    }
  };

  return (
    <StreamDisplay
      localStream={currentStream}
      isLocal={isLocal}
      streamAuthorName={streamAuthorName}
      onStopStream={handleStopStream}
      isMini={isMini}
      isFullscreen={isFullscreen}
      onToggleFullscreen={handleToggleFullscreen}
      onToggleSize={handleToggleSize}
    />
  );
}
