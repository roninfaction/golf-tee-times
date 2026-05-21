import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendPush } from "@/lib/onesignal";
import { clearExpiredPushSubscriptions } from "@/lib/push-cleanup";
import { sendEmail, guestReminderHtml } from "@/lib/resend";

const CRON_SECRET = process.env.CRON_SECRET ?? "";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("X-Cron-Secret");
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceClient();
  const now = new Date();

  // Helper: find tee times within a time window that haven't been notified.
  // Uses batched queries instead of N+1 to stay efficient at scale.
  async function processReminders(
    windowMinutes: number,
    sentFlag: "reminder_24h_sent" | "reminder_2h_sent",
    label: "tomorrow" | "in 2 hours"
  ) {
    const windowCenter = new Date(now.getTime() + windowMinutes * 60 * 1000);
    const windowStart = new Date(windowCenter.getTime() - 15 * 60 * 1000);
    const windowEnd = new Date(windowCenter.getTime() + 15 * 60 * 1000);

    const { data: teeTimes } = await svc
      .from("tee_times")
      .select("id, course_name, tee_datetime, holes, group:groups(name, timezone)")
      .gte("tee_datetime", windowStart.toISOString())
      .lte("tee_datetime", windowEnd.toISOString())
      .eq(sentFlag, false)
      .limit(100);

    if (!teeTimes?.length) return 0;

    const teeTimeIds = teeTimes.map((tt: { id: string }) => tt.id);

    // Batch: RSVPs for push notifications
    const { data: allRsvps } = await svc
      .from("rsvps")
      .select("tee_time_id, user_id")
      .in("tee_time_id", teeTimeIds)
      .in("status", ["accepted", "pending"]);

    const allUserIds = [...new Set((allRsvps ?? []).map((r: { user_id: string }) => r.user_id))];
    const { data: allProfiles } = allUserIds.length
      ? await svc
          .from("profiles")
          .select("id, push_subscription")
          .in("id", allUserIds)
          .not("push_subscription", "is", null)
      : { data: [] };

    // Batch: accepted guests with emails for this set of tee times
    const { data: guestEmails } = await svc
      .from("guest_invites")
      .select("tee_time_id, accepted_name, guest_email")
      .in("tee_time_id", teeTimeIds)
      .eq("status", "accepted")
      .not("guest_email", "is", null);

    // Build lookup maps
    const rsvpsByTeeTime = new Map<string, string[]>();
    for (const r of (allRsvps ?? []) as { tee_time_id: string; user_id: string }[]) {
      const list = rsvpsByTeeTime.get(r.tee_time_id) ?? [];
      list.push(r.user_id);
      rsvpsByTeeTime.set(r.tee_time_id, list);
    }
    const pushByUserId = new Map<string, unknown>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (allProfiles ?? []) as any[]) {
      if (p.push_subscription) pushByUserId.set(p.id, p.push_subscription);
    }
    const guestsByTeeTime = new Map<string, { accepted_name: string; guest_email: string }[]>();
    for (const g of (guestEmails ?? []) as { tee_time_id: string; accepted_name: string; guest_email: string }[]) {
      const list = guestsByTeeTime.get(g.tee_time_id) ?? [];
      list.push(g);
      guestsByTeeTime.set(g.tee_time_id, list);
    }

    let sent = 0;
    for (const tt of teeTimes as { id: string; course_name: string; tee_datetime: string; holes: number; group?: { name?: string; timezone?: string } }[]) {
      const tz = tt.group?.timezone ?? "America/Los_Angeles";
      const teeDate = new Date(tt.tee_datetime);
      const timeStr = teeDate.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true });
      const dateStr = teeDate.toLocaleDateString("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" });

      // Push notifications for app members
      const userIds = rsvpsByTeeTime.get(tt.id) ?? [];
      const subscriptions = userIds.map(uid => pushByUserId.get(uid)).filter(Boolean);
      if (subscriptions.length > 0) {
        const { expiredEndpoints } = await sendPush({
          subscriptions: subscriptions as import("@/lib/web-push-server").PushSubscription[],
          title: `Tee time ${label}! ⛳`,
          body: `${tt.course_name} · ${timeStr}`,
          data: { teeTimeId: tt.id },
        });
        await clearExpiredPushSubscriptions(expiredEndpoints);
        sent++;
      }

      // Email reminders for guests who provided an email
      const guests = guestsByTeeTime.get(tt.id) ?? [];
      for (const guest of guests) {
        await sendEmail({
          to: guest.guest_email,
          subject: `Tee time ${label} — ${tt.course_name}`,
          html: guestReminderHtml({
            guestName: guest.accepted_name,
            courseName: tt.course_name,
            teeDate: dateStr,
            teeTime: timeStr,
            holes: tt.holes,
            groupName: tt.group?.name ?? "Golf Group",
            label,
          }),
        });
      }

      await svc.from("tee_times").update({ [sentFlag]: true }).eq("id", tt.id);
    }

    return sent;
  }

  const sent24h = await processReminders(24 * 60, "reminder_24h_sent", "tomorrow");
  const sent2h = await processReminders(2 * 60, "reminder_2h_sent", "in 2 hours");

  return NextResponse.json({ ok: true, sent24h, sent2h });
}
