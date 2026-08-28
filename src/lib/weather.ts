/**
 * Open-Meteo weather for Sepang International Circuit.
 * Attribution: Open-Meteo (CC BY 4.0) — https://open-meteo.com
 *
 * Forecast window is ~16 days. Race weekend (2–4 Oct) may be outside range;
 * we fall back to live Sepang hours and label the banner accordingly.
 */

export const SEPANG_LAT = 2.76056;
export const SEPANG_LON = 101.7375;

export type WeatherOverride = "auto" | "dry" | "light" | "heavy";

export type SepangWeather = {
  rainIntensity: number;
  precipProbability: number;
  rainMm: number;
  label: string;
  source: "live" | "override" | "fallback";
  fetchedAt: string;
  timezone: string;
};

const OVERRIDE_INTENSITY: Record<Exclude<WeatherOverride, "auto">, number> = {
  dry: 0,
  light: 0.35,
  heavy: 0.85,
};

export const intensityFromForecast = (
  precipProbability: number,
  rainMm: number,
): number => {
  const fromProb = precipProbability / 100;
  const fromRain = Math.min(1, rainMm / 4);
  return Math.min(1, Math.max(fromProb * 0.55 + fromRain * 0.45, 0));
};

export const resolveRainIntensity = (
  override: WeatherOverride,
  live: SepangWeather | null,
): number => {
  if (override !== "auto") return OVERRIDE_INTENSITY[override];
  if (live) return live.rainIntensity;
  return 0.2;
};

import {
  readCachedSepangWeather,
  writeCachedSepangWeather,
} from "@/lib/weatherCache";

const fetchSepangWeatherLive = async (): Promise<SepangWeather> => {
  const params = new URLSearchParams({
    latitude: String(SEPANG_LAT),
    longitude: String(SEPANG_LON),
    hourly: "precipitation_probability,precipitation,rain,weather_code",
    timezone: "Asia/Kuala_Lumpur",
    forecast_days: "2",
  });

  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    const data = (await res.json()) as {
      timezone: string;
      hourly: {
        time: string[];
        precipitation_probability: (number | null)[];
        precipitation: (number | null)[];
        rain: (number | null)[];
      };
    };

    const now = Date.now();
    let bestIdx = 0;
    let bestDelta = Infinity;
    data.hourly.time.forEach((t, i) => {
      const delta = Math.abs(new Date(t).getTime() - now);
      if (delta < bestDelta) {
        bestDelta = delta;
        bestIdx = i;
      }
    });

    const precipProbability = data.hourly.precipitation_probability[bestIdx] ?? 0;
    const rainMm = data.hourly.rain[bestIdx] ?? data.hourly.precipitation[bestIdx] ?? 0;
    const rainIntensity = intensityFromForecast(precipProbability, rainMm);

    let label = "Dry";
    if (rainIntensity >= 0.7) label = "Heavy rain risk";
    else if (rainIntensity >= 0.35) label = "Light rain likely";
    else if (rainIntensity >= 0.15) label = "Showers possible";

    return {
      rainIntensity,
      precipProbability,
      rainMm,
      label,
      source: "live",
      fetchedAt: new Date().toISOString(),
      timezone: data.timezone,
    };
  } catch {
    return {
      rainIntensity: 0.25,
      precipProbability: 40,
      rainMm: 0.5,
      label: "Forecast unavailable — using Sepang climate guess",
      source: "fallback",
      fetchedAt: new Date().toISOString(),
      timezone: "Asia/Kuala_Lumpur",
    };
  }
};

/** Client fetch with localStorage cache (30 min TTL). */
export const fetchSepangWeather = async (): Promise<SepangWeather> => {
  const cached = readCachedSepangWeather();
  if (cached) return cached;

  const weather = await fetchSepangWeatherLive();
  if (weather.source === "live") {
    writeCachedSepangWeather(weather);
  }
  return weather;
};
