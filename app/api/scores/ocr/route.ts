import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { extractScoreFromScorecard } from "@/lib/score-ocr";

// POST /api/scores/ocr — accepts a Supabase Storage path, generates a signed URL, runs OCR
export async function POST(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { storage_path } = await request.json();
  if (!storage_path) return NextResponse.json({ error: "storage_path required" }, { status: 400 });

  const svc = createServiceClient();

  // Generate a short-lived signed URL so GPT-4o can access the image
  const { data: signed, error: signErr } = await svc.storage
    .from("scorecards")
    .createSignedUrl(storage_path, 120); // 2 minute TTL

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: "Could not create signed URL" }, { status: 500 });
  }

  const result = await extractScoreFromScorecard(signed.signedUrl);
  if (!result) return NextResponse.json({ error: "Could not read score from image" }, { status: 422 });

  return NextResponse.json(result);
}
