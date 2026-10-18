"use client";

import { useEffect, useState, useTransition } from "react";
import { Button, SectionLabel } from "./ui";

interface Note {
  id: string;
  author: string;
  body: string;
  created_at: string;
}

export function ObservationNotes({ observationId }: { observationId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/notes?observation_id=${encodeURIComponent(observationId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setNotes(d.notes ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [observationId]);

  return (
    <div>
      <SectionLabel>Clinician notes</SectionLabel>
      <ul className="mb-3 space-y-2">
        {notes.length === 0 && <li className="text-xs text-slate-500">No notes yet — record observations about the video or measurements.</li>}
        {notes.map((n) => (
          <li key={n.id} className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <div className="text-xs text-slate-500">
              {n.author} · {new Date(n.created_at).toLocaleString()}
            </div>
            <p className="mt-1 whitespace-pre-wrap">{n.body}</p>
          </li>
        ))}
      </ul>
      <textarea
        className="min-h-[80px] w-full rounded-md border border-slate-300 p-2 text-sm"
        placeholder="Write a note about this capture…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
      <Button
        className="mt-2"
        size="sm"
        disabled={pending || !body.trim()}
        onClick={() => {
          start(async () => {
            setError(null);
            const res = await fetch("/api/notes", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ observation_id: observationId, body }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              setError(data.error ?? "Could not save note");
              return;
            }
            setNotes((xs) => [...xs, data.note]);
            setBody("");
          });
        }}
      >
        {pending ? "Saving…" : "Add note"}
      </Button>
    </div>
  );
}
