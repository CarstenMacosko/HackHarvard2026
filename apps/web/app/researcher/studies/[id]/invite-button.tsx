"use client";

import { Copy, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { createInvite } from "./actions";

export function InviteButton({ studyId }: { studyId: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      {code && (
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(code);
            setCopied(true);
          }}
          className="flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 hover:bg-slate-200"
          title="Copy the invite code"
        >
          <code className="font-mono font-semibold">{code}</code>
          <Copy className="h-3 w-3" />
          {copied ? "copied" : "copy code"}
        </button>
      )}
      <Button size="sm" disabled={pending} onClick={() => start(async () => { setCopied(false); setCode(await createInvite(studyId)); })}>
        <UserPlus className="h-3.5 w-3.5" /> Invite participant
      </Button>
    </div>
  );
}
