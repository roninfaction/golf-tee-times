import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendPush } from "@/lib/onesignal";

const CRON_SECRET = process.env.CRON_SECRET ?? "";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("X-Cron-Secret");
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceClient();
  const now = new Date();

  // Helper: find tee times within a time window that haven't been notified
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
      .select("id, course_name, tee_datetime, group_id")
      .gte("tee_datetime", windowStart.toISOString())
      .lte("tee_datetime", windowEnd.toISOString())
      .eq(sentFlag, false);

    if (!teeTimes?.length) return 0;

    let sent = 0;
    for (const tt of teeTimes) {
      // Get all RSVPs that are accepted or pending (remind everyone who hasn't declined)
      const { data: rsvps } = await svc
        .from("rsvps")
        .select("user_id")
        .eq("tee_time_id", tt.id)
        .in("status", ["accepted", "pending"]);

      const userIds = (rsvps ?? []).map((r: { user_id: string }) => r.user_id);
      if (!userIds.length) continue;

      const { data: profiles } = await svc
        .from("profiles")
        .select("push_subscription")
        .in("id", userIds)
        .not("push_subscription", "is", null);

      const subscriptions = (profiles ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((p: any) => p.push_subscription)
        .filter(Boolean);

      if (subscriptions.length > 0) {
        const teeDate = new Date(tt.tee_datetime);
        const timeStr = teeDate.toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit", hour12: true });

        await sendPush({
          subscriptions: subscriptions as import("@/lib/web-push-server").PushSubscription[],
          title: `Tee time ${label}! ⛳`,
          body: `${tt.course_name} · ${timeStr}`,
          data: { teeTimeId: tt.id },
        });
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
