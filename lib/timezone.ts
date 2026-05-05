const PACIFIC_TZ = "America/Los_Angeles";

/**
 * Convert a local date+time in the given IANA timezone to a UTC ISO string.
 *
 * Strategy: probe 20:00 UTC on the target date (midday for any US timezone,
 * safely away from the 2 AM DST boundary) to read the actual UTC offset,
 * including sub-hour offsets (India, Nepal, Newfoundland, etc.).
 */
export function localToUtcIso(dateStr: string, timeStr: string, tz: string): string {
  const probe = new Date(`${dateStr}T20:00:00Z`);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(probe);
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)!.value, 10);
  const localHour = get("hour");
  const localMinute = get("minute");
  // UTC offset in minutes = (local time at probe) - (20:00 UTC)
  const offsetMinutes = (localHour * 60 + localMinute) - (20 * 60);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMinutes);
  const oh = String(Math.floor(absOffset / 60)).padStart(2, "0");
  const om = String(absOffset % 60).padStart(2, "0");
  return new Date(`${dateStr}T${timeStr}:00${sign}${oh}:${om}`).toISOString();
}

/**
 * Format a UTC ISO string as a local datetime string in the given IANA timezone
 * for use in .ics calendar files. Returns compact ICS format: "YYYYMMDDTHHMMSS"
 */
export function utcIsoToLocalIcsFormat(isoStr: string, tz: string): string {
  const d = new Date(isoStr);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}${get("month")}${get("day")}T${get("hour")}${get("minute")}${get("second")}`;
}

// Backward-compatible Pacific wrappers — existing call sites unchanged
export function pacificToUtcIso(dateStr: string, timeStr: string): string {
  return localToUtcIso(dateStr, timeStr, PACIFIC_TZ);
}

export function utcIsoToPacificIcsLocal(isoStr: string): string {
  return utcIsoToLocalIcsFormat(isoStr, PACIFIC_TZ);
}
