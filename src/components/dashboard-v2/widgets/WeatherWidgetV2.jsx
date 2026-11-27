import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import MaterialIcon from "../../icons/MaterialIcon";
import Tooltip from "../../ui/Tooltip";
import { useWidgetLayout } from "../WidgetLayoutContext";
import WidgetShell from "../primitives/WidgetShell";
import SplineSparkline from "../primitives/SplineSparkline";
import TrackBarChart from "../primitives/TrackBarChart";

const WEATHER_CODES = {
  0: { icon: "wb_sunny", text: "Despejado" },
  1: { icon: "wb_sunny", text: "Mayormente despejado" },
  2: { icon: "partly_cloudy_day", text: "Parcialmente nublado" },
  3: { icon: "cloud", text: "Nublado" },
  45: { icon: "foggy", text: "Niebla" },
  48: { icon: "foggy", text: "Niebla" },
  51: { icon: "rainy", text: "Llovizna" },
  53: { icon: "rainy", text: "Llovizna moderada" },
  55: { icon: "rainy", text: "Llovizna intensa" },
  61: { icon: "rainy", text: "Lluvia" },
  63: { icon: "rainy", text: "Lluvia moderada" },
  65: { icon: "rainy", text: "Lluvia intensa" },
  71: { icon: "ac_unit", text: "Nieve" },
  73: { icon: "ac_unit", text: "Nieve moderada" },
  75: { icon: "ac_unit", text: "Nieve intensa" },
  80: { icon: "rainy", text: "Chaparrones" },
  81: { icon: "rainy", text: "Chaparrones fuertes" },
  82: { icon: "thunderstorm", text: "Tormenta" },
  95: { icon: "thunderstorm", text: "Tormenta eléctrica" },
};

const DEFAULT_CITY = {
  name: "Mendoza",
  country: "Argentina",
  latitude: -32.8895,
  longitude: -68.8458,
};

function extractHourlySlice(hourly) {
  if (!hourly?.time || !hourly?.temperature_2m) return [];
  const nowMs = Date.now();
  const result = [];
  for (let i = 0; i < hourly.time.length; i++) {
    const tMs = new Date(hourly.time[i]).getTime();
    if (tMs >= nowMs - 30 * 60 * 1000 && result.length < 8) {
      const hourLabel = hourly.time[i].slice(11, 13) + "h";
      result.push({
        id: hourly.time[i],
        label: hourLabel,
        value: Math.round(hourly.temperature_2m[i]),
        code: hourly.weather_code?.[i] ?? 0,
      });
    }
  }
  return result;
}

