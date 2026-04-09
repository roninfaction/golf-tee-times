import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://drnbwzzzlbxpcymnwxmv.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRybmJ3enp6bGJ4cGN5bW53eG12Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwOTc5OTIsImV4cCI6MjA4ODY3Mzk5Mn0.TiMghSrdhaU0IzyvKOd2Qxv9lSauEW_tzN6MYUNWpTE",
    NEXT_PUBLIC_APP_URL: "https://golfpack.app",
    NEXT_PUBLIC_ONESIGNAL_APP_ID: "f59a48aa-0ce4-4992-a7b8-55a612c6a7d6",
    NEXT_PUBLIC_EMAIL_FORWARD_DOMAIN: "golfpack.app",
  },
};

export default withSerwist(nextConfig);
