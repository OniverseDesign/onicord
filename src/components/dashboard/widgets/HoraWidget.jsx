import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

export default function HoraWidget({ setCustomBackground }) {
  const { t, i18n } = useTranslation();
  const [tiempo, setTiempo] = useState(new Date());

  useEffect(() => {
    if (setCustomBackground) {
      setCustomBackground({
        type: "color",
        value: "var(--onicord-pink)", // Mapea directo a tu paleta Mocha V2
      });
    }
  }, [setCustomBackground]);

  useEffect(() => {
    const selectorReloj = setInterval(() => {
      setTiempo(new Date());
    }, 1000);

    return () => clearInterval(selectorReloj);
  }, []);

  const horaFormateada = tiempo.toLocaleTimeString(i18n.language || "es", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const fechaFormateada = tiempo.toLocaleDateString(i18n.language || "es", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div
      style={{ containerType: "inline-size" }}
      className="onicord-widget-shell w-full h-full p-6 flex flex-col justify-between select-none"
    >
      {}
      <div className="onicord-widget-header flex justify-between items-center w-full gap-2 mb-2 shrink-0">
        <h3
          style={{ fontSize: "clamp(0.6rem, 3.5cqi, 0.8rem)" }}
          className="onicord-widget-title font-bold text-onicord-dark/90 truncate"
        >
          {t("widgets.clock.title", "Local Time")}
        </h3>
        <span
          style={{ fontSize: "clamp(0.6rem, 3cqi, 0.5rem)" }}
          className="onicord-widget-badge-fixed shrink-0 px-2 py-0.5 font-medium"
        >
          {t("widgets.clock.badge", "Clock")}
        </span>
      </div>

      {}
      <div className="my-auto py-1 flex items-center justify-center grow w-full overflow-hidden">
        <p
          style={{ fontSize: "clamp(1.6rem, 23cqi, 6rem)" }}
          className="font-black font-mono tracking-tight text-onicord-dark leading-none text-center"
        >
          {horaFormateada}
        </p>
      </div>

      {}
      <div className="w-full shrink-0 pt-1.5 border-t border-black/5 mt-2">
        <p
          style={{ fontSize: "clamp(0.6rem, 3.5cqi, 0.75rem)" }}
          className="font-medium text-onicord-dark/60 truncate capitalize tracking-wide"
        >
          {fechaFormateada}
        </p>
      </div>
    </div>
  );
}

HoraWidget.widgetId = "hora";
HoraWidget.badgeText = "Clock";
HoraWidget.bgVariant = "pink"; 
HoraWidget.defaultGeo = { x: 3, y: 4, w: 2, h: 3 };
HoraWidget.minW = 2;
HoraWidget.minH = 2;
