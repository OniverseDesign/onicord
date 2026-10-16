import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";

import {
  IconSunny,
  IconCloudy,
  IconRainy,
  IconThunderstorm,
  IconFoggy,
  IconSnowing,
  IconSearch,
  IconAir,
  IconHumidity,
} from "../../icons/StreamIcons";

const weatherDescriptions = {
  0: { icon: "sunny", text: "Despejado" },
  1: { icon: "sunny", text: "Mayormente despejado" },
  2: { icon: "cloudy", text: "Parcialmente nublado" },
  3: { icon: "cloudy", text: "Nublado" },

  45: { icon: "foggy", text: "Niebla" },
  48: { icon: "foggy", text: "Niebla" },

  51: { icon: "rainy", text: "Llovizna" },
  53: { icon: "rainy", text: "Llovizna moderada" },
  55: { icon: "rainy", text: "Llovizna intensa" },

  61: { icon: "rainy", text: "Lluvia" },
  63: { icon: "rainy", text: "Lluvia moderada" },
  65: { icon: "rainy", text: "Lluvia intensa" },

  71: { icon: "snow", text: "Nieve" },
  73: { icon: "snow", text: "Nieve moderada" },
  75: { icon: "snow", text: "Nieve intensa" },

  80: { icon: "rainy", text: "Chaparrones" },
  81: { icon: "rainy", text: "Chaparrones fuertes" },

  82: { icon: "storm", text: "Tormenta" },
  95: { icon: "storm", text: "Thunderstorm" },
};

