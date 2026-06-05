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

  // Rate limits: 3 failed scans/day blocks further attempts; 20 total/day hard cap
  const today = new Date().toISOString().slice(0, 10);
  const [{ count: failedCount }, { count: totalCount }] = await Promise.all([
    svc.from("ocr_usage_log").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).eq("success", false).gte("called_at", `${today}T00:00:00.000Z`),
    svc.from("ocr_usage_log").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).gte("called_at", `${today}T00:00:00.000Z`),
  ]);
  if ((failedCount ?? 0) >= 3) {
    return NextResponse.json({ error: "Too many failed scans today — enter your score manually" }, { status: 429 });
  }
  if ((totalCount ?? 0) >= 20) {
    return NextResponse.json({ error: "Daily scan limit reached (20 per day)" }, { status: 429 });
  }

  // Generate a short-lived signed URL so GPT-4o can access the image
  const { data: signed, error: signErr } = await svc.storage
    .from("scorecards")
    .createSignedUrl(storage_path, 120); // 2 minute TTL

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: "Could not create signed URL" }, { status: 500 });
  }

  const result = await extractScoreFromScorecard(signed.signedUrl);
  await svc.from("ocr_usage_log").insert({ user_id: user.id, success: result !== null });
  if (!result) return NextResponse.json({ error: "Could not read score from image" }, { status: 422 });

  return NextResponse.json(result);
}
