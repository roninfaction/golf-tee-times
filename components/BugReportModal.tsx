"use client";

import { useState, useRef } from "react";
import { X, Bug, Image, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";

const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";

interface Props {
  onClose: () => void;
}

export function BugReportModal({ onClose }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setScreenshotFile(file);
    const url = URL.createObjectURL(file);
    setScreenshotPreview(url);
  }

  function removeScreenshot() {
    setScreenshotFile(null);
    if (screenshotPreview) URL.revokeObjectURL(screenshotPreview);
    setScreenshotPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Please add a title."); return; }
    setSubmitting(true);
    setError("");

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("You must be signed in."); setSubmitting(false); return; }

      let screenshotPath: string | null = null;

      if (screenshotFile) {
        const ext = screenshotFile.name.split(".").pop() ?? "jpg";
        const path = `${session.user.id}/${Date.now()}.${ext}`;
        const { data: uploaded, error: uploadErr } = await supabase.storage
          .from("bug-report-screenshots")
          .upload(path, screenshotFile, { contentType: screenshotFile.type });
        if (uploadErr) {
          setError("Screenshot upload failed — submit without it?");
          setSubmitting(false);
          return;
        }
        screenshotPath = uploaded.path;
      }

      const res = await fetch("/api/bug-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          screenshot_path: screenshotPath,
          page_url: window.location.href,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Something went wrong. Try again.");
        setSubmitting(false);
        return;
      }

      setSubmitted(true);
      setTimeout(onClose, 2000);
    } catch {
      setError("Something went wrong. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0,0,0,0.6)" }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl px-4 pt-5 pb-10"
        style={{ background: "#1C1C1E", border: `0.5px solid ${CARD_BORDER}` }}
      >
        {/* Handle */}
        <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: "rgba(255,255,255,0.15)" }} />

        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Bug size={18} style={{ color: "#FF9F0A" }} />
            <h2 className="text-lg font-semibold text-white">Report a Bug</h2>
          </div>
          <button onClick={onClose} className="p-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            <X size={20} />
          </button>
        </div>

        {submitted ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "rgba(48,209,88,0.15)" }}>
              <Check size={24} style={{ color: "#30D158" }} />
            </div>
            <p className="text-white font-semibold">Report submitted!</p>
            <p className="text-sm text-center" style={{ color: "rgba(255,255,255,0.4)" }}>
              Thanks — we&apos;ll look into it.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {/* Title */}
            <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value.slice(0, 120))}
                placeholder="What went wrong? (required)"
                maxLength={120}
                className="w-full px-4 py-3.5 text-white text-sm bg-transparent outline-none placeholder:text-white/20"
              />
            </div>

            {/* Description */}
            <div className="rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value.slice(0, 2000))}
                placeholder="Any extra details? (optional)"
                rows={3}
                className="w-full px-4 py-3.5 text-white text-sm bg-transparent outline-none placeholder:text-white/20 resize-none"
              />
            </div>

            {/* Screenshot */}
            {screenshotPreview ? (
              <div className="relative rounded-2xl overflow-hidden" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={screenshotPreview} alt="Screenshot preview" className="w-full max-h-40 object-cover" />
                <button
                  type="button"
                  onClick={removeScreenshot}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(0,0,0,0.6)" }}
                >
                  <X size={14} className="text-white" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-sm"
                style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}`, color: "rgba(255,255,255,0.45)", borderStyle: "dashed" }}
              >
                <Image size={16} />
                Attach a screenshot (optional)
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />

            {error && <p className="text-xs px-1" style={{ color: "#FF453A" }}>{error}</p>}

            <button
              type="submit"
              disabled={submitting || !title.trim()}
              className="w-full py-4 rounded-2xl text-sm font-semibold transition-opacity"
              style={{
                background: "rgba(255,159,10,0.15)",
                border: "0.5px solid rgba(255,159,10,0.3)",
                color: "#FF9F0A",
                opacity: submitting || !title.trim() ? 0.5 : 1,
              }}
            >
              {submitting ? "Submitting…" : "Submit Report"}
            </button>
          </form>
        )}
      </div>
    </>
  );
}
