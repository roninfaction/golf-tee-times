import type { SupabaseClient } from "@supabase/supabase-js";

export type SideBet = {
  id: string;
  created_at: string;
  created_by: string;
  winner_id: string;
  loser_id: string;
  amount_cents: number;
  note: string | null;
  kind: "bet" | "game" | "settle";
  tee_time_id: string | null;
};

// Positive = the other person owes me.
export function balanceWith(bets: SideBet[], me: string, other: string): number {
  let cents = 0;
  for (const b of bets) {
    if (b.winner_id === me && b.loser_id === other) cents += b.amount_cents;
    else if (b.winner_id === other && b.loser_id === me) cents -= b.amount_cents;
  }
  return cents;
}

// Everyone who shares at least one group with this user (the people they can bet with).
export async function groupmates(svc: SupabaseClient, userId: string) {
  const { data: mine } = await svc.from("group_members").select("group_id").eq("user_id", userId);
  const groupIds = (mine ?? []).map(m => m.group_id as string);
  if (!groupIds.length) return [];
  const { data: rows } = await svc
    .from("group_members")
    .select("user_id, profile:profiles(id, display_name, avatar_url, venmo_username)")
    .in("group_id", groupIds)
    .neq("user_id", userId);
  const seen = new Map<string, { id: string; name: string; avatarUrl: string | null; venmo: string | null }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (rows ?? []) as any[]) {
    if (!seen.has(r.user_id)) {
      seen.set(r.user_id, { id: r.user_id, name: r.profile?.display_name ?? "Player", avatarUrl: r.profile?.avatar_url ?? null, venmo: r.profile?.venmo_username ?? null });
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadBetsBetween(svc: SupabaseClient, me: string, other: string): Promise<SideBet[]> {
  const { data } = await svc
    .from("side_bets")
    .select("*")
    .or(`and(winner_id.eq.${me},loser_id.eq.${other}),and(winner_id.eq.${other},loser_id.eq.${me})`);
  return (data ?? []) as SideBet[];
}
