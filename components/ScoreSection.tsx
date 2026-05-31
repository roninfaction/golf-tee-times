"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Camera, Pencil, ScanLine, X } from "lucide-react";

const GOLD = "#C9A84C";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";

type Team = { id: string; name: string; color: string | null };
type RsvpWithTeam = {
  id: string;
  user_id: string;
  team_id: string | null;
  display_name: string;
  handicap_index: number | null;
};
type GuestEntry = { id: string; accepted_name: string; team_id: string | null };
type EditingScore = { scoreId: string; gross: string; handicap: string; targetUserId: string | null; guestInviteId: string | null };

type Score = {
  id: string;
  user_id: string | null;
  guest_invite_id: string | null;
  gross_score: number;
  net_score: number | null;
  handicap_used: number | null;
  scorecard_image_url: string | null;
  source: string;
  profile: { id: string; display_name: string; avatar_url: string | null } | null;
  guest_invite: { id: string; accepted_name: string; team_id: string | null } | null;
};

type GroupScanPlayer = {
  display_name: string;
  user_id: string | null;
  guest_invite_id: string | null;
  handicap_index: number | null;
  gross_score: number | null;   // null = not detected on card
  confidence: "high" | "low" | null;
  edited_gross: string;         // editable field
  edited_handicap: string;      // editable handicap (pre-filled from profile)
};

