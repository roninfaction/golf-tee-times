"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Detects the "stale chunk after a new deploy" case: the browser has an old
// page open and tries to fetch a JS chunk whose hash no longer exists on the
// CDN. Next surfaces this as a ChunkLoadError / dynamic-import failure.
function isChunkLoadError(error: Error): boolean {
  const name = error?.name ?? "";
  const msg = error?.message ?? "";
  return (
    name === "ChunkLoadError" ||
    /Loading chunk [\d]+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  );
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // For a stale-chunk error, a fresh load pulls the new chunks and fixes it.
    // Guard with sessionStorage so we never loop-reload if the reload also fails.
    if (isChunkLoadError(error)) {
      const KEY = "gp_chunk_reload_ts";
      const last = Number(sessionStorage.getItem(KEY) ?? "0");
      if (Date.now() - last > 10_000) {
        sessionStorage.setItem(KEY, String(Date.now()));
        window.location.reload();
        return;
      }
    }
    // Otherwise report it so we can see real errors in Sentry.
    Sentry.captureException(error);
  }, [error]);

  const chunk = isChunkLoadError(error);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        textAlign: "center",
        background: "#071510",
        color: "#fff",
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      <div style={{ fontSize: 44, marginBottom: 16 }}>⛳</div>
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>
        {chunk ? "Updating GolfPack…" : "Something went wrong"}
      </h1>
      <p
        style={{
          fontSize: 14,
          lineHeight: 1.5,
          color: "rgba(255,255,255,0.5)",
          maxWidth: 320,
          margin: "0 0 28px",
        }}
      >
        {chunk
          ? "A new version is available. Reloading to get the latest…"
          : "That page hit a snag. You can try again or reload the app."}
      </p>
      <div style={{ display: "flex", gap: 12 }}>
        <button
          onClick={() => reset()}
          style={{
            padding: "12px 22px",
            borderRadius: 14,
            fontSize: 15,
            fontWeight: 600,
            color: "#000",
            background: "#30D158",
            border: "none",
          }}
        >
          Try again
        </button>
        <button
          onClick={() => window.location.assign("/upcoming")}
          style={{
            padding: "12px 22px",
            borderRadius: 14,
            fontSize: 15,
            fontWeight: 600,
            color: "#fff",
            background: "rgba(255,255,255,0.08)",
            border: "0.5px solid rgba(255,255,255,0.12)",
          }}
        >
          Reload app
        </button>
      </div>
    </div>
  );
}
