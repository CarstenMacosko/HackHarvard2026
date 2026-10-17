"use client";

import { Gift } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function RedeemButton({ label, unlockAt }: { label: string | null; unlockAt: number }) {
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (code) {
    return (
      <div className="rounded-md bg-white/15 px-3 py-2 text-sm">
        Your code: <code className="font-mono font-semibold">{code}</code> <span className="text-brand-100">(simulated)</span>
      </div>
    );
  }
  if (!label) return <div className="text-sm text-brand-100">Rewards unlock at {unlockAt} points.</div>;
  return (
    <>
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await fetch("/api/rewards/redeem", { method: "POST" });
            const body = await res.json();
            if (!res.ok) return setError(body.error);
            setCode(body.mock_code);
            router.refresh();
          })
        }
        className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-white text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-60"
      >
        <Gift className="h-4 w-4" /> {label}
      </button>
      {error && <p className="mt-2 text-sm text-rose-100">{error}</p>}
    </>
  );
}
