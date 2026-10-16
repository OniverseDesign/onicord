class WeatherService {
  async search(cityName) {
    try {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=5&language=es&format=json`
      );
      return await res.json();
    } catch (err) {
      return null;
    }
  }

  async searchCities(currentName) {
    try {
      const res = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(currentName)}&count=5&language=es&format=json`
      );
      if (!res.ok) throw new Error("Geocoding network error");
      return await res.json();
    } catch (err) {
      console.error("[Weather Service Error] Geocoding falló:", err.message);
      return null;
    }
  }

  async loadForecast(lat, lon) {
    try {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code`
      );
      if (!res.ok) throw new Error("Forecast network error");
      return await res.json();
    } catch (err) {
      console.error("[Weather Service Error] Forecast falló:", err.message);
      return null;
    }
  }
}

module.exports = new WeatherService();