export default function WeatherWidget() {
  const { t } = useTranslation();
  const [weather, setWeather] = useState(null);

  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState([]);

  const debounceRef = useRef();

  const getWeatherIcon = (type) => {
    switch (type) {
      case "sunny":
        return IconSunny;
      case "cloudy":
        return IconCloudy;
      case "rainy":
        return IconRainy;
      case "storm":
        return IconThunderstorm;
      case "foggy":
        return IconFoggy;
      case "snow":
        return IconSnowing;
      default:
        return IconCloudy;
    }
  };

  const loadWeather = async (cityData) => {
    try {
      const { latitude, longitude } = cityData;

      const weatherData = await window.electronAPI.loadForecast(
        latitude,
        longitude,
      );

      if (!weatherData || !weatherData.current) {
        throw new Error("Handler ausente o sin conexión de red");
      }

      localStorage.setItem("weather-city", JSON.stringify(cityData));

      setWeather({
        city: cityData.name,
        country: cityData.country,
        temperature: Math.round(weatherData.current.temperature_2m),
        humidity: weatherData.current.relative_humidity_2m,
        wind: Math.round(weatherData.current.wind_speed_10m),
        weatherCode: weatherData.current.weather_code,
      });

      setEditing(false);
      setSuggestions([]);
    } catch (error) {
      console.warn("[Onicord Clima] Modo de contingencia activado:", error);

      setWeather({
        city: cityData.name || "Mendoza",
        country: cityData.country || "Argentina",
        temperature: 18,
        humidity: 45,
        wind: 12,
        weatherCode: 0, 
      });
    }
  };

  const searchCities = async (query) => {
    if (!query || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    try {
      const geoData = await window.electronAPI.searchCities(query);

      if (geoData && geoData.results) {
        setSuggestions(geoData.results || []);
      } else {
        setSuggestions([]);
      }
    } catch (error) {
      console.error("Error buscando ciudades:", error);
      setSuggestions([]);
    }
  };

  useEffect(() => {
    const savedCity = localStorage.getItem("weather-city");

    if (savedCity) {
      loadWeather(JSON.parse(savedCity));
      return;
    }

    loadWeather({
      name: "Mendoza",
      country: "Argentina",
      latitude: -32.8895,
      longitude: -68.8458,
    });
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      searchCities(search);
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [search]);

  const weatherInfo = weatherDescriptions[weather?.weatherCode] || {
    icon: "cloudy",
    text: "No data",
  };

  const WeatherIcon = getWeatherIcon(weatherInfo.icon);

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
          {t("widgets.weather.title", "Local Weather")}
        </h3>
        <span
          style={{ fontSize: "clamp(0.6rem, 3cqi, 0.5rem)" }}
          className="onicord-widget-badge-fixed shrink-0 px-2 py-0.5 font-medium"
        >
          Open Meteo
        </span>
      </div>

      {editing ? (
        <div className="flex-1 flex flex-col justify-center min-h-0">
          <div className="flex gap-2 items-center">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("common.search")}
              style={{ fontSize: "clamp(0.65rem, 3cqi, 0.85rem)" }}
              className="flex-1 bg-black/5 border border-black/10 rounded-lg px-3 py-2 outline-none text-onicord-dark font-medium placeholder:text-onicord-dark-muted"
            />
            {}
            <button
              onClick={() => {
                setEditing(false);
                setSuggestions([]);
              }}
              style={{ fontSize: "clamp(0.65rem, 3cqi, 0.85rem)" }}
              className="p-2 text-onicord-dark-muted hover:text-onicord-dark font-bold transition"
            >
              ✕
            </button>
          </div>

          {suggestions.length > 0 && (
            <div className="mt-2 rounded-lg overflow-y-auto border border-black/10 bg-black/5 max-h-[40cqi]">
              {suggestions.map((city) => (
                <button
                  key={`${city.latitude}-${city.longitude}`}
                  onClick={() => loadWeather(city)}
                  className="w-full text-left px-3 py-2 hover:bg-black/10 transition"
                >
                  <div
                    style={{ fontSize: "clamp(0.65rem, 3cqi, 0.8rem)" }}
                    className="font-bold text-onicord-dark truncate"
                  >
                    {city.name}
                  </div>
                  <div
                    style={{ fontSize: "clamp(0.55rem, 2.5cqi, 0.7rem)" }}
                    className="text-onicord-dark-muted truncate"
                  >
                    {city.countryCode || city.country}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {}
          <div className="flex-1 min-h-0 flex flex-col @md:flex-row justify-center items-center @md:justify-evenly overflow-hidden my-auto w-full gap-y-2 @md:gap-x-4 py-2">
            {}
            <div className="flex items-center justify-center shrink-0 transition-all duration-500 ease-out">
              <WeatherIcon
                weight={200}
                className="text-onicord-dark animate-pulse"
                style={{
                  fontSize: "clamp(2.8rem, 16cqi, 5.2rem)",
                  lineHeight: 1,
                }}
              />
            </div>

            {}
            <div className="flex flex-col items-center @md:items-start text-center @md:text-left min-w-0 justify-center">
              {}
              <div
                style={{ fontSize: "clamp(1.75rem, 14cqi, 4rem)" }}
                className="onicord-widget-hero-text text-onicord-dark font-mono"
              >
                {weather?.temperature ?? "--"}°
              </div>

              {}
              <div className="mt-1 min-w-0 flex flex-col items-center @md:items-start">
                {}
                <div
                  style={{ fontSize: "clamp(0.7rem, 3.5cqi, 1rem)" }}
                  className="font-bold text-onicord-dark-sub truncate max-w-[85cqi] @md:max-w-[45cqi]"
                >
                  {weather?.city}
                </div>

                {}
                <div
                  style={{ fontSize: "clamp(0.55rem, 2.5cqi, 0.7rem)" }}
                  className="font-mono uppercase tracking-wider text-onicord-dark-muted mt-0.5"
                >
                  {weather?.country}
                </div>
              </div>
            </div>
          </div>

          {}
          <div className="w-full shrink-0 pt-1.5 border-t border-black/5">
            <div className="flex justify-between items-center mb-1">
              <span
                style={{ fontSize: "clamp(0.55rem, 2.5cqi, 0.7rem)" }}
                className="font-bold uppercase tracking-wide text-onicord-dark-sub truncate"
              >
                {t("widgets.weather.codes." + (weather?.weatherCode ?? "nodata"), weatherInfo.text)}
              </span>

              <button
                onClick={() => {
                  setEditing(true);
                  setSearch("");
                  setSuggestions([]);
                }}
                className="flex items-center gap-1 text-onicord-dark-muted hover:text-onicord-dark transition"
              >
                <IconSearch size="sm" />
              </button>
            </div>

            <div
              style={{ fontSize: "clamp(0.55rem, 2.5cqi, 0.7rem)" }}
              className="flex justify-between font-mono text-onicord-dark-muted"
            >
              <span className="flex items-center gap-1">
                <IconHumidity size="sm" />
                {weather?.humidity ?? "--"}%
              </span>

              <span className="flex items-center gap-1">
                <IconAir size="sm" />
                {weather?.wind ?? "--"} km/h
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

WeatherWidget.widgetId = "weather";
WeatherWidget.badgeText = "Weather";
WeatherWidget.bgVariant = "sky";
WeatherWidget.defaultGeo = { x: 1, y: 4, w: 2, h: 3 };
WeatherWidget.minW = 2;
WeatherWidget.minH = 2;
