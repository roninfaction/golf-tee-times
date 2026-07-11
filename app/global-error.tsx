"use client";

// global-error replaces the root layout, so it must render its own <html>/<body>.
// This is the last line of defense: it catches errors thrown in the root layout
// itself, which the segment-level error.tsx cannot handle.
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
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
          Something went wrong
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
          GolfPack hit an unexpected error. Reloading usually fixes it.
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
      </body>
    </html>
  );
}
