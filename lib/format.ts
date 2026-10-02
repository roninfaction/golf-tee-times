import { utcIsoToPacificIcsLocal } from "@/lib/timezone";

const DEFAULT_TZ = "America/Los_Angeles";

export function formatTeeDate(isoString: string, tz = DEFAULT_TZ): string {
  const d = new Date(isoString);
  return d.toLocaleDateString("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatTeeDateLong(isoString: string, tz = DEFAULT_TZ): string {
  const d = new Date(isoString);
  return d.toLocaleDateString("en-US", {
    timeZone: tz,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatTeeTime(isoString: string, tz = DEFAULT_TZ): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatDaysUntil(isoString: string, tz = DEFAULT_TZ): string {
  const d = new Date(isoString);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7) return `In ${diffDays} days`;
  return formatTeeDate(isoString, tz);
}

// ICS text values must escape backslash, comma, semicolon and newlines, or calendar apps cut
// an address like "5880 Woodcreek Oaks Blvd, Roseville" off at the first comma.
function icsText(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Build a .ics calendar file content string — time anchored to Pacific timezone.
// Pass a stable uid (the tee time id) so adding the same round twice updates it, not duplicates it.
export function buildIcsContent({
  summary,
  description,
  location,
  startIso,
  durationHours = 4,
  uid,
}: {
  summary: string;
  description: string;
  location: string;
  startIso: string;
  durationHours?: number;
  uid?: string;
}): string {
  const startLocal = utcIsoToPacificIcsLocal(startIso);
  const endMs = new Date(startIso).getTime() + durationHours * 60 * 60 * 1000;
  const endLocal = utcIsoToPacificIcsLocal(new Date(endMs).toISOString());

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GolfPack//Golf Tee Time//EN",
    "BEGIN:VEVENT",
    `DTSTART;TZID=America/Los_Angeles:${startLocal}`,
    `DTEND;TZID=America/Los_Angeles:${endLocal}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`,
    `SUMMARY:${icsText(summary)}`,
    `DESCRIPTION:${icsText(description)}`,
    `LOCATION:${icsText(location)}`,
    `UID:${uid ?? Date.now()}@golfpack`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
