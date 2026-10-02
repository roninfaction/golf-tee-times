"use client";

import { useEffect, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import {
  Sun, Moon, CloudSun, CloudMoon, Cloud, CloudRain, CloudLightning, CloudSnow, CloudFog, Wind,
  type LucideIcon,
} from "lucide-react";
import type { TeeWeather, WeatherKind } from "@/lib/weather";

const GOLD = "#C9A84C";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // NWS hourly forecasts run about a week out

const KIND_ICONS: Record<WeatherKind, LucideIcon> = {
  sun: Sun,
  moon: Moon,
  "partly-day": CloudSun,
  "partly-night": CloudMoon,
  cloud: Cloud,
  rain: CloudRain,
  storm: CloudLightning,
  snow: CloudSnow,
  fog: CloudFog,
  wind: Wind,
};

type Props = { lat: number; lng: number; teeIso: string };

// Weather is a nice-to-have: render nothing until it arrives, and nothing if it fails.
function useTeeWeather(lat: number, lng: number, teeIso: string, includeLater: boolean): TeeWeather | null {
  const [weather, setWeather] = useState<TeeWeather | null>(null);

  useEffect(() => {
    const ahead = Date.parse(teeIso) - Date.now();
    if (!(ahead > 0) || (!includeLater && ahead > WINDOW_MS)) return;

    const ctrl = new AbortController();
    const qs = new URLSearchParams({ lat: String(lat), lng: String(lng), at: teeIso });
    fetch(`/api/weather?${qs}`, { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Weather request failed (${res.status})`);
        setWeather(await res.json() as TeeWeather);
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return; // navigated away
        Sentry.captureException(err);
      });
    return () => ctrl.abort();
  }, [lat, lng, teeIso, includeLater]);

  return weather;
}

function Stat({ label, value, sub, first }: { label: string; value: string; sub?: string; first?: boolean }) {
  return (
    <div className="px-4 py-3 min-w-0" style={{ borderLeft: first ? "none" : `0.5px solid ${DIVIDER}` }}>
      <p className="text-[17px] font-semibold text-white tracking-tight tabular-nums whitespace-nowrap">
        {value}
        {sub && <span className="text-xs font-medium ml-1" style={{ color: "rgba(255,255,255,0.45)" }}>{sub}</span>}
      </p>
      <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</p>
    </div>
  );
}

/** Tee time detail page: forecast for the tee time's hour. */
export function TeeWeatherCard({ lat, lng, teeIso }: Props) {
  const weather = useTeeWeather(lat, lng, teeIso, true);

  if (weather?.status === "later") {
    return (
      <p className="text-xs px-1" style={{ color: "rgba(255,255,255,0.3)" }}>
        The forecast shows up about a week before your tee time.
      </p>
    );
  }
  if (weather?.status !== "ok") return null;

  const Icon = KIND_ICONS[weather.kind];
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Weather at tee time</p>
      <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
        <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
          <Icon size={15} style={{ color: GOLD, flexShrink: 0 }} />
          <span className="text-sm text-white">{weather.summary}</span>
        </div>
        <div className="grid grid-cols-3">
          <Stat label="Wind" value={`${weather.windMph} mph`} sub={weather.windDir} first />
          <Stat label="Chance of rain" value={`${weather.rainPct}%`} />
          <Stat label="Temp" value={`${weather.tempF}°F`} />
        </div>
      </div>
    </div>
  );
}

/** Upcoming list card: one-line chip, only inside the forecast window. */
export function TeeWeatherChip({ lat, lng, teeIso }: Props) {
  const weather = useTeeWeather(lat, lng, teeIso, false);
  if (weather?.status !== "ok") return null;

  const Icon = KIND_ICONS[weather.kind];
  // Sits below the card's title row (outside its p-4), so it gets the full card width
  return (
    <div className="px-4 pb-4 -mt-2">
      <span
        className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full"
        style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}
      >
        <Icon size={12} style={{ color: GOLD, flexShrink: 0 }} />
        {weather.tempF}° &middot; {weather.windMph} mph wind &middot; {weather.rainPct}% rain
      </span>
    </div>
  );
}
