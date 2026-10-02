// Tee time weather from the US National Weather Service (api.weather.gov).
// Free and keyless, but NWS asks every caller to send a User-Agent with contact info.
//
// Caching: Next's fetch cache does nothing on this deploy (open-next.config.ts uses the
// "dummy" incremental cache), so NWS answers are cached here in two layers:
//   1. a per-isolate Map (also the only layer in `next dev`)
//   2. the Cloudflare Cache API, shared by every isolate in a data center
// The lat/lng -> forecast grid lookup barely ever changes; the hourly forecast is
// refreshed by NWS about once an hour, so 30 minutes keeps it fresh without hammering them.

const NWS = "https://api.weather.gov";
const USER_AGENT = "GolfPack (matt@closecurtain.com)";
const GRID_TTL_S = 24 * 60 * 60;
const HOURLY_TTL_S = 30 * 60;
const NWS_TIMEOUT_MS = 6000;
const FORECAST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // hourly forecasts run ~156 hours out

export type WeatherKind =
  | "sun" | "moon" | "partly-day" | "partly-night" | "cloud"
  | "rain" | "storm" | "snow" | "fog" | "wind";

export type TeeWeather =
  | { status: "ok"; tempF: number; rainPct: number; windMph: number; windDir: string; summary: string; kind: WeatherKind }
  | { status: "later" } // US course, tee time is past the end of the hourly forecast
  | { status: "none" }; // NWS doesn't cover this spot (outside the US) or the tee time has started

type Period = {
  start: number;
  end: number;
  tempF: number;
  rainPct: number;
  windMph: number;
  windDir: string;
  summary: string;
  kind: WeatherKind;
};

// ── Cache ────────────────────────────────────────────────────────────────────

type Entry = { value: unknown; expires: number };
const memory = new Map<string, Entry>();

function edgeCache(): Cache | null {
  // caches.default only exists in the Cloudflare Workers runtime, not in Node
  return (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default ?? null;
}

async function cached<T>(key: string, ttlS: number, load: () => Promise<T>): Promise<T> {
  const hit = memory.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;

  const edge = edgeCache();
  const edgeKey = `https://nws-cache.golfpack.app/${encodeURIComponent(key)}`;
  if (edge) {
    const res = await edge.match(edgeKey).catch((e) => {
      console.error("[weather] edge cache read failed:", e);
      return undefined;
    });
    if (res) {
      const entry = await res.json() as Entry;
      memory.set(key, entry);
      return entry.value as T;
    }
  }

  const entry: Entry = { value: await load(), expires: Date.now() + ttlS * 1000 };
  if (memory.size > 500) memory.clear();
  memory.set(key, entry);
  if (edge) {
    await edge.put(edgeKey, new Response(JSON.stringify(entry), {
      headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${ttlS}` },
    })).catch((e) => console.error("[weather] edge cache write failed:", e));
  }
  return entry.value as T;
}

// ── NWS ──────────────────────────────────────────────────────────────────────

function nws(url: string): Promise<Response> {
  return fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/geo+json" },
    signal: AbortSignal.timeout(NWS_TIMEOUT_MS),
  });
}

/** The hourly forecast URL for a point, or null when NWS doesn't cover it. */
async function hourlyUrlFor(lat: number, lng: number): Promise<string | null> {
  // NWS 301-redirects anything more precise than 4 decimals
  const point = `${Number(lat.toFixed(4))},${Number(lng.toFixed(4))}`;
  const grid = await cached(`grid:${point}`, GRID_TTL_S, async () => {
    const res = await nws(`${NWS}/points/${point}`);
    // 404 = no forecast for this spot (outside the US). Cache that answer too.
    if (res.status === 404) return { hourlyUrl: null };
    if (!res.ok) throw new Error(`NWS points ${point} returned ${res.status}`);
    const body = await res.json() as { properties?: { forecastHourly?: string } };
    if (!body.properties?.forecastHourly) throw new Error(`NWS points ${point} had no forecastHourly`);
    return { hourlyUrl: body.properties.forecastHourly };
  });
  return grid.hourlyUrl;
}

type NwsPeriod = {
  startTime: string;
  endTime: string;
  isDaytime: boolean;
  temperature: number;
  temperatureUnit: string;
  probabilityOfPrecipitation?: { value: number | null };
  windSpeed: string;
  windDirection: string;
  icon: string;
  shortForecast: string;
};

// Icon URLs look like .../icons/land/day/rain_showers,20/tsra,40?size=small
function kindFromIcon(icon: string, isDaytime: boolean): WeatherKind {
  const code = icon.match(/\/(?:day|night)\/([a-z_]+)/)?.[1] ?? "";
  if (/tsra|tornado|hurricane|tropical/.test(code)) return "storm";
  if (/snow|sleet|fzra|blizzard/.test(code)) return "snow";
  if (code.includes("rain")) return "rain";
  if (/fog|haze|smoke|dust/.test(code)) return "fog";
  if (code.startsWith("wind")) return "wind";
  // Matched to NWS's own text: few = "Sunny"/"Mostly Clear", sct = "Mostly Sunny"/"Partly Cloudy",
  // bkn = "Partly Sunny"/"Mostly Cloudy", ovc = "Cloudy"
  if (code === "ovc" || (code === "bkn" && !isDaytime)) return "cloud";
  if (code === "sct" || code === "bkn") return isDaytime ? "partly-day" : "partly-night";
  return isDaytime ? "sun" : "moon";
}

function toPeriod(p: NwsPeriod): Period {
  // windSpeed is "8 mph", occasionally a range like "5 to 10 mph": use the top of it
  const wind = (p.windSpeed.match(/\d+/g) ?? ["0"]).map(Number);
  return {
    start: Date.parse(p.startTime),
    end: Date.parse(p.endTime),
    tempF: p.temperatureUnit === "C" ? Math.round(p.temperature * 9 / 5 + 32) : p.temperature,
    rainPct: p.probabilityOfPrecipitation?.value ?? 0,
    windMph: Math.max(...wind),
    windDir: p.windDirection,
    summary: p.shortForecast,
    kind: kindFromIcon(p.icon, p.isDaytime),
  };
}

async function hourlyPeriods(url: string): Promise<Period[]> {
  return cached(`hourly:${url}`, HOURLY_TTL_S, async () => {
    const res = await nws(url);
    if (!res.ok) throw new Error(`NWS hourly ${url} returned ${res.status}`);
    const body = await res.json() as { properties?: { periods?: NwsPeriod[] } };
    const periods = body.properties?.periods;
    if (!periods?.length) throw new Error(`NWS hourly ${url} had no periods`);
    // Keep only what we show; the raw response is ~150 KB
    return periods.map(toPeriod);
  });
}

/** Forecast for the hour of a tee time. Throws when NWS fails; callers show nothing. */
export async function getTeeWeather(lat: number, lng: number, teeTime: Date): Promise<TeeWeather> {
  const t = teeTime.getTime();
  if (t <= Date.now()) return { status: "none" };

  const hourlyUrl = await hourlyUrlFor(lat, lng);
  if (!hourlyUrl) return { status: "none" };
  if (t - Date.now() > FORECAST_WINDOW_MS) return { status: "later" };

  const periods = await hourlyPeriods(hourlyUrl);
  const p = periods.find((x) => x.start <= t && t < x.end);
  if (!p) return t >= periods[periods.length - 1].end ? { status: "later" } : { status: "none" };

  return {
    status: "ok",
    tempF: p.tempF,
    rainPct: p.rainPct,
    windMph: p.windMph,
    windDir: p.windDir,
    summary: p.summary,
    kind: p.kind,
  };
}
