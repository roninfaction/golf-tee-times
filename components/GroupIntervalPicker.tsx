"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";

const INTERVALS = [8, 10, 12, 15];

interface Props {
  groupId: string;
  defaultInterval: number;
}

export function GroupIntervalPicker({ groupId, defaultInterval }: Props) {
  const [selected, setSelected] = useState(defaultInterval ?? 10);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch(`/api/groups/${groupId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ default_tee_interval: selected }),
      });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="text-xs font-medium mb-2" style={{ color: "rgba(255,255,255,0.45)" }}>
        Default tee interval (minutes)
      </p>
      <div className="flex gap-2">
        {INTERVALS.map(n => (
          <button
            key={n}
            type="button"
            onClick={() => { setSelected(n); setSaved(false); }}
            className="flex-1 text-center py-2 rounded-xl text-sm font-semibold"
            style={{
              background: selected === n ? "#30D158" : "rgba(255,255,255,0.07)",
              color: selected === n ? "#000" : "rgba(255,255,255,0.5)",
            }}
          >
            {n}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg"
        style={{ background: "#30D158", color: "#000", opacity: saving ? 0.7 : 1 }}
      >
        {saving ? "Saving…" : saved ? "Saved!" : "Save"}
      </button>
    </div>
  );
}
