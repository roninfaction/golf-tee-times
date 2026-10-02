import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { buildIcsContent } from "@/lib/format";

type Params = { params: Promise<{ id: string }> };

// GET /api/tee-times/[id]/calendar: the round as a calendar file. Opened as a plain link from
// the round page (no Bearer header), so it authenticates with the session cookie instead.
export async function GET(_request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const svc = createServiceClient();
  const { data: tt } = await svc
    .from("tee_times")
    .select("id, created_by, course_name, tee_datetime, holes, confirmation_number, course_place_id, group:groups(name), rsvps(user_id)")
    .eq("id", id)
    .maybeSingle();
  if (!tt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const onRound = tt.created_by === user.id || tt.rsvps.some((r: { user_id: string }) => r.user_id === user.id);
  if (!onRound) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: course } = tt.course_place_id
    ? await svc.from("courses").select("address").eq("place_id", tt.course_place_id).maybeSingle()
    : { data: null };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groupName = (tt as any).group?.name ?? "GolfPack";
  const details = [`${tt.holes} holes with ${groupName}`, tt.confirmation_number ? `Confirmation ${tt.confirmation_number}` : null]
    .filter(Boolean).join("\n");

  const ics = buildIcsContent({
    summary: `Golf - ${tt.course_name}`,
    description: details,
    location: course?.address ?? tt.course_name,
    startIso: tt.tee_datetime,
    uid: tt.id,
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="tee-time.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
