"use client";

import type { ValidationStatus } from "@vf/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";

export function ModelActions({ id, active, status, n }: { id: string; active: boolean; status: ValidationStatus; n: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const patch = (body: object) =>
    start(async () => {
      setError(null);
      const res = await fetch(`/api/models/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) setError((await res.json()).error ?? "Update failed");
      router.refresh();
    });
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex justify-end gap-1.5">
        {active && status !== "validated" && (
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            title={n < 30 ? "Needs at least 30 labelled examples" : "Record that this model is validated for this study"}
            onClick={() => {
              if (confirm("Mark this model as validated for its study? This is recorded in the audit log.")) patch({ status: "validated" });
            }}
          >
            Mark validated
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => patch({ active: !active })}>
          {active ? "Deactivate" : "Activate"}
        </Button>
      </div>
      {error && <span className="max-w-56 text-right text-xs text-rose-600">{error}</span>}
    </div>
  );
}
