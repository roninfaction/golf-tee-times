/**
 * One-time backfill: finds all tee_times without a course_place_id,
 * searches Google Places for each course name, and links them.
 *
 * Usage: node scripts/backfill-courses.mjs
 * Run from the golf-tee-times project root after setting up .env.local
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Load .env.local manually (no dotenv dependency needed)
const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, "../.env.local");
const envLines = readFileSync(envPath, "utf8").split("\n");
for (const line of envLines) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;
const PLACES_BASE = "https://places.googleapis.com/v1";

if (!SUPABASE_URL || !SERVICE_KEY || !PLACES_KEY) {
  console.error("Missing env vars — check .env.local");
  process.exit(1);
}

const sbHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...opts,
    headers: { ...sbHeaders, ...(opts.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${path}: ${res.status} ${text}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return null;
  return res.json();
}

async function fetchPhotoUri(photoName) {
  const res = await fetch(`${PLACES_BASE}/${photoName}/media?maxWidthPx=1200&skipHttpRedirect=true`, {
    headers: { "X-Goog-Api-Key": PLACES_KEY },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.photoUri ?? null;
}

async function searchCourse(courseName) {
  const fields = "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.location,places.photos";

  async function doSearch(body) {
    const res = await fetch(`${PLACES_BASE}/places:searchText`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": PLACES_KEY, "X-Goog-FieldMask": fields },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return res.json();
  }

  // Try with golf_course type first, then fall back to no type filter
  let json = await doSearch({ textQuery: `${courseName} golf course`, includedType: "golf_course", maxResultCount: 1 });
  if (!json?.places?.length) {
    await new Promise((r) => setTimeout(r, 200));
    json = await doSearch({ textQuery: `${courseName}`, maxResultCount: 1 });
  }
  if (!json) return null;
  const p = json.places?.[0];
  if (!p?.id) return null;

  // Sanity check: matched name must share a distinctive word (exclude generic golf terms)
  const generic = new Set(["golf", "course", "club", "links", "green", "park", "country", "oaks", "the"]);
  const matchedWords = new Set((p.displayName?.text ?? "").toLowerCase().split(/\s+/));
  const queryWords = courseName.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !generic.has(w));
  const hasOverlap = queryWords.some((w) => matchedWords.has(w));
  if (!hasOverlap) {
    console.log(`\n  [skipped weak match: "${p.displayName?.text}" for "${courseName}"]`);
    return null;
  }

  const photo_uri = p.photos?.[0]?.name ? await fetchPhotoUri(p.photos[0].name) : null;

  return {
    place_id: p.id,
    name: p.displayName?.text ?? courseName,
    address: p.formattedAddress ?? null,
    phone: p.nationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    maps_url: p.googleMapsUri ?? null,
    lat: p.location?.latitude ?? null,
    lng: p.location?.longitude ?? null,
    photo_uri,
  };
}

async function main() {
  // Fetch all tee_times (debug: log total count first)
  const all = await sbFetch(`/tee_times?select=id,course_name,course_place_id`);
  console.log(`Total tee times in DB: ${all.length}`);
  if (all.length > 0) {
    for (const t of all) console.log(`  id=${t.id} course="${t.course_name}" place_id=${t.course_place_id ?? "null"}`);
  }

  const teeTimes = all.filter((t) => !t.course_place_id);

  if (!teeTimes.length) {
    console.log("\nAll tee times already have course data — nothing to backfill.");
    return;
  }

  console.log(`Found ${teeTimes.length} tee time(s) to backfill.\n`);

  let matched = 0;
  let skipped = 0;

  for (const tt of teeTimes) {
    process.stdout.write(`  "${tt.course_name}" ... `);

    const course = await searchCourse(tt.course_name);
    if (!course) {
      console.log("no match found");
      skipped++;
      // Throttle to avoid rate limits
      await new Promise((r) => setTimeout(r, 300));
      continue;
    }

    // Upsert course record
    await sbFetch("/courses", {
      method: "POST",
      body: JSON.stringify({ ...course, photo_uri: course.photo_uri ?? null }),
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    });

    // Link tee_time to course
    await sbFetch(`/tee_times?id=eq.${tt.id}`, {
      method: "PATCH",
      body: JSON.stringify({ course_place_id: course.place_id }),
      headers: { Prefer: "return=minimal" },
    });

    console.log(`matched → ${course.name}`);
    matched++;

    // Throttle to stay well under Places API rate limits
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\nDone. ${matched} matched, ${skipped} skipped (no Places result).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
