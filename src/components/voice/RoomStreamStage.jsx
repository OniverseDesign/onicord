import React from "react";
import { useTranslation } from "react-i18next";
import StreamDisplay, { MultiStreamDisplay } from "./StreamDisplay";

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
  isMultiStreamMode = false,
  multiStreamEntries = [],
  activeMultiAudioPeerId = null,
  onSelectMultiAudioPeer,
  onCloseMultiStream,
  localStreamMode = "screen",
  isLocalWebcamActive = false,
  isWebcamBusy = false,
  webcamPosition = "bottom-right",
  webcamMirror = true,
  onToggleLocalWebcam = null,
  onChangeWebcamPosition = null,
  onToggleWebcamMirror = null,
}) {
  const { t } = useTranslation();

  const isMini = isStreamFloating && !isStreamFullscreen;
  const isFullscreen = isStreamFullscreen;

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

  if (isMultiStreamMode && multiStreamEntries.length > 0) {
    const handleStopWatchingMulti = () => {
      if (isFullscreen) {
        setIsStreamFullscreen(false);
        window.electronAPI?.setFullscreen?.(false);
      }
      setIsStreamFloating(false);
      onCloseMultiStream?.();
    };

    return (
      <MultiStreamDisplay
        streams={multiStreamEntries}
        activeAudioId={activeMultiAudioPeerId}
        onSelectAudio={onSelectMultiAudioPeer}
        onStopWatching={handleStopWatchingMulti}
        isMini={isMini}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        onToggleSize={handleToggleSize}
      />
    );
  }

  const hasStream = Boolean(localStream || remoteStream);
  if (!hasStream) return null;

  const currentStream = activeStreamUserId ? remoteStream : (remoteStream || localStream);
  const isLocal = !activeStreamUserId && !remoteStream;
  const streamAuthorName = !isLocal
    ? voiceMembersDisplay.find((m) => m.peerId === activeStreamUserId)?.nickname
    : t("common.you");

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
      localStreamMode={localStreamMode}
      isLocalWebcamActive={isLocalWebcamActive}
      isWebcamBusy={isWebcamBusy}
      webcamPosition={webcamPosition}
      webcamMirror={webcamMirror}
      onToggleLocalWebcam={isLocal ? onToggleLocalWebcam : null}
      onChangeWebcamPosition={isLocal ? onChangeWebcamPosition : null}
      onToggleWebcamMirror={isLocal ? onToggleWebcamMirror : null}
    />
  );
}
