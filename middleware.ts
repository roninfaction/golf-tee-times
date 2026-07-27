import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://aqcyuxxvgbyifdnhfzoq.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFxY3l1eHh2Z2J5aWZkbmhmem9xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTc5NjYsImV4cCI6MjA5NTIzMzk2Nn0.9mohEOHIlaJGf5ZCp57GDQmdLCMN4_zv17YVqmPNGhU";

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

  // getSession() reads the JWT from the cookie (no network round-trip).
  // Pages that serve user data call getUser() themselves for secure validation.
  let user = null;
  try {
    const { data } = await supabase.auth.getSession();
    user = data.session?.user ?? null;
  } catch {
    // Auth check failed — treat as unauthenticated
  }

  const { pathname } = request.nextUrl;

  const publicPaths = [
    "/login",
    "/reset-password",  // set a new password via emailed recovery link
    "/auth/callback",
    "/api/auth/reset-request",  // request a reset email (no session)
    "/invite",          // group join links
    "/welcome",         // app invite links (sign up → create own group)
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
    "/api/app-invites",           // uses Bearer token auth, not cookies
    "/share",                     // public shareable results pages
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
