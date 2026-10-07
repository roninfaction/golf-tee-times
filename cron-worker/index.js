/**
 * Cloudflare Worker — cron scheduler for GolfPack reminders
 *
 * Setup:
 *   1. CRON_SECRET must match the Pages app's. Pipe it from .env.local, never type it:
 *        grep '^CRON_SECRET=' .env.local | cut -d= -f2- | tr -d '"\n' | npx wrangler secret put CRON_SECRET --config cron-worker/wrangler.toml
 *      APP_URL is optional (defaults to golf-tee-times.pages.dev).
 *   2. Deploy: wrangler deploy --config cron-worker/wrangler.toml
 *
 * This Worker runs every 15 minutes and calls the /api/cron/reminders route
 * on the GolfPack Cloudflare Pages app to send 24h and 2h tee time reminders.
 *
 * A non-200 from the app THROWS, so Cloudflare records the run as an exception.
 * Until 2026-10-07 the response was ignored: the Worker had no CRON_SECRET, every
 * tick got 401, every run still showed "success", and no reminder went out for weeks.
 */
export default {
  async scheduled(event, env, _ctx) {
    // Every 15 min: send tee time reminders
    const appUrl = env.APP_URL ?? "https://golf-tee-times.pages.dev";
    if (!env.CRON_SECRET) throw new Error("CRON_SECRET is not set on golf-tee-times-cron");

    const res = await fetch(`${appUrl}/api/cron/reminders`, {
      method: "POST",
      headers: {
        "X-Cron-Secret": env.CRON_SECRET,
        "Content-Type": "application/json",
      },
    });
    const body = (await res.text()).slice(0, 300);
    if (!res.ok) throw new Error(`reminders route answered HTTP ${res.status}: ${body}`);
    console.log(`reminders ok: ${body}`);
  },
};
