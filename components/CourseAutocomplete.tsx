"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/browser";
import type { CourseDetails, PlaceSuggestion } from "@/lib/google-places";

const GOLD = "#C9A84C";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "rgba(80,200,110,0.16)";
const DIVIDER = "rgba(80,200,110,0.10)";

type Props = {
  value: string;
  onChange: (name: string, placeId: string | null, details: CourseDetails | null) => void;
  autoFocus?: boolean;
};

export function CourseAutocomplete({ value, onChange, autoFocus }: Props) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tokenRef = useRef<string | null>(null);

  // Cache token so we don't refetch on every keystroke
  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => {
      tokenRef.current = data.session?.access_token ?? null;
    });
  }, []);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) { setSuggestions([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/places/autocomplete?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${tokenRef.current ?? ""}` },
      });
      const data = await res.json() as PlaceSuggestion[];
      setSuggestions(data);
      setOpen(data.length > 0);
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    onChange(v, null, null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(v), 300);
  }

  async function handleSelect(suggestion: PlaceSuggestion) {
    setOpen(false);
    setSuggestions([]);
    onChange(suggestion.name, suggestion.placeId, null);

    // Fetch full details in background
    try {
      const res = await fetch(`/api/places/details?place_id=${suggestion.placeId}`, {
        headers: { Authorization: `Bearer ${tokenRef.current ?? ""}` },
      });
      if (res.ok) {
        const details = await res.json() as CourseDetails;
        onChange(suggestion.name, suggestion.placeId, details);
      }
    } catch { /* details are optional */ }
  }

  // Close on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const fieldStyle = "w-full px-4 py-3.5 text-white text-sm bg-transparent outline-none placeholder:text-white/20";

  return (
    <div ref={containerRef} className="relative">
      <div className="rounded-2xl overflow-visible" style={{ background: CARD_BG, border: `0.5px solid ${CARD_BORDER}` }}>
        <input
          type="text"
          value={value}
          onChange={handleInput}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder="Pine Valley Golf Club"
          required
          autoFocus={autoFocus}
          autoComplete="off"
          className={fieldStyle}
        />
      </div>

      {open && (
        <div
          className="absolute left-0 right-0 z-50 rounded-2xl overflow-hidden mt-1.5"
          style={{ background: "rgba(18,18,20,0.97)", border: `0.5px solid ${CARD_BORDER}`, backdropFilter: "blur(20px)" }}
        >
          {loading && (
            <div className="px-4 py-3 text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>Searching…</div>
          )}
          {suggestions.map((s, i) => (
            <button
              key={s.placeId}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(s); }}
              className="w-full text-left px-4 py-3 transition-colors"
              style={{
                borderBottom: i < suggestions.length - 1 ? `0.5px solid ${DIVIDER}` : "none",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <p className="text-sm font-medium text-white">{s.name}</p>
              <p className="text-xs mt-0.5" style={{ color: GOLD }}>{s.address}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
