import type { SepangWeather } from "@/lib/weather";

const STORAGE_KEY = "sepang-weather-v1";
const TTL_MS = 30 * 60 * 1000;

type CachedWeather = {
  weather: SepangWeather;
  savedAt: number;
};

export const readCachedSepangWeather = (): SepangWeather | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedWeather;
    if (!parsed?.weather || typeof parsed.savedAt !== "number") return null;
    if (Date.now() - parsed.savedAt > TTL_MS) return null;
    return parsed.weather;
  } catch {
    return null;
  }
};

export const writeCachedSepangWeather = (weather: SepangWeather): void => {
  if (typeof window === "undefined") return;
  try {
    const payload: CachedWeather = { weather, savedAt: Date.now() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode — ignore */
  }
};
