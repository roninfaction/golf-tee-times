/**
 * Cloudflare Worker — cron scheduler for GolfPack reminders
 *
 * Setup:
 *   1. Set APP_URL and CRON_SECRET environment variables in Cloudflare dashboard
 *   2. Deploy: wrangler deploy --config cron-worker/wrangler.toml
 *
 * This Worker runs every 15 minutes and calls the /api/cron/reminders route
 * on the GolfPack Cloudflare Pages app to send 24h and 2h tee time reminders.
 */
export default {
  async scheduled(_event, env, _ctx) {
    const appUrl = env.APP_URL ?? "https://golf-tee-times.pages.dev";
    const cronSecret = env.CRON_SECRET ?? "";

    await fetch(`${appUrl}/api/cron/reminders`, {
      method: "POST",
      headers: {
        "X-Cron-Secret": cronSecret,
        "Content-Type": "application/json",
      },
    });
  },
};
