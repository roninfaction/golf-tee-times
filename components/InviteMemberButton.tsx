"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { UserPlus, Check, ChevronRight } from "lucide-react";

const GOLD = "#C9A84C";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";

interface Member {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

interface Props {
  teeTimeId: string;
  groupId: string;
  existingRsvpUserIds: string[];
}

export function InviteMemberButton({ teeTimeId, groupId, existingRsvpUserIds }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "open" | "sending" | "done">("idle");
  const [members, setMembers] = useState<Member[]>([]);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setState("loading");
    setError(null);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError("Not signed in"); setState("idle"); return; }

    // Fetch group members with profiles, excluding those who already have an RSVP
    const { data, error: fetchErr } = await supabase
      .from("group_members")
      .select("user_id, profile:profiles(display_name, avatar_url)")
      .eq("group_id", groupId)
      .neq("user_id", session.user.id);

    if (fetchErr || !data) { setError("Could not load members"); setState("idle"); return; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uninvited = (data as any[])
      .filter((m) => !existingRsvpUserIds.includes(m.user_id) && m.profile)
      .map((m) => ({
        user_id: m.user_id as string,
        display_name: (m.profile?.display_name ?? "") as string,
        avatar_url: (m.profile?.avatar_url ?? null) as string | null,
      }));

    setMembers(uninvited);
    setState("open");
  }

  async function invite(member: Member) {
    setState("sending");
    setError(null);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setError("Not signed in"); setState("open"); return; }

    const res = await fetch(`/api/tee-times/${teeTimeId}/invite-member`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ memberId: member.user_id }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? "Something went wrong");
      setState("open");
      return;
    }

    setSentTo(member.display_name);
    setState("done");
  }

  if (state === "done") {
    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>
          Individual invite
        </p>
        <div className="w-full rounded-2xl px-4 py-3.5 flex items-center gap-3" style={{ background: CARD_BG, border: `0.5px solid rgba(48,209,88,0.25)` }}>
          <Check size={16} style={{ color: "#30D158", flexShrink: 0 }} />
          <p className="text-sm font-medium text-white">{sentTo} notified</p>
        </div>
      </div>
    );
  }

  if (state === "open" || state === "sending") {
    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>
          Individual invite
        </p>
        <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
          {members.length === 0 ? (
            <p className="px-4 py-4 text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>
              All members already have RSVPs
            </p>
          ) : (
            members.map((m, i) => {
              const isLast = i === members.length - 1;
              return (
                <button
                  key={m.user_id}
                  onClick={() => invite(m)}
                  disabled={state === "sending"}
                  className="w-full flex items-center justify-between px-4 py-3.5 transition-opacity active:opacity-60 disabled:opacity-50"
                  style={{ borderBottom: isLast ? "none" : "0.5px solid rgba(80,200,110,0.10)" }}
                >
                  <div className="flex items-center gap-3">
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt={m.display_name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0" style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.8)" }}>
                        {m.display_name[0]?.toUpperCase()}
                      </div>
                    )}
                    <span className="text-sm font-medium text-white">{m.display_name}</span>
                  </div>
                  <ChevronRight size={15} style={{ color: "rgba(255,255,255,0.3)" }} />
                </button>
              );
            })
          )}
        </div>
        {error && <p className="px-1 pt-2 text-xs" style={{ color: "#FF453A" }}>{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>
        Individual invite
      </p>
      <button
        onClick={open}
        disabled={state === "loading"}
        className="w-full rounded-2xl px-4 py-3.5 flex items-center justify-between transition-opacity active:opacity-70"
        style={{
          background: CARD_BG,
          border: `0.5px solid ${CARD_BORDER}`,
          opacity: state === "loading" ? 0.6 : 1,
        }}
      >
        <div className="flex items-center gap-3">
          <UserPlus size={16} style={{ color: GOLD, flexShrink: 0 }} />
          <div className="text-left">
            <p className="text-sm font-medium text-white">
              {state === "loading" ? "Loading…" : "Invite a Member"}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
              Sends a push notification to one member
            </p>
          </div>
        </div>
        {state === "loading" && (
          <div className="w-4 h-4 border-2 rounded-full" style={{ borderColor: "rgba(201,168,76,0.3)", borderTopColor: GOLD, animation: "spin 0.8s linear infinite" }} />
        )}
      </button>
      {error && <p className="px-1 pt-2 text-xs" style={{ color: "#FF453A" }}>{error}</p>}
    </div>
  );
}
