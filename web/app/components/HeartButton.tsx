"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function HeartButton({ projectId, saved }: { projectId: string; saved: boolean }) {
  const [on, setOn] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestInFlight = useRef(false);
  const router = useRouter();

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/watchlist", {
        method: on ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (!res.ok) {
        setError("Could not update watchlist. Try again.");
        return;
      }
      setOn(!on);
      router.refresh();
    } catch {
      setError("Could not update watchlist. Try again.");
    } finally {
      requestInFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={toggle}
        aria-disabled={busy}
        aria-pressed={on}
        aria-label={on ? "Remove from watchlist" : "Save to watchlist"}
        className="rounded-full bg-white/90 p-2 shadow-sm ring-1 ring-black/5 transition hover:scale-105 aria-disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill={on ? "#e11d48" : "none"} stroke={on ? "#e11d48" : "#334155"} strokeWidth="2">
          <path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.4 3.4 5 6.9 5c2 0 3.5 1.1 4.3 2.4h1.6C13.6 6.1 15.1 5 17.1 5c3.5 0 5.7 3.4 4.4 6.8C19.5 16.4 12 21 12 21z" />
        </svg>
      </button>
      {error && <span role="alert" className="max-w-40 text-center text-xs text-rose-700">{error}</span>}
    </span>
  );
}
