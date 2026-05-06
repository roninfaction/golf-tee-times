"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Users } from "lucide-react";

const GOLD = "#C9A84C";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";

const FORMATS = [
  { value: "stroke",     label: "Stroke play" },
  { value: "scramble",   label: "Scramble" },
  { value: "best_ball",  label: "Best ball" },
  { value: "stableford", label: "Stableford" },
  { value: "match_play", label: "Match play" },
];

const TEAM_COLORS = ["#30D158", "#C9A84C", "#0A84FF", "#FF453A", "#BF5AF2", "#FF9F0A"];

type Rsvp = { id: string; user_id: string; status: string; profile: { display_name: string; avatar_url: string | null }; team_id: string | null };
type Team = { id: string; name: string; color: string | null };

export function TeamPlaySection({
  teeTimeId,
  isCreator,
  currentFormat,
  rsvps,
}: {
  teeTimeId: string;
  isCreator: boolean;
  currentFormat: string | null;
  rsvps: Rsvp[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [format, setFormat] = useState(currentFormat ?? "scramble");
  const [teams, setTeams] = useState<Team[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string | null>>({});
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [teamNames, setTeamNames] = useState(["Team A", "Team B"]);
  const [token, setToken] = useState("");

  useEffect(() => {
    createClient().auth.getSession().then(({ data: { session } }) => {
      if (session) setToken(session.access_token);
    });
  }, []);

  useEffect(() => {
    if (!expanded) return;
    // Load existing teams
    fetch(`/api/tee-times/${teeTimeId}/teams`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.ok ? r.json() : []).then((t: Team[]) => {
      if (t.length > 0) {
        setTeams(t);
        setTeamNames(t.map(tm => tm.name));
      }
    });
    // Load existing assignments from rsvps
    const init: Record<string, string | null> = {};
    for (const r of rsvps) init[r.id] = r.team_id ?? null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAssignments(init);
  }, [expanded, teeTimeId, token, rsvps]);

  function assignToTeam(teamId: string) {
    if (!selectedPlayer) return;
    setAssignments(prev => ({ ...prev, [selectedPlayer]: teamId }));
    setSelectedPlayer(null);
  }

  async function saveTeams() {
    setSaving(true);
    // Upsert teams
    const res = await fetch(`/api/tee-times/${teeTimeId}/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        format,
        teams: teamNames.filter(Boolean).map((name, i) => ({
          name,
          color: TEAM_COLORS[i % TEAM_COLORS.length],
        })),
      }),
    });

    if (res.ok) {
      const newTeams: Team[] = await res.json();
      setTeams(newTeams);

      // Save assignments
      const assignmentList = Object.entries(assignments)
        .map(([rsvpId, teamId]) => ({ rsvp_id: rsvpId, team_id: teamId }));

      if (assignmentList.length > 0) {
        await fetch(`/api/tee-times/${teeTimeId}/teams`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ assignments: assignmentList }),
        });
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }

  const acceptedRsvps = rsvps.filter(r => r.status === "accepted");

  if (!isCreator && teams.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl"
        style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}
      >
        <div className="flex items-center gap-2">
          <Users size={16} style={{ color: GOLD }} />
          <span className="text-sm font-medium text-white">
            {teams.length > 0 ? `Team play · ${currentFormat?.replace("_", " ")}` : "Set up teams"}
          </span>
        </div>
        <span className="text-white/30 text-lg">{expanded ? "↑" : "↓"}</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-4">
          {isCreator && (
            <>
              {/* Format picker */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Format</p>
                <div className="flex flex-wrap gap-2">
                  {FORMATS.map(f => (
                    <button
                      key={f.value}
                      onClick={() => setFormat(f.value)}
                      className="px-3 py-2 rounded-xl text-xs font-semibold"
                      style={{
                        background: format === f.value ? "#30D158" : CARD_BG,
                        color: format === f.value ? "#000" : "rgba(255,255,255,0.6)",
                        border: format === f.value ? "none" : `0.5px solid ${CARD_BORDER}`,
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Team names */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Teams</p>
                <div className="space-y-2">
                  {teamNames.map((name, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-xl" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ background: TEAM_COLORS[i % TEAM_COLORS.length] }} />
                      <input
                        type="text"
                        value={name}
                        onChange={e => {
                          const n = [...teamNames];
                          n[i] = e.target.value;
                          setTeamNames(n);
                        }}
                        className="flex-1 bg-transparent text-sm text-white outline-none"
                        placeholder={`Team ${String.fromCharCode(65 + i)}`}
                      />
                      {teamNames.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setTeamNames(prev => prev.filter((_, idx) => idx !== i))}
                          className="shrink-0 text-base leading-none px-1"
                          style={{ color: "rgba(255,255,255,0.3)" }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  {teamNames.length < 4 && (
                    <button
                      onClick={() => setTeamNames(prev => [...prev, `Team ${String.fromCharCode(65 + prev.length)}`])}
                      className="text-xs font-medium px-3 py-1.5"
                      style={{ color: "#30D158" }}
                    >
                      + Add team
                    </button>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Player assignment — tap player then tap team */}
          {acceptedRsvps.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>
                {isCreator ? "Assign players" : "Teams"}
              </p>
              <p className="text-xs mb-3 px-1" style={{ color: "rgba(255,255,255,0.35)" }}>
                {isCreator && !selectedPlayer && "Tap a player, then tap their team."}
                {isCreator && selectedPlayer && "Now tap the team to assign them."}
              </p>

              {/* Players */}
              <div className="rounded-2xl overflow-hidden mb-3" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
                {acceptedRsvps.map((r, i) => {
                  const teamId = assignments[r.id];
                  const team = [...teams, ...teamNames.map((name, idx) => ({ id: `new-${idx}`, name, color: TEAM_COLORS[idx] }))].find(t => t.id === teamId);
                  const isSelected = selectedPlayer === r.id;
                  const isLast = i === acceptedRsvps.length - 1;
                  return (
                    <button
                      key={r.id}
                      onClick={() => isCreator && setSelectedPlayer(isSelected ? null : r.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 transition-all"
                      style={{
                        borderBottom: isLast ? "none" : `0.5px solid ${DIVIDER}`,
                        background: isSelected ? "rgba(48,209,88,0.1)" : "transparent",
                      }}
                    >
                      <div className="flex-1 text-left">
                        <span className="text-sm font-medium text-white">{r.profile?.display_name ?? "?"}</span>
                      </div>
                      {team ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: team.color ?? "#fff" }} />
                          <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.6)" }}>{team.name}</span>
                        </div>
                      ) : (
                        <span className="text-xs shrink-0" style={{ color: "rgba(255,255,255,0.2)" }}>Unassigned</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Team tap targets (visible when a player is selected) */}
              {isCreator && selectedPlayer && (
                <div className="flex gap-2 flex-wrap">
                  {teamNames.filter(Boolean).map((name, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        const teamId = teams[i]?.id ?? `new-${i}`;
                        setAssignments(prev => ({ ...prev, [selectedPlayer]: teamId }));
                        setSelectedPlayer(null);
                      }}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
                      style={{ background: TEAM_COLORS[i % TEAM_COLORS.length] + "33", border: `1.5px solid ${TEAM_COLORS[i % TEAM_COLORS.length]}`, color: "white" }}
                    >
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: TEAM_COLORS[i % TEAM_COLORS.length] }} />
                      {name}
                    </button>
                  ))}
                  <button
                    onClick={() => { setAssignments(prev => ({ ...prev, [selectedPlayer]: null })); setSelectedPlayer(null); }}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium"
                    style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)" }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          )}

          {isCreator && (
            <button
              onClick={saveTeams}
              disabled={saving}
              className="w-full py-3.5 rounded-2xl text-sm font-semibold text-black"
              style={{ background: "#30D158", opacity: saving ? 0.6 : 1 }}
            >
              {saved ? "Saved! ✓" : saving ? "Saving…" : "Save teams"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
