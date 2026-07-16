import type { Area } from "react-easy-crop";

/**
 * Render a react-easy-crop selection to a JPEG blob.
 *
 * Keeps the crop's aspect ratio (so it works for both the square avatar and the
 * wide group banner) and scales down so the width is at most maxWidth.
 *
 * Re-encoding through the canvas also normalises whatever the picker handed us —
 * notably iPhone HEIC — to JPEG, which is why callers can always store `.jpg`.
 */
export async function getCroppedBlob(
  imageSrc: string,
  pixelCrop: Area,
  maxWidth: number,
): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = imageSrc;
  });

  const scale = Math.min(1, maxWidth / pixelCrop.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(pixelCrop.width * scale);
  canvas.height = Math.round(pixelCrop.height * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(
    img,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, canvas.width, canvas.height,
  );

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      b => b ? resolve(b) : reject(new Error("Canvas toBlob failed")),
      "image/jpeg",
      0.92,
    )
  );
}
