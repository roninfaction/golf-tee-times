"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Users, Check, ChevronDown } from "lucide-react";

type GroupOption = {
  id: string;
  name: string;
  role: "admin" | "member";
  photo_url: string | null;
};

const CARD_BG = "rgba(15,23,42,0.97)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";

export function GroupSwitcher({ activeGroupId, groupName }: { activeGroupId: string; groupName: string }) {
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!open || groups.length > 0) return;
    fetch("/api/groups/me", {
      headers: { Authorization: `Bearer ${document.cookie.match(/sb-[^=]+-auth-token=([^;]+)/)?.[1] ?? ""}` },
    })
      .then(r => r.json())
      .then(d => setGroups((d.groups ?? []).map((g: { id: string; name: string; role: "admin" | "member"; photo_url: string | null }) => ({
        id: g.id,
        name: g.name,
        role: g.role,
        photo_url: g.photo_url,
      }))));
  }, [open, groups.length]);

  function switchGroup(groupId: string) {
    // eslint-disable-next-line react-hooks/immutability
    document.cookie = `golfpack_active_group=${groupId}; path=/; max-age=31536000; SameSite=Lax`;
    setOpen(false);
    startTransition(() => router.push(`/group/${groupId}`));
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-sm mt-0.5 transition-opacity active:opacity-60"
        style={{ color: "rgba(255,255,255,0.4)" }}
      >
        {groupName}
        <ChevronDown size={13} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end" onClick={() => setOpen(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.6)" }} />

          {/* Sheet */}
          <div
            className="relative rounded-t-3xl pb-10 pt-5"
            style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}
            onClick={e => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: "rgba(255,255,255,0.2)" }} />

            <p className="text-xs font-semibold uppercase tracking-wide mb-3 px-5" style={{ color: "rgba(255,255,255,0.35)" }}>
              Switch group
            </p>

            <div className="overflow-y-auto max-h-72">
              {groups.length === 0 ? (
                <p className="text-sm px-5 py-4" style={{ color: "rgba(255,255,255,0.3)" }}>Loading…</p>
              ) : (
                groups.map((g, i) => (
                  <button
                    key={g.id}
                    onClick={() => switchGroup(g.id)}
                    className="w-full flex items-center gap-3 px-5 py-3.5 transition-opacity active:opacity-60"
                    style={{ borderTop: i === 0 ? "none" : `0.5px solid ${DIVIDER}` }}
                  >
                    {g.photo_url ? (
                      <img src={g.photo_url} alt={g.name} className="w-9 h-9 rounded-xl object-cover shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.07)" }}>
                        <Users size={16} className="text-white/40" />
                      </div>
                    )}
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium text-white truncate">{g.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>{g.role}</p>
                    </div>
                    {g.id === activeGroupId && <Check size={16} style={{ color: "#30D158" }} />}
                  </button>
                ))
              )}
            </div>

            <div className="px-5 mt-4" style={{ borderTop: `0.5px solid ${DIVIDER}`, paddingTop: "1rem" }}>
              <button
                onClick={() => { setOpen(false); router.push("/groups"); }}
                className="w-full py-3 rounded-2xl text-sm font-semibold"
                style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)" }}
              >
                Manage all groups
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
