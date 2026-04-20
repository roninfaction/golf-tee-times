import { NextRequest, NextResponse } from "next/server";

// Called by the service worker when it receives a push event.
// Lets us confirm server-side whether the SW push handler is firing.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  console.log("[push-log] SW received push event:", JSON.stringify(body));
  return NextResponse.json({ ok: true });
}
