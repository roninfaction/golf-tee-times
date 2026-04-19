import { createBrowserClient } from "@supabase/ssr";

// Hardcoded for Cloudflare CI compatibility — NEXT_PUBLIC_ vars don't get
// baked into the client bundle in Cloudflare Pages' build environment.
// These are public/anon values safe to include in source.
// IMPORTANT: Replace with your actual Supabase project values.
const SUPABASE_URL = "https://drnbwzzzlbxpcymnwxmv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRybmJ3enp6bGJ4cGN5bW53eG12Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwOTc5OTIsImV4cCI6MjA4ODY3Mzk5Mn0.TiMghSrdhaU0IzyvKOd2Qxv9lSauEW_tzN6MYUNWpTE";

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}
