"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

// Runs once for a signed-in visitor of /join/[token]: records referral
// attribution, then forces group creation (force create-group onboarding) when
// the user has no group yet, otherwise drops them on the schedule.
export function AcceptAppInvite({ token }: { token: string }) {
  const ran = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { window.location.href = `/login?next=/join/${token}`; return; }

        const res = await fetch("/api/app-invites/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ token }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) { setError(body.error ?? `Error ${res.status}`); return; }

        window.location.href = body.hasGroup ? "/upcoming" : "/group/setup";
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    })();
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-center">
      <div className="text-4xl mb-4">⛳</div>
      {error ? (
        <>
          <h1 className="text-xl font-bold text-white mb-2">Couldn&apos;t finish setup</h1>
          <p className="text-slate-400 text-sm">{error}</p>
        </>
      ) : (
        <p className="text-slate-400 text-sm">Setting up your account…</p>
      )}
    </div>
  );
}
