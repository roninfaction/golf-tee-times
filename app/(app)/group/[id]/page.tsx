import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CopyInviteButton } from "@/components/CopyInviteButton";
import { GroupPhotoUpload } from "@/components/GroupPhotoUpload";
import type { GroupMember, Profile } from "@/lib/types";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://golfpack.app";
const GOLD = "#C9A84C";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";

const US_TIMEZONES = [
  { label: "Pacific (PT)", value: "America/Los_Angeles" },
  { label: "Mountain (MT)", value: "America/Denver" },
  { label: "Arizona (no DST)", value: "America/Phoenix" },
  { label: "Central (CT)", value: "America/Chicago" },
  { label: "Eastern (ET)", value: "America/New_York" },
  { label: "Hawaii (HT)", value: "Pacific/Honolulu" },
  { label: "Alaska (AKT)", value: "America/Anchorage" },
];

type Params = { params: Promise<{ id: string }> };

export default async function GroupPage({ params }: Params) {
  const { id: groupId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();

  const { data: membership } = await svc
    .from("group_members")
    .select("role, group:groups(id, name, invite_code, photo_url, timezone, default_tee_interval, org_id)")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) redirect("/groups");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const group = membership.group as any;
  const isAdmin = membership.role === "admin";
  const inviteUrl = `${APP_URL}/invite/${group.invite_code}`;

  const { data: members } = await svc
    .from("group_members")
    .select("*, profile:profiles(id, display_name, email, avatar_url, ghin_handicap_index)")
    .eq("group_id", groupId)
    .order("joined_at", { ascending: true });

  // Leaderboard: avg gross/net per member (only shown when ≥5 scores exist in this group)
  const { count: scoreCount } = await svc
    .from("round_scores")
    .select("id", { count: "exact", head: true })
    .in("tee_time_id",
      (await svc.from("tee_times").select("id").eq("group_id", groupId)).data?.map((t: { id: string }) => t.id) ?? []
    );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let leaderboard: any[] = [];
  if ((scoreCount ?? 0) >= 5) {
    const teeTimeIds = (await svc.from("tee_times").select("id").eq("group_id", groupId)).data?.map((t: { id: string }) => t.id) ?? [];
    if (teeTimeIds.length > 0) {
      const { data: scores } = await svc
        .from("round_scores")
        .select("user_id, gross_score, net_score")
        .in("tee_time_id", teeTimeIds);
      const byUser = new Map<string, { grossTotal: number; netTotal: number; rounds: number }>();
      for (const s of scores ?? []) {
        const cur = byUser.get(s.user_id) ?? { grossTotal: 0, netTotal: 0, rounds: 0 };
        byUser.set(s.user_id, {
          grossTotal: cur.grossTotal + s.gross_score,
          netTotal: cur.netTotal + (s.net_score ?? s.gross_score),
          rounds: cur.rounds + 1,
        });
      }
      leaderboard = Array.from(byUser.entries())
        .map(([uid, v]) => ({ user_id: uid, avg_gross: Math.round(v.grossTotal / v.rounds), avg_net: Math.round(v.netTotal / v.rounds), rounds: v.rounds }))
        .sort((a, b) => a.avg_net - b.avg_net)
        .slice(0, 10);
    }
  }

  // Check if user is an org admin (to show org link)
  let orgName: string | null = null;
  if (group.org_id) {
    const { data: org } = await svc
      .from("organizations")
      .select("name")
      .eq("id", group.org_id)
      .single();
    orgName = org?.name ?? null;
  }

  return (
    <div className="min-h-screen pb-52">
      <div className="pt-12">
        <GroupPhotoUpload groupId={group.id} currentPhotoUrl={group.photo_url} />
      </div>

      <div className="px-4 pt-4 pb-5" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-[26px] font-bold text-white tracking-tight">{group.name}</h1>
            <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
              {(members ?? []).length} members
            </p>
          </div>
          <Link href="/groups" className="text-sm font-medium mt-1 shrink-0" style={{ color: "#30D158" }}>
            All groups
          </Link>
        </div>
        {orgName && (
          <Link href={`/org/${group.org_id}`} className="mt-1 inline-flex items-center gap-1 text-xs font-medium" style={{ color: GOLD }}>
            ⛳ {orgName}
          </Link>
        )}
      </div>

      <div className="px-4 pt-6 space-y-6">

        {/* Members */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Members</p>
          <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
            {(members ?? []).map((m: GroupMember & { profile: Profile & { avatar_url?: string | null } }, i) => {
              const isLast = i === (members ?? []).length - 1;
              const name = m.profile?.display_name || m.profile?.email || "Unknown";
              const initials = name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
              return (
                <div
                  key={m.id ?? i}
                  className="flex items-center gap-3 px-4 py-3.5"
                  style={{ borderBottom: isLast ? "none" : `0.5px solid ${DIVIDER}` }}
                >
                  {m.profile?.avatar_url ? (
                    <img src={m.profile.avatar_url} alt={name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0" style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}>
                      {initials}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {name}
                      {m.user_id === user.id && <span className="ml-1.5 text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>you</span>}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: m.role === "admin" ? GOLD : "rgba(255,255,255,0.3)" }}>
                      {m.role === "admin" ? "Admin" : ""}
                      {m.profile.ghin_handicap_index != null
                        ? `${m.role === "admin" ? " · " : ""}HCP ${m.profile.ghin_handicap_index}`
                        : ""}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Invite link */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Invite link</p>
          <div className="rounded-2xl p-4 space-y-3" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
            <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
              Share this link to add someone to your group.
            </p>
            <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(201,168,76,0.10)", border: "0.5px solid rgba(201,168,76,0.22)" }}>
              <p className="text-xs font-mono break-all" style={{ color: GOLD }}>{inviteUrl}</p>
            </div>
            <CopyInviteButton url={inviteUrl} />
          </div>
        </div>

        {/* Admin settings */}
        {isAdmin && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Group settings</p>
            <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
              {/* Timezone */}
              <div className="px-4 py-3.5" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
                <p className="text-xs font-medium mb-2" style={{ color: "rgba(255,255,255,0.45)" }}>Timezone</p>
                <form action={async (formData: FormData) => {
                  "use server";
                  const { createServiceClient: sc } = await import("@/lib/supabase/server");
                  const s = sc();
                  await s.from("groups").update({ timezone: formData.get("timezone") as string }).eq("id", groupId);
                }}>
                  <select
                    name="timezone"
                    defaultValue={group.timezone ?? "America/Los_Angeles"}
                    className="w-full bg-transparent text-white text-sm outline-none"
                    style={{ color: "white" }}
                  >
                    {US_TIMEZONES.map(tz => (
                      <option key={tz.value} value={tz.value} style={{ background: "#0f172a" }}>{tz.label}</option>
                    ))}
                  </select>
                  <button type="submit" className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: "#30D158", color: "#000" }}>
                    Save
                  </button>
                </form>
              </div>
              {/* Default tee interval */}
              <div className="px-4 py-3.5">
                <p className="text-xs font-medium mb-2" style={{ color: "rgba(255,255,255,0.45)" }}>Default tee interval (minutes)</p>
                <form action={async (formData: FormData) => {
                  "use server";
                  const { createServiceClient: sc } = await import("@/lib/supabase/server");
                  const s = sc();
                  await s.from("groups").update({ default_tee_interval: parseInt(formData.get("interval") as string) }).eq("id", groupId);
                }}>
                  <div className="flex gap-2">
                    {[8, 10, 12, 15].map(n => (
                      <label key={n} className="flex-1">
                        <input type="radio" name="interval" value={n} defaultChecked={group.default_tee_interval === n} className="sr-only" />
                        <div className="text-center py-2 rounded-xl text-sm font-semibold cursor-pointer" style={{
                          background: group.default_tee_interval === n ? "#30D158" : "rgba(255,255,255,0.07)",
                          color: group.default_tee_interval === n ? "#000" : "rgba(255,255,255,0.5)",
                        }}>{n}</div>
                      </label>
                    ))}
                  </div>
                  <button type="submit" className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg" style={{ background: "#30D158", color: "#000" }}>
                    Save
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Leaderboard — only shown when ≥5 scores exist in this group */}
        {leaderboard.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Leaderboard</p>
            <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
              {leaderboard.map((entry, i) => {
                const member = (members ?? []).find((m) => m.user_id === entry.user_id);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const name = (member?.profile as any)?.display_name ?? "Unknown";
                const isLast = i === leaderboard.length - 1;
                return (
                  <div key={entry.user_id} className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: isLast ? "none" : `0.5px solid ${DIVIDER}` }}>
                    <span className="text-sm font-bold w-5 shrink-0" style={{ color: i === 0 ? GOLD : "rgba(255,255,255,0.3)" }}>
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-white flex-1 truncate">
                      {name}{entry.user_id === user.id ? " (you)" : ""}
                    </span>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-white">Avg {entry.avg_gross}</p>
                      {entry.avg_net !== entry.avg_gross && (
                        <p className="text-xs" style={{ color: "#30D158" }}>Net {entry.avg_net}</p>
                      )}
                      <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>{entry.rounds} rounds</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
