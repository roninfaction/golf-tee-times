import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { parseTeeTimeEmail } from "@/lib/email-parser";
import { sendPush } from "@/lib/onesignal";

// Resend inbound email webhook
// Docs: https://resend.com/docs/dashboard/emails/inbound-email
export async function POST(request: NextRequest) {
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Extract the To: address to identify the user by their forwarder token
  // Resend sends headers as an object; the To address is in `to` field
  const toAddress: string = (payload.to as string) ?? "";
  // Expected format: tee-{token}@tee.yourdomain.com
  const tokenMatch = toAddress.match(/tee-([a-f0-9]+)@/i);
  if (!tokenMatch) {
    return NextResponse.json({ error: "No forwarder token in To address" }, { status: 400 });
  }
  const forwarderToken = tokenMatch[1];

  const svc = createServiceClient();

  // Look up the user by their forwarder token
  const { data: profile } = await svc
    .from("profiles")
    .select("id, display_name")
    .eq("forwarder_token", forwarderToken)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "Unknown forwarder token" }, { status: 200 }); // 200 so Resend doesn't retry
  }

  // Get user's group
  const { data: membership } = await svc
    .from("group_members")
    .select("group_id")
    .eq("user_id", profile.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "User has no group" }, { status: 200 });
  }

  // Extract email body (prefer plain text)
  const textBody = (payload.text as string) ?? "";
  const htmlBody = (payload.html as string) ?? "";
  const emailBody = textBody || htmlBody;
  const isHtml = !textBody && !!htmlBody;

  // Parse with GPT-4o
  const parsed = await parseTeeTimeEmail(emailBody, isHtml);

  if (!parsed) {
    // Parsing failed — notify user to add manually
    const { data: userProfile } = await svc
      .from("profiles")
      .select("onesignal_player_id")
      .eq("id", profile.id)
      .single();

    if (userProfile?.onesignal_player_id) {
      await sendPush({
        playerIds: [userProfile.onesignal_player_id],
        title: "Couldn't read that email",
        body: "We couldn't parse your tee time confirmation. Please add it manually.",
      });
    }
    return NextResponse.json({ ok: true, parsed: false });
  }

  // Build the full datetime string
  const tee_datetime = `${parsed.tee_date}T${parsed.tee_time}:00`;

  // Insert the tee time
  const { data: teeTime, error: insertError } = await svc
    .from("tee_times")
    .insert({
      created_by: profile.id,
      group_id: membership.group_id,
      course_name: parsed.course_name,
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

  // Auto-create RSVPs
  const { data: members } = await svc
    .from("group_members")
    .select("user_id")
    .eq("group_id", membership.group_id);

  const memberIds = (members ?? []).map((m: { user_id: string }) => m.user_id);

  await svc.from("rsvps").insert(
    memberIds.map((uid: string) => ({
      tee_time_id: teeTime.id,
      user_id: uid,
      status: uid === profile.id ? "accepted" : "pending",
    }))
  );

  // Push notify all group members
  const { data: profiles } = await svc
    .from("profiles")
    .select("onesignal_player_id")
    .in("id", memberIds)
    .not("onesignal_player_id", "is", null);

  const playerIds = (profiles ?? [])
    .map((p: { onesignal_player_id: string }) => p.onesignal_player_id)
    .filter(Boolean);

  if (playerIds.length > 0) {
    const teeDate = new Date(tee_datetime);
    const dateStr = teeDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const timeStr = teeDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

    await sendPush({
      playerIds,
      title: "New tee time added! ⛳",
      body: `${parsed.course_name} · ${dateStr} at ${timeStr}`,
      data: { teeTimeId: teeTime.id },
    });
  }

  return NextResponse.json({ ok: true, parsed: true, teeTimeId: teeTime.id });
}
