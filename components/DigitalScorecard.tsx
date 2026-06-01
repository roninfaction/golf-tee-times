"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/browser";

const GOLD = "#C9A84C";
const GREEN = "#30D158";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";
const BEST_BG = "rgba(48,209,88,0.22)";

const HOLE_W = 32;
const NAME_W = 76;
const SUB_W = 38;
const TOT_W = 44;

export type ScoreCardRow = {
  id: string;
  user_id: string | null;
  guest_invite_id: string | null;
  display_name: string;
  team_id: string | null;
  hole_scores: Record<string, number> | null;
  gross_score: number;
  handicap_used: number | null;
};

type Team = { id: string; name: string; color: string | null };

// ── HoleCell — defined outside to avoid remount on each render ────────────────
type HoleCellProps = {
  value: string;
  isEditing: boolean;
  isBest: boolean;
  editable: boolean;
  onActivate: () => void;
  onChange: (v: string) => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
};

function HoleCell({ value, isEditing, isBest, editable, onActivate, onChange, onBlur, onKeyDown }: HoleCellProps) {
  if (isEditing) {
    return (
      <div
        style={{
          width: HOLE_W, height: 36,
          background: "rgba(255,255,255,0.08)",
          border: `1.5px solid ${GREEN}`,
          borderRadius: 6,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <input
          type="number" min="1" max="20"
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          autoFocus
          className="w-full text-center text-sm font-semibold text-white bg-transparent outline-none"
          style={{ padding: 0, MozAppearance: "textfield" } as React.CSSProperties}
        />
      </div>
    );
  }

  return (
    <div
      onClick={editable ? onActivate : undefined}
      style={{
        width: HOLE_W, height: 36,
        flexShrink: 0,
        borderRadius: 6,
        background: isBest ? BEST_BG : "transparent",
        color: isBest ? GREEN : value ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.13)",
        cursor: editable ? "pointer" : "default",
        fontWeight: isBest ? 700 : 500,
        fontSize: 12,
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.12s",
        userSelect: "none",
      }}
    >
      {value || "·"}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function DigitalScorecard({
  teeTimeId,
  userId,
  canEditOthers,
  format,
  teams,
  scores,
  onSaved,
}: {
  teeTimeId: string;
  userId: string;
  canEditOthers: boolean;
  format: string | null;
  teams: Team[];
  scores: ScoreCardRow[];
  onSaved: (update: { id: string; gross_score: number; hole_scores: Record<string, number> | null }) => void;
}) {
  // Local hole state: scoreId → { "1": "4", ... }
  const [local, setLocal] = useState<Record<string, Record<string, string>>>({});
  const [editing, setEditing] = useState<{ sid: string; h: number } | null>(null);
  const [saving, setSaving] = useState<Set<string>>(new Set());

  // Keep ref in sync so doSave always reads the latest hole values
  const localRef = useRef(local);
  localRef.current = local;

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Populate local state when scores first arrive or a new score is added
  useEffect(() => {
    setLocal(prev => {
      const next = { ...prev };
      for (const s of scores) {
        if (!next[s.id]) {
          const row: Record<string, string> = {};
          for (let h = 1; h <= 18; h++) {
            const v = s.hole_scores?.[String(h)];
            row[String(h)] = v != null ? String(v) : "";
          }
          next[s.id] = row;
        }
      }
      return next;
    });
  }, [scores]);

  function getVal(sid: string, h: number): string {
    return local[sid]?.[String(h)] ?? "";
  }

  function setVal(sid: string, h: number, v: string) {
    setLocal(prev => ({
      ...prev,
      [sid]: { ...(prev[sid] ?? {}), [String(h)]: v },
    }));
  }

  function scheduleSave(score: ScoreCardRow) {
    clearTimeout(timers.current[score.id]);
    timers.current[score.id] = setTimeout(() => doSave(score), 900);
  }

  async function doSave(score: ScoreCardRow) {
    const holes = localRef.current[score.id] ?? {};
    const parsed: Record<string, number> = {};
    let sum = 0, count = 0;

    for (let h = 1; h <= 18; h++) {
      const n = parseInt(holes[String(h)] ?? "");
      if (!isNaN(n) && n > 0 && n <= 20) {
        parsed[String(h)] = n;
        sum += n;
        count++;
      }
    }

    // Auto-update gross from hole sum if we have at least 9 holes
    const newGross = count >= 9 ? sum : score.gross_score;

    setSaving(prev => new Set([...prev, score.id]));

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setSaving(prev => { const n = new Set(prev); n.delete(score.id); return n; });
      return;
    }

    const body: Record<string, unknown> = {
      gross_score: newGross,
      handicap_used: score.handicap_used ?? null,
      hole_scores: Object.keys(parsed).length > 0 ? parsed : null,
      source: "manual",
    };
    if (score.guest_invite_id) body.guest_invite_id = score.guest_invite_id;
    else if (score.user_id && score.user_id !== userId) body.target_user_id = score.user_id;

    const res = await fetch(`/api/tee-times/${teeTimeId}/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });

    setSaving(prev => { const n = new Set(prev); n.delete(score.id); return n; });

    if (res.ok) {
      onSaved({
        id: score.id,
        gross_score: newGross,
        hole_scores: Object.keys(parsed).length > 0 ? parsed : null,
      });
    }
  }

  // ── Team grouping ─────────────────────────────────────────────────────────
  const teamsMap = new Map(teams.map(t => [t.id, t]));
  type Group = { team: Team | null; rows: ScoreCardRow[] };
  const groups: Group[] = [];

  if (teams.length > 0) {
    for (const team of teams) {
      const rows = scores.filter(s => s.team_id === team.id);
      if (rows.length > 0) groups.push({ team, rows });
    }
    const unassigned = scores.filter(s => !s.team_id || !teamsMap.has(s.team_id));
    if (unassigned.length > 0) groups.push({ team: null, rows: unassigned });
  } else {
    groups.push({ team: null, rows: scores });
  }

  // ── Per-team best-ball per hole ───────────────────────────────────────────
  function bestPerHole(rows: ScoreCardRow[]): Record<number, number | null> {
    const result: Record<number, number | null> = {};
    for (let h = 1; h <= 18; h++) {
      const vals = rows
        .map(s => { const n = parseInt(getVal(s.id, h)); return (isNaN(n) || n <= 0) ? null : n; })
        .filter((v): v is number => v !== null);
      result[h] = vals.length >= 2 ? Math.min(...vals) : null;
    }
    return result;
  }

  function holeSum(sid: string, holes: number[]): number {
    return holes.reduce((sum, h) => {
      const n = parseInt(getVal(sid, h));
      return isNaN(n) ? sum : sum + n;
    }, 0);
  }

  function bestSum(bph: Record<number, number | null>, holes: number[]): number {
    return holes.reduce((sum, h) => sum + (bph[h] ?? 0), 0);
  }

  const FRONT = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const BACK = [10, 11, 12, 13, 14, 15, 16, 17, 18];
  const showBestBall = format === "best_ball";

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>
        Scorecard
      </p>
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}
      >
        <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
          {/* Min-width keeps the table from collapsing */}
          <div style={{ minWidth: NAME_W + HOLE_W * 18 + 8 + SUB_W * 2 + TOT_W + 24 }}>

            {/* ── Header row ─────────────────────────────────────────────── */}
            <div
              className="flex items-center"
              style={{ height: 28, background: "rgba(255,255,255,0.025)", borderBottom: `0.5px solid ${DIVIDER}` }}
            >
              <div style={{ width: NAME_W, flexShrink: 0, paddingLeft: 12 }}>
                <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.25)" }}>Player</span>
              </div>
              <div style={{ display: "flex", gap: 0, paddingLeft: 4 }}>
                {FRONT.map(h => (
                  <div key={h} style={{ width: HOLE_W, flexShrink: 0, textAlign: "center", fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.28)" }}>
                    {h}
                  </div>
                ))}
              </div>
              <div style={{ width: SUB_W, flexShrink: 0, textAlign: "center", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)" }}>
                OUT
              </div>
              <div style={{ display: "flex", gap: 0, paddingLeft: 4 }}>
                {BACK.map(h => (
                  <div key={h} style={{ width: HOLE_W, flexShrink: 0, textAlign: "center", fontSize: 10, fontWeight: 600, color: "rgba(255,255,255,0.28)" }}>
                    {h}
                  </div>
                ))}
              </div>
              <div style={{ width: SUB_W, flexShrink: 0, textAlign: "center", fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.35)" }}>
                IN
              </div>
              <div style={{ width: TOT_W, flexShrink: 0, textAlign: "center", fontSize: 10, fontWeight: 700, color: GOLD }}>
                TOT
              </div>
            </div>

            {/* ── Groups ─────────────────────────────────────────────────── */}
            {groups.map((group, gi) => {
              const bph = showBestBall && group.team ? bestPerHole(group.rows) : {};
              const showBestRow = showBestBall && group.team !== null && group.rows.length >= 2;
              const bestOut = bestSum(bph, FRONT);
              const bestIn = bestSum(bph, BACK);
              const bestTot = bestOut + bestIn;
              const hasBestData = Object.values(bph).some(v => v !== null);

              return (
                <div key={group.team?.id ?? "unassigned"}>

                  {/* Team label row */}
                  {group.team && (
                    <div
                      className="flex items-center gap-2"
                      style={{
                        height: 24,
                        paddingLeft: 12,
                        background: "rgba(255,255,255,0.02)",
                        borderTop: gi > 0 ? `0.5px solid ${DIVIDER}` : "none",
                        borderBottom: `0.5px solid ${DIVIDER}`,
                        borderLeft: `2.5px solid ${group.team.color ?? "rgba(255,255,255,0.2)"}`,
                      }}
                    >
                      <span
                        className="text-[9px] font-black uppercase tracking-widest"
                        style={{ color: group.team.color ?? "rgba(255,255,255,0.45)" }}
                      >
                        {group.team.name}
                      </span>
                    </div>
                  )}

                  {/* Player rows */}
                  {group.rows.map((score, ri) => {
                    const editable = score.user_id === userId || canEditOthers;
                    const isSaving = saving.has(score.id);
                    const shortName = score.user_id === userId
                      ? "You"
                      : score.display_name.split(" ")[0];

                    const out = holeSum(score.id, FRONT);
                    const inn = holeSum(score.id, BACK);
                    const hasAnyHoles = FRONT.some(h => parseInt(getVal(score.id, h)) > 0)
                      || BACK.some(h => parseInt(getVal(score.id, h)) > 0);
                    const tot = hasAnyHoles ? (out + inn) : score.gross_score;

                    const isLastPlayerRow = ri === group.rows.length - 1;
                    const isVeryLastRow = isLastPlayerRow && !showBestRow && gi === groups.length - 1;

                    return (
                      <div
                        key={score.id}
                        className="flex items-center"
                        style={{ borderBottom: isVeryLastRow ? "none" : `0.5px solid ${DIVIDER}` }}
                      >
                        {/* Name */}
                        <div
                          style={{
                            width: NAME_W, flexShrink: 0, height: 40,
                            display: "flex", alignItems: "center", gap: 6,
                            paddingLeft: 12, paddingRight: 4,
                            borderRight: `0.5px solid ${DIVIDER}`,
                          }}
                        >
                          <span className="text-xs font-semibold text-white truncate leading-none">
                            {shortName}
                          </span>
                          {isSaving && (
                            <div
                              className="shrink-0 rounded-full animate-pulse"
                              style={{ width: 5, height: 5, background: GOLD, opacity: 0.85 }}
                            />
                          )}
                        </div>

                        {/* Front 9 */}
                        <div style={{ display: "flex", gap: 2, paddingLeft: 4, paddingRight: 2 }}>
                          {FRONT.map(h => {
                            const v = getVal(score.id, h);
                            const isEditingCell = editing?.sid === score.id && editing?.h === h;
                            const best = bph[h];
                            const isBest = showBestBall && best !== null && parseInt(v) === best && group.rows.length >= 2;
                            return (
                              <HoleCell
                                key={h}
                                value={v}
                                isEditing={isEditingCell}
                                isBest={!!isBest}
                                editable={editable}
                                onActivate={() => setEditing({ sid: score.id, h })}
                                onChange={nv => setVal(score.id, h, nv)}
                                onBlur={() => {
                                  setEditing(null);
                                  scheduleSave(score);
                                }}
                                onKeyDown={e => {
                                  if (e.key === "Enter" || e.key === "Tab") {
                                    e.preventDefault();
                                    const next = e.shiftKey ? h - 1 : h + 1;
                                    if (next >= 1 && next <= 18) setEditing({ sid: score.id, h: next });
                                    else { setEditing(null); scheduleSave(score); }
                                  }
                                  if (e.key === "Escape") setEditing(null);
                                }}
                              />
                            );
                          })}
                        </div>

                        {/* OUT */}
                        <div style={{ width: SUB_W, flexShrink: 0, textAlign: "center", fontSize: 12, fontWeight: 700, color: out > 0 ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.13)" }}>
                          {out > 0 ? out : "—"}
                        </div>

                        {/* Back 9 */}
                        <div style={{ display: "flex", gap: 2, paddingLeft: 4, paddingRight: 2 }}>
                          {BACK.map(h => {
                            const v = getVal(score.id, h);
                            const isEditingCell = editing?.sid === score.id && editing?.h === h;
                            const best = bph[h];
                            const isBest = showBestBall && best !== null && parseInt(v) === best && group.rows.length >= 2;
                            return (
                              <HoleCell
                                key={h}
                                value={v}
                                isEditing={isEditingCell}
                                isBest={!!isBest}
                                editable={editable}
                                onActivate={() => setEditing({ sid: score.id, h })}
                                onChange={nv => setVal(score.id, h, nv)}
                                onBlur={() => {
                                  setEditing(null);
                                  scheduleSave(score);
                                }}
                                onKeyDown={e => {
                                  if (e.key === "Enter" || e.key === "Tab") {
                                    e.preventDefault();
                                    const next = e.shiftKey ? h - 1 : h + 1;
                                    if (next >= 1 && next <= 18) setEditing({ sid: score.id, h: next });
                                    else { setEditing(null); scheduleSave(score); }
                                  }
                                  if (e.key === "Escape") setEditing(null);
                                }}
                              />
                            );
                          })}
                        </div>

                        {/* IN */}
                        <div style={{ width: SUB_W, flexShrink: 0, textAlign: "center", fontSize: 12, fontWeight: 700, color: inn > 0 ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.13)" }}>
                          {inn > 0 ? inn : "—"}
                        </div>

                        {/* TOT */}
                        <div style={{ width: TOT_W, flexShrink: 0, textAlign: "center", fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.92)" }}>
                          {tot || "—"}
                        </div>
                      </div>
                    );
                  })}

                  {/* Best ball row */}
                  {showBestRow && hasBestData && (
                    <div
                      className="flex items-center"
                      style={{
                        background: "rgba(48,209,88,0.07)",
                        borderTop: `0.5px solid rgba(48,209,88,0.18)`,
                        borderBottom: gi < groups.length - 1 ? `0.5px solid ${DIVIDER}` : "none",
                      }}
                    >
                      <div
                        style={{
                          width: NAME_W, flexShrink: 0, height: 38,
                          display: "flex", alignItems: "center",
                          paddingLeft: 12,
                          borderRight: `0.5px solid rgba(48,209,88,0.15)`,
                        }}
                      >
                        <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: GREEN }}>Best</span>
                      </div>

                      <div style={{ display: "flex", gap: 2, paddingLeft: 4, paddingRight: 2 }}>
                        {FRONT.map(h => (
                          <div key={h} style={{ width: HOLE_W, flexShrink: 0, height: 38, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: bph[h] !== null ? GREEN : "rgba(48,209,88,0.2)" }}>
                            {bph[h] ?? "·"}
                          </div>
                        ))}
                      </div>

                      <div style={{ width: SUB_W, flexShrink: 0, textAlign: "center", fontSize: 12, fontWeight: 700, color: bestOut > 0 ? GREEN : "rgba(48,209,88,0.2)" }}>
                        {bestOut > 0 ? bestOut : "—"}
                      </div>

                      <div style={{ display: "flex", gap: 2, paddingLeft: 4, paddingRight: 2 }}>
                        {BACK.map(h => (
                          <div key={h} style={{ width: HOLE_W, flexShrink: 0, height: 38, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: bph[h] !== null ? GREEN : "rgba(48,209,88,0.2)" }}>
                            {bph[h] ?? "·"}
                          </div>
                        ))}
                      </div>

                      <div style={{ width: SUB_W, flexShrink: 0, textAlign: "center", fontSize: 12, fontWeight: 700, color: bestIn > 0 ? GREEN : "rgba(48,209,88,0.2)" }}>
                        {bestIn > 0 ? bestIn : "—"}
                      </div>

                      <div style={{ width: TOT_W, flexShrink: 0, textAlign: "center", fontSize: 14, fontWeight: 800, color: GREEN }}>
                        {bestTot > 0 ? bestTot : "—"}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Hint */}
            {scores.every(s => !s.hole_scores || Object.keys(s.hole_scores).length === 0) && (
              <div className="px-4 py-3 text-xs" style={{ color: "rgba(255,255,255,0.2)", borderTop: `0.5px solid ${DIVIDER}` }}>
                Tap any cell to enter hole scores · Tab or Enter to advance
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
