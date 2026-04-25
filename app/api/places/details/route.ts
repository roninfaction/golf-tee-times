import { NextRequest, NextResponse } from "next/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { getPlaceDetails } from "@/lib/google-places";

export async function GET(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const placeId = request.nextUrl.searchParams.get("place_id") ?? "";
  if (!placeId) return NextResponse.json({ error: "place_id required" }, { status: 400 });

  const details = await getPlaceDetails(placeId);
  if (!details) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(details);
}
