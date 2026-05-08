import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

const GOLD = "#C9A84C";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  trial:     { bg: "rgba(201,168,76,0.15)",  color: "#C9A84C" },
  active:    { bg: "rgba(48,209,88,0.15)",   color: "#30D158" },
  suspended: { bg: "rgba(255,69,58,0.12)",   color: "#FF453A" },
};

type SearchParams = { params: Promise<unknown>; searchParams: Promise<{ page?: string }> };

export default async function AdminOrgsPage({ searchParams }: SearchParams) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();
  const { data: profile } = await svc.from("profiles").select("is_super_admin").eq("id", user.id).maybeSingle();
  if (!profile?.is_super_admin) redirect("/upcoming");

  const { page: pageParam } = await searchParams;
  const page = Math.max(0, parseInt(pageParam ?? "0", 10));
  const PAGE = 25;

  const { data: orgs } = await svc
    .from("organizations")
    .select("id, name, slug, billing_status, created_at")
    .order("created_at", { ascending: false })
    .range(page * PAGE, (page + 1) * PAGE - 1);

  // Group counts
  const orgIds = (orgs ?? []).map((o: { id: string }) => o.id);
  const groupCounts: Record<string, number> = {};
  if (orgIds.length > 0) {
    const { data: groups } = await svc.from("groups").select("org_id").in("org_id", orgIds);
    for (const g of groups ?? []) {
      if (g.org_id) groupCounts[g.org_id] = (groupCounts[g.org_id] ?? 0) + 1;
    }
  }

  return (
    <div className="min-h-screen pb-52">
      <div className="px-4 pt-12 pb-5 flex items-center gap-3" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
        <Link href="/admin" style={{ color: "#30D158" }} className="flex items-center gap-0.5 text-sm font-medium">
          <ChevronLeft size={18} strokeWidth={2} />
          Admin
        </Link>
        <h1 className="text-[17px] font-semibold text-white flex-1 text-center -ml-16 pointer-events-none">Organizations</h1>
      </div>

      <div className="px-4 pt-5">
        <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
          {(orgs ?? []).length === 0 ? (
            <p className="text-sm px-4 py-4" style={{ color: "rgba(255,255,255,0.3)" }}>No organizations yet.</p>
          ) : (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (orgs ?? []).map((org: any, i) => {
              const isLast = i === (orgs ?? []).length - 1;
              const statusStyle = STATUS_COLORS[org.billing_status] ?? STATUS_COLORS.trial;
              return (
                <Link
                  key={org.id}
                  href={`/org/${org.id}`}
                  className="flex items-center justify-between px-4 py-3.5 transition-opacity active:opacity-70"
                  style={{ borderBottom: isLast ? "none" : `0.5px solid ${DIVIDER}` }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{org.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                      {groupCounts[org.id] ?? 0} group{groupCounts[org.id] !== 1 ? "s" : ""}
                      {org.slug ? ` · /${org.slug}` : ""}
                    </p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full ml-3 shrink-0 capitalize" style={statusStyle}>
                    {org.billing_status}
                  </span>
                </Link>
              );
            })
          )}
        </div>

        {(orgs ?? []).length === PAGE && (
          <div className="mt-4 text-center">
            <Link href={`/admin/orgs?page=${page + 1}`} className="text-sm font-medium px-5 py-2.5 rounded-xl inline-block" style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)" }}>
              Load more
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
