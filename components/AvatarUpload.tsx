"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { Camera, AlertCircle } from "lucide-react";

const GOLD = "#C9A84C";

interface Props {
  userId: string;
  currentAvatarUrl: string | null;
  displayName: string;
}

export function AvatarUpload({ userId, currentAvatarUrl, displayName }: Props) {
  const [avatarUrl, setAvatarUrl] = useState(currentAvatarUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const initials = displayName
    ? displayName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("Not signed in"); return; }

      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${userId}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) { setError(`Upload failed: ${uploadError.message}`); return; }

      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      const urlWithBust = `${publicUrl}?t=${Date.now()}`;

      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ avatar_url: publicUrl }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(`Save failed: ${body.error ?? res.status}`);
        return;
      }

      setAvatarUrl(urlWithBust);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="w-20 h-20 rounded-full object-cover"
          />
        ) : (
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold"
            style={{ background: "rgba(201,168,76,0.18)", color: GOLD }}
          >
            {initials}
          </div>
        )}

        {/* Camera badge */}
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="absolute bottom-0 right-0 w-7 h-7 rounded-full flex items-center justify-center"
          style={{
            background: uploading ? "rgba(0,0,0,0.5)" : "#30D158",
            border: "2px solid #000",
          }}
          aria-label="Change photo"
        >
          {uploading
            ? <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            : <Camera size={13} strokeWidth={2} className="text-black" />
          }
        </button>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-xl text-xs" style={{ background: "rgba(255,69,58,0.12)", color: "#FF453A" }}>
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
