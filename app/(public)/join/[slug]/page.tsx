import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { Building2 } from "lucide-react";

type Params = { params: Promise<{ slug: string }> };

export default async function OrgJoinPage({ params }: Params) {
  const { slug } = await params;
  const svc = createServiceClient();

  const { data: org } = await svc
    .from("organizations")
    .select("id, name, logo_url, groups(id, name, invite_code)")
    .eq("slug", slug)
    .single();

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://golfpack.app";

  if (!org) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: "#0f172a" }}>
        <span className="text-4xl mb-4">⛳</span>
        <h1 className="text-xl font-bold text-white mb-2">Club not found</h1>
        <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.45)" }}>
          This link may be invalid or the club hasn&apos;t set up their page yet.
        </p>
        <Link href="/login" className="text-sm font-semibold" style={{ color: "#30D158" }}>Go to GolfPack</Link>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groups = (org.groups ?? []) as any[];

  return (
    <div className="min-h-screen px-4 pt-14 pb-20" style={{ background: "#0f172a" }}>
      <div className="max-w-sm mx-auto">
        {/* Club identity */}
        <div className="text-center mb-8">
          {org.logo_url ? (
            <img src={org.logo_url} alt={org.name} className="w-20 h-20 rounded-3xl mx-auto mb-4 object-cover" />
          ) : (
            <div className="w-20 h-20 rounded-3xl mx-auto mb-4 flex items-center justify-center" style={{ background: "rgba(201,168,76,0.15)" }}>
              <Building2 size={36} style={{ color: "#C9A84C" }} />
            </div>
          )}
          <h1 className="text-[28px] font-bold text-white tracking-tight">{org.name}</h1>
          <p className="text-sm mt-2" style={{ color: "rgba(255,255,255,0.45)" }}>
            Join your club on GolfPack to schedule tee times with your group.
          </p>
        </div>

        {/* Groups to join */}
        {groups.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-wide mb-3 px-1" style={{ color: "#C9A84C" }}>Choose your group</p>
            <div className="space-y-2">
              {groups.map((g) => (
                <Link
                  key={g.id}
                  href={`${APP_URL}/invite/${g.invite_code}`}
                  className="block p-4 rounded-2xl transition-opacity active:opacity-70"
                  style={{ background: "rgba(255,255,255,0.055)", border: "0.5px solid rgba(80,200,110,0.16)" }}
                >
                  <p className="font-semibold text-white">{g.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>Tap to join</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Install CTA */}
        <div className="rounded-2xl p-4 mb-4" style={{ background: "rgba(48,209,88,0.08)", border: "0.5px solid rgba(48,209,88,0.2)" }}>
          <p className="text-sm font-medium text-white mb-1">New to GolfPack?</p>
          <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.5)" }}>
            Install the app first, then tap your group above.
          </p>
          <Link
            href="/install"
            className="inline-block text-xs font-semibold px-4 py-2 rounded-xl"
            style={{ background: "#30D158", color: "#000" }}
          >
            Install GolfPack ↗
          </Link>
        </div>

        <Link
          href="/login"
          className="block w-full py-4 rounded-2xl text-base font-semibold text-black text-center"
          style={{ background: "#30D158" }}
        >
          Open GolfPack
        </Link>
      </div>
    </div>
  );
}
