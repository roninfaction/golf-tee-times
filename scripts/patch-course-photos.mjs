/**
 * One-off script to fetch and patch photos for specific courses.
 * Usage: node scripts/patch-course-photos.mjs
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

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
const BASE = "https://places.googleapis.com/v1";

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
  if (!res.ok) throw new Error(`Supabase ${path}: ${res.status} ${await res.text()}`);
  if (res.status === 204 || res.headers.get("content-length") === "0") return null;
  return res.json();
}

async function fetchPhotoUri(photoName) {
  const res = await fetch(`${BASE}/${photoName}/media?maxWidthPx=1200&skipHttpRedirect=true`, {
    headers: { "X-Goog-Api-Key": PLACES_KEY },
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.photoUri ?? null;
}

async function searchAndFetchPhoto(query) {
  const fields = "places.id,places.displayName,places.formattedAddress,places.photos";

  // Try with golf_course type first
  for (const body of [
    { textQuery: query, includedType: "golf_course", maxResultCount: 1 },
    { textQuery: query, maxResultCount: 1 },
  ]) {
    const res = await fetch(`${BASE}/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": PLACES_KEY,
        "X-Goog-FieldMask": fields,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) continue;
    const json = await res.json();
    const p = json.places?.[0];
    if (!p?.id) continue;

    console.log(`  Found: "${p.displayName?.text}" (${p.formattedAddress})`);
    const photoName = p.photos?.[0]?.name;
    if (!photoName) { console.log("  No photos available."); return { placeId: p.id, photoUri: null }; }

    const photoUri = await fetchPhotoUri(photoName);
    console.log(`  Photo: ${photoUri ? "✓ fetched" : "✗ failed"}`);
    return { placeId: p.id, photoUri };
  }

  console.log("  No match found.");
  return null;
}

async function main() {
  // ── Bayonet & Black Horse ────────────────────────────────────────────────
  console.log('\n1. Bayonet & Black Horse Golf Course');
  const bh = await searchAndFetchPhoto("Bayonet Black Horse Golf Course Seaside CA");
  if (bh?.photoUri) {
    await sbFetch(`/courses?place_id=eq.manual_bayonet_black_horse`, {
      method: "PATCH",
      body: JSON.stringify({ photo_uri: bh.photoUri }),
      headers: { Prefer: "return=minimal" },
    });
    console.log("  ✓ Updated courses record.");
  }

  await new Promise((r) => setTimeout(r, 400));

  // ── Pacific Grove Golf Course ────────────────────────────────────────────
  console.log('\n2. Pacific Grove Golf Course');
  const pg = await searchAndFetchPhoto("Pacific Grove Golf Links California");
  if (pg) {
    // Check if a course record already exists for this place
    const existing = await sbFetch(`/courses?place_id=eq.${pg.placeId}`);
    if (existing?.length) {
      // Update photo on existing record
      if (pg.photoUri) {
        await sbFetch(`/courses?place_id=eq.${pg.placeId}`, {
          method: "PATCH",
          body: JSON.stringify({ photo_uri: pg.photoUri }),
          headers: { Prefer: "return=minimal" },
        });
        console.log("  ✓ Updated existing course record with photo.");
      }
    } else {
      // Insert new course record and link all Pacific Grove tee times
      const fullFields = "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.location,places.photos";
      const detailRes = await fetch(`${BASE}/places:searchText`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": PLACES_KEY, "X-Goog-FieldMask": fullFields },
        body: JSON.stringify({ textQuery: "Pacific Grove Golf Links California", maxResultCount: 1 }),
      });
      const detailJson = await detailRes.json();
      const p = detailJson.places?.[0];
      if (p?.id) {
        await sbFetch("/courses", {
          method: "POST",
          body: JSON.stringify({
            place_id: p.id,
            name: p.displayName?.text ?? "Pacific Grove Golf Links",
            address: p.formattedAddress ?? null,
            phone: p.nationalPhoneNumber ?? null,
            website: p.websiteUri ?? null,
            maps_url: p.googleMapsUri ?? null,
            lat: p.location?.latitude ?? null,
            lng: p.location?.longitude ?? null,
            photo_uri: pg.photoUri ?? null,
          }),
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        });
        // Link all tee times with that course name
        await sbFetch(`/tee_times?course_name=eq.Pacific%20Grove%20Golf%20Course`, {
          method: "PATCH",
          body: JSON.stringify({ course_place_id: p.id }),
          headers: { Prefer: "return=minimal" },
        });
        console.log(`  ✓ Inserted course + linked tee times.`);
      }
    }
  }

  console.log("\nDone.");
}

main().catch((e) => { console.error(e); process.exit(1); });
