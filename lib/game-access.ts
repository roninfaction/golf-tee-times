import type { SupabaseClient } from "@supabase/supabase-js";

// Who can set up a round's game, enter everyone's scores, and settle the stake:
// anyone playing in it, whoever booked it, or a group admin. One person holds the card.
export async function canManageGame(svc: SupabaseClient, teeTimeId: string, userId: string) {
  const { data: tt } = await svc
    .from("tee_times")
    .select("id, created_by, group_id, course_name, format, stake_cents")
    .eq("id", teeTimeId)
    .maybeSingle();
  if (!tt) return { tt: null, allowed: false };
  if (tt.created_by === userId) return { tt, allowed: true };

  const [{ data: rsvp }, { data: gm }] = await Promise.all([
    svc.from("rsvps").select("status").eq("tee_time_id", teeTimeId).eq("user_id", userId).maybeSingle(),
    svc.from("group_members").select("role").eq("group_id", tt.group_id).eq("user_id", userId).maybeSingle(),
  ]);
  return { tt, allowed: rsvp?.status === "accepted" || gm?.role === "admin" };
}

// Players on a round in the shape lib/game.ts expects: accepted members, then accepted guests.
export async function loadGamePlayers(svc: SupabaseClient, teeTimeId: string) {
  const [{ data: rsvps }, { data: guests }, { data: teams }, { data: scores }] = await Promise.all([
    svc.from("rsvps").select("user_id, team_id, profile:profiles(display_name)").eq("tee_time_id", teeTimeId).eq("status", "accepted"),
    svc.from("guest_invites").select("id, team_id, accepted_name, invitee_name").eq("tee_time_id", teeTimeId).eq("status", "accepted"),
    svc.from("tee_time_teams").select("id, name, color").eq("tee_time_id", teeTimeId).order("name"),
    svc.from("round_scores").select("user_id, guest_invite_id, gross_score, handicap_used, hole_scores").eq("tee_time_id", teeTimeId),
  ]);
  const players = [
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(rsvps ?? []).map((r: any) => ({
      key: `u:${r.user_id}`, userId: r.user_id as string, guestId: null,
      name: (r.profile?.display_name as string) ?? "Player", teamId: (r.team_id as string | null) ?? null,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(guests ?? []).map((g: any) => ({
      key: `g:${g.id}`, userId: null, guestId: g.id as string,
      name: (g.accepted_name ?? g.invitee_name ?? "Guest") as string, teamId: (g.team_id as string | null) ?? null,
    })),
  ];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gameScores = (scores ?? []).map((s: any) => ({
    userId: s.user_id as string | null, guestId: s.guest_invite_id as string | null,
    gross: s.gross_score as number, handicap: s.handicap_used != null ? Number(s.handicap_used) : null,
    holes: (s.hole_scores as Record<string, number> | null) ?? null,
  }));
  return { players, teams: (teams ?? []) as { id: string; name: string; color: string | null }[], scores: gameScores };
}
