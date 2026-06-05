import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserFromBearer } from "@/lib/auth-bearer";
import { extractScoreFromScorecard } from "@/lib/score-ocr";
import { parseBody } from "@/lib/parse-body";

// POST /api/scores/ocr — accepts a Supabase Storage path, generates a signed URL, runs OCR
export async function POST(request: NextRequest) {
  const user = await getUserFromBearer(request.headers.get("Authorization"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { body, badRequest } = await parseBody<{ storage_path: string }>(request);
  if (badRequest) return badRequest;
  const { storage_path } = body;
  if (!storage_path) return NextResponse.json({ error: "storage_path required" }, { status: 400 });

  const svc = createServiceClient();

  // Rate limit: 20 OCR calls per user per day
  const today = new Date().toISOString().slice(0, 10);
  const { count } = await svc
    .from("ocr_usage_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("called_at", `${today}T00:00:00.000Z`);
  if ((count ?? 0) >= 20) {
    return NextResponse.json({ error: "Daily OCR limit reached (20 per day)" }, { status: 429 });
  }
  await svc.from("ocr_usage_log").insert({ user_id: user.id });

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
