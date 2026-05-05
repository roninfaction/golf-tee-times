import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Users, Plus, Settings } from "lucide-react";

const GOLD = "#C9A84C";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";

type Params = { params: Promise<{ id: string }> };

export default async function OrgPage({ params }: Params) {
  const { id: orgId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();

  const { data: myMembership } = await svc
    .from("org_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!myMembership) redirect("/groups");

  const isAdmin = ["owner", "admin"].includes(myMembership.role);

  const { data: org } = await svc
    .from("organizations")
    .select("*, groups(id, name, invite_code, photo_url, timezone)")
    .eq("id", orgId)
    .single();

  if (!org) redirect("/groups");

  const { count: memberCount } = await svc
    .from("org_members")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://golfpack.app";

  return (
    <div className="min-h-screen pb-52">
      {/* Header */}
      <div className="px-4 pt-14 pb-5" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            {org.logo_url ? (
              <img src={org.logo_url} alt={org.name} className="w-12 h-12 rounded-xl object-cover shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-2xl" style={{ background: "rgba(201,168,76,0.15)" }}>⛳</div>
            )}
            <div>
              <h1 className="text-[22px] font-bold text-white tracking-tight">{org.name}</h1>
              <p className="text-sm mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                {memberCount ?? 0} members · {(org.groups ?? []).length} group{(org.groups ?? []).length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          {isAdmin && (
            <Link href={`/org/${orgId}/settings`} className="mt-1">
              <Settings size={20} className="text-white/40" />
            </Link>
          )}
        </div>

        {org.billing_status === "trial" && (
          <div className="mt-3 px-3 py-2 rounded-xl text-xs font-medium" style={{ background: "rgba(201,168,76,0.12)", color: GOLD }}>
            Trial period active
          </div>
        )}
      </div>

      <div className="px-4 pt-6 space-y-6">
        {/* Groups */}
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: GOLD }}>Groups</p>
            {isAdmin && (
              <Link href={`/org/${orgId}/groups/new`} className="text-xs font-semibold" style={{ color: "#30D158" }}>
                + Add group
              </Link>
            )}
          </div>
          <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
            {(org.groups ?? []).length === 0 ? (
              <p className="text-sm px-4 py-4" style={{ color: "rgba(255,255,255,0.3)" }}>No groups yet.</p>
            ) : (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (org.groups as any[]).map((g, i) => (
                <Link
                  key={g.id}
                  href={`/group/${g.id}`}
                  className="flex items-center gap-3 px-4 py-3.5 transition-opacity active:opacity-70"
                  style={{ borderBottom: i < (org.groups ?? []).length - 1 ? `0.5px solid ${DIVIDER}` : "none" }}
                >
                  {g.photo_url ? (
                    <img src={g.photo_url} alt={g.name} className="w-9 h-9 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.07)" }}>
                      <Users size={16} className="text-white/40" />
                    </div>
                  )}
                  <p className="text-sm font-medium text-white flex-1 truncate">{g.name}</p>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Admin actions */}
        {isAdmin && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Admin</p>
            <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
              <Link href={`/org/${orgId}/members`} className="flex items-center gap-3 px-4 py-3.5 transition-opacity active:opacity-70" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
                <Users size={18} className="text-white/50 shrink-0" />
                <p className="text-sm font-medium text-white">Manage members</p>
              </Link>
              <div className="px-4 py-3.5">
                <p className="text-xs font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.45)" }}>Club join link</p>
                <p className="text-xs font-mono break-all" style={{ color: GOLD }}>
                  {org.slug ? `${APP_URL}/join/${org.slug}` : "Set a slug in settings to get a join link"}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
