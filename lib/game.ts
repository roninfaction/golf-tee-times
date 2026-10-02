// Game results and stake settlement for a round. Pure functions shared by the round page
// (to show who won) and the settle API (to post money to tabs), so both always agree.

export type GameFormat = "scramble" | "best_ball" | "match_play" | "stroke";

export const GAME_FORMATS: { value: GameFormat; label: string; team: boolean; byHole: boolean; blurb: string }[] = [
  { value: "scramble",   label: "Scramble",    team: true,  byHole: false, blurb: "Teams play one ball. Lowest team score wins." },
  { value: "best_ball",  label: "Best ball",   team: true,  byHole: true,  blurb: "Each team counts its best score on every hole. Most holes won wins." },
  { value: "match_play", label: "Match play",  team: false, byHole: true,  blurb: "Everyone for themselves, hole by hole. Most holes won wins." },
  { value: "stroke",     label: "Stroke play", team: false, byHole: false, blurb: "Lowest total wins. Uses handicaps if you enter them." },
];

// Includes retired formats so old rounds still read correctly.
export const FORMAT_LABELS: Record<string, string> = {
  scramble: "Scramble", best_ball: "Best ball", match_play: "Match play", stroke: "Stroke play", stableford: "Stableford",
};

export function formatInfo(format: string | null) {
  return GAME_FORMATS.find(f => f.value === format) ?? null;
}

export type GameTeam = { id: string; name: string; color: string | null };
export type GamePlayer = { key: string; userId: string | null; guestId: string | null; name: string; teamId: string | null };
export type GameScore = { userId: string | null; guestId: string | null; gross: number; handicap: number | null; holes: Record<string, number> | null };

export type Standing = { id: string; name: string; color: string | null; main: string; sub?: string; winner: boolean };
export type GameResult = {
  state: "waiting" | "decided" | "tie";
  headline: string;
  detail?: string;
  standings: Standing[];
  winnerKeys: string[];
  loserKeys: string[];
  missing?: string;
};

export function playerKey(userId: string | null, guestId: string | null): string {
  return userId ? `u:${userId}` : `g:${guestId}`;
}

function scoreOf(p: GamePlayer, scores: GameScore[]): GameScore | undefined {
  return scores.find(s => (p.userId ? s.userId === p.userId : s.guestId === p.guestId));
}

