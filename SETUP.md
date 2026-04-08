# TeeUp — Setup Guide

Complete these steps once to get TeeUp live for your group.

---

## Step 1 — Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your **Project URL** and **Anon Key** from Settings → API
3. Also copy the **Service Role Key** (keep this secret)
4. Open the SQL Editor and run all three migration files **in order**:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_rls_policies.sql`
   - `supabase/migrations/003_indexes_triggers.sql`
5. In Supabase → Authentication → URL Configuration, add your Cloudflare Pages URL as a redirect URL:
   `https://golf-tee-times.pages.dev/**`

---

## Step 2 — Create a OneSignal app (push notifications)

1. Go to [onesignal.com](https://onesignal.com) and create a free account
2. Create a new app → choose **Web** → name it "TeeUp"
3. On setup, enter your Cloudflare Pages URL as the site URL
4. From the app settings → Keys & IDs, copy:
   - **OneSignal App ID** (public, goes in `next.config.ts`)
   - **REST API Key** (secret, goes in `.env.local`)

---

## Step 3 — Set up email forwarding (optional but recommended)

This lets your group forward tee time confirmation emails to auto-create events.

1. You need a domain. If you don't have one, skip this step for now.
2. Create a [Resend](https://resend.com) account (free)
3. In Resend → Domains, add a subdomain like `tee.yourdomain.com`
4. Add the MX record Resend gives you to your DNS provider
5. In Resend → Inbound, create a new route:
   - Match: `tee-*@tee.yourdomain.com`
   - Webhook URL: `https://golf-tee-times.pages.dev/api/webhooks/email-inbound`
6. Copy the **Inbound Signing Secret** from Resend

---

## Step 4 — Fill in your credentials

### In `next.config.ts` (hardcoded for Cloudflare — replace placeholders):
```ts
NEXT_PUBLIC_SUPABASE_URL: "https://YOUR_PROJECT_ID.supabase.co",
NEXT_PUBLIC_SUPABASE_ANON_KEY: "YOUR_SUPABASE_ANON_KEY",
NEXT_PUBLIC_APP_URL: "https://golf-tee-times.pages.dev",
NEXT_PUBLIC_ONESIGNAL_APP_ID: "YOUR_ONESIGNAL_APP_ID",
NEXT_PUBLIC_EMAIL_FORWARD_DOMAIN: "tee.yourdomain.com",
```

### In `lib/supabase/browser.ts` (same values as above):
```ts
const SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

### Also update the fallback in `middleware.ts` and `lib/supabase/server.ts`.

### In `.env.local` (for local dev + Cloudflare Pages environment variables):
```
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=your_openai_key
ONESIGNAL_REST_API_KEY=your_onesignal_rest_key
RESEND_API_KEY=your_resend_key
RESEND_INBOUND_SIGNING_SECRET=your_resend_inbound_secret
CRON_SECRET=any_long_random_string_you_choose
```

> **These same variables must also be set in Cloudflare Pages → Settings → Environment Variables**
> for the production build to work.

---

## Step 5 — Deploy to Cloudflare Pages

1. Push to a GitHub repo
2. Connect the repo in [Cloudflare Pages](https://pages.cloudflare.com)
3. Build command:
   ```
   npx @opennextjs/cloudflare build && node_modules/.bin/wrangler deploy --config wrangler-bundle.toml --dry-run --outdir .open-next/worker-build && cp .open-next/worker-build/worker.js .open-next/assets/_worker.js
   ```
4. Build output directory: `.open-next/assets`
5. Add all your environment variables (from `.env.local`) in Pages → Settings → Environment Variables
6. Deploy

---

## Step 6 — Deploy the cron Worker (reminder notifications)

```bash
# Set env vars in Cloudflare dashboard first:
# Workers → golf-tee-times-cron → Settings → Variables
# APP_URL = https://golf-tee-times.pages.dev
# CRON_SECRET = <same value as your CRON_SECRET>

wrangler deploy --config cron-worker/wrangler.toml
```

This 5-line Worker runs every 15 minutes and sends push notifications 24h and 2h before each tee time.

---

## Step 7 — Configure Supabase magic link emails (to avoid spam)

1. In Supabase → Authentication → SMTP Settings, add your Resend SMTP:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: your Resend API key
   - Sender: `TeeUp <noreply@yourdomain.com>`
2. Add SPF/DKIM records as instructed by Resend

Without this, magic link emails may land in spam.

---

## Step 8 — First launch

1. Open `https://golf-tee-times.pages.dev/login`
2. Sign in with your email — check for the magic link
3. Go to **Group** → **Set up your group** → create your group
4. Copy your invite link and send to the other 3 players
5. Each person: sign in → click invite link → join group
6. Test by creating a tee time
7. On Android: tap browser menu → "Add to Home Screen"
   On iPhone: Safari → Share → "Add to Home Screen" (required for push notifications)

---

## App Name

The app is currently named **TeeUp**. To rename it:
- `app/layout.tsx` — update `title` and `appleWebApp.title`
- `public/manifest.json` — update `name` and `short_name`
- `next.config.ts` — update `NEXT_PUBLIC_APP_URL` if you have a custom domain
- Replace the icon files in `public/icons/` with 192×192 and 512×512 PNG images

---

## Troubleshooting

**Push notifications not working on iPhone**
→ Must be installed to home screen first (Safari → Share → Add to Home Screen)
→ Must be iOS 16.4 or later

**Magic link email went to spam**
→ Complete Step 7 (Resend SMTP + custom domain)

**Email forwarding not creating events**
→ Check the tee time confirmation email has plain text content
→ Look at Supabase → tee_times → raw_email_body for what was received
→ The GPT-4o parser needs course name, date, and time to succeed

**Tee time created from email but wrong date/time**
→ Forward a sample email and check the parse. You may need to adjust the prompt in `lib/email-parser.ts` for your specific golf course's email format.
