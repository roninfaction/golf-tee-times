"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Camera, Pencil, ScanLine, Trophy, X, RotateCw, Download, ZoomIn, ZoomOut, Upload } from "lucide-react";

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
type EditingScore = {
  scoreId: string;
  gross: string;
  handicap: string;
  targetUserId: string | null;
  guestInviteId: string | null;
  holeScores: Record<string, string>;
};

type Score = {
  id: string;
  user_id: string | null;
  guest_invite_id: string | null;
  gross_score: number;
  net_score: number | null;
  handicap_used: number | null;
  scorecard_image_url: string | null;
  hole_scores: Record<string, number> | null;
  source: string;
  profile: { id: string; display_name: string; avatar_url: string | null } | null;
  guest_invite: { id: string; accepted_name: string; team_id: string | null } | null;
};

type GroupScanPlayer = {
  display_name: string;
  user_id: string | null;
  guest_invite_id: string | null;
  handicap_index: number | null;
  gross_score: number | null;
  confidence: "high" | "low" | null;
  edited_gross: string;
  edited_handicap: string;
  hole_scores?: Record<string, number>;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function playerLabel(s: Score, userId: string): string {
  if (s.user_id === userId) return "You";
  return s.profile?.display_name ?? s.guest_invite?.accepted_name ?? "Guest";
}

function calcMatchPlay(scores: Score[]): { id: string; name: string; holesWon: number; holesHalved: number }[] | null {
  const withHoles = scores.filter(s => s.hole_scores && Object.keys(s.hole_scores).length >= 9);
  if (withHoles.length < 2) return null;

  const wins: Record<string, number> = {};
  let halvedTotal = 0;

  for (let hole = 1; hole <= 18; hole++) {
    const holeScores = withHoles
      .map(s => ({ id: s.id, score: s.hole_scores![String(hole)] ?? null }))
      .filter(s => s.score !== null);
    if (holeScores.length < 2) continue;

    const min = Math.min(...holeScores.map(s => s.score!));
    const winners = holeScores.filter(s => s.score === min);
    if (winners.length === 1) {
      wins[winners[0].id] = (wins[winners[0].id] ?? 0) + 1;
    } else {
      halvedTotal++;
    }
  }

  return withHoles
    .map(s => ({
      id: s.id,
      name: s.profile?.display_name ?? s.guest_invite?.accepted_name ?? "Guest",
      holesWon: wins[s.id] ?? 0,
      holesHalved: halvedTotal,
    }))
    .sort((a, b) => b.holesWon - a.holesWon);
}

type BestBallResult = {
  teamId: string;
  name: string;
  color: string | null;
  bestBallTotal: number | null;
  holesWon: number;
  holesHalved: number;
  memberBreakdown: string;
};

function calcBestBallTeams(
  scores: Score[],
  teams: Team[],
  userTeamMap: Map<string, Team | undefined>,
  getGuestTeam: (s: Score) => Team | undefined
): BestBallResult[] | null {
  const teamScores: Record<string, Score[]> = {};
  for (const s of scores) {
    const team = s.user_id ? userTeamMap.get(s.user_id) : getGuestTeam(s);
    if (!team) continue;
    if (!teamScores[team.id]) teamScores[team.id] = [];
    teamScores[team.id].push(s);
  }

  const teamIds = Object.keys(teamScores);
  if (teamIds.length < 1) return null;

  // Per-team best ball score per hole
  const teamBestPerHole: Record<string, Record<number, number>> = {};
  let hasHoleData = false;

  for (const teamId of teamIds) {
    teamBestPerHole[teamId] = {};
    for (let hole = 1; hole <= 18; hole++) {
      const vals = teamScores[teamId]
        .map(s => s.hole_scores?.[String(hole)] ?? null)
        .filter((v): v is number => v !== null);
      if (vals.length > 0) {
        teamBestPerHole[teamId][hole] = Math.min(...vals);
        hasHoleData = true;
      }
    }
  }

  // Team best-ball totals (sum of best holes)
  const teamTotals: Record<string, number | null> = {};
  for (const teamId of teamIds) {
    const vals = Object.values(teamBestPerHole[teamId]);
    teamTotals[teamId] = vals.length >= 9 ? vals.reduce((a, b) => a + b, 0) : null;
  }

  // Team holes won (compare teams hole by hole using best-ball scores)
  const teamHolesWon: Record<string, number> = {};
  for (const id of teamIds) teamHolesWon[id] = 0;
  let halvedTotal = 0;

  if (hasHoleData && teamIds.length >= 2) {
    for (let hole = 1; hole <= 18; hole++) {
      const holeData = teamIds
        .map(id => ({ id, score: teamBestPerHole[id][hole] ?? null }))
        .filter(t => t.score !== null);
      if (holeData.length < 2) continue;
      const min = Math.min(...holeData.map(t => t.score!));
      const winners = holeData.filter(t => t.score === min);
      if (winners.length === 1) {
        teamHolesWon[winners[0].id] = (teamHolesWon[winners[0].id] ?? 0) + 1;
      } else {
        halvedTotal++;
      }
    }
  }

  return teams
    .filter(t => teamScores[t.id])
    .map(t => {
      const members = teamScores[t.id] ?? [];
      const memberGross = members.map(s => s.gross_score).join(" + ");
      const bbTotal = teamTotals[t.id];
      return {
        teamId: t.id,
        name: t.name,
        color: t.color,
        bestBallTotal: bbTotal,
        holesWon: teamHolesWon[t.id] ?? 0,
        holesHalved: halvedTotal,
        memberBreakdown: bbTotal !== null ? `${memberGross} → ${bbTotal}` : memberGross,
      };
    })
    .sort((a, b) => {
      if (hasHoleData) return b.holesWon - a.holesWon;
      return (a.bestBallTotal ?? 999) - (b.bestBallTotal ?? 999);
    });
}

export function ScoreSection({
  teeTimeId,
  userId,
  isCreator,
  isGroupAdmin,
  format,
  teams,
  rsvps,
  guests,
}: {
  teeTimeId: string;
  userId: string;
  isCreator: boolean;
  isGroupAdmin: boolean;
  format: string | null;
  teams: Team[];
  rsvps: RsvpWithTeam[];
  guests: GuestEntry[];
}) {
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

  const [guestScores, setGuestScores] = useState<Record<string, string>>({});
  const [guestSaving, setGuestSaving] = useState<Record<string, boolean>>({});
  const [guestSaved, setGuestSaved] = useState<Record<string, boolean>>({});

  const [groupStep, setGroupStep] = useState<"idle" | "uploading" | "processing" | "review" | "error">("idle");
  const [groupScanPath, setGroupScanPath] = useState<string | null>(null);
  const [groupScanPreviewUrl, setGroupScanPreviewUrl] = useState<string | null>(null);
  const [groupPlayers, setGroupPlayers] = useState<GroupScanPlayer[]>([]);
  const [groupSaving, setGroupSaving] = useState(false);
  const [groupSaved, setGroupSaved] = useState(false);
  const [groupSaveError, setGroupSaveError] = useState<string | null>(null);

  const [savedGroupScanPath, setSavedGroupScanPath] = useState<string | null>(null);
  const [savedGroupScanUrl, setSavedGroupScanUrl] = useState<string | null>(null);

  const [editingScore, setEditingScore] = useState<EditingScore | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxRotation, setLightboxRotation] = useState(0);
  const [lightboxZoom, setLightboxZoom] = useState(1);

  // Pinch-to-zoom refs
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartZoom = useRef(1);

  const fileRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const groupFileRef = useRef<HTMLInputElement>(null);
  const groupGalleryRef = useRef<HTMLInputElement>(null);

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
      if (!res.ok) return;

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

      const groupScore = data.find(s => s.scorecard_image_url?.includes("_group"));
      if (groupScore?.scorecard_image_url) {
        setSavedGroupScanPath(groupScore.scorecard_image_url);
        const { data: signed } = await supabase.storage.from("scorecards").createSignedUrl(
          groupScore.scorecard_image_url.replace("scorecards/", ""), 300
        );
        if (signed?.signedUrl) setSavedGroupScanUrl(signed.signedUrl);
      }
    }
    load();
  }, [teeTimeId, userId]);

  // ── Personal scorecard ────────────────────────────────────────────────────
  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setOcrConfidence(null);

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setUploading(false); return; }

    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${userId}/${teeTimeId}.${ext}`;
    const { error } = await supabase.storage.from("scorecards").upload(path, file, { upsert: true });
    if (error) { setUploading(false); return; }

    setScorecardPath(path);
    const { data: signed } = await supabase.storage.from("scorecards").createSignedUrl(path, 300);
    if (signed?.signedUrl) setScorecardPreviewUrl(signed.signedUrl);
    setUploading(false);
    setOcrLoading(true);

    try {
      const ocrRes = await fetch("/api/scores/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ storage_path: path }),
      });

      if (ocrRes.ok) {
        const { gross_score, confidence, hole_scores } = await ocrRes.json();
        setGrossScore(String(gross_score));
        setOcrConfidence(confidence);

        const saveRes = await fetch(`/api/tee-times/${teeTimeId}/scores`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({
            gross_score,
            handicap_used: handicap ? parseFloat(handicap) : null,
            scorecard_image_url: path,
            source: "photo_ocr",
            hole_scores: hole_scores ?? null,
          }),
        });
        if (saveRes.ok) {
          const newScore = await saveRes.json() as Score;
          setMyScore(newScore);
          setSaved(true);
          setTimeout(() => setSaved(false), 3000);
          setScores(prev => {
            const filtered = prev.filter(s => s.user_id !== userId);
            return [...filtered, { ...newScore, profile: { id: userId, display_name: "You", avatar_url: null }, guest_invite: null }]
              .sort((a, b) => a.gross_score - b.gross_score);
          });
        }
      } else {
        setOcrConfidence("failed");
      }
    } catch {
      setOcrConfidence("failed");
    }
    setOcrLoading(false);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
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
    setGroupSaveError(null);
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

    if (!res.ok) { setGroupStep("error"); return; }
    const { players } = await res.json() as { players: Omit<GroupScanPlayer, "edited_gross" | "edited_handicap">[] };

    setGroupPlayers(players.map(p => ({
      ...p,
      edited_gross: p.gross_score != null ? String(p.gross_score) : "",
      edited_handicap: p.handicap_index != null ? String(p.handicap_index) : "",
    })));
    setGroupStep("review");
  }

  function handleEnterManually() {
    setGroupPlayers([
      ...rsvps.map(r => ({
        display_name: r.display_name,
        user_id: r.user_id,
        guest_invite_id: null,
        handicap_index: r.handicap_index,
        gross_score: null,
        confidence: null,
        edited_gross: "",
        edited_handicap: r.handicap_index != null ? String(r.handicap_index) : "",
      })),
      ...guests.map(g => ({
        display_name: g.accepted_name,
        user_id: null,
        guest_invite_id: g.id,
        handicap_index: null,
        gross_score: null,
        confidence: null,
        edited_gross: "",
        edited_handicap: "",
      })),
    ]);
    setGroupStep("review");
  }

  async function handleSaveAll() {
    const toSave = groupPlayers.filter(p => p.edited_gross && parseInt(p.edited_gross) >= 50);
    if (!toSave.length) return;
    setGroupSaving(true);
    setGroupSaveError(null);

    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const results = await Promise.all(toSave.map(p =>
      fetch(`/api/tee-times/${teeTimeId}/scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          gross_score: parseInt(p.edited_gross),
          handicap_used: p.edited_handicap ? parseFloat(p.edited_handicap) : null,
          source: groupScanPath ? "photo_ocr" : "manual",
          scorecard_image_url: groupScanPath,
          hole_scores: p.hole_scores ?? null,
          ...(p.guest_invite_id
            ? { guest_invite_id: p.guest_invite_id }
            : p.user_id && p.user_id !== userId
              ? { target_user_id: p.user_id }
              : {}),
        }),
      }).then(r => r.ok)
    ));

    const failCount = results.filter(ok => !ok).length;

    const res = await fetch(`/api/tee-times/${teeTimeId}/scores`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      const data = await res.json() as Score[];
      setScores(data);
      if (groupScanPath) {
        setSavedGroupScanPath(groupScanPath);
        setSavedGroupScanUrl(groupScanPreviewUrl);
      }
    }

    setGroupSaving(false);
    if (failCount > 0) {
      setGroupSaveError(`${failCount} score${failCount > 1 ? "s" : ""} couldn't be saved — check each player has an RSVP`);
    } else {
      setGroupSaved(true);
      setTimeout(() => { setGroupSaved(false); setGroupStep("idle"); }, 2500);
    }
  }

  async function openLightbox(path: string) {
    const supabase = createClient();
    const { data: signed } = await supabase.storage.from("scorecards").createSignedUrl(
      path.replace("scorecards/", ""), 120
    );
    if (signed?.signedUrl) {
      setLightboxUrl(signed.signedUrl);
      setLightboxRotation(0);
      setLightboxZoom(1);
      setLightboxOpen(true);
    }
  }

  function closeLightbox() {
    setLightboxOpen(false);
    setLightboxRotation(0);
    setLightboxZoom(1);
  }

  async function handleLightboxDownload() {
    if (!lightboxUrl) return;
    try {
      const response = await fetch(lightboxUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "scorecard.jpg";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(lightboxUrl, "_blank");
    }
  }

  function handleLightboxTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDist.current = Math.sqrt(dx * dx + dy * dy);
      pinchStartZoom.current = lightboxZoom;
    }
  }

  function handleLightboxTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinchStartDist.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = pinchStartZoom.current * (dist / pinchStartDist.current);
      setLightboxZoom(Math.max(0.5, Math.min(5, scale)));
    }
  }

  function handleLightboxTouchEnd() {
    pinchStartDist.current = null;
  }

  async function handleEditSave() {
    if (!editingScore?.gross) return;
    setEditSaving(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Build hole_scores from the string map — only include holes with valid numbers
    const parsedHoleScores: Record<string, number> = {};
    for (const [hole, val] of Object.entries(editingScore.holeScores)) {
      const n = parseInt(val);
      if (!isNaN(n) && n > 0) parsedHoleScores[hole] = n;
    }

    const body: Record<string, unknown> = {
      gross_score: parseInt(editingScore.gross),
      handicap_used: editingScore.handicap ? parseFloat(editingScore.handicap) : null,
      source: "manual",
      hole_scores: Object.keys(parsedHoleScores).length > 0 ? parsedHoleScores : null,
    };
    if (editingScore.guestInviteId) body.guest_invite_id = editingScore.guestInviteId;
    else if (editingScore.targetUserId && editingScore.targetUserId !== userId) body.target_user_id = editingScore.targetUserId;

    const res = await fetch(`/api/tee-times/${teeTimeId}/scores`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const updated = await res.json() as Score;
      setScores(prev => prev.map(s =>
        s.id === editingScore.scoreId
          ? { ...s, gross_score: updated.gross_score, net_score: updated.net_score, handicap_used: updated.handicap_used, hole_scores: updated.hole_scores }
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

  // Format-aware team scores
  const teamsWithScores = teams.length > 0 ? teams.map(team => {
    const memberScores = scores.filter(s => {
      if (s.user_id) return userTeamMap.get(s.user_id)?.id === team.id;
      const gTeamId = s.guest_invite?.team_id ?? guests.find(g => g.id === s.guest_invite_id)?.team_id;
      return gTeamId === team.id;
    });
    // Scramble: all players played same ball — use min gross as team score
    const total = format === "scramble" && memberScores.length > 0
      ? Math.min(...memberScores.map(s => s.gross_score))
      : memberScores.reduce((sum, s) => sum + s.gross_score, 0);
    return { team, memberScores, total };
  }).filter(t => t.memberScores.length > 0).sort((a, b) => a.total - b.total) : [];

  const bestBallResults = format === "best_ball"
    ? calcBestBallTeams(scores, teams, userTeamMap, guestTeam)
    : null;

  // ── Winner + match play ───────────────────────────────────────────────────
  const grossWinnerId = scores.length > 0 ? scores[0].id : null;
  const netScores = scores.filter(s => s.net_score !== null);
  const netWinnerId = netScores.length > 0
    ? netScores.sort((a, b) => (a.net_score ?? 0) - (b.net_score ?? 0))[0].id
    : null;
  const matchPlay = calcMatchPlay(scores);
  const showIndividualMatchPlay = matchPlay && format !== "best_ball" && format !== "scramble";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div>

        {/* ── Results — shown first when scores exist ───────────────────── */}
        {scores.length > 0 && (
          <div className="mb-4">

            {/* Best ball team results */}
            {bestBallResults && bestBallResults.length >= 2 && (
              <div className="mb-3">
                <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>
                  Best ball
                </p>
                <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
                  {bestBallResults.map((t, i) => {
                    const isFirst = i === 0;
                    const isLast = i === bestBallResults.length - 1;
                    return (
                      <div key={t.teamId} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: isLast ? "none" : `0.5px solid ${DIVIDER}` }}>
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: t.color ?? "#fff" }} />
                        {isFirst && <Trophy size={14} style={{ color: GOLD, flexShrink: 0 }} />}
                        {!isFirst && <div style={{ width: 14, flexShrink: 0 }} />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white">{t.name}</p>
                          <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{t.memberBreakdown}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold" style={{ color: isFirst ? GOLD : "rgba(255,255,255,0.5)" }}>
                            {t.holesWon} hole{t.holesWon !== 1 ? "s" : ""}
                          </p>
                          {t.bestBallTotal !== null && (
                            <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>{t.bestBallTotal} strokes</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {bestBallResults[0] && (
                    <div className="px-4 py-2 text-xs" style={{ borderTop: `0.5px solid ${DIVIDER}`, color: "rgba(255,255,255,0.3)" }}>
                      {bestBallResults[0].holesHalved} hole{bestBallResults[0].holesHalved !== 1 ? "s" : ""} halved
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Individual match play — hidden for team formats */}
            {showIndividualMatchPlay && (
              <div className="mb-3">
                <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>
                  Match play
                </p>
                <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
                  {matchPlay.map((p, i) => {
                    const isFirst = i === 0;
                    const isLast = i === matchPlay.length - 1;
                    return (
                      <div key={p.id} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: isLast ? "none" : `0.5px solid ${DIVIDER}` }}>
                        {isFirst && <Trophy size={14} style={{ color: GOLD, flexShrink: 0 }} />}
                        {!isFirst && <div style={{ width: 14, flexShrink: 0 }} />}
                        <p className="text-sm font-medium text-white flex-1">{p.name}</p>
                        <p className="text-sm font-semibold" style={{ color: isFirst ? GOLD : "rgba(255,255,255,0.5)" }}>
                          {p.holesWon} hole{p.holesWon !== 1 ? "s" : ""}
                        </p>
                      </div>
                    );
                  })}
                  {matchPlay[0] && (
                    <div className="px-4 py-2 text-xs" style={{ borderTop: `0.5px solid ${DIVIDER}`, color: "rgba(255,255,255,0.3)" }}>
                      {matchPlay[0].holesHalved} hole{matchPlay[0].holesHalved !== 1 ? "s" : ""} halved
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Scorecard photo */}
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

            {/* Scores list */}
            <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Scores</p>
            <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
              {scores.map((s, i) => {
                const isLast = i === scores.length - 1;
                const displayName = playerLabel(s, userId);
                const isMe = s.user_id === userId;
                const canEditOwn = isMe;
                const canEditOthers = isCreator || isGroupAdmin;
                const canEdit = canEditOwn || canEditOthers;
                const team = s.user_id ? userTeamMap.get(s.user_id) : guestTeam(s);
                const isGrossWinner = s.id === grossWinnerId && scores.length > 1;
                const isNetWinner = s.id === netWinnerId && netScores.length > 1 && netWinnerId !== grossWinnerId;
                const isEditing = editingScore?.scoreId === s.id;

                if (isEditing) {
                  const holeSum = Object.values(editingScore.holeScores)
                    .map(v => parseInt(v))
                    .filter(n => !isNaN(n) && n > 0)
                    .reduce((a, b) => a + b, 0);
                  const holeCount = Object.values(editingScore.holeScores).filter(v => parseInt(v) > 0).length;

                  return (
                    <div key={s.id} className="px-4 py-3" style={{ borderBottom: isLast ? "none" : `0.5px solid ${DIVIDER}` }}>
                      <p className="text-xs font-semibold text-white mb-3">{displayName}</p>

                      {/* Gross + Handicap */}
                      <div className="flex items-start gap-2 mb-3">
                        <div className="flex-1">
                          <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>Gross</p>
                          <input
                            type="number" min="18" max="180"
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
                      </div>

                      {/* Hole scores (9+9 grid) */}
                      <div className="mb-2">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[10px] uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.3)" }}>Hole scores</p>
                          {holeCount >= 9 && (
                            <button
                              type="button"
                              onClick={() => setEditingScore(prev => prev ? { ...prev, gross: String(holeSum) } : prev)}
                              className="text-[10px] font-semibold"
                              style={{ color: GOLD }}
                            >
                              Use sum ({holeSum})
                            </button>
                          )}
                        </div>
                        {/* Front 9 */}
                        <div className="grid grid-cols-9 gap-1 mb-1">
                          {Array.from({ length: 9 }, (_, i) => i + 1).map(hole => (
                            <div key={hole} className="text-center">
                              <p className="text-[9px] mb-0.5" style={{ color: "rgba(255,255,255,0.2)" }}>{hole}</p>
                              <input
                                type="number" min="1" max="20"
                                value={editingScore.holeScores[String(hole)] ?? ""}
                                onChange={e => setEditingScore(prev => prev
                                  ? { ...prev, holeScores: { ...prev.holeScores, [String(hole)]: e.target.value } }
                                  : prev)}
                                placeholder="—"
                                className="w-full px-0 py-1.5 rounded-lg text-xs text-white text-center bg-transparent outline-none placeholder:text-white/15"
                                style={{ border: `0.5px solid ${CARD_BORDER}` }}
                              />
                            </div>
                          ))}
                        </div>
                        {/* Back 9 */}
                        <div className="grid grid-cols-9 gap-1">
                          {Array.from({ length: 9 }, (_, i) => i + 10).map(hole => (
                            <div key={hole} className="text-center">
                              <p className="text-[9px] mb-0.5" style={{ color: "rgba(255,255,255,0.2)" }}>{hole}</p>
                              <input
                                type="number" min="1" max="20"
                                value={editingScore.holeScores[String(hole)] ?? ""}
                                onChange={e => setEditingScore(prev => prev
                                  ? { ...prev, holeScores: { ...prev.holeScores, [String(hole)]: e.target.value } }
                                  : prev)}
                                placeholder="—"
                                className="w-full px-0 py-1.5 rounded-lg text-xs text-white text-center bg-transparent outline-none placeholder:text-white/15"
                                style={{ border: `0.5px solid ${CARD_BORDER}` }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Save / Cancel */}
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={handleEditSave}
                          disabled={editSaving || !editingScore.gross}
                          className="flex-1 px-3 py-2 rounded-xl text-sm font-semibold"
                          style={{ background: "rgba(48,209,88,0.15)", color: "#30D158" }}
                        >
                          {editSaving ? "Saving…" : "Save"}
                        </button>
                        <button
                          onClick={() => setEditingScore(null)}
                          className="px-4 py-2 rounded-xl text-sm font-semibold"
                          style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.4)" }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: isLast ? "none" : `0.5px solid ${DIVIDER}` }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium text-white">{displayName}</p>
                        {s.guest_invite_id && (
                          <span className="text-xs px-1.5 py-0.5 rounded-md" style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.35)" }}>guest</span>
                        )}
                        {isGrossWinner && (
                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md" style={{ background: "rgba(201,168,76,0.18)", color: GOLD }}>🏆 gross</span>
                        )}
                        {isNetWinner && (
                          <span className="text-xs font-semibold px-1.5 py-0.5 rounded-md" style={{ background: "rgba(48,209,88,0.15)", color: "#30D158" }}>🏆 net</span>
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
                        onClick={() => {
                          const existing = s.hole_scores ?? {};
                          const holeScores: Record<string, string> = {};
                          for (let h = 1; h <= 18; h++) {
                            holeScores[String(h)] = existing[String(h)] != null ? String(existing[String(h)]) : "";
                          }
                          setEditingScore({
                            scoreId: s.id,
                            gross: String(s.gross_score),
                            handicap: s.handicap_used != null ? String(s.handicap_used) : "",
                            targetUserId: s.user_id,
                            guestInviteId: s.guest_invite_id,
                            holeScores,
                          });
                        }}
                        className="ml-1 shrink-0"
                      >
                        <Pencil size={14} className="text-white/25" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Team results — stroke / scramble */}
            {teamsWithScores.length > 0 && format !== "best_ball" && (
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>
                  {format === "scramble" ? "Scramble results" : "Team results"}
                </p>
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
                            {format === "scramble"
                              ? "Scramble"
                              : `${memberScores.map(s => s.gross_score).join(" + ")} = ${total}`}
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
        )}

        {/* ── Group scan — creator / group admin only ───────────────────── */}
        {(isCreator || isGroupAdmin) && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: GOLD }}>Group scorecard</p>
              {groupStep === "review" && (
                <button onClick={() => setGroupStep("idle")} className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Start over
                </button>
              )}
            </div>

            {/* Hidden file inputs — no capture so user can pick camera OR gallery */}
            <input ref={groupFileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleGroupPhotoSelect} />
            <input ref={groupGalleryRef} type="file" accept="image/*" className="hidden" onChange={handleGroupPhotoSelect} />

            {groupStep === "idle" && (
              <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
                <button
                  onClick={() => groupFileRef.current?.click()}
                  className="w-full flex items-center gap-3 px-4 py-3.5"
                  style={{ borderBottom: `0.5px solid ${DIVIDER}` }}
                >
                  <ScanLine size={18} style={{ color: GOLD, flexShrink: 0 }} />
                  <div className="text-left">
                    <p className="text-sm font-medium text-white">Scan group scorecard</p>
                    <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                      Take a photo — AI reads names + scores
                    </p>
                  </div>
                </button>
                <button
                  onClick={() => groupGalleryRef.current?.click()}
                  className="w-full flex items-center gap-3 px-4 py-3.5"
                >
                  <Upload size={18} style={{ color: "rgba(255,255,255,0.4)", flexShrink: 0 }} />
                  <div className="text-left">
                    <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>Upload from photos</p>
                    <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
                      Choose an existing photo of the scorecard
                    </p>
                  </div>
                </button>
              </div>
            )}

            {(groupStep === "uploading" || groupStep === "processing") && (
              <div className="px-4 py-4 rounded-2xl text-sm" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}`, color: GOLD }}>
                {groupStep === "uploading" ? "Uploading photo…" : "Reading scorecard with AI…"}
              </div>
            )}

            {groupStep === "error" && (
              <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
                {groupScanPreviewUrl && (
                  <div className="px-4 pt-3 pb-2">
                    <img src={groupScanPreviewUrl} alt="Group scorecard" className="w-full h-28 object-cover rounded-xl" />
                  </div>
                )}
                <div className="px-4 pb-2">
                  <p className="text-sm font-semibold" style={{ color: "#FF453A" }}>Couldn&apos;t read scorecard</p>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>AI couldn&apos;t extract scores — enter them manually or try again</p>
                </div>
                <div className="flex gap-2 px-4 pb-4">
                  <button
                    onClick={handleEnterManually}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                    style={{ background: "rgba(48,209,88,0.12)", color: "#30D158" }}
                  >
                    Enter manually
                  </button>
                  <button
                    onClick={() => groupFileRef.current?.click()}
                    className="py-2.5 px-4 rounded-xl text-sm font-semibold"
                    style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)" }}
                  >
                    Try again
                  </button>
                </div>
              </div>
            )}

            {groupStep === "review" && (
              <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
                {groupScanPreviewUrl && (
                  <div className="px-4 pt-3 pb-2">
                    <img src={groupScanPreviewUrl} alt="Group scorecard" className="w-full h-28 object-cover rounded-xl" />
                  </div>
                )}

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
                            type="number" min="50" max="180"
                            value={p.edited_gross}
                            onChange={e => setGroupPlayers(prev => prev.map((pl, idx) => idx === i ? { ...pl, edited_gross: e.target.value } : pl))}
                            placeholder="—"
                            className="w-full px-3 py-2 rounded-xl text-sm text-white text-center bg-transparent outline-none placeholder:text-white/20"
                            style={{ border: `0.5px solid ${CARD_BORDER}` }}
                          />
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>
                            Handicap{p.handicap_index != null ? " (profile)" : ""}
                          </p>
                          <input
                            type="number" step="0.1" min="0" max="54"
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
                  {groupSaveError && (
                    <p className="px-4 pt-3 text-xs" style={{ color: "#FF453A" }}>{groupSaveError}</p>
                  )}
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

        {/* ── Personal score entry ──────────────────────────────────────── */}
        <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>
          {myScore ? "Your score" : "Post your score"}
        </p>

        <form onSubmit={handleSubmit} className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
          <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
            {/* Camera: take photo */}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoSelect} />
            {/* Gallery: pick existing photo */}
            <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoSelect} />

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
              <div className="flex gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading || ocrLoading}
                  className="w-12 h-12 rounded-xl flex items-center justify-center relative"
                  style={{ background: "rgba(255,255,255,0.07)", border: `0.5px solid ${CARD_BORDER}` }}
                  title="Take photo"
                >
                  {uploading || ocrLoading
                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <Camera size={20} className="text-white/40" />}
                </button>
                <button
                  type="button"
                  onClick={() => galleryRef.current?.click()}
                  disabled={uploading || ocrLoading}
                  className="w-12 h-12 rounded-xl flex items-center justify-center relative"
                  style={{ background: "rgba(255,255,255,0.07)", border: `0.5px solid ${CARD_BORDER}` }}
                  title="Upload from photos"
                >
                  <Upload size={18} className="text-white/30" />
                </button>
              </div>
            )}
            <div className="flex-1">
              {uploading && <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>Uploading…</p>}
              {ocrLoading && <p className="text-sm font-semibold" style={{ color: GOLD }}>Reading scorecard…</p>}
              {ocrConfidence === "high" && (
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#30D158" }}>Score saved!</p>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>Tap the pencil above to edit</p>
                </div>
              )}
              {ocrConfidence === "low" && (
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#FF9F0A" }}>Saved — low confidence</p>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>Tap the pencil above to verify</p>
                </div>
              )}
              {ocrConfidence === "failed" && (
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#FF453A" }}>Couldn&apos;t read scorecard</p>
                  <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>Enter your score below manually</p>
                </div>
              )}
              {!uploading && !ocrLoading && !ocrConfidence && (
                <p className="text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>
                  {scorecardPreviewUrl ? "Tap to view · use camera or upload to replace" : "Scan or upload your scorecard"}
                </p>
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

        {/* ── Guest score entry — creator / group admin only ─────────────── */}
        {(isCreator || isGroupAdmin) && guests.length > 0 && (
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
      </div>

      {/* ── Enhanced lightbox ─────────────────────────────────────────────── */}
      {lightboxOpen && lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: "rgba(0,0,0,0.97)" }}
          onTouchStart={handleLightboxTouchStart}
          onTouchMove={handleLightboxTouchMove}
          onTouchEnd={handleLightboxTouchEnd}
        >
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "0.5px solid rgba(255,255,255,0.08)" }}>
            <button
              onClick={handleLightboxDownload}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
              style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)" }}
            >
              <Download size={15} />
              Save
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setLightboxRotation(r => (r + 90) % 360)}
                className="p-2.5 rounded-xl"
                style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)" }}
              >
                <RotateCw size={17} />
              </button>
              <button
                onClick={() => setLightboxZoom(z => Math.min(z + 0.5, 5))}
                className="p-2.5 rounded-xl"
                style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)" }}
              >
                <ZoomIn size={17} />
              </button>
              <button
                onClick={() => setLightboxZoom(z => Math.max(z - 0.5, 0.5))}
                className="p-2.5 rounded-xl"
                style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.6)" }}
              >
                <ZoomOut size={17} />
              </button>
            </div>
            <button
              onClick={closeLightbox}
              className="p-2.5 rounded-xl"
              style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.7)" }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Image area — scrollable for when zoomed */}
          <div className="flex-1 overflow-auto flex items-center justify-center p-4" onClick={closeLightbox}>
            <img
              src={lightboxUrl}
              alt="Scorecard"
              className="object-contain select-none"
              style={{
                transform: `rotate(${lightboxRotation}deg) scale(${lightboxZoom})`,
                transformOrigin: "center center",
                transition: "transform 0.25s ease",
                maxWidth: lightboxRotation % 180 !== 0 ? "80vh" : "100%",
                maxHeight: lightboxRotation % 180 !== 0 ? "80vw" : "80vh",
              }}
              onClick={e => e.stopPropagation()}
              draggable={false}
            />
          </div>

          {/* Zoom hint */}
          {lightboxZoom === 1 && lightboxRotation === 0 && (
            <p className="text-center text-xs pb-4 shrink-0" style={{ color: "rgba(255,255,255,0.2)" }}>
              Pinch to zoom · rotate icon to flip landscape
            </p>
          )}
        </div>
      )}
    </>
  );
}
