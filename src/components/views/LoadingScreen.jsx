import { useState } from "react";
import { useTranslation } from "react-i18next";
import OnicordWordmarkAnimated from "../icons/OnicordWordmarkAnimated";

export default function LoadingScreen() {
  const { t } = useTranslation();

  const LOADING_TIPS = [
    t("loadingScreen.tip1"),
    t("loadingScreen.tip2"),
    t("loadingScreen.tip3"),
    t("loadingScreen.tip4"),
    t("loadingScreen.tip5"),
    t("loadingScreen.tip6"),
    t("loadingScreen.tip7"),
    t("loadingScreen.tip8"),
    t("loadingScreen.tip9"),
    t("loadingScreen.tip10")
  ];

  const [currentTip] = useState(() => {
    const randomIndex = Math.floor(Math.random() * LOADING_TIPS.length);
    return LOADING_TIPS[randomIndex];
  });

  return (
    <div className="flex h-full w-full select-none flex-col items-center justify-center bg-onicord-base animate-fade-in overflow-hidden relative">
      <div className="flex flex-col items-center gap-6 max-w-[480px] w-full px-6">
        <div className="w-full flex items-center justify-center py-3">
          <OnicordWordmarkAnimated className="w-full max-w-[400px]" />
        </div>

        <div className="flex flex-col items-center gap-2 text-center onicord-loading-delayed-info">
          <p className="text-[13px] text-onicord-subtext font-medium leading-relaxed tracking-wide">
            {currentTip}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-onicord-accent animate-pulse [animation-duration:1.5s]">
            {t("roomView.loadingServer")}
          </p>
        </div>
      </div>
    </div>
  );
}
