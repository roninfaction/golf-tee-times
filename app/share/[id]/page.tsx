import { createClient, createServiceClient } from "@/lib/supabase/server";
import { Trophy, ChevronLeft } from "lucide-react";
import Link from "next/link";

const GOLD = "#C9A84C";
const GREEN = "#30D158";

type Params = { params: Promise<{ id: string }> };

type TeamRow = { id: string; name: string; color: string | null };
type ScoreRow = {
  id: string;
  user_id: string | null;
  guest_invite_id: string | null;
  gross_score: number;
  net_score: number | null;
  handicap_used: number | null;
  hole_scores: Record<string, number> | null;
  profile: { display_name: string } | null;
  guest_invite: { accepted_name: string; team_id: string | null } | null;
};
type RsvpRow = { user_id: string; team_id: string | null };

const HOLE_W = 28;
const NAME_W = 80;
const SUB_W = 36;
const TOT_W = 42;
const FRONT = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const BACK = [10, 11, 12, 13, 14, 15, 16, 17, 18];

const FORMAT_LABELS: Record<string, string> = {
  stroke: "Stroke Play", best_ball: "Best Ball",
  scramble: "Scramble", match_play: "Match Play", stableford: "Stableford",
};

function holeSum(hs: Record<string, number> | null, holes: number[]): number {
  if (!hs) return 0;
  return holes.reduce((acc, h) => acc + (hs[String(h)] ?? 0), 0);
}

