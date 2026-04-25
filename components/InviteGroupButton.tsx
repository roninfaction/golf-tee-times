"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Users, Check } from "lucide-react";

const GOLD = "#C9A84C";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";

interface Props {
  teeTimeId: string;
}

export function InviteGroupButton({ teeTimeId }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [invitedCount, setInvitedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function handleInvite() {
    if (state !== "idle") return;
    setState("loading");
    setError(null);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("Not signed in"); setState("idle"); return; }

      const res = await fetch(`/api/tee-times/${teeTimeId}/invite-group`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Something went wrong");
        setState("idle");
        return;
      }

      setInvitedCount(body.invited_count ?? 0);
      setState("done");
    } catch {
      setError("Something went wrong");
      setState("idle");
    }
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>
        Group invite
      </p>
      <button
        onClick={handleInvite}
        disabled={state !== "idle"}
        className="w-full rounded-2xl px-4 py-3.5 flex items-center justify-between transition-opacity active:opacity-70"
        style={{
          background: state === "done" ? "rgba(48,209,88,0.10)" : CARD_BG,
          border: state === "done" ? "0.5px solid rgba(48,209,88,0.25)" : `0.5px solid ${CARD_BORDER}`,
          opacity: state === "loading" ? 0.6 : 1,
        }}
      >
        <div className="flex items-center gap-3">
          {state === "done"
            ? <Check size={16} style={{ color: "#30D158", flexShrink: 0 }} />
            : <Users size={16} style={{ color: GOLD, flexShrink: 0 }} />
          }
          <div className="text-left">
            <p className="text-sm font-medium text-white">
              {state === "idle" && "Invite Group"}
              {state === "loading" && "Sending…"}
              {state === "done" && (invitedCount > 0 ? `Sent! ${invitedCount} member${invitedCount !== 1 ? "s" : ""} notified` : "Group already invited")}
            </p>
            {state === "idle" && (
              <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                Notifies your group and lets them RSVP
              </p>
            )}
          </div>
        </div>
        {state === "loading" && (
          <div className="w-4 h-4 border-2 rounded-full" style={{ borderColor: "rgba(201,168,76,0.3)", borderTopColor: GOLD, animation: "spin 0.8s linear infinite" }} />
        )}
      </button>
      {error && (
        <p className="px-1 pt-2 text-xs" style={{ color: "#FF453A" }}>{error}</p>
      )}
    </div>
  );
}
