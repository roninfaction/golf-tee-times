"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/browser";

const GOLD = "#C9A84C";
const GREEN = "#30D158";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";
const BEST_BG = "rgba(48,209,88,0.22)";

// All widths kept as constants so header and cells always match exactly
const HOLE_W = 32;
const CELL_GAP = 2;
const NAME_W = 76;
const SUB_W = 40;
const TOT_W = 46;

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

// ── HoleCell — defined at module level so React never remounts it mid-render ──
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
  const cellRef = useRef<HTMLDivElement>(null);

  // Scroll the active cell into view horizontally when editing starts
  useEffect(() => {
    if (isEditing && cellRef.current) {
      cellRef.current.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }, [isEditing]);

  const base: React.CSSProperties = {
    width: HOLE_W,
    height: 38,
    flexShrink: 0,
    borderRadius: 6,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  if (isEditing) {
    return (
      <div
        ref={cellRef}
        style={{ ...base, background: "rgba(255,255,255,0.10)", border: `1.5px solid ${GREEN}` }}
      >
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={2}
          value={value}
          autoFocus
          // Select existing value immediately so typing replaces it
          onFocus={e => e.target.select()}
          onChange={e => onChange(e.target.value.replace(/\D/g, "").slice(0, 2))}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          className="w-full text-center text-sm font-bold text-white bg-transparent outline-none"
          style={{ padding: 0 }}
        />
      </div>
    );
  }

  return (
    <div
      ref={cellRef}
      onClick={editable ? onActivate : undefined}
      style={{
        ...base,
        background: isBest ? BEST_BG : "transparent",
        color: isBest ? GREEN : value ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.13)",
        cursor: editable ? "pointer" : "default",
        fontWeight: isBest ? 700 : 500,
        fontSize: 13,
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
  const [local, setLocal] = useState<Record<string, Record<string, string>>>({});
  const [editing, setEditing] = useState<{ sid: string; h: number } | null>(null);
  const [saving, setSaving] = useState<Set<string>>(new Set());

  // Always up-to-date ref so doSave reads current cell values without stale closures
  const localRef = useRef(local);
  localRef.current = local;

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Populate local state when scores first arrive or a new score is added.
  // Bail out immediately (return same ref) if all score IDs are already present —
  // this prevents unnecessary re-renders during active editing after an auto-save.
  useEffect(() => {
    setLocal(prev => {
      const newOnes = scores.filter(s => !prev[s.id]);
      if (newOnes.length === 0) return prev;
      const next = { ...prev };
      for (const s of newOnes) {
        const row: Record<string, string> = {};
        for (let h = 1; h <= 18; h++) {
          const v = s.hole_scores?.[String(h)];
          row[String(h)] = v != null ? String(v) : "";
        }
        next[s.id] = row;
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

  // ── Build keyboard navigation handler ────────────────────────────────────────
  function makeKeyDown(score: ScoreCardRow, h: number) {
    return (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) {
        e.preventDefault();
        scheduleSave(score);
        const next = h + 1;
        if (next <= 18) setEditing({ sid: score.id, h: next });
        else setEditing(null);
      } else if (e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        scheduleSave(score);
        const prev = h - 1;
        if (prev >= 1) setEditing({ sid: score.id, h: prev });
        else setEditing(null);
      } else if (e.key === "Escape") {
        setEditing(null);
      }
    };
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

  // ── Per-team best-ball per hole (uses live local state) ───────────────────
  function bestPerHole(rows: ScoreCardRow[]): Record<number, number | null> {
    const result: Record<number, number | null> = {};
    for (let h = 1; h <= 18; h++) {
      const vals = rows
        .map(s => { const n = parseInt(getVal(s.id, h)); return isNaN(n) || n <= 0 ? null : n; })
        .filter((v): v is number => v !== null);
      result[h] = vals.length >= 2 ? Math.min(...vals) : null;
    }
    return result;
  }

  function holeSum(sid: string, holes: number[]): number {
    return holes.reduce((acc, h) => {
      const n = parseInt(getVal(sid, h));
      return isNaN(n) ? acc : acc + n;
    }, 0);
  }

  function bestSum(bph: Record<number, number | null>, holes: number[]): number {
    return holes.reduce((acc, h) => acc + (bph[h] ?? 0), 0);
  }

  const FRONT = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const BACK = [10, 11, 12, 13, 14, 15, 16, 17, 18];
  const showBestBall = format === "best_ball";

  // Shared header row widths (must exactly mirror the data row layout)
  const holeGroupStyle = (isHeader?: boolean): React.CSSProperties => ({
    display: "flex",
    gap: CELL_GAP,
    paddingLeft: 4,
    paddingRight: 2,
    // Header cells are same height as the label row
    alignItems: isHeader ? "center" : undefined,
  });

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
          <div style={{ minWidth: NAME_W + (HOLE_W + CELL_GAP) * 18 + 6 + SUB_W * 2 + TOT_W + 16 }}>

            {/* ── Header row ─────────────────────────────────────────────── */}
            <div
              className="flex items-stretch"
              style={{
                height: 26,
                background: "rgba(255,255,255,0.025)",
                borderBottom: `0.5px solid ${DIVIDER}`,
              }}
            >
              {/* Player label */}
              <div
                style={{
                  width: NAME_W,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  paddingLeft: 12,
                  borderRight: `0.5px solid ${DIVIDER}`,
                }}
              >
                <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.22)" }}>
                  Player
                </span>
              </div>

              {/* Holes 1–9 */}
              <div style={holeGroupStyle(true)}>
                {FRONT.map(h => (
                  <div
                    key={h}
                    style={{
                      width: HOLE_W,
                      flexShrink: 0,
                      textAlign: "center",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "rgba(255,255,255,0.30)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {h}
                  </div>
                ))}
              </div>

              {/* OUT label */}
              <div
                style={{
                  width: SUB_W,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  color: "rgba(255,255,255,0.32)",
                }}
              >
                OUT
              </div>

              {/* Holes 10–18 */}
              <div style={holeGroupStyle(true)}>
                {BACK.map(h => (
                  <div
                    key={h}
                    style={{
                      width: HOLE_W,
                      flexShrink: 0,
                      textAlign: "center",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "rgba(255,255,255,0.30)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {h}
                  </div>
                ))}
              </div>

              {/* IN label */}
              <div
                style={{
                  width: SUB_W,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  color: "rgba(255,255,255,0.32)",
                }}
              >
                IN
              </div>

              {/* TOT label */}
              <div
                style={{
                  width: TOT_W,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 9,
                  fontWeight: 800,
                  letterSpacing: "0.06em",
                  color: GOLD,
                }}
              >
                TOT
              </div>
            </div>

            {/* ── Groups ─────────────────────────────────────────────────── */}
            {groups.map((group, gi) => {
              const bph = showBestBall && group.team ? bestPerHole(group.rows) : ({} as Record<number, number | null>);
              const showBestRow = showBestBall && group.team !== null && group.rows.length >= 2;
              const bestOut = bestSum(bph, FRONT);
              const bestIn = bestSum(bph, BACK);
              const bestTot = bestOut + bestIn;
              const hasBestData = Object.values(bph).some(v => v !== null);

              return (
                <div key={group.team?.id ?? "unassigned"}>

                  {/* Team label */}
                  {group.team && (
                    <div
                      className="flex items-center"
                      style={{
                        height: 22,
                        paddingLeft: 12,
                        background: "rgba(255,255,255,0.018)",
                        borderTop: gi > 0 ? `0.5px solid ${DIVIDER}` : "none",
                        borderBottom: `0.5px solid ${DIVIDER}`,
                        borderLeft: `2.5px solid ${group.team.color ?? "rgba(255,255,255,0.2)"}`,
                      }}
                    >
                      <span
                        className="text-[9px] font-black uppercase tracking-widest"
                        style={{ color: group.team.color ?? "rgba(255,255,255,0.40)" }}
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
                    const hasAnyHoles =
                      FRONT.some(h => parseInt(getVal(score.id, h)) > 0) ||
                      BACK.some(h => parseInt(getVal(score.id, h)) > 0);
                    const tot = hasAnyHoles ? out + inn : score.gross_score;

                    const isLastRow = ri === group.rows.length - 1;
                    const noBottomBorder = isLastRow && !showBestRow && gi === groups.length - 1;

                    return (
                      <div
                        key={score.id}
                        className="flex items-center"
                        style={{
                          borderBottom: noBottomBorder ? "none" : `0.5px solid ${DIVIDER}`,
                          minHeight: 42,
                        }}
                      >
                        {/* Name */}
                        <div
                          style={{
                            width: NAME_W,
                            flexShrink: 0,
                            height: 42,
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            paddingLeft: 12,
                            paddingRight: 4,
                            borderRight: `0.5px solid ${DIVIDER}`,
                          }}
                        >
                          <span className="text-xs font-semibold text-white truncate leading-none flex-1 min-w-0">
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
                        <div style={holeGroupStyle()}>
                          {FRONT.map(h => {
                            const v = getVal(score.id, h);
                            const isEdit = editing?.sid === score.id && editing?.h === h;
                            const best = bph[h];
                            const isBest = showBestBall && best !== null && parseInt(v) === best && group.rows.length >= 2;
                            return (
                              <HoleCell
                                key={h}
                                value={v}
                                isEditing={isEdit}
                                isBest={!!isBest}
                                editable={editable}
                                onActivate={() => setEditing({ sid: score.id, h })}
                                onChange={nv => setVal(score.id, h, nv)}
                                onBlur={() => { scheduleSave(score); setEditing(null); }}
                                onKeyDown={makeKeyDown(score, h)}
                              />
                            );
                          })}
                        </div>

                        {/* OUT subtotal */}
                        <div
                          style={{
                            width: SUB_W,
                            flexShrink: 0,
                            textAlign: "center",
                            fontSize: 12,
                            fontWeight: 700,
                            color: out > 0 ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.13)",
                          }}
                        >
                          {out > 0 ? out : "—"}
                        </div>

                        {/* Back 9 */}
                        <div style={holeGroupStyle()}>
                          {BACK.map(h => {
                            const v = getVal(score.id, h);
                            const isEdit = editing?.sid === score.id && editing?.h === h;
                            const best = bph[h];
                            const isBest = showBestBall && best !== null && parseInt(v) === best && group.rows.length >= 2;
                            return (
                              <HoleCell
                                key={h}
                                value={v}
                                isEditing={isEdit}
                                isBest={!!isBest}
                                editable={editable}
                                onActivate={() => setEditing({ sid: score.id, h })}
                                onChange={nv => setVal(score.id, h, nv)}
                                onBlur={() => { scheduleSave(score); setEditing(null); }}
                                onKeyDown={makeKeyDown(score, h)}
                              />
                            );
                          })}
                        </div>

                        {/* IN subtotal */}
                        <div
                          style={{
                            width: SUB_W,
                            flexShrink: 0,
                            textAlign: "center",
                            fontSize: 12,
                            fontWeight: 700,
                            color: inn > 0 ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.13)",
                          }}
                        >
                          {inn > 0 ? inn : "—"}
                        </div>

                        {/* Total */}
                        <div
                          style={{
                            width: TOT_W,
                            flexShrink: 0,
                            textAlign: "center",
                            fontSize: 14,
                            fontWeight: 800,
                            color: "rgba(255,255,255,0.95)",
                          }}
                        >
                          {tot || "—"}
                        </div>
                      </div>
                    );
                  })}

                  {/* Best ball summary row */}
                  {showBestRow && hasBestData && (
                    <div
                      className="flex items-center"
                      style={{
                        background: "rgba(48,209,88,0.07)",
                        borderTop: `0.5px solid rgba(48,209,88,0.18)`,
                        borderBottom: gi < groups.length - 1 ? `0.5px solid ${DIVIDER}` : "none",
                        minHeight: 40,
                      }}
                    >
                      <div
                        style={{
                          width: NAME_W,
                          flexShrink: 0,
                          height: 40,
                          display: "flex",
                          alignItems: "center",
                          paddingLeft: 12,
                          borderRight: `0.5px solid rgba(48,209,88,0.15)`,
                        }}
                      >
                        <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: GREEN }}>
                          Best
                        </span>
                      </div>

                      <div style={holeGroupStyle()}>
                        {FRONT.map(h => (
                          <div
                            key={h}
                            style={{
                              width: HOLE_W,
                              flexShrink: 0,
                              height: 40,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 13,
                              fontWeight: 700,
                              color: bph[h] !== null ? GREEN : "rgba(48,209,88,0.2)",
                            }}
                          >
                            {bph[h] ?? "·"}
                          </div>
                        ))}
                      </div>

                      <div
                        style={{
                          width: SUB_W,
                          flexShrink: 0,
                          textAlign: "center",
                          fontSize: 12,
                          fontWeight: 700,
                          color: bestOut > 0 ? GREEN : "rgba(48,209,88,0.2)",
                        }}
                      >
                        {bestOut > 0 ? bestOut : "—"}
                      </div>

                      <div style={holeGroupStyle()}>
                        {BACK.map(h => (
                          <div
                            key={h}
                            style={{
                              width: HOLE_W,
                              flexShrink: 0,
                              height: 40,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 13,
                              fontWeight: 700,
                              color: bph[h] !== null ? GREEN : "rgba(48,209,88,0.2)",
                            }}
                          >
                            {bph[h] ?? "·"}
                          </div>
                        ))}
                      </div>

                      <div
                        style={{
                          width: SUB_W,
                          flexShrink: 0,
                          textAlign: "center",
                          fontSize: 12,
                          fontWeight: 700,
                          color: bestIn > 0 ? GREEN : "rgba(48,209,88,0.2)",
                        }}
                      >
                        {bestIn > 0 ? bestIn : "—"}
                      </div>

                      <div
                        style={{
                          width: TOT_W,
                          flexShrink: 0,
                          textAlign: "center",
                          fontSize: 14,
                          fontWeight: 800,
                          color: GREEN,
                        }}
                      >
                        {bestTot > 0 ? bestTot : "—"}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Hint when no holes are filled yet */}
            {scores.every(s => !s.hole_scores || Object.keys(s.hole_scores).length === 0) && (
              <div
                className="px-4 py-3 text-xs"
                style={{ color: "rgba(255,255,255,0.18)", borderTop: `0.5px solid ${DIVIDER}` }}
              >
                Tap any cell to enter scores · Enter or Tab to advance holes
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
