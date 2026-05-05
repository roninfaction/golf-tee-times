import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import { withSentryConfig } from "@sentry/nextjs";

// Serwist disabled — we use a hand-written public/sw.js instead.
// The Serwist runtime was causing the SW to hang in "installing" on iOS.
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: true,
});

// NEXT_PUBLIC_* vars must be set via Cloudflare Pages env vars (prod/staging dashboards)
// or .env.local for local dev. Do NOT hardcode them here — they bake into the build
// artifact and prevent staging from using its own Supabase project.
const nextConfig: NextConfig = {};

export default withSentryConfig(withSerwist(nextConfig), {
  silent: true,
  telemetry: false,
});
