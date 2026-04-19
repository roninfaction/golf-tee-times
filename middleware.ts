import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://drnbwzzzlbxpcymnwxmv.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRybmJ3enp6bGJ4cGN5bW53eG12Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwOTc5OTIsImV4cCI6MjA4ODY3Mzk5Mn0.TiMghSrdhaU0IzyvKOd2Qxv9lSauEW_tzN6MYUNWpTE";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Auth check failed — treat as unauthenticated
  }

  const { pathname } = request.nextUrl;

  const publicPaths = [
    "/login",
    "/auth/callback",
    "/invite",          // group join links
    "/fill",            // guest tee time accept (no account required)
    "/api/webhooks",
    "/api/health",
    "/api/cron",
    "/api/guest-invites/accept",  // public endpoint
    "/api/profile",               // uses Bearer token auth, not cookies
    "/api/groups",                // uses Bearer token auth, not cookies
    "/api/tee-times",             // uses Bearer token auth, not cookies
    "/api/rsvps",                 // uses Bearer token auth, not cookies
    "/api/push",                  // uses Bearer token auth, not cookies
    "/api/guest-invites",         // uses Bearer token auth, not cookies
  ];
  const isPublic = publicPaths.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/upcoming";
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/upcoming";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|sw.js|OneSignalSDKWorker.js|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
