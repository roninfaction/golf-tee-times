"use client";

import { useCallback, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { createClient } from "@/lib/supabase/browser";
import { getCroppedBlob } from "@/lib/crop-image";
import { Camera, AlertCircle, Check, X } from "lucide-react";

const GOLD = "#C9A84C";
const AVATAR_MAX_WIDTH = 600;

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

  // Crop modal state
  const [rawSrc, setRawSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const initials = displayName
    ? displayName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setRawSrc(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  function cancelCrop() {
    if (rawSrc) URL.revokeObjectURL(rawSrc);
    setRawSrc(null);
  }

  async function confirmCrop() {
    if (!rawSrc || !croppedAreaPixels) return;
    setUploading(true);
    setError(null);
    try {
      const blob = await getCroppedBlob(rawSrc, croppedAreaPixels, AVATAR_MAX_WIDTH);
      URL.revokeObjectURL(rawSrc);
      setRawSrc(null);

      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError("Not signed in"); return; }

      const path = `${userId}/avatar.jpg`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: "image/jpeg", cacheControl: "31536000" });

      if (uploadError) { setError(`Upload failed: ${uploadError.message}`); return; }

      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);

      // The storage path is fixed, so a new avatar changes the bytes but not the URL —
      // browsers keep serving their cached copy of the old image, and the upload looks like
      // it reverted as soon as you navigate away. Persist a *versioned* URL so every
      // consumer (this page, group lists, tee-time rosters) requests a URL it has never
      // cached. Versioning the URL is also what makes the year-long cacheControl above safe.
      const versionedUrl = `${publicUrl}?v=${Date.now()}`;

      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ avatar_url: versionedUrl }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(`Save failed: ${body.error ?? res.status}`);
        return;
      }

      setAvatarUrl(versionedUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
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

      {/* Crop modal */}
      {rawSrc && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#000" }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-12 pb-4 shrink-0">
            <button onClick={cancelCrop} className="flex items-center gap-1.5 text-sm font-medium" style={{ color: "rgba(255,255,255,0.6)" }}>
              <X size={16} />
              Cancel
            </button>
            <p className="text-sm font-semibold text-white">Move and Scale</p>
            <button
              onClick={confirmCrop}
              disabled={uploading}
              className="flex items-center gap-1.5 text-sm font-semibold"
              style={{ color: "#30D158" }}
            >
              {uploading
                ? <div className="w-4 h-4 border-2 border-green-500/30 border-t-green-500 rounded-full animate-spin" />
                : <><Check size={16} />Use Photo</>
              }
            </button>
          </div>

          {/* Cropper */}
          <div className="relative flex-1">
            <Cropper
              image={rawSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              style={{
                containerStyle: { background: "#000" },
                cropAreaStyle: { border: "2px solid rgba(255,255,255,0.8)", boxShadow: "0 0 0 9999px rgba(0,0,0,0.7)" },
              }}
            />
          </div>

          {/* Zoom slider */}
          <div className="px-8 py-6 shrink-0">
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              className="w-full accent-green-400"
              aria-label="Zoom"
            />
          </div>
        </div>
      )}
    </>
  );
}
