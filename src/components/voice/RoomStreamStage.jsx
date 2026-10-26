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

  const currentStream = activeStreamUserId ? remoteStream : localStream;
  const streamAuthorName = remoteStream
    ? voiceMembersDisplay.find((m) => m.peerId === activeStreamUserId)?.nickname
    : t("common.you");

  const handleStopStream = () => {
    if (remoteStream) {
      onResetRemoteStream?.();
    } else {
      onStopScreenShare?.();
      window.electronAPI?.voice?.setStreaming?.(false);
    }
  };

  return (
    <>
      {/* 1. Inline Stage: rendered inside RoomView main central column */}
      {!isStreamFloating && !isStreamFullscreen && (
        <StreamDisplay
          localStream={currentStream}
          isLocal={!activeStreamUserId}
          streamAuthorName={streamAuthorName}
          onStopStream={handleStopStream}
          isFullscreen={false}
          onToggleFullscreen={() => {
            setIsStreamFullscreen(true);
            window.electronAPI?.setFullscreen?.(true);
          }}
          onToggleSize={() => setIsStreamFloating(true)}
        />
      )}

      {/* 2. Floating Stage (PiP) */}
      {isStreamFloating && !isStreamFullscreen && (
        <StreamDisplay
          localStream={remoteStream || localStream}
          streamAuthorName={streamAuthorName}
          onStopStream={handleStopStream}
          isMini={true}
          isLocal={!remoteStream}
          isFullscreen={false}
          onToggleFullscreen={() => {
            setIsStreamFloating(false);
            setIsStreamFullscreen(true);
            window.electronAPI?.setFullscreen?.(true);
          }}
          onToggleSize={() => setIsStreamFloating(false)}
        />
      )}

      {/* 3. Fullscreen Layer */}
      {isStreamFullscreen && (
        <div className="fixed inset-0 z-[999999] w-screen h-screen bg-black flex items-center justify-center select-none">
          <StreamDisplay
            localStream={currentStream}
            isLocal={!activeStreamUserId}
            streamAuthorName={streamAuthorName}
            onStopStream={() => {
              setIsStreamFullscreen(false);
              window.electronAPI?.setFullscreen?.(false);
              handleStopStream();
            }}
            isFullscreen={true}
            onToggleFullscreen={() => {
              setIsStreamFullscreen(false);
              window.electronAPI?.setFullscreen?.(false);
            }}
            onToggleSize={() => {
              setIsStreamFullscreen(false);
              window.electronAPI?.setFullscreen?.(false);
              setIsStreamFloating(true);
            }}
          />
        </div>
      )}
    </>
  );
}