export default async function SharePage({ params }: Params) {
  const { id: teeTimeId } = await params;
  const svc = createServiceClient();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isLoggedIn = !!user;

  const { data: ttRaw, error: ttError } = await svc
    .from("tee_times").select("*").eq("id", teeTimeId).single();

  if (ttError || !ttRaw) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0f1a", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 8 }}>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)" }}>Results not found</p>
        {ttError && <p style={{ fontSize: 11, color: "#FF453A", fontFamily: "monospace" }}>{ttError.message}</p>}
      </div>
    );
  }

  // Results are always publicly viewable by their share link (unguessable UUID).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tt = ttRaw as any;

  // Run all fetches in parallel — course photo is a free DB lookup, no external API
  const [{ data: teamsRaw }, { data: scoresRaw }, { data: rsvpsRaw }, { data: groupRaw }, { data: courseRaw }] = await Promise.all([
    svc.from("tee_time_teams").select("id, name, color").eq("tee_time_id", teeTimeId),
    svc.from("round_scores")
      .select("id, user_id, guest_invite_id, gross_score, net_score, handicap_used, hole_scores, profile:profiles(display_name), guest_invite:guest_invites(accepted_name, team_id)")
      .eq("tee_time_id", teeTimeId).order("gross_score", { ascending: true }),
    svc.from("rsvps").select("user_id, team_id").eq("tee_time_id", teeTimeId),
    tt.group_id ? svc.from("groups").select("name").eq("id", tt.group_id).single() : Promise.resolve({ data: null }),
    tt.course_place_id ? svc.from("courses").select("photo_uri, name").eq("place_id", tt.course_place_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const teams: TeamRow[] = (teamsRaw as unknown as TeamRow[]) ?? [];
  const allScores: ScoreRow[] = (scoresRaw as unknown as ScoreRow[]) ?? [];
  const rsvps: RsvpRow[] = (rsvpsRaw as unknown as RsvpRow[]) ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const groupName: string | null = (groupRaw as any)?.name ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const coursePhotoUri: string | null = (courseRaw as any)?.photo_uri ?? null;

  const rsvpTeamMap = new Map(rsvps.map(r => [r.user_id, r.team_id]));
  const teamsMap = new Map(teams.map(t => [t.id, t]));

  function playerName(s: ScoreRow): string {
    return s.profile?.display_name ?? s.guest_invite?.accepted_name ?? "Guest";
  }
  function playerTeam(s: ScoreRow): TeamRow | undefined {
    const tid = s.user_id ? rsvpTeamMap.get(s.user_id) : s.guest_invite?.team_id;
    return tid ? teamsMap.get(tid) : undefined;
  }

  const isBestBall = tt.format === "best_ball";
  const isScramble = tt.format === "scramble";
  const hasNetScores = allScores.some(s => s.net_score != null);

  // ── Group scores by team ────────────────────────────────────────────────
  const scoresByTeam: Record<string, ScoreRow[]> = {};
  for (const s of allScores) {
    const team = playerTeam(s);
    if (!team) continue;
    if (!scoresByTeam[team.id]) scoresByTeam[team.id] = [];
    scoresByTeam[team.id].push(s);
  }

  // ── Best-ball per-hole + holes won ──────────────────────────────────────
  const teamBestPerHole: Record<string, Record<number, number | null>> = {};
  const teamBestTotals: Record<string, number | null> = {};
  let halvedTotal = 0;
  const teamHolesWon: Record<string, number> = {};
  let hasAnyHoleData = false;

  if (isBestBall) {
    for (const team of teams) {
      if (!scoresByTeam[team.id]) continue;
      teamBestPerHole[team.id] = {};
      teamHolesWon[team.id] = 0;
      for (let h = 1; h <= 18; h++) {
        const vals = scoresByTeam[team.id]
          .map(s => s.hole_scores?.[String(h)] ?? null)
          .filter((v): v is number => v !== null);
        teamBestPerHole[team.id][h] = vals.length > 0 ? Math.min(...vals) : null;
        if (vals.length > 0) hasAnyHoleData = true;
      }
      const vals = Object.values(teamBestPerHole[team.id]).filter((v): v is number => v !== null);
      teamBestTotals[team.id] = vals.length >= 9 ? vals.reduce((a, b) => a + b, 0) : null;
    }
    const teamIds = teams.filter(t => teamBestPerHole[t.id]).map(t => t.id);
    if (teamIds.length >= 2) {
      for (let h = 1; h <= 18; h++) {
        const pts = teamIds.map(id => ({ id, score: teamBestPerHole[id]?.[h] ?? null })).filter(t => t.score !== null);
        if (pts.length < 2) continue;
        const min = Math.min(...pts.map(t => t.score!));
        const winners = pts.filter(t => t.score === min);
        if (winners.length === 1) teamHolesWon[winners[0].id] = (teamHolesWon[winners[0].id] ?? 0) + 1;
        else halvedTotal++;
      }
    }
  }

  // ── Scramble totals ─────────────────────────────────────────────────────
  const scrambleTotals: Record<string, number> = {};
  if (isScramble) {
    for (const team of teams) {
      const members = scoresByTeam[team.id] ?? [];
      if (members.length > 0) scrambleTotals[team.id] = Math.min(...members.map(s => s.gross_score));
    }
  }

  // ── Sort teams ──────────────────────────────────────────────────────────
  const sortedTeams = teams.filter(t => scoresByTeam[t.id]).sort((a, b) => {
    if (isBestBall) {
      const hw = (teamHolesWon[b.id] ?? 0) - (teamHolesWon[a.id] ?? 0);
      return hw !== 0 ? hw : (teamBestTotals[a.id] ?? 999) - (teamBestTotals[b.id] ?? 999);
    }
    if (isScramble) return (scrambleTotals[a.id] ?? 999) - (scrambleTotals[b.id] ?? 999);
    return 0;
  });

  // ── Date formatting — field is tee_datetime ─────────────────────────────
  const rawDate = tt.tee_datetime ?? tt.scheduled_at;
  const dateObj = rawDate ? new Date(rawDate) : null;
  const dateStr = dateObj && !isNaN(dateObj.getTime())
    ? dateObj.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" })
    : null;

  const winnerPlayer = allScores[0];
  const winnerTeam = sortedTeams[0];

  const cell = (w: number, extra?: React.CSSProperties): React.CSSProperties => ({
    width: w, flexShrink: 0, textAlign: "center", ...extra,
  });

  return (
    <div style={{ minHeight: "100vh", background: "#0a0f1a", color: "#fff" }}>

      {/* ── Back to app — logged-in users only ──────────────────────────── */}
      {isLoggedIn && (
        <div style={{ position: "sticky", top: 0, zIndex: 10, background: "rgba(10,15,26,0.92)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderBottom: "0.5px solid rgba(255,255,255,0.07)", padding: "10px 16px" }}>
          <Link
            href={`/tee-times/${teeTimeId}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 14, fontWeight: 600, color: "#30D158", textDecoration: "none" }}
          >
            <ChevronLeft size={16} strokeWidth={2.5} />
            View tee time
          </Link>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{ position: "relative", background: "rgba(201,168,76,0.08)", borderBottom: "0.5px solid rgba(201,168,76,0.2)", overflow: "hidden" }}>
        {/* Course photo banner */}
        {coursePhotoUri && (
          <>
            <img
              src={coursePhotoUri}
              alt={tt.course_name ?? "Course"}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.22 }}
            />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(10,15,26,0.3), rgba(10,15,26,0.85))" }} />
          </>
        )}
        <div style={{ position: "relative", maxWidth: 640, margin: "0 auto", padding: coursePhotoUri ? "32px 16px 24px" : "20px 16px 16px" }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: GOLD, textTransform: "uppercase", marginBottom: 4 }}>
            GolfPack · Round Results
          </p>
          <h1 style={{ fontSize: coursePhotoUri ? 26 : 22, fontWeight: 800, margin: "0 0 6px", lineHeight: 1.2 }}>
            {tt.course_name ?? "Golf Round"}
          </h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", margin: 0 }}>
            {dateStr ?? "—"}
            {tt.format ? ` · ${FORMAT_LABELS[tt.format] ?? tt.format}` : ""}
            {groupName ? ` · ${groupName}` : ""}
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 40px" }}>

        {/* ── Winner banner ────────────────────────────────────────────── */}
        {(winnerTeam ?? winnerPlayer) && (
          <div style={{ background: "rgba(201,168,76,0.10)", border: "0.5px solid rgba(201,168,76,0.28)", borderRadius: 16, padding: "14px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
            <Trophy size={18} style={{ color: GOLD, flexShrink: 0 }} />
            <div>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: GOLD, textTransform: "uppercase" }}>Winner</p>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
                {isBestBall && winnerTeam
                  ? `${winnerTeam.name} · ${teamHolesWon[winnerTeam.id] ?? 0} hole${teamHolesWon[winnerTeam.id] !== 1 ? "s" : ""}`
                  : isScramble && winnerTeam
                    ? `${winnerTeam.name} · ${scrambleTotals[winnerTeam.id]}`
                    : winnerPlayer
                      ? `${playerName(winnerPlayer)} · ${winnerPlayer.gross_score}`
                      : ""}
              </p>
            </div>
          </div>
        )}

        {/* ── Best ball results ────────────────────────────────────────── */}
        {isBestBall && sortedTeams.length >= 2 && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: GOLD, textTransform: "uppercase", marginBottom: 8 }}>Best ball</p>
            <div style={{ background: "rgba(255,255,255,0.055)", border: "0.5px solid rgba(80,200,110,0.16)", borderRadius: 14, overflow: "hidden" }}>
              {sortedTeams.map((team, i) => {
                const isFirst = i === 0;
                const isLast = i === sortedTeams.length - 1;
                const members = scoresByTeam[team.id] ?? [];
                const grossList = members.map(s => s.gross_score).join(" + ");
                const bbTotal = teamBestTotals[team.id];
                const breakdown = bbTotal != null ? `${grossList} → ${bbTotal}` : grossList;
                return (
                  <div key={team.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: isLast ? "none" : "0.5px solid rgba(80,200,110,0.10)" }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: team.color ?? "#fff", flexShrink: 0 }} />
                    {isFirst ? <Trophy size={14} style={{ color: GOLD, flexShrink: 0 }} /> : <div style={{ width: 14, flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{team.name}</p>
                      <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{breakdown}</p>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: isFirst ? GOLD : "rgba(255,255,255,0.5)" }}>
                        {teamHolesWon[team.id] ?? 0} hole{teamHolesWon[team.id] !== 1 ? "s" : ""}
                      </p>
                      {bbTotal != null && <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{bbTotal} strokes</p>}
                    </div>
                  </div>
                );
              })}
              <div style={{ padding: "8px 16px", borderTop: "0.5px solid rgba(80,200,110,0.10)", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                {halvedTotal} hole{halvedTotal !== 1 ? "s" : ""} halved
              </div>
            </div>
          </div>
        )}

        {/* ── Scramble results ─────────────────────────────────────────── */}
        {isScramble && sortedTeams.length >= 2 && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: GOLD, textTransform: "uppercase", marginBottom: 8 }}>Scramble</p>
            <div style={{ background: "rgba(255,255,255,0.055)", border: "0.5px solid rgba(80,200,110,0.16)", borderRadius: 14, overflow: "hidden" }}>
              {sortedTeams.map((team, i) => (
                <div key={team.id} style={{ display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: i < sortedTeams.length - 1 ? "0.5px solid rgba(80,200,110,0.10)" : "none", borderLeft: `3px solid ${team.color ?? "rgba(255,255,255,0.2)"}` }}>
                  {i === 0 ? <Trophy size={14} style={{ color: GOLD, marginRight: 8, flexShrink: 0 }} /> : <div style={{ width: 22 }} />}
                  <span style={{ fontWeight: 700, flex: 1, color: team.color ?? "#fff" }}>{team.name}</span>
                  <span style={{ fontWeight: 800, fontSize: 18 }}>{scrambleTotals[team.id] ?? "—"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Scores list ──────────────────────────────────────────────── */}
        {allScores.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: GOLD, textTransform: "uppercase", marginBottom: 8 }}>Scores</p>
            <div style={{ background: "rgba(255,255,255,0.055)", border: "0.5px solid rgba(80,200,110,0.16)", borderRadius: 14, overflow: "hidden" }}>
              {allScores.map((s, i) => {
                const team = playerTeam(s);
                const isFirst = i === 0 && !isBestBall && !isScramble;
                return (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", padding: "10px 16px", borderBottom: i < allScores.length - 1 ? "0.5px solid rgba(80,200,110,0.10)" : "none" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.3)", width: 20, flexShrink: 0 }}>{i + 1}</span>
                    {isFirst ? <Trophy size={13} style={{ color: GOLD, marginRight: 6, flexShrink: 0 }} /> : <div style={{ width: 19 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>{playerName(s)}</p>
                      {s.handicap_used != null && (
                        <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                          HCP {s.handicap_used}
                          {s.net_score != null ? ` · Net ${s.net_score}` : ""}
                        </p>
                      )}
                    </div>
                    {team && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: team.color ?? "rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.06)", borderRadius: 6, padding: "2px 6px", marginRight: 10, flexShrink: 0 }}>
                        {team.name}
                      </span>
                    )}
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <p style={{ margin: 0, fontWeight: 800, fontSize: 17 }}>{s.gross_score}</p>
                      {s.net_score != null && s.handicap_used != null && (
                        <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Net {s.net_score}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {hasNetScores && (
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 6, paddingLeft: 4 }}>
                Net scores shown where handicap was recorded
              </p>
            )}
          </div>
        )}

        {/* ── Scorecard grid ───────────────────────────────────────────── */}
        {allScores.some(s => s.hole_scores && Object.keys(s.hole_scores).length > 0) && (
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: GOLD, textTransform: "uppercase", marginBottom: 8 }}>Scorecard</p>
            <div style={{ background: "rgba(255,255,255,0.055)", border: "0.5px solid rgba(80,200,110,0.16)", borderRadius: 14, overflowX: "auto", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
              <div style={{ minWidth: NAME_W + HOLE_W * 18 + SUB_W * 2 + TOT_W + 20 }}>

                {/* Header */}
                <div style={{ display: "flex", height: 24, background: "rgba(255,255,255,0.03)", borderBottom: "0.5px solid rgba(80,200,110,0.10)", alignItems: "center" }}>
                  <div style={{ width: NAME_W, flexShrink: 0, paddingLeft: 10, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.22)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Player</div>
                  {FRONT.map(h => <div key={h} style={cell(HOLE_W, { fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.28)" })}>{h}</div>)}
                  <div style={cell(SUB_W, { fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.32)", letterSpacing: "0.06em" })}>OUT</div>
                  {BACK.map(h => <div key={h} style={cell(HOLE_W, { fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.28)" })}>{h}</div>)}
                  <div style={cell(SUB_W, { fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.32)", letterSpacing: "0.06em" })}>IN</div>
                  <div style={cell(TOT_W, { fontSize: 9, fontWeight: 800, color: GOLD, letterSpacing: "0.06em" })}>TOT</div>
                </div>

                {/* Rows grouped by team */}
                {(() => {
                  const groups: { team: TeamRow | null; rows: ScoreRow[] }[] = [];
                  if (teams.length > 0) {
                    for (const team of teams) {
                      const rows = allScores.filter(s => playerTeam(s)?.id === team.id);
                      if (rows.length > 0) groups.push({ team, rows });
                    }
                    const unassigned = allScores.filter(s => !playerTeam(s));
                    if (unassigned.length > 0) groups.push({ team: null, rows: unassigned });
                  } else {
                    groups.push({ team: null, rows: allScores });
                  }

                  return groups.map((group, gi) => {
                    const bph = isBestBall && group.team ? teamBestPerHole[group.team.id] ?? {} : {};
                    const showBest = isBestBall && group.team !== null && group.rows.length >= 2 && hasAnyHoleData;
                    const bestOut = FRONT.reduce((a, h) => a + (bph[h] ?? 0), 0);
                    const bestIn = BACK.reduce((a, h) => a + (bph[h] ?? 0), 0);
                    const bestTot = bestOut + bestIn;

                    return (
                      <div key={group.team?.id ?? "unassigned"}>
                        {group.team && (
                          <div style={{ height: 22, paddingLeft: 12, display: "flex", alignItems: "center", background: "rgba(255,255,255,0.018)", borderTop: gi > 0 ? "0.5px solid rgba(80,200,110,0.10)" : "none", borderBottom: "0.5px solid rgba(80,200,110,0.10)", borderLeft: `2.5px solid ${group.team.color ?? "rgba(255,255,255,0.2)"}` }}>
                            <span style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: group.team.color ?? "rgba(255,255,255,0.4)" }}>{group.team.name}</span>
                          </div>
                        )}
                        {group.rows.map((s, ri) => {
                          const hs = s.hole_scores;
                          const out = holeSum(hs, FRONT);
                          const inn = holeSum(hs, BACK);
                          const isLast = ri === group.rows.length - 1 && !showBest && gi === groups.length - 1;
                          return (
                            <div key={s.id} style={{ display: "flex", alignItems: "center", height: 36, borderBottom: isLast ? "none" : "0.5px solid rgba(80,200,110,0.08)" }}>
                              <div style={{ width: NAME_W, flexShrink: 0, paddingLeft: 10, paddingRight: 4, fontSize: 12, fontWeight: 600, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{playerName(s).split(" ")[0]}</div>
                              {FRONT.map(h => <div key={h} style={cell(HOLE_W, { fontSize: 12, fontWeight: 500, color: hs?.[String(h)] != null ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.13)" })}>{hs?.[String(h)] ?? "·"}</div>)}
                              <div style={cell(SUB_W, { fontSize: 12, fontWeight: 700, color: out > 0 ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.13)" })}>{out > 0 ? out : "—"}</div>
                              {BACK.map(h => <div key={h} style={cell(HOLE_W, { fontSize: 12, fontWeight: 500, color: hs?.[String(h)] != null ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.13)" })}>{hs?.[String(h)] ?? "·"}</div>)}
                              <div style={cell(SUB_W, { fontSize: 12, fontWeight: 700, color: inn > 0 ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.13)" })}>{inn > 0 ? inn : "—"}</div>
                              <div style={cell(TOT_W, { fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.95)" })}>{s.gross_score}</div>
                            </div>
                          );
                        })}
                        {showBest && (
                          <div style={{ display: "flex", alignItems: "center", height: 38, background: "rgba(48,209,88,0.07)", borderTop: "0.5px solid rgba(48,209,88,0.18)", borderBottom: gi < groups.length - 1 ? "0.5px solid rgba(80,200,110,0.10)" : "none" }}>
                            <div style={{ width: NAME_W, flexShrink: 0, paddingLeft: 10, fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: GREEN }}>Best</div>
                            {FRONT.map(h => <div key={h} style={cell(HOLE_W, { fontSize: 12, fontWeight: 700, color: bph[h] != null ? GREEN : "rgba(48,209,88,0.2)" })}>{bph[h] ?? "·"}</div>)}
                            <div style={cell(SUB_W, { fontSize: 12, fontWeight: 700, color: bestOut > 0 ? GREEN : "rgba(48,209,88,0.2)" })}>{bestOut > 0 ? bestOut : "—"}</div>
                            {BACK.map(h => <div key={h} style={cell(HOLE_W, { fontSize: 12, fontWeight: 700, color: bph[h] != null ? GREEN : "rgba(48,209,88,0.2)" })}>{bph[h] ?? "·"}</div>)}
                            <div style={cell(SUB_W, { fontSize: 12, fontWeight: 700, color: bestIn > 0 ? GREEN : "rgba(48,209,88,0.2)" })}>{bestIn > 0 ? bestIn : "—"}</div>
                            <div style={cell(TOT_W, { fontSize: 14, fontWeight: 800, color: GREEN })}>{bestTot > 0 ? bestTot : "—"}</div>
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
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
