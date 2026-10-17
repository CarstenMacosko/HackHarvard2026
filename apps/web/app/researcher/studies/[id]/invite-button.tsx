"use client";

import { useState, useTransition } from "react";
import { createInvite } from "./actions";

export function InviteButton({ studyId }: { studyId: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-3">
      {code && (
        <span className="text-sm text-slate-600">
          Invite code <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">{code}</code>
        </span>
      )}
      <button
        disabled={pending}
        onClick={() => start(async () => setCode(await createInvite(studyId)))}
        className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
      >
        + Invite participant
      </button>
    </div>
  );
}
