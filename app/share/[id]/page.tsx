import { createServiceClient } from "@/lib/supabase/server";
import { Trophy } from "lucide-react";
import { notFound } from "next/navigation";

const GOLD = "#C9A84C";
const GREEN = "#30D158";

type Params = { params: Promise<{ id: string }> };

type TeeTimeRow = {
  id: string;
  scheduled_at: string;
  format: string | null;
  course_name: string | null;
  group_id: string | null;
  group: { name: string } | null;
};

type TeamRow = { id: string; name: string; color: string | null };

type ScoreRow = {
  id: string;
  user_id: string | null;
  guest_invite_id: string | null;
  gross_score: number;
  hole_scores: Record<string, number> | null;
  handicap_used: number | null;
  profile: { display_name: string } | null;
  guest_invite: { accepted_name: string; team_id: string | null } | null;
};

type RsvpRow = { user_id: string; team_id: string | null };

export default async function SharePage({ params }: Params) {
  const { id: teeTimeId } = await params;
  const svc = createServiceClient();

  const { data: ttRaw } = await svc
    .from("tee_times")
    .select("id, scheduled_at, format, course_name, group_id, group:groups(name)")
    .eq("id", teeTimeId)
    .single();

  if (!ttRaw) notFound();
  const tt = ttRaw as unknown as TeeTimeRow;

  const [{ data: teamsRaw }, { data: scoresRaw }, { data: rsvpsRaw }] = await Promise.all([
    svc.from("teams").select("id, name, color").eq("group_id", tt.group_id ?? ""),
    svc
      .from("round_scores")
      .select(
        "id, user_id, guest_invite_id, gross_score, hole_scores, handicap_used, " +
        "profile:profiles(display_name), guest_invite:guest_invites(accepted_name, team_id)"
      )
      .eq("tee_time_id", teeTimeId)
      .order("gross_score", { ascending: true }),
    svc.from("rsvps").select("user_id, team_id").eq("tee_time_id", teeTimeId),
  ]);

  const teams: TeamRow[] = (teamsRaw as unknown as TeamRow[]) ?? [];
  const allScores: ScoreRow[] = (scoresRaw as unknown as ScoreRow[]) ?? [];
  const rsvps: RsvpRow[] = (rsvpsRaw as unknown as RsvpRow[]) ?? [];

  const rsvpTeamMap = new Map(rsvps.map(r => [r.user_id, r.team_id]));
  const teamsMap = new Map(teams.map(t => [t.id, t]));

  const formatLabel: Record<string, string> = {
    stroke: "Stroke Play",
    best_ball: "Best Ball",
    scramble: "Scramble",
    match_play: "Match Play",
    stableford: "Stableford",
  };

  const dateStr = new Date(tt.scheduled_at).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
    timeZone: "America/Los_Angeles",
  });

  function playerName(s: ScoreRow): string {
    return s.profile?.display_name ?? s.guest_invite?.accepted_name ?? "Guest";
  }

  function playerTeam(s: ScoreRow): TeamRow | undefined {
    const teamId = s.user_id
      ? rsvpTeamMap.get(s.user_id)
      : s.guest_invite?.team_id;
    return teamId ? teamsMap.get(teamId) : undefined;
  }

  // Compute team totals
  const isBestBall = tt.format === "best_ball";
  const isScramble = tt.format === "scramble";
  const teamTotals: Record<string, number> = {};
  const teamBestBall: Record<string, Record<number, number>> = {};

  if (isBestBall || isScramble) {
    for (const s of allScores) {
      const team = playerTeam(s);
      if (!team) continue;
      if (isScramble) {
        if (teamTotals[team.id] == null || s.gross_score < teamTotals[team.id]) {
          teamTotals[team.id] = s.gross_score;
        }
      } else {
        if (!teamBestBall[team.id]) teamBestBall[team.id] = {};
        const hs = s.hole_scores;
        if (hs) {
          for (let h = 1; h <= 18; h++) {
            const v = hs[String(h)];
            if (v != null && (teamBestBall[team.id][h] == null || v < teamBestBall[team.id][h])) {
              teamBestBall[team.id][h] = v;
            }
          }
        }
      }
    }
    if (isBestBall) {
      for (const tid of Object.keys(teamBestBall)) {
        const vals = Object.values(teamBestBall[tid]);
        if (vals.length >= 9) teamTotals[tid] = vals.reduce((a, b) => a + b, 0);
      }
    }
  }

  const sortedTeams = teams
    .filter(t => teamTotals[t.id] != null)
    .sort((a, b) => (teamTotals[a.id] ?? 999) - (teamTotals[b.id] ?? 999));

  const winnerTeam = sortedTeams[0];
  const winnerPlayer = allScores[0];

  const HOLE_W = 28;
  const NAME_W = 80;
  const SUB_W = 36;
  const TOT_W = 42;
  const FRONT = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const BACK = [10, 11, 12, 13, 14, 15, 16, 17, 18];

  function holeSum(hs: Record<string, number> | null, holes: number[]): number {
    if (!hs) return 0;
    return holes.reduce((acc, h) => acc + (hs[String(h)] ?? 0), 0);
  }

  const hasHoleData = allScores.some(s => s.hole_scores && Object.keys(s.hole_scores).length > 0);

  return (
    <div style={{ minHeight: "100vh", background: "#0a0f1a", color: "#fff" }}>
      {/* Header */}
      <div style={{ background: "rgba(201,168,76,0.08)", borderBottom: "0.5px solid rgba(201,168,76,0.2)", padding: "20px 16px 16px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: GOLD, textTransform: "uppercase", marginBottom: 4 }}>
            GolfPack · Round Results
          </p>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px", lineHeight: 1.2 }}>
            {tt.course_name ?? "Golf Round"}
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: 0 }}>
            {dateStr}
            {tt.format ? ` · ${formatLabel[tt.format] ?? tt.format}` : ""}
            {tt.group?.name ? ` · ${tt.group.name}` : ""}
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 40px" }}>

        {/* Winner banner */}
        {(winnerTeam ?? winnerPlayer) && (
          <div
            style={{
              background: "rgba(201,168,76,0.10)",
              border: "0.5px solid rgba(201,168,76,0.28)",
              borderRadius: 16,
              padding: "14px 16px",
              marginBottom: 20,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Trophy size={18} style={{ color: GOLD, flexShrink: 0 }} />
            <div>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: GOLD, textTransform: "uppercase" }}>
                Winner
              </p>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
                {winnerTeam
                  ? `${winnerTeam.name} — ${teamTotals[winnerTeam.id]}`
                  : winnerPlayer
                    ? `${playerName(winnerPlayer)} — ${winnerPlayer.gross_score}`
                    : ""}
              </p>
            </div>
          </div>
        )}

        {/* Team results */}
        {sortedTeams.length >= 2 && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: GOLD, textTransform: "uppercase", marginBottom: 8 }}>
              {isBestBall ? "Best Ball" : "Scramble"} Results
            </p>
            <div style={{ background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(80,200,110,0.16)", borderRadius: 14, overflow: "hidden" }}>
              {sortedTeams.map((team, i) => (
                <div
                  key={team.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "12px 16px",
                    borderBottom: i < sortedTeams.length - 1 ? "0.5px solid rgba(80,200,110,0.10)" : "none",
                    borderLeft: `3px solid ${team.color ?? "rgba(255,255,255,0.2)"}`,
                  }}
                >
                  {i === 0
                    ? <Trophy size={14} style={{ color: GOLD, marginRight: 8, flexShrink: 0 }} />
                    : <div style={{ width: 22 }} />}
                  <span style={{ fontWeight: 700, flex: 1, color: team.color ?? "#fff" }}>{team.name}</span>
                  <span style={{ fontWeight: 800, fontSize: 18 }}>{teamTotals[team.id] ?? "—"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Individual scores */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: GOLD, textTransform: "uppercase", marginBottom: 8 }}>
            Scores
          </p>
          <div style={{ background: "rgba(255,255,255,0.05)", border: "0.5px solid rgba(80,200,110,0.16)", borderRadius: 14, overflow: "hidden" }}>
            {allScores.map((s, i) => {
              const team = playerTeam(s);
              return (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "10px 16px",
                    borderBottom: i < allScores.length - 1 ? "0.5px solid rgba(80,200,110,0.10)" : "none",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.3)", width: 20, flexShrink: 0 }}>
                    {i + 1}
                  </span>
                  <span style={{ flex: 1, fontWeight: 600 }}>{playerName(s)}</span>
                  {team && (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: team.color ?? "rgba(255,255,255,0.4)",
                        background: "rgba(255,255,255,0.06)",
                        borderRadius: 6,
                        padding: "2px 6px",
                        marginRight: 10,
                      }}
                    >
                      {team.name}
                    </span>
                  )}
                  <span style={{ fontWeight: 800, fontSize: 16 }}>{s.gross_score}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Scorecard grid */}
        {hasHoleData && (
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: GOLD, textTransform: "uppercase", marginBottom: 8 }}>
              Scorecard
            </p>
            <div
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "0.5px solid rgba(80,200,110,0.16)",
                borderRadius: 14,
                overflowX: "auto",
                WebkitOverflowScrolling: "touch",
              } as React.CSSProperties}
            >
              <div style={{ minWidth: NAME_W + HOLE_W * 18 + SUB_W * 2 + TOT_W + 20 }}>

                {/* Header */}
                <div
                  style={{
                    display: "flex",
                    height: 24,
                    background: "rgba(255,255,255,0.03)",
                    borderBottom: "0.5px solid rgba(80,200,110,0.10)",
                    alignItems: "center",
                  }}
                >
                  <div style={{ width: NAME_W, flexShrink: 0, paddingLeft: 10, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.22)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Player
                  </div>
                  {FRONT.map(h => (
                    <div key={h} style={{ width: HOLE_W, flexShrink: 0, textAlign: "center", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.28)" }}>{h}</div>
                  ))}
                  <div style={{ width: SUB_W, flexShrink: 0, textAlign: "center", fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.32)", letterSpacing: "0.06em" }}>OUT</div>
                  {BACK.map(h => (
                    <div key={h} style={{ width: HOLE_W, flexShrink: 0, textAlign: "center", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.28)" }}>{h}</div>
                  ))}
                  <div style={{ width: SUB_W, flexShrink: 0, textAlign: "center", fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.32)", letterSpacing: "0.06em" }}>IN</div>
                  <div style={{ width: TOT_W, flexShrink: 0, textAlign: "center", fontSize: 9, fontWeight: 800, color: GOLD, letterSpacing: "0.06em" }}>TOT</div>
                </div>

                {/* Score rows */}
                {allScores.map((s, i) => {
                  const hs = s.hole_scores;
                  const out = holeSum(hs, FRONT);
                  const inn = holeSum(hs, BACK);
                  return (
                    <div
                      key={s.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        height: 36,
                        borderBottom: i < allScores.length - 1 ? "0.5px solid rgba(80,200,110,0.08)" : "none",
                      }}
                    >
                      <div style={{ width: NAME_W, flexShrink: 0, paddingLeft: 10, paddingRight: 4, fontSize: 12, fontWeight: 600, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                        {playerName(s).split(" ")[0]}
                      </div>
                      {FRONT.map(h => (
                        <div key={h} style={{ width: HOLE_W, flexShrink: 0, textAlign: "center", fontSize: 12, fontWeight: 500, color: hs?.[String(h)] ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.13)" }}>
                          {hs?.[String(h)] ?? "·"}
                        </div>
                      ))}
                      <div style={{ width: SUB_W, flexShrink: 0, textAlign: "center", fontSize: 12, fontWeight: 700, color: out > 0 ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.13)" }}>
                        {out > 0 ? out : "—"}
                      </div>
                      {BACK.map(h => (
                        <div key={h} style={{ width: HOLE_W, flexShrink: 0, textAlign: "center", fontSize: 12, fontWeight: 500, color: hs?.[String(h)] ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.13)" }}>
                          {hs?.[String(h)] ?? "·"}
                        </div>
                      ))}
                      <div style={{ width: SUB_W, flexShrink: 0, textAlign: "center", fontSize: 12, fontWeight: 700, color: inn > 0 ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.13)" }}>
                        {inn > 0 ? inn : "—"}
                      </div>
                      <div style={{ width: TOT_W, flexShrink: 0, textAlign: "center", fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.95)" }}>
                        {s.gross_score}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <p style={{ textAlign: "center", marginTop: 32, fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
          Shared via GolfPack · golfpack.app
        </p>
      </div>
    </div>
  );
}

// Suppress unused import warning — GREEN used in future team-color tinting
void GREEN;
