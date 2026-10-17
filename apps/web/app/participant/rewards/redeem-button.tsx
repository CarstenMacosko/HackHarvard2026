"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function RedeemButton({ label }: { label: string | null }) {
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (code) return <div className="rounded-lg bg-white/15 p-3 text-sm">🎁 Your code: <code className="font-mono font-semibold">{code}</code> (simulated)</div>;
  if (!label) return <div className="text-sm text-brand-100">Keep going! Rewards unlock at 300 pts.</div>;
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
        className="w-full rounded-lg bg-white py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-60"
      >
        {label}
      </button>
      {error && <p className="mt-2 text-sm text-rose-100">{error}</p>}
    </>
  );
}
