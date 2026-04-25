"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Camera, AlertCircle, X } from "lucide-react";

interface Props {
  groupId: string;
  currentPhotoUrl: string | null;
}

export function GroupPhotoUpload({ groupId, currentPhotoUrl }: Props) {
  const [photoUrl, setPhotoUrl] = useState(currentPhotoUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError("Not signed in");
        return;
      }

      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${groupId}/cover.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("group-photos")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) {
        setError(`Upload failed: ${uploadError.message}`);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from("group-photos")
        .getPublicUrl(path);

      const res = await fetch("/api/groups", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ photo_url: publicUrl }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(`Save failed: ${body.error ?? res.status}`);
        return;
      }

      setPhotoUrl(`${publicUrl}?t=${Date.now()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <div>
        <div className="relative w-full" style={{ height: 260 }}>
          {photoUrl ? (
            <img
              src={photoUrl}
              alt="Group photo"
              className="w-full h-full object-cover cursor-pointer"
              style={{ borderRadius: "0 0 20px 20px" }}
              onClick={() => setLightboxOpen(true)}
            />
          ) : (
            <div
              className="w-full h-full flex flex-col items-center justify-center gap-2"
              style={{
                background: "linear-gradient(135deg, rgba(201,168,76,0.18) 0%, rgba(48,209,88,0.12) 100%)",
                borderRadius: "0 0 20px 20px",
                border: "0.5px solid rgba(80,200,110,0.18)",
                borderTop: "none",
              }}
            >
              <span className="text-4xl">⛳</span>
              <p className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>Tap to add a group photo</p>
            </div>
          )}

          {/* Gradient overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 50%)",
              borderRadius: "0 0 20px 20px",
            }}
          />

          {/* Upload button */}
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{
              background: "rgba(0,0,0,0.60)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              color: "#fff",
              border: "0.5px solid rgba(255,255,255,0.2)",
            }}
          >
            {uploading ? (
              <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Camera size={13} strokeWidth={2} />
            )}
            {uploading ? "Uploading…" : "Change photo"}
          </button>

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="mx-4 mt-2 flex items-start gap-2 px-3 py-2 rounded-xl text-xs" style={{ background: "rgba(255,69,58,0.12)", color: "#FF453A" }}>
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxOpen && photoUrl && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: "rgba(0,0,0,0.92)" }}
          onClick={() => setLightboxOpen(false)}
        >
          <button
            className="absolute top-5 right-5 w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.12)", border: "0.5px solid rgba(255,255,255,0.18)" }}
            onClick={() => setLightboxOpen(false)}
            aria-label="Close"
          >
            <X size={18} className="text-white" />
          </button>
          <img
            src={photoUrl}
            alt="Group photo"
            className="max-w-full max-h-full object-contain"
            style={{ borderRadius: 12 }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
