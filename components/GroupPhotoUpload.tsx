"use client";

import { useCallback, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { createClient } from "@/lib/supabase/browser";
import { getCroppedBlob } from "@/lib/crop-image";
import { Camera, AlertCircle, Check, X } from "lucide-react";

interface Props {
  groupId: string;
  currentPhotoUrl: string | null;
}

// The banner renders at this aspect on every phone (see the container below), so cropping
// to it means what you frame is exactly what you get. 1600 wide covers a 3x retina phone.
const COVER_ASPECT = 3 / 2;
const COVER_MAX_WIDTH = 1600;

export function GroupPhotoUpload({ groupId, currentPhotoUrl }: Props) {
  const [photoUrl, setPhotoUrl] = useState(currentPhotoUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Crop modal state
  const [rawSrc, setRawSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

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
      const blob = await getCroppedBlob(rawSrc, croppedAreaPixels, COVER_MAX_WIDTH);
      URL.revokeObjectURL(rawSrc);
      setRawSrc(null);

      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError("Not signed in");
        return;
      }

      // Always .jpg: the cropper re-encodes to JPEG, and a fixed name means each upload
      // upserts the same object instead of leaving an orphan behind per file extension.
      const path = `${groupId}/cover.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("group-photos")
        .upload(path, blob, { upsert: true, contentType: "image/jpeg", cacheControl: "31536000" });

      if (uploadError) {
        setError(`Upload failed: ${uploadError.message}`);
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from("group-photos")
        .getPublicUrl(path);

      // Fixed storage path, so version the stored URL or browsers keep serving the cached
      // previous cover. Same reasoning as AvatarUpload.
      const versionedUrl = `${publicUrl}?v=${Date.now()}`;

      // PATCH lives at /api/groups/[id] — /api/groups only exposes GET and POST, so posting
      // the group id in the body silently 405'd and the cover never saved.
      const res = await fetch(`/api/groups/${groupId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ photo_url: versionedUrl }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(`Save failed: ${body.error ?? res.status}`);
        return;
      }

      setPhotoUrl(versionedUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <div>
        {/*
          aspectRatio matches COVER_ASPECT so the saved crop displays exactly as framed on
          any phone. maxHeight only binds above ~480px wide (desktop), where a 3:2 banner
          would otherwise be absurdly tall — the page has no max-width wrapper.
        */}
        <div className="relative w-full" style={{ aspectRatio: "3 / 2", maxHeight: 320 }}>
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
              aspect={COVER_ASPECT}
              showGrid
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
