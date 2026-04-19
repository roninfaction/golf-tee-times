const TZ = "America/Los_Angeles";

/**
 * Convert a Pacific-local date+time (e.g. from a tee time confirmation email or
 * the manual-entry form on a server-side code path) to a UTC ISO string for DB storage.
 *
 * Strategy: probe 20:00 UTC on the target date (always noon-ish Pacific, safely
 * away from the 2 AM DST boundary) to read the actual UTC offset, then construct
 * the correct ISO string.
 */
export function pacificToUtcIso(dateStr: string, timeStr: string): string {
  const probe = new Date(`${dateStr}T20:00:00Z`);
  const pacificHourAtProbe = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hour: "2-digit",
      hour12: false,
    }).format(probe),
    10
  );
  // pacificHourAtProbe = 13 for PDT (UTC-7), 12 for PST (UTC-8)
  const utcOffsetHours = pacificHourAtProbe - 20;
  const sign = utcOffsetHours < 0 ? "-" : "+";
  const absHours = String(Math.abs(utcOffsetHours)).padStart(2, "0");
  return new Date(`${dateStr}T${timeStr}:00${sign}${absHours}:00`).toISOString();
}

/**
 * Format a UTC ISO string as a Pacific local datetime string for use in .ics files.
 * Returns the compact ICS format: "YYYYMMDDTHHMMSS"
 */
export function utcIsoToPacificIcsLocal(isoStr: string): string {
  const d = new Date(isoStr);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
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
