/**
 * Finds Bayonet & Black Horse via coordinates (nearby search) and patches the DB.
 * Usage: node scripts/patch-bayonet.mjs
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, "../.env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;
const BASE = "https://places.googleapis.com/v1";

const sbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

async function sbPatch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: "PATCH",
    headers: { ...sbHeaders, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${path}: ${res.status} ${await res.text()}`);
}

async function fetchPhotoUri(photoName) {
  const res = await fetch(`${BASE}/${photoName}/media?maxWidthPx=1200&skipHttpRedirect=true`, {
    headers: { "X-Goog-Api-Key": PLACES_KEY },
  });
  if (!res.ok) { console.log(`  Photo fetch failed: ${res.status}`); return null; }
  const json = await res.json();
  return json.photoUri ?? null;
}

async function main() {
  const fields = "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.location,places.photos";

  // Known coordinates from the Google Maps URL
  const LAT = 36.6303333;
  const LNG = -121.8209667;

  console.log("Searching nearby coords:", LAT, LNG);

  const res = await fetch(`${BASE}/places:searchNearby`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": PLACES_KEY, "X-Goog-FieldMask": fields },
    body: JSON.stringify({
      locationRestriction: {
        circle: { center: { latitude: LAT, longitude: LNG }, radius: 800 },
      },
      maxResultCount: 10,
    }),
  });

  const json = await res.json();
  const places = json.places ?? [];
  console.log(`Found ${places.length} nearby place(s):`);
  for (const p of places) {
    console.log(`  - "${p.displayName?.text}" (${p.formattedAddress})`);
  }

  // Pick the one whose name contains "bayonet" or "black horse" or "horse"
  const match = places.find((p) => {
    const n = (p.displayName?.text ?? "").toLowerCase();
    return n.includes("bayonet") || n.includes("black horse") || n.includes("horse");
  }) ?? places[0]; // fall back to first result if nothing matches

  if (!match) { console.log("\nNo places found at all — check coordinates."); return; }

  console.log(`\nUsing: "${match.displayName?.text}" (${match.formattedAddress})`);

  const photoUri = match.photos?.[0]?.name ? await fetchPhotoUri(match.photos[0].name) : null;
  console.log(`Photo: ${photoUri ? "✓ fetched" : "✗ none available"}`);

  if (photoUri) {
    await sbPatch(`/courses?place_id=eq.manual_bayonet_black_horse`, { photo_uri: photoUri });
    console.log("✓ courses record updated with photo.");
  }

  // Also update phone/website/maps_url if we got a real match
  const updates = {
    phone: match.nationalPhoneNumber ?? null,
    website: match.websiteUri ?? null,
    maps_url: match.googleMapsUri ?? null,
    ...(photoUri ? { photo_uri: photoUri } : {}),
  };
  await sbPatch(`/courses?place_id=eq.manual_bayonet_black_horse`, updates);
  console.log("✓ Contact info updated:", updates);
}

main().catch((e) => { console.error(e); process.exit(1); });
