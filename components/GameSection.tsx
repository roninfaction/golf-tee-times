"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";
import { Trophy, Camera, ImageIcon, Pencil, ChevronRight, X, RotateCw, Share2, Check } from "lucide-react";
import { DigitalScorecard } from "@/components/DigitalScorecard";
import {
  GAME_FORMATS, FORMAT_LABELS, formatInfo, computeResult, settle, guestsLeftOut, money,
  type GameTeam, type GamePlayer, type GameScore,
} from "@/lib/game";

const GOLD = "#C9A84C";
const GREEN = "#30D158";
const RED = "#FF453A";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";
const MUTED = "rgba(255,255,255,0.4)";
const TEAM_COLORS = ["#30D158", "#C9A84C", "#0A84FF", "#FF453A"];

export type GamePlayerWithHcp = GamePlayer & { handicap: number | null };
export type SavedScore = {
  id: string;
  user_id: string | null;
  guest_invite_id: string | null;
  gross_score: number;
  handicap_used: number | null;
  hole_scores: Record<string, number> | null;
  scorecard_image_url: string | null;
};
export type SettledLine = { winnerName: string; loserName: string; cents: number };

type DraftTeam = { name: string; color: string };
type Entry = { total: string; hcp: string; holes: string[] };

async function authHeaders() {
  const { data: { session } } = await createClient().auth.getSession();
  return { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` };
}

function firstName(name: string) {
  return name.split(" ")[0];
}

function joinNames(names: string[]) {
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// "Matt and Brian win $10 each" / "Tyson and John pay $10 each": one line per amount,
// instead of every winner/loser pair.
function moneyLines(pairs: { winner: string; loser: string; cents: number }[]): string[] {
  const net = new Map<string, number>();
  for (const p of pairs) {
    net.set(p.winner, (net.get(p.winner) ?? 0) + p.cents);
    net.set(p.loser, (net.get(p.loser) ?? 0) - p.cents);
  }
  const groups = new Map<number, string[]>();
  for (const [name, cents] of net) if (cents !== 0) groups.set(cents, [...(groups.get(cents) ?? []), name]);
  return [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([cents, names]) => `${joinNames(names)} ${cents > 0 ? (names.length > 1 ? "win" : "wins") : (names.length > 1 ? "pay" : "pays")} ${money(cents)}${names.length > 1 ? " each" : ""}`);
}

export function GameSection({
  teeTimeId, userId, canManage, isTodayOrPast, holes, format, stakeCents, teams, players, scores, settled, shareUrl,
}: {
  teeTimeId: string;
  userId: string;
  canManage: boolean;
  isTodayOrPast: boolean;
  holes: number;
  format: string | null;
  stakeCents: number | null;
  teams: GameTeam[];
  players: GamePlayerWithHcp[];
  scores: SavedScore[];
  settled: SettledLine[];
  shareUrl: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "setup" | "scores">("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Setup draft ───────────────────────────────────────────────────────────
  const [draftFormat, setDraftFormat] = useState<string>(format ?? "scramble");
  const [draftTeams, setDraftTeams] = useState<DraftTeam[]>([]);
  const [draftAssign, setDraftAssign] = useState<Record<string, number | null>>({});
  const [draftStake, setDraftStake] = useState("");

  // ── Score entry draft ─────────────────────────────────────────────────────
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [scanPath, setScanPath] = useState<string | null>(null);
  const [scanState, setScanState] = useState<"idle" | "reading" | "read" | "failed">("idle");
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  // ── View extras ───────────────────────────────────────────────────────────
  const [showHoles, setShowHoles] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoTurn, setPhotoTurn] = useState(0);
  const [shared, setShared] = useState(false);

  const info = formatInfo(format);
  const holeNums = Array.from({ length: holes === 9 ? 9 : 18 }, (_, i) => i + 1);
  const gameScores: GameScore[] = scores.map(s => ({
    userId: s.user_id, guestId: s.guest_invite_id, gross: s.gross_score,
    handicap: s.handicap_used != null ? Number(s.handicap_used) : null, holes: s.hole_scores,
  }));
  const result = computeResult(format, teams, players, gameScores);
  const isSettled = settled.length > 0;
  const preview = settle(result, players, stakeCents);
  const nameOf = (uid: string) => players.find(p => p.userId === uid)?.name ?? "Player";
  const photoPath = scores.find(s => s.scorecard_image_url)?.scorecard_image_url ?? null;
  const hasHoles = scores.some(s => s.hole_scores && Object.keys(s.hole_scores).length > 0);

  function scoreFor(p: GamePlayer) {
    return scores.find(s => (p.userId ? s.user_id === p.userId : s.guest_invite_id === p.guestId));
  }

  // ── Open setup ────────────────────────────────────────────────────────────
  function openSetup() {
    const existingTeams = teams.length
      ? teams.map((t, i) => ({ name: t.name, color: t.color ?? TEAM_COLORS[i % TEAM_COLORS.length] }))
      : [{ name: "Team A", color: TEAM_COLORS[0] }, { name: "Team B", color: TEAM_COLORS[1] }];
    const assign: Record<string, number | null> = {};
    players.forEach((p, i) => {
      const idx = teams.findIndex(t => t.id === p.teamId);
      // First time through, split players evenly so most groups only tweak a name or two.
      assign[p.key] = teams.length ? (idx >= 0 ? idx : null) : i % 2;
    });
    setDraftFormat(format ?? "scramble");
    setDraftTeams(existingTeams);
    setDraftAssign(assign);
    setDraftStake(stakeCents ? String(stakeCents / 100) : "");
    setError(null);
    setMode("setup");
  }

  async function saveGame() {
    const fmt = formatInfo(draftFormat);
    if (!fmt) return;
    const stakeNum = draftStake.trim() ? Math.round(parseFloat(draftStake) * 100) : null;
    if (stakeNum != null && (!Number.isFinite(stakeNum) || stakeNum <= 0)) {
      setError("Enter the stake as a dollar amount, like 10.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tee-times/${teeTimeId}/game`, {
      method: "PUT",
      headers: await authHeaders(),
      body: JSON.stringify({
        format: fmt.value,
        stake_cents: stakeNum,
        teams: fmt.team
          ? draftTeams.map((t, i) => ({
              name: t.name.trim() || `Team ${String.fromCharCode(65 + i)}`,
              color: t.color,
              members: players.filter(p => draftAssign[p.key] === i).map(p => p.key),
            }))
          : [],
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't save the game. Try again.");
      return;
    }
    setMode("view");
    router.refresh();
  }

  async function removeGame() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tee-times/${teeTimeId}/game`, { method: "DELETE", headers: await authHeaders() });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't remove the game. Try again.");
      return;
    }
    setMode("view");
    router.refresh();
  }

  // ── Open score entry ──────────────────────────────────────────────────────
  function blankEntry(): Entry {
    return { total: "", hcp: "", holes: holeNums.map(() => "") };
  }

  function openScores() {
    const next: Record<string, Entry> = {};
    if (format === "scramble") {
      for (const t of teams) {
        const member = players.find(p => p.teamId === t.id && scoreFor(p));
        const s = member ? scoreFor(member) : undefined;
        next[t.id] = { ...blankEntry(), total: s ? String(s.gross_score) : "" };
      }
    } else {
      for (const p of players) {
        const s = scoreFor(p);
        const hcp = s?.handicap_used ?? p.handicap;
        next[p.key] = {
          total: s ? String(s.gross_score) : "",
          hcp: hcp != null ? String(hcp) : "",
          holes: holeNums.map(h => (s?.hole_scores?.[String(h)] != null ? String(s.hole_scores[String(h)]) : "")),
        };
      }
    }
    setEntries(next);
    setScanPath(null);
    setScanState("idle");
    setError(null);
    setMode("scores");
  }

  function setEntry(key: string, patch: Partial<Entry>) {
    setEntries(prev => ({ ...prev, [key]: { ...(prev[key] ?? blankEntry()), ...patch } }));
  }

  async function handleScan(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setScanState("reading");
    setError(null);
    const supabase = createClient();
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${userId}/${teeTimeId}_group.${ext}`;
    const { error: upErr } = await supabase.storage.from("scorecards").upload(path, file, { upsert: true });
    if (upErr) {
      setScanState("failed");
      setError("Couldn't upload that photo. Try again, or type the scores in below.");
      return;
    }
    setScanPath(path);
    const res = await fetch(`/api/tee-times/${teeTimeId}/scores/ocr-group`, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ storage_path: path }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setScanState("failed");
      setError(body.error && body.error !== "Could not read scorecard"
        ? body.error
        : "Couldn't read that photo. Try a clearer shot, or type the scores in below.");
      return;
    }
    const { players: read } = await res.json() as {
      players: { user_id: string | null; guest_invite_id: string | null; gross_score: number | null; hole_scores: Record<string, number> | null }[];
    };
    setEntries(prev => {
      const next = { ...prev };
      for (const r of read) {
        if (r.gross_score == null) continue;
        const p = players.find(pl => (r.user_id ? pl.userId === r.user_id : pl.guestId === r.guest_invite_id));
        if (!p) continue;
        if (format === "scramble") {
          if (p.teamId) next[p.teamId] = { ...(next[p.teamId] ?? blankEntry()), total: String(r.gross_score) };
        } else {
          next[p.key] = {
            ...(next[p.key] ?? blankEntry()),
            total: String(r.gross_score),
            holes: holeNums.map(h => (r.hole_scores?.[String(h)] != null ? String(r.hole_scores[String(h)]) : (next[p.key]?.holes[h - 1] ?? ""))),
          };
        }
      }
      return next;
    });
    setScanState("read");
  }

  async function saveScores() {
    setError(null);
    type Job = { player: GamePlayerWithHcp; gross?: number; hcp: number | null; holes: Record<string, number> | null } | { player: GamePlayerWithHcp; remove: string };
    const jobs: Job[] = [];
    const byHole = info?.byHole ?? false;

    if (format === "scramble") {
      for (const t of teams) {
        const raw = entries[t.id]?.total.trim() ?? "";
        const members = players.filter(p => p.teamId === t.id);
        if (!raw) {
          for (const m of members) { const s = scoreFor(m); if (s) jobs.push({ player: m, remove: s.id }); }
          continue;
        }
        const gross = parseInt(raw);
        if (!(gross >= 18 && gross <= 180)) { setError(`${t.name}'s score doesn't look right.`); return; }
        for (const m of members) jobs.push({ player: m, gross, hcp: null, holes: null });
      }
    } else {
      for (const p of players) {
        const en = entries[p.key] ?? blankEntry();
        const hcp = en.hcp.trim() ? parseFloat(en.hcp) : null;
        if (byHole) {
          const filled = en.holes.filter(v => v.trim()).length;
          if (filled === 0) { const s = scoreFor(p); if (s) jobs.push({ player: p, remove: s.id }); continue; }
          if (filled < holeNums.length) { setError(`Fill in every hole for ${firstName(p.name)}, or clear the row.`); return; }
          const holesObj: Record<string, number> = {};
          holeNums.forEach((h, i) => { holesObj[String(h)] = parseInt(en.holes[i]); });
          if (Object.values(holesObj).some(v => !(v >= 1 && v <= 20))) { setError(`One of ${firstName(p.name)}'s holes doesn't look right.`); return; }
          jobs.push({ player: p, hcp, holes: holesObj });
        } else {
          const raw = en.total.trim();
          if (!raw) { const s = scoreFor(p); if (s) jobs.push({ player: p, remove: s.id }); continue; }
          const gross = parseInt(raw);
          if (!(gross >= 18 && gross <= 180)) { setError(`${firstName(p.name)}'s score doesn't look right.`); return; }
          jobs.push({ player: p, gross, hcp, holes: null });
        }
      }
    }

    setBusy(true);
    const headers = await authHeaders();
    const results = await Promise.all(jobs.map(async job => {
      if ("remove" in job) {
        return fetch(`/api/tee-times/${teeTimeId}/scores`, { method: "DELETE", headers, body: JSON.stringify({ score_id: job.remove }) });
      }
      const p = job.player;
      return fetch(`/api/tee-times/${teeTimeId}/scores`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          gross_score: job.gross,
          handicap_used: job.hcp,
          hole_scores: job.holes,
          source: scanPath ? "photo_ocr" : "manual",
          scorecard_image_url: scanPath ?? scoreFor(p)?.scorecard_image_url ?? null,
          ...(p.guestId ? { guest_invite_id: p.guestId } : p.userId !== userId ? { target_user_id: p.userId } : {}),
        }),
      });
    }));
    setBusy(false);
    const failed = results.filter(r => !r.ok).length;
    if (failed) {
      setError(`${failed} score${failed > 1 ? "s" : ""} didn't save. Check them and try again.`);
      router.refresh();
      return;
    }
    setMode("view");
    router.refresh();
  }

  // ── Money ─────────────────────────────────────────────────────────────────
  async function settleBet() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tee-times/${teeTimeId}/game/settle`, { method: "POST", headers: await authHeaders() });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't settle the bet. Try again.");
    }
    router.refresh();
  }

  async function undoSettle() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/tee-times/${teeTimeId}/game/settle`, { method: "DELETE", headers: await authHeaders() });
    setBusy(false);
    if (!res.ok) setError("Couldn't undo it. Try again.");
    router.refresh();
  }

  async function openPhoto() {
    if (!photoPath) return;
    const { data } = await createClient().storage.from("scorecards").createSignedUrl(photoPath.replace("scorecards/", ""), 300);
    if (data?.signedUrl) { setPhotoTurn(0); setPhotoUrl(data.signedUrl); }
  }

  async function shareResults() {
    if (navigator.share) {
      try { await navigator.share({ title: "Round results", url: shareUrl }); return; } catch { /* dismissed: fall through to copy */ }
    }
    await navigator.clipboard.writeText(shareUrl).catch(() => {});
    setShared(true);
    setTimeout(() => setShared(false), 2200);
  }

  const label = (text: string) => (
    <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>{text}</p>
  );
  const errorLine = error && <p className="text-sm px-1 pt-1" style={{ color: RED }}>{error}</p>;

  // ═══ No game ═══════════════════════════════════════════════════════════════
  if (mode === "view" && !format && scores.length === 0) {
    if (!canManage) return null;
    return (
      <button
        onClick={openSetup}
        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left active:opacity-70 transition-opacity"
        style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}
      >
        <Trophy size={17} style={{ color: GOLD, flexShrink: 0 }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white">Playing a game?</p>
          <p className="text-xs mt-0.5" style={{ color: MUTED }}>Teams, stakes and scores. Optional.</p>
        </div>
        <ChevronRight size={16} style={{ color: "rgba(255,255,255,0.25)", flexShrink: 0 }} />
      </button>
    );
  }

  // ═══ Setup ═════════════════════════════════════════════════════════════════
  if (mode === "setup") {
    const fmt = formatInfo(draftFormat);
    const unassigned = fmt?.team ? players.filter(p => draftAssign[p.key] == null).length : 0;
    return (
      <div>
        {label("Game")}
        <div className="rounded-2xl p-4 space-y-5" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
          <div>
            <div className="grid grid-cols-2 gap-2">
              {GAME_FORMATS.map(f => {
                const on = draftFormat === f.value;
                return (
                  <button
                    key={f.value}
                    onClick={() => setDraftFormat(f.value)}
                    className="py-2.5 rounded-xl text-sm font-semibold"
                    style={{
                      background: on ? GREEN : "rgba(255,255,255,0.05)",
                      color: on ? "#000" : "rgba(255,255,255,0.65)",
                      border: on ? "none" : `0.5px solid ${CARD_BORDER}`,
                    }}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
            {fmt && <p className="text-xs mt-2.5 px-0.5 leading-relaxed" style={{ color: MUTED }}>{fmt.blurb}</p>}
          </div>

          {fmt?.team && (
            <div className="space-y-3">
              <div className="space-y-2">
                {draftTeams.map((t, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: `0.5px solid ${CARD_BORDER}` }}>
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: t.color }} />
                    <input
                      value={t.name}
                      maxLength={30}
                      onChange={e => setDraftTeams(prev => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                      className="flex-1 min-w-0 bg-transparent text-sm text-white outline-none"
                      placeholder={`Team ${String.fromCharCode(65 + i)}`}
                    />
                    {draftTeams.length > 2 && (
                      <button
                        aria-label={`Remove ${t.name}`}
                        onClick={() => {
                          setDraftTeams(prev => prev.filter((_, j) => j !== i));
                          setDraftAssign(prev => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, v === i ? null : v != null && v > i ? v - 1 : v])));
                        }}
                        className="w-8 h-8 -mr-1 flex items-center justify-center shrink-0"
                        style={{ color: "rgba(255,255,255,0.35)" }}
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                ))}
                {draftTeams.length < 4 && (
                  <button
                    onClick={() => setDraftTeams(prev => [...prev, { name: `Team ${String.fromCharCode(65 + prev.length)}`, color: TEAM_COLORS[prev.length] }])}
                    className="text-xs font-semibold px-1 py-1"
                    style={{ color: GREEN }}
                  >
                    + Add a team
                  </button>
                )}
              </div>

              <div className="rounded-xl overflow-hidden" style={{ border: `0.5px solid ${CARD_BORDER}` }}>
                {players.map((p, i) => (
                  <div key={p.key} className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: i === players.length - 1 ? "none" : `0.5px solid ${DIVIDER}` }}>
                    <span className="text-sm text-white flex-1 min-w-0 truncate">
                      {p.name}{p.guestId && <span className="text-xs ml-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>guest</span>}
                    </span>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {draftTeams.map((t, ti) => {
                        const on = draftAssign[p.key] === ti;
                        return (
                          <button
                            key={ti}
                            onClick={() => setDraftAssign(prev => ({ ...prev, [p.key]: on ? null : ti }))}
                            className="min-w-[44px] h-8 px-2.5 rounded-lg text-xs font-semibold max-w-[96px] truncate"
                            style={{
                              background: on ? t.color : "transparent",
                              color: on ? "#000" : "rgba(255,255,255,0.5)",
                              border: on ? "none" : `1px solid ${t.color}66`,
                            }}
                          >
                            {t.name.trim() || `Team ${String.fromCharCode(65 + ti)}`}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {players.length === 0 && (
                  <p className="px-3 py-3 text-sm" style={{ color: MUTED }}>Nobody&apos;s confirmed yet. Teams fill in once people say they&apos;re going.</p>
                )}
              </div>
              {unassigned > 0 && (
                <p className="text-xs px-0.5" style={{ color: MUTED }}>{unassigned} player{unassigned > 1 ? "s" : ""} not on a team won&apos;t count.</p>
              )}
            </div>
          )}

          <div>
            <p className="text-sm font-medium text-white mb-2 px-0.5">Money on it? <span className="font-normal" style={{ color: MUTED }}>Optional</span></p>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: `0.5px solid ${CARD_BORDER}` }}>
              <span className="text-sm" style={{ color: MUTED }}>$</span>
              <input
                inputMode="decimal"
                value={draftStake}
                onChange={e => setDraftStake(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0"
                className="w-20 bg-transparent text-sm text-white outline-none placeholder:text-white/20"
              />
              <span className="text-sm" style={{ color: MUTED }}>a player</span>
            </div>
            <p className="text-xs mt-2 px-0.5 leading-relaxed" style={{ color: MUTED }}>
              Losers pay winners. After the round, settle it and it goes on everyone&apos;s side bet tab.
            </p>
          </div>

          {errorLine}

          <div className="flex gap-2">
            <button
              onClick={saveGame}
              disabled={busy}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-black"
              style={{ background: GREEN, opacity: busy ? 0.6 : 1 }}
            >
              {busy ? "Saving…" : "Save game"}
            </button>
            <button
              onClick={() => { setMode("view"); setError(null); }}
              className="px-5 py-3 rounded-xl text-sm font-semibold"
              style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)" }}
            >
              Cancel
            </button>
          </div>
          {format && (
            <button onClick={removeGame} disabled={busy} className="w-full text-center text-xs font-semibold py-1" style={{ color: RED }}>
              Remove the game
            </button>
          )}
        </div>
      </div>
    );
  }

  // ═══ Score entry ═══════════════════════════════════════════════════════════
  if (mode === "scores") {
    const byHole = info?.byHole ?? false;
    const showHcp = format === "stroke" || !format;
    const holeInput = (key: string, en: Entry, idx: number) => (
      <input
        key={idx}
        inputMode="numeric"
        maxLength={2}
        value={en.holes[idx] ?? ""}
        aria-label={`Hole ${holeNums[idx]}`}
        onChange={e => {
          const v = e.target.value.replace(/\D/g, "").slice(0, 2);
          const next = [...en.holes];
          next[idx] = v;
          setEntry(key, { holes: next });
        }}
        className="h-9 rounded-md text-center text-sm font-semibold text-white bg-transparent outline-none placeholder:text-white/15"
        style={{ border: `0.5px solid ${CARD_BORDER}`, minWidth: 0 }}
        placeholder={String(holeNums[idx])}
      />
    );
    return (
      <div>
        {label(`${FORMAT_LABELS[format ?? ""] ?? "Game"} scores`)}
        <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleScan} />
          <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={handleScan} />
          <div className="flex gap-2 p-3" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
            <button
              onClick={() => cameraRef.current?.click()}
              disabled={scanState === "reading"}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: "rgba(48,209,88,0.12)", color: GREEN }}
            >
              <Camera size={15} /> {scanState === "reading" ? "Reading…" : "Scan the card"}
            </button>
            <button
              onClick={() => galleryRef.current?.click()}
              disabled={scanState === "reading"}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
              style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.6)" }}
            >
              <ImageIcon size={15} /> Photo
            </button>
          </div>
          <p className="px-4 pt-3 text-xs" style={{ color: scanState === "read" ? GREEN : MUTED }}>
            {scanState === "read"
              ? "Read the card. Check the numbers, then save."
              : scanState === "reading"
              ? "Reading the scorecard…"
              : byHole
              ? `${FORMAT_LABELS[format ?? ""]} is decided hole by hole. Scan the card, or type each hole in.`
              : format === "scramble"
              ? "One score per team."
              : "Scan the card, or type the totals in."}
          </p>

          <div className="p-3 space-y-2.5">
            {format === "scramble"
              ? teams.map(t => {
                  const en = entries[t.id] ?? blankEntry();
                  const members = players.filter(p => p.teamId === t.id);
                  return (
                    <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ background: t.color ?? "#fff" }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{t.name}</p>
                        <p className="text-xs truncate" style={{ color: MUTED }}>{members.map(m => firstName(m.name)).join(", ") || "No players"}</p>
                      </div>
                      <input
                        inputMode="numeric"
                        maxLength={3}
                        value={en.total}
                        onChange={e => setEntry(t.id, { total: e.target.value.replace(/\D/g, "") })}
                        placeholder="Score"
                        className="w-20 h-10 rounded-lg text-center text-base font-semibold text-white bg-transparent outline-none placeholder:text-white/20 placeholder:text-sm placeholder:font-normal"
                        style={{ border: `0.5px solid ${CARD_BORDER}` }}
                      />
                    </div>
                  );
                })
              : players.map(p => {
                  const en = entries[p.key] ?? blankEntry();
                  const holeTotal = en.holes.reduce((sum, v) => sum + (parseInt(v) || 0), 0);
                  return (
                    <div key={p.key} className="px-3 py-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-white flex-1 min-w-0 truncate">
                          {p.name}{p.guestId && <span className="text-xs ml-1.5" style={{ color: "rgba(255,255,255,0.3)" }}>guest</span>}
                        </p>
                        {byHole ? (
                          <span className="text-sm font-semibold shrink-0" style={{ color: holeTotal ? "white" : "rgba(255,255,255,0.2)" }}>
                            {holeTotal || "—"}
                          </span>
                        ) : (
                          <>
                            <input
                              inputMode="numeric"
                              maxLength={3}
                              value={en.total}
                              onChange={e => setEntry(p.key, { total: e.target.value.replace(/\D/g, "") })}
                              placeholder="Total"
                              aria-label={`${p.name} total`}
                              className="w-16 h-10 rounded-lg text-center text-base font-semibold text-white bg-transparent outline-none placeholder:text-white/20 placeholder:text-sm placeholder:font-normal"
                              style={{ border: `0.5px solid ${CARD_BORDER}` }}
                            />
                            {showHcp && (
                              <input
                                inputMode="decimal"
                                maxLength={4}
                                value={en.hcp}
                                onChange={e => setEntry(p.key, { hcp: e.target.value.replace(/[^0-9.]/g, "") })}
                                placeholder="Hcp"
                                aria-label={`${p.name} handicap`}
                                className="w-14 h-10 rounded-lg text-center text-sm text-white bg-transparent outline-none placeholder:text-white/20"
                                style={{ border: `0.5px solid ${CARD_BORDER}` }}
                              />
                            )}
                          </>
                        )}
                      </div>
                      {byHole && (
                        <div className="mt-2 space-y-1.5">
                          <div className="grid grid-cols-9 gap-1">{holeNums.slice(0, 9).map((_, i) => holeInput(p.key, en, i))}</div>
                          {holeNums.length > 9 && (
                            <div className="grid grid-cols-9 gap-1">{holeNums.slice(9).map((_, i) => holeInput(p.key, en, i + 9))}</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            {players.length === 0 && <p className="text-sm px-1" style={{ color: MUTED }}>Nobody&apos;s marked as going on this round.</p>}
          </div>

          <div className="px-3 pb-3">
            {errorLine}
            <div className="flex gap-2 pt-2">
              <button
                onClick={saveScores}
                disabled={busy || scanState === "reading"}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-black"
                style={{ background: GREEN, opacity: busy ? 0.6 : 1 }}
              >
                {busy ? "Saving…" : "Save scores"}
              </button>
              <button
                onClick={() => { setMode("view"); setError(null); }}
                className="px-5 py-3 rounded-xl text-sm font-semibold"
                style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══ Game card ═════════════════════════════════════════════════════════════
  const teamRows = teams
    .map(t => ({ team: t, members: players.filter(p => p.teamId === t.id) }))
    .filter(t => t.members.length > 0);

  return (
    <div>
      {label("Game")}
      <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
        {/* Header: what's being played */}
        <div className="flex items-center gap-2 px-4 py-3.5" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
          <Trophy size={15} style={{ color: GOLD, flexShrink: 0 }} />
          <p className="text-sm font-semibold text-white">{FORMAT_LABELS[format ?? ""] ?? "Scores"}</p>
          {stakeCents ? (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(201,168,76,0.15)", color: GOLD }}>
              {money(stakeCents)} a player
            </span>
          ) : null}
          <div className="flex-1" />
          {canManage && !isSettled && (
            <button onClick={openSetup} className="text-xs font-semibold px-2 py-1 -mr-2" style={{ color: GREEN }}>
              Edit
            </button>
          )}
        </div>

        {/* Who's on which side (before there's a result) */}
        {scores.length === 0 && (
          <div className="px-4 py-3 space-y-1.5" style={{ borderBottom: isTodayOrPast ? `0.5px solid ${DIVIDER}` : "none" }}>
            {info?.team ? (
              teamRows.length ? teamRows.map(({ team, members }) => (
                <div key={team.id} className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: team.color ?? "#fff" }} />
                  <span className="text-sm text-white shrink-0">{team.name}</span>
                  <span className="text-sm truncate" style={{ color: MUTED }}>{members.map(m => firstName(m.name)).join(", ")}</span>
                </div>
              )) : <p className="text-sm" style={{ color: MUTED }}>No teams yet.</p>
            ) : (
              <p className="text-sm" style={{ color: MUTED }}>
                Everyone for themselves{players.length ? `: ${players.map(p => firstName(p.name)).join(", ")}` : ""}
              </p>
            )}
            {!isTodayOrPast && <p className="text-xs pt-1" style={{ color: "rgba(255,255,255,0.3)" }}>Add scores after the round.</p>}
          </div>
        )}

        {/* Add scores */}
        {isTodayOrPast && scores.length === 0 && (
          canManage ? (
            <div className="flex gap-2 p-3">
              <button onClick={openScores} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-black" style={{ background: GREEN }}>
                <Pencil size={14} /> Add scores
              </button>
            </div>
          ) : (
            <p className="px-4 py-3 text-sm" style={{ color: MUTED }}>No scores yet.</p>
          )
        )}

        {/* Result */}
        {scores.length > 0 && (
          <>
            <div className="px-4 pt-4 pb-3">
              <p className="text-xl font-bold text-white tracking-tight">{result.headline}</p>
              {result.detail && <p className="text-sm mt-0.5" style={{ color: MUTED }}>{result.detail}</p>}
              {result.missing && <p className="text-sm mt-1" style={{ color: "#FF9F0A" }}>{result.missing}</p>}
            </div>
            {result.standings.length > 0 && (
              <div style={{ borderTop: `0.5px solid ${DIVIDER}` }}>
                {result.standings.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: i === result.standings.length - 1 ? "none" : `0.5px solid ${DIVIDER}` }}>
                    {s.color ? <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} /> : null}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{s.name}</p>
                      {s.sub && <p className="text-xs truncate" style={{ color: "rgba(255,255,255,0.35)" }}>{s.sub}</p>}
                    </div>
                    {s.winner && <Trophy size={13} style={{ color: GOLD, flexShrink: 0 }} />}
                    <p className="text-sm font-semibold shrink-0" style={{ color: s.winner ? GOLD : "rgba(255,255,255,0.6)" }}>{s.main}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Money */}
            {stakeCents ? (
              <div className="px-4 py-3" style={{ borderTop: `0.5px solid ${DIVIDER}` }}>
                {isSettled ? (
                  <>
                    <p className="text-xs font-semibold mb-1.5" style={{ color: GREEN }}>On the tabs</p>
                    {moneyLines(settled.map(l => ({ winner: l.winnerName, loser: l.loserName, cents: l.cents }))).map(line => (
                      <p key={line} className="text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>{line}</p>
                    ))}
                    <div className="flex items-center gap-4 mt-2">
                      <Link href="/tabs" className="text-xs font-semibold" style={{ color: GREEN }}>Open side bets</Link>
                      {canManage && <button onClick={undoSettle} disabled={busy} className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.4)" }}>Undo</button>}
                    </div>
                  </>
                ) : result.state === "tie" ? (
                  <p className="text-sm" style={{ color: MUTED }}>All square, so nobody owes anything.</p>
                ) : preview.length > 0 ? (
                  <>
                    {moneyLines(preview.map(e => ({ winner: nameOf(e.winnerId), loser: nameOf(e.loserId), cents: e.cents }))).map(line => (
                      <p key={line} className="text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>{line}</p>
                    ))}
                    {guestsLeftOut(result, players) && <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.3)" }}>Guests aren&apos;t on the tabs.</p>}
                    {canManage && (
                      <button onClick={settleBet} disabled={busy} className="w-full mt-3 py-3 rounded-xl text-sm font-semibold text-black" style={{ background: GREEN, opacity: busy ? 0.6 : 1 }}>
                        {busy ? "Settling…" : "Settle the bet"}
                      </button>
                    )}
                  </>
                ) : result.state === "decided" ? (
                  <p className="text-sm" style={{ color: MUTED }}>Only guests won or lost, so nothing goes on the tabs.</p>
                ) : null}
              </div>
            ) : null}

            {errorLine && <div className="px-3 pb-2">{errorLine}</div>}

            {/* Small actions */}
            <div className="flex flex-wrap gap-2 px-3 py-3" style={{ borderTop: `0.5px solid ${DIVIDER}` }}>
              {canManage && !isSettled && (
                <button onClick={openScores} className="text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)" }}>
                  Edit scores
                </button>
              )}
              {hasHoles && (
                <button onClick={() => setShowHoles(v => !v)} className="text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: showHoles ? "rgba(48,209,88,0.15)" : "rgba(255,255,255,0.07)", color: showHoles ? GREEN : "rgba(255,255,255,0.7)" }}>
                  Hole by hole
                </button>
              )}
              {photoPath && (
                <button onClick={openPhoto} className="text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)" }}>
                  Scorecard photo
                </button>
              )}
              <button onClick={shareResults} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: shared ? "rgba(48,209,88,0.15)" : "rgba(255,255,255,0.07)", color: shared ? GREEN : "rgba(255,255,255,0.7)" }}>
                {shared ? <Check size={12} /> : <Share2 size={12} />}
                {shared ? "Link copied" : "Share"}
              </button>
            </div>
          </>
        )}
      </div>

      {showHoles && hasHoles && (
        <div className="mt-3">
          <DigitalScorecard
            teeTimeId={teeTimeId}
            userId={userId}
            canEditOthers={false}
            readOnly
            format={format}
            teams={teams}
            scores={scores.map(s => {
              const p = players.find(pl => (s.user_id ? pl.userId === s.user_id : pl.guestId === s.guest_invite_id));
              return {
                id: s.id, user_id: s.user_id, guest_invite_id: s.guest_invite_id,
                display_name: p?.name ?? "Player", team_id: p?.teamId ?? null,
                hole_scores: s.hole_scores, gross_score: s.gross_score, handicap_used: s.handicap_used,
              };
            })}
            onSaved={() => {}}
          />
        </div>
      )}

      {/* Scorecard photo viewer */}
      {photoUrl && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.96)" }} onClick={() => setPhotoUrl(null)}>
          <img
            src={photoUrl}
            alt="Scorecard"
            className="max-w-full max-h-full object-contain select-none"
            style={{ transform: `rotate(${photoTurn}deg)`, transition: "transform 0.2s ease", maxHeight: photoTurn % 180 ? "100vw" : "85svh", maxWidth: photoTurn % 180 ? "85svh" : "100%" }}
            onClick={e => e.stopPropagation()}
            draggable={false}
          />
          <div className="absolute left-0 right-0 flex justify-between px-3" style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.5rem)", zIndex: 2 }}>
            <button
              aria-label="Rotate"
              onClick={e => { e.stopPropagation(); setPhotoTurn(t => (t + 90) % 360); }}
              className="w-11 h-11 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.12)", color: "white" }}
            >
              <RotateCw size={18} />
            </button>
            <button
              aria-label="Close"
              onClick={e => { e.stopPropagation(); setPhotoUrl(null); }}
              className="w-11 h-11 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.12)", color: "white" }}
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
