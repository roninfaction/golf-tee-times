/**
 * Fetches photos for courses that have a place_id but no photo_uri.
 * Usage: node scripts/fetch-missing-photos.mjs
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(resolve(__dir, "../.env.local"), "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;
const BASE = "https://places.googleapis.com/v1";
const h = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

async function fetchPhotoUri(photoName) {
  const res = await fetch(`${BASE}/${photoName}/media?maxWidthPx=1200&skipHttpRedirect=true`, {
    headers: { "X-Goog-Api-Key": PLACES_KEY },
  });
  if (!res.ok) return null;
  return (await res.json()).photoUri ?? null;
}

// Fetch courses missing a photo but with a real ChIJ place_id
const courses = await (await fetch(`${SUPABASE_URL}/rest/v1/courses?photo_uri=is.null&select=place_id,name`, { headers: h })).json();
const toFetch = courses.filter((c) => c.place_id.startsWith("ChIJ"));
console.log(`${toFetch.length} course(s) need photos.\n`);

for (const course of toFetch) {
  process.stdout.write(`  "${course.name}" ... `);
  const fields = "id,photos";
  const res = await fetch(`${BASE}/places/${course.place_id}`, {
    headers: { "X-Goog-Api-Key": PLACES_KEY, "X-Goog-FieldMask": fields },
  });
  if (!res.ok) { console.log(`places fetch failed (${res.status})`); continue; }
  const p = await res.json();
  const photoName = p.photos?.[0]?.name;
  if (!photoName) { console.log("no photos available"); continue; }

  const photoUri = await fetchPhotoUri(photoName);
  if (!photoUri) { console.log("photo media fetch failed"); continue; }

  await fetch(`${SUPABASE_URL}/rest/v1/courses?place_id=eq.${course.place_id}`, {
    method: "PATCH",
    headers: { ...h, Prefer: "return=minimal" },
    body: JSON.stringify({ photo_uri: photoUri }),
  });
  console.log("✓");
  await new Promise((r) => setTimeout(r, 300));
}

console.log("\nDone.");
