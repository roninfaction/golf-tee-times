import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL = "https://aqcyuxxvgbyifdnhfzoq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxY3l1eHh2Z2J5aWZkbmhmem9xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTc5NjYsImV4cCI6MjA5NTIzMzk2Nn0.9mohEOHIlaJGf5ZCp57GDQmdLCMN4_zv17YVqmPNGhU";

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}
