import { utcIsoToPacificIcsLocal } from "@/lib/timezone";

const TZ = "America/Los_Angeles";

// Format a tee time datetime string for display — always Pacific time
export function formatTeeDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString("en-US", {
    timeZone: TZ,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatTeeDateLong(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString("en-US", {
    timeZone: TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatTeeTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatDaysUntil(isoString: string): string {
  const d = new Date(isoString);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7) return `In ${diffDays} days`;
  return formatTeeDate(isoString);
}

// Build a .ics calendar file content string — time anchored to Pacific timezone
export function buildIcsContent({
  summary,
  description,
  location,
  startIso,
  durationHours = 4,
}: {
  summary: string;
  description: string;
  location: string;
  startIso: string;
  durationHours?: number;
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
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    `UID:${Date.now()}@golfpack`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
