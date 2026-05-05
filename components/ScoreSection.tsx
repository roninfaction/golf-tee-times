"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Camera, X } from "lucide-react";

const GOLD = "#C9A84C";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";

type Score = {
  id: string;
  user_id: string;
  gross_score: number;
  net_score: number | null;
  handicap_used: number | null;
  scorecard_image_url: string | null;
  source: string;
  profile: { id: string; display_name: string; avatar_url: string | null };
};

export function ScoreSection({ teeTimeId, userId }: { teeTimeId: string; userId: string }) {
  const [scores, setScores] = useState<Score[]>([]);
  const [myScore, setMyScore] = useState<Score | null>(null);
  const [grossScore, setGrossScore] = useState("");
  const [handicap, setHandicap] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrConfidence, setOcrConfidence] = useState<"high" | "low" | null>(null);
  const [scorecardPath, setScorecardPath] = useState<string | null>(null);
  const [scorecardPreviewUrl, setScorecardPreviewUrl] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Pre-populate handicap from profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("ghin_handicap_index")
        .eq("id", userId)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((profile as any)?.ghin_handicap_index) setHandicap(String((profile as any).ghin_handicap_index));

      // Load existing scores
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
            // Generate preview URL
            const { data: signed } = await supabase.storage.from("scorecards").createSignedUrl(mine.scorecard_image_url.replace("scorecards/", ""), 300);
            if (signed?.signedUrl) setScorecardPreviewUrl(signed.signedUrl);
          }
        }
      }
    }
    load();
  }, [teeTimeId, userId]);

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

    const { error: uploadError } = await supabase.storage
      .from("scorecards")
      .upload(path, file, { upsert: true });

    if (uploadError) { setUploading(false); return; }

    setScorecardPath(path);

    // Show preview
    const { data: signed } = await supabase.storage.from("scorecards").createSignedUrl(path, 300);
    if (signed?.signedUrl) setScorecardPreviewUrl(signed.signedUrl);

    setUploading(false);
    setOcrLoading(true);

    // Run OCR
    const ocrRes = await fetch("/api/scores/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ storage_path: path }),
    });

    if (ocrRes.ok) {
      const { gross_score, confidence } = await ocrRes.json();
      setGrossScore(String(gross_score));
      setOcrConfidence(confidence);
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
        return [...filtered, { ...newScore, profile: { id: userId, display_name: "You", avatar_url: null } }]
          .sort((a, b) => a.gross_score - b.gross_score);
      });
      setTimeout(() => setSaved(false), 2000);
    }
  }

  async function openLightbox(path: string) {
    const supabase = createClient();
    const { data: signed } = await supabase.storage.from("scorecards").createSignedUrl(
      path.replace("scorecards/", ""), 120
    );
    if (signed?.signedUrl) { setLightboxUrl(signed.signedUrl); setLightboxOpen(true); }
  }

  return (
    <>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>
          {myScore ? "Your score" : "Post your score"}
        </p>

        <form onSubmit={handleSubmit} className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
          {/* Scorecard photo row */}
          <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoSelect} />
            {scorecardPreviewUrl ? (
              <button type="button" onClick={() => openLightbox(scorecardPath!)} className="shrink-0">
                <img src={scorecardPreviewUrl} alt="Scorecard" className="w-12 h-12 rounded-xl object-cover" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || ocrLoading}
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(255,255,255,0.07)", border: `0.5px solid ${CARD_BORDER}` }}
              >
                <Camera size={20} className="text-white/40" />
              </button>
            )}
            <div className="flex-1">
              {uploading && <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Uploading…</p>}
              {ocrLoading && <p className="text-xs" style={{ color: GOLD }}>Reading scorecard…</p>}
              {ocrConfidence === "high" && <p className="text-xs" style={{ color: "#30D158" }}>Score detected — confirm below</p>}
              {ocrConfidence === "low" && <p className="text-xs" style={{ color: "#FF9F0A" }}>Could not read clearly — check below</p>}
              {!uploading && !ocrLoading && !ocrConfidence && (
                <button type="button" onClick={() => fileRef.current?.click()} className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {scorecardPreviewUrl ? "Replace photo" : "Take a photo of your scorecard"}
                </button>
              )}
            </div>
          </div>

          {/* Gross score */}
          <div className="flex items-center" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
            <span className="pl-4 text-sm shrink-0" style={{ color: "rgba(255,255,255,0.4)" }}>Gross</span>
            <input
              type="number"
              min="50"
              max="180"
              value={grossScore}
              onChange={e => setGrossScore(e.target.value)}
              placeholder="e.g. 88"
              required
              className="flex-1 px-3 py-3.5 text-white text-sm bg-transparent outline-none placeholder:text-white/20"
            />
          </div>

          {/* Handicap */}
          <div className="flex items-center" style={{ borderBottom: `0.5px solid ${DIVIDER}` }}>
            <span className="pl-4 text-sm shrink-0" style={{ color: "rgba(255,255,255,0.4)" }}>Handicap</span>
            <input
              type="number"
              step="0.1"
              min="0"
              max="54"
              value={handicap}
              onChange={e => setHandicap(e.target.value)}
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
            type="submit"
            disabled={saving || !grossScore}
            className="w-full px-4 py-3.5 text-sm font-semibold text-left"
            style={{ color: saved ? "#30D158" : saving ? "rgba(255,255,255,0.4)" : "#30D158" }}
          >
            {saved ? "Score saved! ✓" : saving ? "Saving…" : myScore ? "Update score" : "Save score"}
          </button>
        </form>

        {/* All scores */}
        {scores.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: GOLD }}>Scores</p>
            <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
              {scores.map((s, i) => {
                const isLast = i === scores.length - 1;
                const name = s.profile?.display_name ?? "Unknown";
                return (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: isLast ? "none" : `0.5px solid ${DIVIDER}` }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">{s.user_id === userId ? "You" : name}</p>
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
                    {s.scorecard_image_url && (
                      <button onClick={() => openLightbox(s.scorecard_image_url!)} className="ml-1 shrink-0">
                        <Camera size={15} className="text-white/30" />
                      </button>
                    )}
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