export default function WeatherWidgetV2() {
  const { t, i18n } = useTranslation();
  const { sizeMode } = useWidgetLayout();
  const [weather, setWeather] = useState(null);
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const debounceRef = useRef(null);
  const compactBodyRef = useRef(null);
  const compactIconRef = useRef(null);
  const compactTextRef = useRef(null);

  const loadWeather = async (cityData) => {
    try {
      const data = await window.electronAPI?.loadForecast?.(
        cityData.latitude,
        cityData.longitude
      );
      if (!data?.current) {
        throw new Error("Forecast unavailable");
      }

      try {
        localStorage.setItem("weather-city", JSON.stringify(cityData));
      } catch {}

      setWeather({
        city: cityData.name,
        country: cityData.country || cityData.countryCode || "",
        temperature: Math.round(data.current.temperature_2m),
        apparent:
          data.current.apparent_temperature !== undefined
            ? Math.round(data.current.apparent_temperature)
            : null,
        humidity: data.current.relative_humidity_2m,
        wind: Math.round(data.current.wind_speed_10m),
        weatherCode: data.current.weather_code,
        tempMin:
          data.daily?.temperature_2m_min?.[0] !== undefined
            ? Math.round(data.daily.temperature_2m_min[0])
            : null,
        tempMax:
          data.daily?.temperature_2m_max?.[0] !== undefined
            ? Math.round(data.daily.temperature_2m_max[0])
            : null,
        hourly: extractHourlySlice(data.hourly),
      });
      setEditing(false);
      setSuggestions([]);
    } catch {
      setWeather({
        city: cityData.name || DEFAULT_CITY.name,
        country: cityData.country || DEFAULT_CITY.country,
        temperature: 18,
        apparent: 18,
        humidity: 45,
        wind: 12,
        weatherCode: 0,
        tempMin: 12,
        tempMax: 24,
        hourly: [
          { id: 1, label: "12h", value: 18 },
          { id: 2, label: "15h", value: 22 },
          { id: 3, label: "18h", value: 21 },
          { id: 4, label: "21h", value: 17 },
          { id: 5, label: "00h", value: 14 },
          { id: 6, label: "03h", value: 13 },
        ],
      });
    }
  };

  useEffect(() => {
    try {
      const saved = localStorage.getItem("weather-city");
      if (saved) {
        loadWeather(JSON.parse(saved));
        return;
      }
    } catch {}
    loadWeather(DEFAULT_CITY);
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!editing || !search || search.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await window.electronAPI?.searchCities?.(search);
        setSuggestions(res?.results || []);
      } catch {
        setSuggestions([]);
      }
    }, 280);
    return () => clearTimeout(debounceRef.current);
  }, [search, editing]);

  const codeInfo = WEATHER_CODES[weather?.weatherCode] || { icon: "cloud", text: "Despejado" };
  const conditionText = t(
    "widgets.weather.codes." + (weather?.weatherCode ?? "nodata"),
    codeInfo.text
  );

  useLayoutEffect(() => {
    if (sizeMode !== "compact" || editing) return;
    const body = compactBodyRef.current;
    const textEl = compactTextRef.current;
    const iconEl = compactIconRef.current;
    if (!body || !textEl || !iconEl) return;

    const fitCompactLayout = () => {
      const availW = body.clientWidth;
      const availH = body.clientHeight;
      if (availW <= 0 || availH <= 0) return;

      let iconPx = Math.round(Math.max(22, Math.min(availW * 0.24, availH * 0.36, 68)));
      iconEl.style.fontSize = `${iconPx}px`;

      const minFont = 11;
      const maxFont = Math.max(14, Math.min(48, Math.round(Math.min(availW * 0.14, availH * 0.32))));
      let lo = minFont;
      let hi = maxFont;
      let best = minFont;

      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        textEl.style.fontSize = `${mid}px`;
        const fits =
          body.scrollHeight <= body.clientHeight + 1 &&
          textEl.scrollWidth <= body.clientWidth + 1;
        if (fits) {
          best = mid;
          lo = mid;
        } else {
          hi = mid;
        }
      }

      textEl.style.fontSize = `${Math.floor(best * 10) / 10}px`;

      if (body.scrollHeight > body.clientHeight + 1) {
        iconPx = Math.max(18, Math.round(iconPx * 0.7));
        iconEl.style.fontSize = `${iconPx}px`;
      }
    };

    fitCompactLayout();
    const obs = new ResizeObserver(fitCompactLayout);
    obs.observe(body);
    return () => obs.disconnect();
  }, [sizeMode, editing, weather?.temperature, weather?.city, conditionText, i18n.language]);

  const searchButton = (
    <Tooltip content={t("common.search", "Buscar ciudad")} side="bottom">
      <button
        type="button"
        onClick={() => {
          setEditing((v) => !v);
          setSearch("");
          setSuggestions([]);
        }}
        className="bento-v2-pill-icon cursor-pointer active:scale-90"
      >
        <MaterialIcon name={editing ? "close" : "search"} size={15} />
      </button>
    </Tooltip>
  );

  if (editing) {
    return (
      <WidgetShell title={t("widgets.weather.title", "Local Weather")} headerRight={searchButton}>
        <div className="flex-1 flex flex-col min-h-0 gap-2" data-no-drag="true">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("widgets.weather.searchCity", "Search city...")}
            className="w-full rounded-onicord-button px-3 py-1.5 text-xs font-semibold bento-v2-ink-pill outline-none placeholder:opacity-50"
          />
          <div className="flex-1 min-h-0 overflow-y-auto bento-v2-no-scrollbar space-y-1">
            {suggestions.map((city) => (
              <button
                key={`${city.latitude}-${city.longitude}`}
                type="button"
                onClick={() => loadWeather(city)}
                className="w-full text-left px-2.5 py-1.5 rounded-onicord-button bento-v2-ink-pill transition-colors cursor-pointer"
              >
                <p className="text-xs font-bold truncate">{city.name}</p>
                <p className="text-2xs bento-v2-ink-muted truncate">
                  {city.admin1 ? `${city.admin1}, ` : ""}
                  {city.countryCode || city.country}
                </p>
              </button>
            ))}
          </div>
        </div>
      </WidgetShell>
    );
  }

  // MICRO / PILLAR: minimal expressive badge (Ref 7: 22° Tokyo)
  if (sizeMode === "micro" || sizeMode === "pillar") {
    return (
      <WidgetShell headerRight={sizeMode === "pillar" ? searchButton : null}>
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-1 min-h-0">
          <MaterialIcon
            name={codeInfo.icon}
            weight={250}
            style={{ fontSize: "clamp(1.8rem, 22cqmin, 3.6rem)", lineHeight: 1 }}
          />
          <span
            style={{ fontSize: "clamp(1.75rem, 28cqmin, 4.2rem)" }}
            className="bento-v2-display-hero"
          >
            {weather?.temperature ?? "--"}°
          </span>
          <span className="text-xs font-bold truncate max-w-full">
            {weather?.city || "--"}
          </span>
          {sizeMode === "pillar" && (
            <span className="text-2xs bento-v2-ink-muted truncate max-w-full">
              {conditionText}
            </span>
          )}
        </div>
      </WidgetShell>
    );
  }

  // COMPACT: Editorial phrase card (inspired by Ref 9 "It's 3° now in Tokyo...")
  if (sizeMode === "compact") {
    return (
      <WidgetShell
        headerRight={
          <>
            {weather?.tempMin != null && weather?.tempMax != null && (
              <span className="bento-v2-pill font-mono">
                {weather.tempMin}° / {weather.tempMax}°
              </span>
            )}
            {searchButton}
          </>
        }
        footer={
          <div className="flex items-center justify-between text-2xs font-mono font-bold bento-v2-ink-muted">
            <span className="flex items-center gap-1">
              <MaterialIcon name="humidity_percentage" size={12} />
              {weather?.humidity ?? "--"}%
            </span>
            <span className="flex items-center gap-1">
              <MaterialIcon name="air" size={12} />
              {weather?.wind ?? "--"} km/h
            </span>
          </div>
        }
      >
        <div
          ref={compactBodyRef}
          className="flex-1 flex flex-col items-start justify-between gap-1.5 min-h-0 overflow-hidden py-0.5 text-left"
        >
          <span
            ref={compactIconRef}
            className="inline-flex items-center shrink-0 self-start"
            style={{ fontSize: "40px", lineHeight: 1 }}
          >
            <MaterialIcon
              name={codeInfo.icon}
              weight={220}
              style={{ fontSize: "1em", lineHeight: 1 }}
            />
          </span>

          <p
            ref={compactTextRef}
            style={{ fontSize: "20px", lineHeight: 1.08 }}
            className="font-bold tracking-tight w-full text-left"
          >
            <span className="bento-v2-ink-muted font-semibold">
              {t("widgets.weather.nowPrefix", "Now")}{" "}
            </span>
            <span className="bento-v2-display-hero" style={{ fontSize: "1.08em" }}>
              {weather?.temperature ?? "--"}°
            </span>
            <span className="bento-v2-ink-muted font-semibold">
              {" "}{t("widgets.weather.inCity", "in")}{" "}
            </span>
            <span>{weather?.city}</span>
            <span className="bento-v2-ink-muted font-semibold">. {conditionText}.</span>
          </p>
        </div>
      </WidgetShell>
    );
  }

  // STRIP: horizontal hero + hourly spline
  if (sizeMode === "strip") {
    return (
      <WidgetShell
        title={`${weather?.city || "--"} · ${conditionText}`}
        headerRight={searchButton}
      >
        <div className="flex-1 flex items-center gap-4 min-h-0">
          <div className="flex items-center gap-2.5 shrink-0">
            <MaterialIcon
              name={codeInfo.icon}
              weight={250}
              style={{ fontSize: "clamp(1.8rem, 24cqmin, 3rem)", lineHeight: 1 }}
            />
            <span
              style={{ fontSize: "clamp(1.8rem, 32cqmin, 3.6rem)" }}
              className="bento-v2-display-hero"
            >
              {weather?.temperature ?? "--"}°
            </span>
          </div>

          <div className="flex-1 h-full min-w-0 py-1">
            <SplineSparkline
              data={weather?.hourly || []}
              formatValue={(v) => `${v}°`}
            />
          </div>

          <div className="flex flex-col items-end gap-1 shrink-0 text-2xs font-mono font-bold bento-v2-ink-muted">
            <span>{weather?.humidity ?? "--"}% {t("widgets.weather.humidityShort", "HUM")}</span>
            <span>{weather?.wind ?? "--"} km/h</span>
          </div>
        </div>
      </WidgetShell>
    );
  }

  // STANDARD / EXPANDED: Hero + Hourly forecast chart + metrics
  return (
    <WidgetShell
      title={weather?.city ? `${weather.city}` : t("widgets.weather.title", "Local Weather")}
      headerRight={
        <>
          {weather?.tempMin != null && weather?.tempMax != null && (
            <span className="bento-v2-pill font-mono">
              ↓{weather.tempMin}° ↑{weather.tempMax}°
            </span>
          )}
          {searchButton}
        </>
      }
      footer={
        <div className="flex items-center justify-between text-2xs font-mono font-bold bento-v2-ink-muted">
          <span className="truncate uppercase">{conditionText}</span>
          <div className="flex items-center gap-3 shrink-0">
            <span className="flex items-center gap-1">
              <MaterialIcon name="humidity_percentage" size={12} />
              {weather?.humidity ?? "--"}%
            </span>
            <span className="flex items-center gap-1">
              <MaterialIcon name="air" size={12} />
              {weather?.wind ?? "--"} km/h
            </span>
          </div>
        </div>
      }
    >
      <div className="flex-1 flex flex-col justify-between gap-2 min-h-0">
        <div className="flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-baseline gap-2.5 min-w-0">
            <span
              style={{ fontSize: "clamp(3.2rem, min(28cqw, 36cqh), 7.5rem)" }}
              className="bento-v2-display-hero"
            >
              {weather?.temperature ?? "--"}°
            </span>
            {weather?.apparent != null && (
              <span
                style={{ fontSize: "clamp(0.75rem, 4.5cqmin, 1rem)" }}
                className="font-mono font-bold bento-v2-ink-muted truncate"
              >
                {t("widgets.weather.feelsLikeShort", "FL {{temp}}°", { temp: weather.apparent })}
              </span>
            )}
          </div>
          <MaterialIcon
            name={codeInfo.icon}
            weight={200}
            style={{ fontSize: "clamp(2.4rem, 18cqmin, 4.2rem)", lineHeight: 1 }}
            className="shrink-0 opacity-90"
          />
        </div>

        {weather?.hourly && weather.hourly.length > 1 && (
          <div className="flex-1 max-h-[52%] min-h-[60px] pt-1">
            {sizeMode === "expanded" ? (
              <TrackBarChart
                data={weather.hourly}
                formatValue={(v) => `${v}°`}
                minBarPct={18}
              />
            ) : (
              <SplineSparkline
                data={weather.hourly}
                formatValue={(v) => `${v}°`}
              />
            )}
          </div>
        )}
      </div>
    </WidgetShell>
  );
}
