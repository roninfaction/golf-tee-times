import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseTeeTimeEmail } from "@/lib/email-parser";
import { searchCourseByName } from "@/lib/google-places";
import { sendPush } from "@/lib/onesignal";
import { pacificToUtcIso } from "@/lib/timezone";

export async function POST(request: NextRequest) {
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const toAddress: string = (payload.to as string) ?? "";

  const tokenMatch = toAddress.match(/tee-([a-f0-9]+)@/i);
  if (!tokenMatch) {
    return NextResponse.json({ error: "No forwarder token in To address" }, { status: 400 });
  }
  const forwarderToken = tokenMatch[1];

  const svc = createServiceClient();

  const { data: profile } = await svc
    .from("profiles")
    .select("id, display_name")
    .eq("forwarder_token", forwarderToken)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Unknown forwarder token", token: forwarderToken }, { status: 200 });
  }

  const { data: membership } = await svc
    .from("group_members")
    .select("group_id")
    .eq("user_id", profile.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "User has no group" }, { status: 200 });
  }

  const textBody = (payload.text as string) ?? "";
  const htmlBody = (payload.html as string) ?? "";
  const emailBody = textBody || htmlBody;
  const isHtml = !textBody && !!htmlBody;

  const parsed = await parseTeeTimeEmail(emailBody, isHtml);

  if (!parsed) {
    const { data: userProfile } = await svc
      .from("profiles")
      .select("push_subscription")
      .eq("id", profile.id)
      .single();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((userProfile as any)?.push_subscription) {
      await sendPush({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        subscriptions: [(userProfile as any).push_subscription],
        title: "Couldn't read that email",
        body: "We couldn't parse your tee time confirmation. Please add it manually.",
      });
    }
    return NextResponse.json({ ok: true, parsed: false });
  }

  const tee_datetime = pacificToUtcIso(parsed.tee_date, parsed.tee_time);

  // Try to match course via Google Places (best-effort, non-blocking)
  let coursePlaceId: string | null = null;
  const courseMatch = await searchCourseByName(parsed.course_name);
  if (courseMatch) {
    await svc.from("courses").upsert({
      place_id: courseMatch.place_id,
      name: courseMatch.name,
      address: courseMatch.address,
      phone: courseMatch.phone,
      website: courseMatch.website,
      maps_url: courseMatch.maps_url,
      lat: courseMatch.lat,
      lng: courseMatch.lng,
      photo_uri: courseMatch.photo_uri ?? null,
    }, { onConflict: "place_id" });
    coursePlaceId = courseMatch.place_id;
  }

  const { data: teeTime, error: insertError } = await svc
    .from("tee_times")
    .insert({
      created_by: profile.id,
      group_id: membership.group_id,
      course_name: parsed.course_name,
      course_place_id: coursePlaceId,
      tee_datetime,
      holes: parsed.holes,
      max_players: 4,
      notes: parsed.notes,
      confirmation_number: parsed.confirmation_number,
      source: "email_parse",
      raw_email_body: emailBody.slice(0, 5000),
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Only add the creator's RSVP. Group members are invited explicitly via
  // the Invite Group button or individual guest invites.
  await svc.from("rsvps").insert({
    tee_time_id: teeTime.id,
    user_id: profile.id,
    status: "accepted",
  });

  // Notify only the creator that the tee time was parsed and added.
  const { data: profiles } = await svc
    .from("profiles")
    .select("push_subscription")
    .eq("id", profile.id)
    .not("push_subscription", "is", null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subscriptions = (profiles ?? []).map((p: any) => p.push_subscription).filter(Boolean);

  if (subscriptions.length > 0) {
    const teeDate = new Date(tee_datetime);
    const dateStr = teeDate.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric" });
    const timeStr = teeDate.toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit", hour12: true });
    await sendPush({
      subscriptions: subscriptions as import("@/lib/web-push-server").PushSubscription[],
      title: "New tee time added! ⛳",
      body: `${parsed.course_name} · ${dateStr} at ${timeStr}`,
      data: { teeTimeId: teeTime.id },
    });
  }

  return NextResponse.json({ ok: true, parsed: true, teeTimeId: teeTime.id });
}
