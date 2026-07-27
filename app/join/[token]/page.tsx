import { createClient, createServiceClient } from "@/lib/supabase/server";
import Link from "next/link";
import { AcceptAppInvite } from "./AcceptAppInvite";

type PageProps = { params: Promise<{ token: string }> };

export default async function JoinPage({ params }: PageProps) {
  const { token } = await params;

  // Service client so logged-out visitors can resolve the invite + inviter name.
  const svc = createServiceClient();
  const { data: invite } = await svc
    .from("app_invites")
    .select("token, invitee_name, inviter:profiles!inviter_id(display_name)")
    .eq("token", token)
    .maybeSingle();

  if (!invite) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-center">
        <div className="text-4xl mb-4">🏌️</div>
        <h1 className="text-xl font-bold text-white mb-2">Invalid invite link</h1>
        <p className="text-slate-400 text-sm">This invite doesn&apos;t exist or has expired.</p>
      </div>
    );
  }

  // Embedded relation may type as an object or a single-element array depending on FK inference.
  const inviterRaw = invite.inviter as unknown;
  const inviterProfile = (Array.isArray(inviterRaw) ? inviterRaw[0] : inviterRaw) as { display_name?: string } | null;
  const inviterName = inviterProfile?.display_name?.trim() || "A friend";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Logged in already → run the accept flow (stamp referral, then route to
  // group creation or the schedule) on the client.
  if (user) {
    return <AcceptAppInvite token={token} />;
  }

  // Logged out → warm landing, then deep-link into signup carrying the token.
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-center">
      <div className="w-16 h-16 rounded-[18px] flex items-center justify-center mx-auto mb-5 text-3xl" style={{ background: "rgba(48,209,88,0.15)" }}>
        ⛳
      </div>
      <h1 className="text-2xl font-bold text-white mb-2">{inviterName} invited you to GolfPack</h1>
      <p className="text-slate-400 text-sm mb-8 max-w-xs">
        Set up tee times, RSVPs, and scoring for your own golf crew. Create your account and you&apos;ll be the admin of your group.
      </p>
      <Link
        href={`/login?mode=signup&next=/join/${token}`}
        className="font-semibold px-8 py-3.5 rounded-2xl text-base text-black"
        style={{ background: "#30D158" }}
      >
        Create your account
      </Link>
      <Link
        href={`/login?next=/join/${token}`}
        className="mt-4 text-sm font-medium"
        style={{ color: "rgba(255,255,255,0.4)" }}
      >
        Already have an account? Sign in
      </Link>
    </div>
  );
}
