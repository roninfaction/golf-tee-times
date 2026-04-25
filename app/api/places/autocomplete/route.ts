import { NextRequest, NextResponse } from "next/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { autocompleteCourse } from "@/lib/google-places";

export async function GET(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q") ?? "";
  const suggestions = await autocompleteCourse(q);
  return NextResponse.json(suggestions);
}