export function ScoreSection({
  teeTimeId,
  userId,
  isCreator,
  teams,
  rsvps,
  guests,
}: {
  teeTimeId: string;
  userId: string;
  isCreator: boolean;
  teams: Team[];
  rsvps: RsvpWithTeam[];
  guests: GuestEntry[];
}) {
  // Personal score state
  const [scores, setScores] = useState<Score[]>([]);
  const [myScore, setMyScore] = useState<Score | null>(null);
  const [grossScore, setGrossScore] = useState("");
  const [handicap, setHandicap] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrConfidence, setOcrConfidence] = useState<"high" | "low" | "failed" | null>(null);
  const [scorecardPath, setScorecardPath] = useState<string | null>(null);
  const [scorecardPreviewUrl, setScorecardPreviewUrl] = useState<string | null>(null);

  // Guest score state (creator only)
  const [guestScores, setGuestScores] = useState<Record<string, string>>({});
  const [guestSaving, setGuestSaving] = useState<Record<string, boolean>>({});
  const [guestSaved, setGuestSaved] = useState<Record<string, boolean>>({});

  // Group scan state (creator only)
  const [groupStep, setGroupStep] = useState<"idle" | "uploading" | "processing" | "review">("idle");
  const [groupScanPath, setGroupScanPath] = useState<string | null>(null);
  const [groupScanPreviewUrl, setGroupScanPreviewUrl] = useState<string | null>(null);
  const [groupPlayers, setGroupPlayers] = useState<GroupScanPlayer[]>([]);
  const [groupSaving, setGroupSaving] = useState(false);
  const [groupSaved, setGroupSaved] = useState(false);

  // Saved group scan photo (loaded from DB on mount)
  const [savedGroupScanPath, setSavedGroupScanPath] = useState<string | null>(null);
  const [savedGroupScanUrl, setSavedGroupScanUrl] = useState<string | null>(null);

  // Inline score editing
  const [editingScore, setEditingScore] = useState<EditingScore | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Shared
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const groupFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("ghin_handicap_index")
        .eq("id", userId)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((profile as any)?.ghin_handicap_index) setHandicap(String((profile as any).ghin_handicap_index));

      const res = await fetch(`/api/tee-times/${teeTimeId}/scores`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json() as Score[];
        setScores(data);
        const mine = data.find(s => s.user_id === userId);
        if (mine) {
          setMyScore(mine);
          setGrossScore(String(mine.gross_score));
          if (mine.handicap_used) setHandicap(String(mine.handicap_used));
          if (mine.scorecard_image_url) {
            setScorecardPath(mine.scorecard_image_url);
            const { data: signed } = await supabase.storage.from("scorecards").createSignedUrl(mine.scorecard_image_url.replace("scorecards/", ""), 300);
            if (signed?.signedUrl) setScorecardPreviewUrl(signed.signedUrl);
          }
        }
        const guestInit: Record<string, string> = {};
        for (const s of data) {
          if (s.guest_invite_id) guestInit[s.guest_invite_id] = String(s.gross_score);
        }
        if (Object.keys(guestInit).length) setGuestScores(prev => ({ ...guestInit, ...prev }));

        // Load saved group scan photo if any score references one
        const groupScore = data.find(s => s.scorecard_image_url?.includes("_group"));
        if (groupScore?.scorecard_image_url) {
          setSavedGroupScanPath(groupScore.scorecard_image_url);
          const { data: signed } = await supabase.storage.from("scorecards").createSignedUrl(
            groupScore.scorecard_image_url.replace("scorecards/", ""), 300
          );
          if (signed?.signedUrl) setSavedGroupScanUrl(signed.signedUrl);
        }
      }
    }
    load();
  }, [teeTimeId, userId]);

  // ── Personal scorecard photo ──────────────────────────────────────────────
  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setOcrConfidence(null);

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${userId}/${teeTimeId}.${ext}`;
    const { error } = await supabase.storage.from("scorecards").upload(path, file, { upsert: true });
    if (error) { setUploading(false); return; }

    setScorecardPath(path);
    const { data: signed } = await supabase.storage.from("scorecards").createSignedUrl(path, 300);
    if (signed?.signedUrl) setScorecardPreviewUrl(signed.signedUrl);
    setUploading(false);
    setOcrLoading(true);

    const ocrRes = await fetch("/api/scores/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ storage_path: path }),
    });
    if (ocrRes.ok) {
      const { gross_score, confidence } = await ocrRes.json();
      setGrossScore(String(gross_score));
      setOcrConfidence(confidence);
    } else {
      setOcrConfidence("failed");
    }
    setOcrLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!grossScore) return;
    setSaving(true);

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch(`/api/tee-times/${teeTimeId}/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        gross_score: parseInt(grossScore),
        handicap_used: handicap ? parseFloat(handicap) : null,
        scorecard_image_url: scorecardPath,
        source: scorecardPath ? "photo_ocr" : "manual",
      }),
    });
    setSaving(false);
    if (res.ok) {
      const newScore = await res.json() as Score;
      setSaved(true);
      setMyScore(newScore);
      setScores(prev => {
        const filtered = prev.filter(s => s.user_id !== userId);
        return [...filtered, { ...newScore, profile: { id: userId, display_name: "You", avatar_url: null }, guest_invite: null }]
          .sort((a, b) => a.gross_score - b.gross_score);
      });
      setTimeout(() => setSaved(false), 2000);
    }
  }

  // ── Guest score entry ─────────────────────────────────────────────────────
  async function handleGuestScoreSubmit(guestId: string) {
    const raw = guestScores[guestId];
    if (!raw) return;
    setGuestSaving(prev => ({ ...prev, [guestId]: true }));

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const res = await fetch(`/api/tee-times/${teeTimeId}/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ gross_score: parseInt(raw), guest_invite_id: guestId, source: "manual" }),
    });
    setGuestSaving(prev => ({ ...prev, [guestId]: false }));
    if (res.ok) {
      const newScore = await res.json() as Score;
      setGuestSaved(prev => ({ ...prev, [guestId]: true }));
      setTimeout(() => setGuestSaved(prev => ({ ...prev, [guestId]: false })), 2000);
      const guest = guests.find(g => g.id === guestId);
      setScores(prev => {
        const filtered = prev.filter(s => s.guest_invite_id !== guestId);
        return [...filtered, {
          ...newScore,
          profile: null,
          guest_invite: { id: guestId, accepted_name: guest?.accepted_name ?? "Guest", team_id: guest?.team_id ?? null },
        }].sort((a, b) => a.gross_score - b.gross_score);
      });
    }
  }

  // ── Group scan ────────────────────────────────────────────────────────────
  async function handleGroupPhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setGroupStep("uploading");
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${userId}/${teeTimeId}_group.${ext}`;
    const { error } = await supabase.storage.from("scorecards").upload(path, file, { upsert: true });
    if (error) { setGroupStep("idle"); return; }

    setGroupScanPath(path);
    const { data: signed } = await supabase.storage.from("scorecards").createSignedUrl(path, 300);
    if (signed?.signedUrl) setGroupScanPreviewUrl(signed.signedUrl);

    setGroupStep("processing");
    const res = await fetch(`/api/tee-times/${teeTimeId}/scores/ocr-group`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ storage_path: path }),
    });

    if (!res.ok) { setGroupStep("idle"); return; }
    const { players } = await res.json() as { players: Omit<GroupScanPlayer, "edited_gross" | "edited_handicap">[] };

    setGroupPlayers(players.map(p => ({
      ...p,
      edited_gross: p.gross_score != null ? String(p.gross_score) : "",
      edited_handicap: p.handicap_index != null ? String(p.handicap_index) : "",
    })));
    setGroupStep("review");
  }

  async function handleSaveAll() {
    const toSave = groupPlayers.filter(p => p.edited_gross && parseInt(p.edited_gross) >= 50);
    if (!toSave.length) return;
    setGroupSaving(true);

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    await Promise.all(toSave.map(p =>
      fetch(`/api/tee-times/${teeTimeId}/scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          gross_score: parseInt(p.edited_gross),
          handicap_used: p.edited_handicap ? parseFloat(p.edited_handicap) : null,
          source: groupScanPath ? "photo_ocr" : "manual",
          scorecard_image_url: groupScanPath,
          ...(p.guest_invite_id
            ? { guest_invite_id: p.guest_invite_id }
            : p.user_id && p.user_id !== userId
              ? { target_user_id: p.user_id }
              : {}),
        }),
      })
    ));

    // Reload scores
    const res = await fetch(`/api/tee-times/${teeTimeId}/scores`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      const data = await res.json() as Score[];
      setScores(data);
      // Show the group scan photo in the Scores section
      if (groupScanPath) {
        setSavedGroupScanPath(groupScanPath);
        setSavedGroupScanUrl(groupScanPreviewUrl);
      }
    }

    setGroupSaving(false);
    setGroupSaved(true);
    setTimeout(() => { setGroupSaved(false); setGroupStep("idle"); }, 2000);
  }

  async function openLightbox(path: string) {
    const supabase = createClient();
    const { data: signed } = await supabase.storage.from("scorecards").createSignedUrl(
      path.replace("scorecards/", ""), 120
    );
    if (signed?.signedUrl) { setLightboxUrl(signed.signedUrl); setLightboxOpen(true); }
  }

  async function handleEditSave() {
    if (!editingScore?.gross) return;
    setEditSaving(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const body: Record<string, unknown> = {
      gross_score: parseInt(editingScore.gross),
      handicap_used: editingScore.handicap ? parseFloat(editingScore.handicap) : null,
      source: "manual",
    };
    if (editingScore.guestInviteId) {
      body.guest_invite_id = editingScore.guestInviteId;
    } else if (editingScore.targetUserId && editingScore.targetUserId !== userId) {
      body.target_user_id = editingScore.targetUserId;
    }

    const res = await fetch(`/api/tee-times/${teeTimeId}/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const updated = await res.json() as Score;
      setScores(prev => prev.map(s =>
        s.id === editingScore.scoreId
          ? { ...s, gross_score: updated.gross_score, net_score: updated.net_score, handicap_used: updated.handicap_used }
          : s
      ).sort((a, b) => a.gross_score - b.gross_score));
      setEditingScore(null);
    }
    setEditSaving(false);
  }

  // ── Team helpers ──────────────────────────────────────────────────────────
  const userTeamMap = new Map<string, Team | undefined>();
  for (const r of rsvps) {
    if (r.team_id) userTeamMap.set(r.user_id, teams.find(t => t.id === r.team_id));
  }
  function guestTeam(s: Score): Team | undefined {
    const teamId = s.guest_invite?.team_id ?? guests.find(g => g.id === s.guest_invite_id)?.team_id;
    return teamId ? teams.find(t => t.id === teamId) : undefined;
  }

  const teamsWithScores = teams.length > 0 ? teams.map(team => {
    const memberScores = scores.filter(s => {
      if (s.user_id) return userTeamMap.get(s.user_id)?.id === team.id;
      const gTeamId = s.guest_invite?.team_id ?? guests.find(g => g.id === s.guest_invite_id)?.team_id;
      return gTeamId === team.id;
    });
    const total = memberScores.reduce((sum, s) => sum + s.gross_score, 0);
    return { team, memberScores, total };
  }).filter(t => t.memberScores.length > 0).sort((a, b) => a.total - b.total) : [];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div>
        {/* Group scan — creator only */}
        {isCreator && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: GOLD }}>Group scorecard</p>
              {groupStep === "review" && (
                <button onClick={() => setGroupStep("idle")} className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Start over
                </button>
              )}
            </div>

            <input ref={groupFileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleGroupPhotoSelect} />

            {groupStep === "idle" && (
              <button
                onClick={() => groupFileRef.current?.click()}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl"
                style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}
              >
                <ScanLine size={18} style={{ color: GOLD, flexShrink: 0 }} />
                <div className="text-left">
                  <p className="text-sm font-medium text-white">Scan group scorecard</p>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                    One photo fills everyone&apos;s scores — AI reads names + handicaps
                  </p>
                </div>
              </button>
            )}

            {(groupStep === "uploading" || groupStep === "processing") && (
              <div className="px-4 py-4 rounded-2xl text-sm" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}`, color: GOLD }}>
                {groupStep === "uploading" ? "Uploading photo…" : "Reading scorecard with AI…"}
              </div>
            )}

            {groupStep === "review" && (
              <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
                {/* Thumbnail */}
                {groupScanPreviewUrl && (
                  <div className="px-4 pt-3 pb-2">
                    <img src={groupScanPreviewUrl} alt="Group scorecard" className="w-full h-28 object-cover rounded-xl" />
                  </div>
                )}

                {/* Player rows */}
                {groupPlayers.map((p, i) => {
                  const isLast = i === groupPlayers.length - 1;
                  const net = p.edited_gross && p.edited_handicap
                    ? parseInt(p.edited_gross) - Math.floor(parseFloat(p.edited_handicap))
                    : null;
                  return (
                    <div key={p.display_name} style={{ borderBottom: isLast ? "none" : `0.5px solid ${DIVIDER}` }}>
                      <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                        <span className="text-sm font-medium text-white flex-1 truncate">{p.display_name}</span>
                        {p.confidence === "low" && p.gross_score != null && (
                          <span className="text-xs px-2 py-0.5 rounded-full shrink-0" style={{ background: "rgba(255,159,10,0.15)", color: "#FF9F0A" }}>
                            low confidence
                          </span>
                        )}
                        {p.gross_score == null && (
                          <span className="text-xs shrink-0" style={{ color: "rgba(255,255,255,0.25)" }}>not detected</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 px-4 pb-3">
                        <div className="flex-1">
                          <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>Gross</p>
                          <input
                            type="number"
                            min="50"
                            max="180"
                            value={p.edited_gross}
                            onChange={e => setGroupPlayers(prev => prev.map((pl, idx) => idx === i ? { ...pl, edited_gross: e.target.value } : pl))}
                            placeholder="—"
                            className="w-full px-3 py-2 rounded-xl text-sm text-white text-center bg-transparent outline-none placeholder:text-white/20"
                            style={{ border: `0.5px solid ${CARD_BORDER}` }}
                          />
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>
                            Handicap{p.handicap_index != null ? " (from profile)" : ""}
                          </p>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="54"
                            value={p.edited_handicap}
                            onChange={e => setGroupPlayers(prev => prev.map((pl, idx) => idx === i ? { ...pl, edited_handicap: e.target.value } : pl))}
                            placeholder="—"
                            className="w-full px-3 py-2 rounded-xl text-sm text-white text-center bg-transparent outline-none placeholder:text-white/20"
                            style={{ border: `0.5px solid ${CARD_BORDER}` }}
                          />
                        </div>
                        <div className="shrink-0 text-center w-14">
                          <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>Net</p>
                          <p className="text-sm font-semibold" style={{ color: net != null ? "#30D158" : "rgba(255,255,255,0.2)" }}>
                            {net ?? "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div style={{ borderTop: `0.5px solid ${DIVIDER}` }}>
                  <button
                    onClick={handleSaveAll}
                    disabled={groupSaving || groupSaved}
                    className="w-full py-3.5 text-sm font-semibold"
                    style={{ color: groupSaved ? "#30D158" : groupSaving ? "rgba(255,255,255,0.4)" : "#30D158" }}
                  >
                    {groupSaved ? "All scores saved! ✓" : groupSaving ? "Saving…" : "Save all scores"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Personal score entry */}
        <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>
          {myScore ? "Your score" : "Post your score"}
        </p>

        <form onSubmit={handleSubmit} className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
          <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoSelect} />
            {/* Camera / photo thumbnail */}
            {scorecardPreviewUrl ? (
              <button type="button" onClick={() => !ocrLoading && openLightbox(scorecardPath!)} className="relative shrink-0 w-12 h-12 rounded-xl overflow-hidden">
                <img src={scorecardPreviewUrl} alt="Scorecard" className="w-full h-full object-cover" />
                {(uploading || ocrLoading) && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl" style={{ background: "rgba(0,0,0,0.6)" }}>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  </div>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || ocrLoading}
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 relative"
                style={{ background: "rgba(255,255,255,0.07)", border: `0.5px solid ${CARD_BORDER}` }}
              >
                {uploading || ocrLoading
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Camera size={20} className="text-white/40" />}
              </button>
            )}
            <div className="flex-1">
              {uploading && <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>Uploading…</p>}
              {ocrLoading && <p className="text-sm font-semibold" style={{ color: GOLD }}>Reading scorecard…</p>}
              {ocrConfidence === "high" && (
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#30D158" }}>Score detected!</p>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>Check the score below and tap Save</p>
                </div>
              )}
              {ocrConfidence === "low" && (
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#FF9F0A" }}>Couldn&apos;t read clearly</p>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>Check the score below and correct if needed</p>
                </div>
              )}
              {ocrConfidence === "failed" && (
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#FF453A" }}>Scan failed</p>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>Enter score manually below</p>
                </div>
              )}
              {!uploading && !ocrLoading && !ocrConfidence && (
                <button type="button" onClick={() => fileRef.current?.click()} className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {scorecardPreviewUrl ? "Replace photo" : "Scan your scorecard"}
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center" style={{
            borderBottom: `0.5px solid ${DIVIDER}`,
            background: (ocrConfidence === "high" || ocrConfidence === "low") && grossScore ? "rgba(48,209,88,0.06)" : "transparent",
            transition: "background 0.4s",
          }}>
            <span className="pl-4 text-sm shrink-0" style={{ color: "rgba(255,255,255,0.4)" }}>Gross</span>
            <input
              type="number" min="50" max="180"
              value={grossScore} onChange={e => { setGrossScore(e.target.value); setOcrConfidence(null); }}
              placeholder="e.g. 88" required
              className="flex-1 px-3 py-3.5 text-white text-sm bg-transparent outline-none placeholder:text-white/20"
              style={{ fontWeight: (ocrConfidence === "high" || ocrConfidence === "low") && grossScore ? 600 : 400 }}
            />
            {(ocrConfidence === "high" || ocrConfidence === "low") && grossScore && (
              <span className="pr-3 text-xs shrink-0" style={{ color: ocrConfidence === "high" ? "#30D158" : "#FF9F0A" }}>
                {ocrConfidence === "high" ? "AI read" : "unverified"}
              </span>
            )}
          </div>

          <div className="flex items-center" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
            <span className="pl-4 text-sm shrink-0" style={{ color: "rgba(255,255,255,0.4)" }}>Handicap</span>
            <input
              type="number" step="0.1" min="0" max="54"
              value={handicap} onChange={e => setHandicap(e.target.value)}
              placeholder="0.0"
              className="flex-1 px-3 py-3.5 text-white text-sm bg-transparent outline-none placeholder:text-white/20"
            />
            {grossScore && handicap && (
              <span className="pr-4 text-xs font-semibold shrink-0" style={{ color: "#30D158" }}>
                Net {parseInt(grossScore) - Math.round(parseFloat(handicap))}
              </span>
            )}
          </div>

          <button
            type="submit" disabled={saving || !grossScore}
            className="w-full px-4 py-3.5 text-sm font-semibold text-left"
            style={{ color: saved ? "#30D158" : saving ? "rgba(255,255,255,0.4)" : "#30D158" }}
          >
            {saved ? "Score saved! ✓" : saving ? "Saving…" : myScore ? "Update score" : "Save score"}
          </button>
        </form>

        {/* Guest score entry — creator only */}
        {isCreator && guests.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Guest scores</p>
            <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
              {guests.map((guest, i) => {
                const isLast = i === guests.length - 1;
                const team = guest.team_id ? teams.find(t => t.id === guest.team_id) : undefined;
                return (
                  <div key={guest.id} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: isLast ? "none" : `0.5px solid ${DIVIDER}` }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-white truncate">{guest.accepted_name}</span>
                        {team && (
                          <div className="flex items-center gap-1 shrink-0">
                            <div className="w-2 h-2 rounded-full" style={{ background: team.color ?? "#fff" }} />
                            <span className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>{team.name}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <input
                      type="number" min="50" max="180"
                      value={guestScores[guest.id] ?? ""}
                      onChange={e => setGuestScores(prev => ({ ...prev, [guest.id]: e.target.value }))}
                      placeholder="Score"
                      className="w-20 px-3 py-2 rounded-xl text-sm text-white text-center bg-transparent outline-none placeholder:text-white/20"
                      style={{ border: `0.5px solid ${CARD_BORDER}` }}
                    />
                    <button
                      onClick={() => handleGuestScoreSubmit(guest.id)}
                      disabled={guestSaving[guest.id] || !guestScores[guest.id]}
                      className="text-xs font-semibold px-3 py-2 rounded-xl shrink-0"
                      style={{
                        background: guestSaved[guest.id] ? "rgba(48,209,88,0.15)" : "rgba(48,209,88,0.12)",
                        color: guestSaved[guest.id] ? "#30D158" : guestSaving[guest.id] ? "rgba(255,255,255,0.3)" : "#30D158",
                        opacity: !guestScores[guest.id] ? 0.4 : 1,
                      }}
                    >
                      {guestSaved[guest.id] ? "✓" : guestSaving[guest.id] ? "…" : "Save"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* All scores */}
        {scores.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Scores</p>

            {/* Group scorecard photo — shown if any score came from a group scan */}
            {savedGroupScanUrl && (
              <button
                onClick={() => openLightbox(savedGroupScanPath!)}
                className="w-full mb-3 rounded-2xl overflow-hidden relative"
                style={{ border: `0.5px solid ${CARD_BORDER}` }}
              >
                <img src={savedGroupScanUrl} alt="Group scorecard" className="w-full max-h-48 object-cover" />
                <div className="absolute bottom-0 left-0 right-0 px-3 py-2 flex items-center gap-1.5"
                  style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)" }}>
                  <Camera size={12} style={{ color: GOLD }} />
                  <span className="text-xs font-medium" style={{ color: GOLD }}>View scorecard</span>
                </div>
              </button>
            )}

            <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
              {scores.map((s, i) => {
                const isLast = i === scores.length - 1;
                const displayName = s.profile?.display_name ?? s.guest_invite?.accepted_name ?? "Guest";
                const isMe = s.user_id === userId;
                const canEdit = isCreator || isMe;
                const team = s.user_id ? userTeamMap.get(s.user_id) : guestTeam(s);
                const isEditing = editingScore?.scoreId === s.id;

                if (isEditing) {
                  return (
                    <div key={s.id} className="px-4 py-3" style={{ borderBottom: isLast ? "none" : `0.5px solid ${DIVIDER}` }}>
                      <p className="text-xs font-medium text-white mb-2">{isMe ? "You" : displayName}</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>Gross</p>
                          <input
                            type="number" min="50" max="180"
                            value={editingScore.gross}
                            onChange={e => setEditingScore(prev => prev ? { ...prev, gross: e.target.value } : prev)}
                            className="w-full px-3 py-2 rounded-xl text-sm text-white text-center bg-transparent outline-none"
                            style={{ border: `0.5px solid ${CARD_BORDER}` }}
                            autoFocus
                          />
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>Handicap</p>
                          <input
                            type="number" step="0.1" min="0" max="54"
                            value={editingScore.handicap}
                            onChange={e => setEditingScore(prev => prev ? { ...prev, handicap: e.target.value } : prev)}
                            placeholder="—"
                            className="w-full px-3 py-2 rounded-xl text-sm text-white text-center bg-transparent outline-none placeholder:text-white/20"
                            style={{ border: `0.5px solid ${CARD_BORDER}` }}
                          />
                        </div>
                        <div className="flex gap-1 mt-4">
                          <button
                            onClick={handleEditSave}
                            disabled={editSaving || !editingScore.gross}
                            className="px-3 py-2 rounded-xl text-xs font-semibold"
                            style={{ background: "rgba(48,209,88,0.15)", color: "#30D158" }}
                          >
                            {editSaving ? "…" : "Save"}
                          </button>
                          <button
                            onClick={() => setEditingScore(null)}
                            className="px-3 py-2 rounded-xl text-xs font-semibold"
                            style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.4)" }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: isLast ? "none" : `0.5px solid ${DIVIDER}` }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium text-white">{isMe ? "You" : displayName}</p>
                        {s.guest_invite_id && (
                          <span className="text-xs px-1.5 py-0.5 rounded-md" style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.35)" }}>guest</span>
                        )}
                        {team && (
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full" style={{ background: team.color ?? "#fff" }} />
                            <span className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>{team.name}</span>
                          </div>
                        )}
                      </div>
                      {s.handicap_used && (
                        <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>HCP {s.handicap_used}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-white">{s.gross_score}</p>
                      {s.net_score !== null && s.net_score !== s.gross_score && (
                        <p className="text-xs" style={{ color: "#30D158" }}>Net {s.net_score}</p>
                      )}
                    </div>
                    {s.scorecard_image_url && !s.scorecard_image_url.includes("_group") && (
                      <button onClick={() => openLightbox(s.scorecard_image_url!)} className="ml-1 shrink-0">
                        <Camera size={15} className="text-white/30" />
                      </button>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => setEditingScore({
                          scoreId: s.id,
                          gross: String(s.gross_score),
                          handicap: s.handicap_used != null ? String(s.handicap_used) : "",
                          targetUserId: s.user_id,
                          guestInviteId: s.guest_invite_id,
                        })}
                        className="ml-1 shrink-0"
                      >
                        <Pencil size={14} className="text-white/25" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Team results */}
        {teamsWithScores.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Team results</p>
            <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
              {teamsWithScores.map(({ team, memberScores, total }, i) => {
                const isLast = i === teamsWithScores.length - 1;
                const isWinner = i === 0 && teamsWithScores.length > 1;
                return (
                  <div key={team.id} className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: isLast ? "none" : `0.5px solid ${DIVIDER}` }}>
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: team.color ?? "#fff" }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-white">{team.name}</p>
                        {isWinner && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "rgba(201,168,76,0.2)", color: GOLD }}>Winner</span>
                        )}
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                        {memberScores.map(s => s.gross_score).join(" + ")} = {total}
                      </p>
                    </div>
                    <p className="text-lg font-bold text-white shrink-0">{total}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxOpen && lightboxUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={() => setLightboxOpen(false)}>
          <button className="absolute top-4 right-4 p-2" onClick={() => setLightboxOpen(false)}>
            <X size={24} className="text-white" />
          </button>
          <img src={lightboxUrl} alt="Scorecard" className="max-w-full max-h-full object-contain p-4" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </>
  );
}
