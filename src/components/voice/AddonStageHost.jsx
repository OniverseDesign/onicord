import React, { lazy, Suspense } from "react";
const AddonStageDisplay = lazy(() => import("./AddonStageDisplay"));

export default function AddonStageHost({
  activeStage,
  onCloseStage,
  isStageFloating,
  isStageFullscreen,
  setIsStageFloating,
  setIsStageFullscreen,
  onShareToChat,
}) {
  if (!activeStage || (!activeStage.url && !activeStage.htmlContent)) {
    return null;
  }

  const isMini = isStageFloating && !isStageFullscreen;
  const isFullscreen = isStageFullscreen;

  const handleClose = () => {
    if (isFullscreen) {
      setIsStageFullscreen(false);
      window.electronAPI?.setFullscreen?.(false);
    }
    onCloseStage?.();
  };

  const handleToggleFullscreen = () => {
    if (isFullscreen) {
      setIsStageFullscreen(false);
      window.electronAPI?.setFullscreen?.(false);
    } else {
      setIsStageFloating(false);
      setIsStageFullscreen(true);
      window.electronAPI?.setFullscreen?.(true);
    }
  };

  const handleToggleSize = () => {
    if (isFullscreen) {
      setIsStageFullscreen(false);
      window.electronAPI?.setFullscreen?.(false);
      setIsStageFloating(true);
    } else {
      setIsStageFloating((prev) => !prev);
    }
  };

  return (
    <Suspense fallback={null}>
      <AddonStageDisplay
        stageData={activeStage}
        onClose={handleClose}
        isMini={isMini}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        onToggleSize={handleToggleSize}
        onShareToChat={onShareToChat}
      />
    </Suspense>
  );
}