function holeCount(s: GameScore | undefined): number {
  return s?.holes ? Object.keys(s.holes).length : 0;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

const WAITING = (missing: string): GameResult => ({
  state: "waiting", headline: "Waiting on scores", standings: [], winnerKeys: [], loserKeys: [], missing,
});

// Rank sides by value. Lower wins unless higherWins. A shared top value is a tie.
function rank<T extends { value: number }>(sides: T[], higherWins = false): { sorted: T[]; tie: boolean } {
  const sorted = [...sides].sort((a, b) => (higherWins ? b.value - a.value : a.value - b.value));
  const tie = sorted.length >= 2 && sorted[0].value === sorted[1].value;
  return { sorted, tie };
}

export function computeResult(
  formatRaw: string | null,
  teams: GameTeam[],
  players: GamePlayer[],
  scores: GameScore[],
): GameResult {
  const format = formatRaw ?? "stroke";
  if (scores.length === 0) return WAITING("Add scores after the round to see who won.");

  if (format === "scramble" || format === "best_ball") {
    const sides = teams
      .map(team => ({ team, members: players.filter(p => p.teamId === team.id) }))
      .filter(s => s.members.length > 0);
    if (sides.length < 2) return WAITING("Put players on at least two teams.");

    if (format === "scramble") {
      const scored = sides
        .map(s => {
          const vals = s.members.map(m => scoreOf(m, scores)?.gross).filter((v): v is number => v != null);
          return { ...s, value: vals.length ? Math.min(...vals) : NaN };
        })
        .filter(s => !Number.isNaN(s.value));
      if (scored.length < sides.length) return WAITING("Every team needs a score.");
      const { sorted, tie } = rank(scored);
      const standings = sorted.map((s, i) => ({
        id: s.team.id, name: s.team.name, color: s.team.color, main: String(s.value),
        sub: s.members.map(m => m.name.split(" ")[0]).join(", "),
        winner: !tie && i === 0,
      }));
      if (tie) return { state: "tie", headline: "All square", detail: `Tied at ${sorted[0].value}`, standings, winnerKeys: [], loserKeys: [] };
      return {
        state: "decided",
        headline: `${sorted[0].team.name} wins`,
        detail: `${sorted[0].value} to ${sorted[1].value}`,
        standings,
        winnerKeys: sorted[0].members.map(m => m.key),
        loserKeys: sorted.slice(1).flatMap(s => s.members.map(m => m.key)),
      };
    }

    // Best ball: each team's best score on each hole, compared hole by hole.
    const best = sides.map(s => {
      const perHole: Record<number, number> = {};
      for (let h = 1; h <= 18; h++) {
        const vals = s.members.map(m => scoreOf(m, scores)?.holes?.[String(h)]).filter((v): v is number => v != null);
        if (vals.length) perHole[h] = Math.min(...vals);
      }
      return { ...s, perHole };
    });
    if (best.some(b => Object.keys(b.perHole).length < 9)) {
      return WAITING("Best ball is decided hole by hole. Scan the card or enter scores hole by hole.");
    }
    const won: Record<string, number> = {};
    let halved = 0;
    for (let h = 1; h <= 18; h++) {
      const pts = best.filter(b => b.perHole[h] != null).map(b => ({ id: b.team.id, v: b.perHole[h] }));
      if (pts.length < 2) continue;
      const min = Math.min(...pts.map(p => p.v));
      const top = pts.filter(p => p.v === min);
      if (top.length === 1) won[top[0].id] = (won[top[0].id] ?? 0) + 1;
      else halved++;
    }
    const valued = best.map(b => ({ ...b, value: won[b.team.id] ?? 0, strokes: Object.values(b.perHole).reduce((a, c) => a + c, 0) }));
    const { sorted, tie } = rank(valued, true);
    const standings = sorted.map((s, i) => ({
      id: s.team.id, name: s.team.name, color: s.team.color, main: plural(s.value, "hole"),
      sub: `${s.strokes} strokes · ${s.members.map(m => m.name.split(" ")[0]).join(", ")}`,
      winner: !tie && i === 0,
    }));
    const halvedNote = halved ? `, ${plural(halved, "hole")} halved` : "";
    if (tie) return { state: "tie", headline: "All square", detail: `${plural(sorted[0].value, "hole")} each${halvedNote}`, standings, winnerKeys: [], loserKeys: [] };
    return {
      state: "decided",
      headline: `${sorted[0].team.name} wins`,
      detail: `${plural(sorted[0].value, "hole")} to ${sorted[1].value}${halvedNote}`,
      standings,
      winnerKeys: sorted[0].members.map(m => m.key),
      loserKeys: sorted.slice(1).flatMap(s => s.members.map(m => m.key)),
    };
  }

  if (format === "match_play") {
    const scored = players.map(p => ({ p, s: scoreOf(p, scores) })).filter(x => holeCount(x.s) >= 9);
    if (scored.length < 2) return WAITING("Match play is decided hole by hole. Scan the card or enter scores hole by hole.");
    const won: Record<string, number> = {};
    let halved = 0;
    for (let h = 1; h <= 18; h++) {
      const pts = scored.filter(x => x.s!.holes![String(h)] != null).map(x => ({ key: x.p.key, v: x.s!.holes![String(h)] }));
      if (pts.length < 2) continue;
      const min = Math.min(...pts.map(p => p.v));
      const top = pts.filter(p => p.v === min);
      if (top.length === 1) won[top[0].key] = (won[top[0].key] ?? 0) + 1;
      else halved++;
    }
    const valued = scored.map(x => ({ ...x, value: won[x.p.key] ?? 0 }));
    const { sorted, tie } = rank(valued, true);
    const standings = sorted.map((x, i) => ({
      id: x.p.key, name: x.p.name, color: null, main: plural(x.value, "hole"), sub: `${x.s!.gross} strokes`, winner: !tie && i === 0,
    }));
    const halvedNote = halved ? `, ${plural(halved, "hole")} halved` : "";
    if (tie) return { state: "tie", headline: "All square", detail: `Tied at ${plural(sorted[0].value, "hole")}${halvedNote}`, standings, winnerKeys: [], loserKeys: [] };
    return {
      state: "decided",
      headline: `${sorted[0].p.name} wins`,
      detail: `${plural(sorted[0].value, "hole")} to ${sorted[1].value}${halvedNote}`,
      standings,
      winnerKeys: [sorted[0].p.key],
      loserKeys: sorted.slice(1).map(x => x.p.key),
    };
  }

  // Stroke play (also the fallback for retired formats and old rounds with no game set).
  const scored = players.map(p => ({ p, s: scoreOf(p, scores) })).filter(x => x.s);
  if (scored.length < 2) return WAITING("Need scores for at least two players.");
  const useNet = scored.some(x => x.s!.handicap != null);
  const valued = scored.map(x => ({
    ...x,
    value: useNet && x.s!.handicap != null ? x.s!.gross - Math.round(x.s!.handicap) : x.s!.gross,
  }));
  const { sorted, tie } = rank(valued);
  const standings = sorted.map((x, i) => ({
    id: x.p.key, name: x.p.name, color: null,
    main: String(x.value),
    sub: useNet ? (x.s!.handicap != null ? `${x.s!.gross} gross, ${x.s!.handicap} hcp` : `${x.s!.gross} gross, no hcp`) : undefined,
    winner: !tie && i === 0,
  }));
  const label = useNet ? "net" : "";
  if (tie) return { state: "tie", headline: "All square", detail: `Tied at ${sorted[0].value}${label ? ` ${label}` : ""}`, standings, winnerKeys: [], loserKeys: [] };
  return {
    state: "decided",
    headline: `${sorted[0].p.name} wins`,
    detail: `${sorted[0].value} to ${sorted[1].value}${label ? ` ${label}` : ""}`,
    standings,
    winnerKeys: [sorted[0].p.key],
    loserKeys: sorted.slice(1).map(x => x.p.key),
  };
}

export type Settlement = { winnerId: string; loserId: string; cents: number }[];

// Every losing player owes the stake, split evenly across the winning players.
// 2v2 at $10: each loser pays each winner $5, so everyone wins or loses $10.
// Only members have tabs; guests on either side are left out.
export function settle(result: GameResult, players: GamePlayer[], stakeCents: number | null): Settlement {
  if (result.state !== "decided" || !stakeCents) return [];
  const byKey = new Map(players.map(p => [p.key, p]));
  const winners = result.winnerKeys.map(k => byKey.get(k)?.userId).filter((v): v is string => !!v);
  const losers = result.loserKeys.map(k => byKey.get(k)?.userId).filter((v): v is string => !!v);
  if (!winners.length || !losers.length) return [];
  const cents = Math.round(stakeCents / winners.length);
  return losers.flatMap(loserId => winners.map(winnerId => ({ winnerId, loserId, cents })));
}

export function guestsLeftOut(result: GameResult, players: GamePlayer[]): boolean {
  const byKey = new Map(players.map(p => [p.key, p]));
  return [...result.winnerKeys, ...result.loserKeys].some(k => byKey.get(k)?.guestId);
}

export function money(cents: number): string {
  const abs = Math.abs(cents);
  return abs % 100 === 0 ? `$${abs / 100}` : `$${(abs / 100).toFixed(2)}`;
}
