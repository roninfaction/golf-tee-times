import { NextRequest, NextResponse } from "next/server";
import { getTeeWeather } from "@/lib/weather";

// Not in middleware's publicPaths, so only signed-in users reach this. It serves public
// NWS data with no per-user lookups, so it skips the Bearer check the DB routes use.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const lat = parseFloat(params.get("lat") ?? "");
  const lng = parseFloat(params.get("lng") ?? "");
  const at = new Date(params.get("at") ?? "");

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || isNaN(at.getTime())) {
    return NextResponse.json({ error: "lat, lng and at are required" }, { status: 400 });
  }

  try {
    const weather = await getTeeWeather(lat, lng, at);
    return NextResponse.json(weather, { headers: { "Cache-Control": "private, max-age=900" } });
  } catch (e) {
    console.error("[weather] forecast lookup failed:", lat, lng, e);
    return NextResponse.json({ error: "Forecast unavailable" }, { status: 502 });
  }
}
