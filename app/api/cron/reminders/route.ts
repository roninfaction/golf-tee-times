import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendPush } from "@/lib/onesignal";
import { clearExpiredPushSubscriptions } from "@/lib/push-cleanup";

const CRON_SECRET = process.env.CRON_SECRET ?? "";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("X-Cron-Secret");
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceClient();
  const now = new Date();

  // Helper: find tee times within a time window that haven't been notified.
  // Uses 3 batched queries instead of 2N+1 to avoid N+1 at scale.
  async function processReminders(
    windowMinutes: number,
    sentFlag: "reminder_24h_sent" | "reminder_2h_sent",
    label: string
  ) {
    const windowCenter = new Date(now.getTime() + windowMinutes * 60 * 1000);
    const windowStart = new Date(windowCenter.getTime() - 15 * 60 * 1000);
    const windowEnd = new Date(windowCenter.getTime() + 15 * 60 * 1000);

    const { data: teeTimes } = await svc
      .from("tee_times")
      .select("id, course_name, tee_datetime, group:groups(timezone)")
      .gte("tee_datetime", windowStart.toISOString())
      .lte("tee_datetime", windowEnd.toISOString())
      .eq(sentFlag, false)
      .limit(100);

    if (!teeTimes?.length) return 0;

    const teeTimeIds = teeTimes.map((tt: { id: string }) => tt.id);

    // Batch query 1: all RSVPs for all matching tee times
    const { data: allRsvps } = await svc
      .from("rsvps")
      .select("tee_time_id, user_id")
      .in("tee_time_id", teeTimeIds)
      .in("status", ["accepted", "pending"]);

    // Batch query 2: all profiles for all relevant users
    const allUserIds = [...new Set((allRsvps ?? []).map((r: { user_id: string }) => r.user_id))];
    const { data: allProfiles } = allUserIds.length
      ? await svc
          .from("profiles")
          .select("id, push_subscription")
          .in("id", allUserIds)
          .not("push_subscription", "is", null)
      : { data: [] };

    // Build lookup maps in memory
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

    let sent = 0;
    for (const tt of teeTimes as { id: string; course_name: string; tee_datetime: string; group?: { timezone?: string } }[]) {
      const userIds = rsvpsByTeeTime.get(tt.id) ?? [];
      const subscriptions = userIds.map(uid => pushByUserId.get(uid)).filter(Boolean);

      if (subscriptions.length > 0) {
        const tz = tt.group?.timezone ?? "America/Los_Angeles";
        const teeDate = new Date(tt.tee_datetime);
        const timeStr = teeDate.toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true });

        const { expiredEndpoints } = await sendPush({
          subscriptions: subscriptions as import("@/lib/web-push-server").PushSubscription[],
          title: `Tee time ${label}! ⛳`,
          body: `${tt.course_name} · ${timeStr}`,
          data: { teeTimeId: tt.id },
        });
        await clearExpiredPushSubscriptions(expiredEndpoints);
        sent++;
      }

      // Mark as sent
      await svc.from("tee_times").update({ [sentFlag]: true }).eq("id", tt.id);
    }

    return sent;
  }

  const sent24h = await processReminders(24 * 60, "reminder_24h_sent", "tomorrow");
  const sent2h = await processReminders(2 * 60, "reminder_2h_sent", "in 2 hours");

  return NextResponse.json({ ok: true, sent24h, sent2h });
}
