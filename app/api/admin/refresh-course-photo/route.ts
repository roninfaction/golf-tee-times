import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getPlaceDetails } from "@/lib/google-places";

// Temporary one-off: refetch a course's photo_uri from Google Places and upsert it.
// Remove after use — not part of the app's normal surface.
export async function GET(request: NextRequest) {
  const secret = request.headers.get("X-Admin-Secret");
  if (!process.env.ADMIN_REFRESH_SECRET || secret !== process.env.ADMIN_REFRESH_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const placeId = request.nextUrl.searchParams.get("place_id") ?? "";
  if (!placeId) return NextResponse.json({ error: "place_id required" }, { status: 400 });

  const details = await getPlaceDetails(placeId);
  if (!details) return NextResponse.json({ error: "Places lookup failed" }, { status: 502 });

  const svc = createServiceClient();
  const { error } = await svc.from("courses").upsert({
    place_id: details.place_id,
    name: details.name,
    address: details.address,
    phone: details.phone,
    website: details.website,
    maps_url: details.maps_url,
    lat: details.lat,
    lng: details.lng,
    photo_uri: details.photo_uri,
  }, { onConflict: "place_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, photo_uri: details.photo_uri });
}
// force redeploy 1790973656
