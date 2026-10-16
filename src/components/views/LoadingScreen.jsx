import { useState } from "react";
import { useTranslation } from "react-i18next";
import Logo from "../icons/Logo.svg?react";

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
    <div className="flex h-full w-full select-none flex-col items-center justify-center bg-onicord-base animate-fade-in">
      <div className="flex flex-col items-center gap-3 max-w-[450px] px-6">
        <div className="onicord-loading-container onicord-bounce-logo h-20 w-20 text-onicord-accent drop-shadow-onicord-text">
          <Logo className="w-full h-full" />
        </div>

        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-[13px] text-onicord-subtext font-medium leading-relaxed tracking-wide animate-fade-in [animation-duration:0.4s]">
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
