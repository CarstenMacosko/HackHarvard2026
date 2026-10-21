"use client";

import { useState, useTransition } from "react";
import { Button, cn } from "@/components/ui";
import { signInAction, signUpAction } from "./actions";

const input = "mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm";

export function SignInForm({ defaultRole }: { defaultRole: "researcher" | "participant" }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      action={(fd) => {
        start(async () => {
          const r = await signInAction(fd);
          if (r?.error) setError(r.error);
        });
      }}
    >
      <RoleHint role={defaultRole} />
      <label className="block text-sm font-medium text-slate-900">
        Email
        <input className={input} name="email" type="email" autoComplete="email" required />
      </label>
      <label className="block text-sm font-medium text-slate-900">
        Password
        <input className={input} name="password" type="password" autoComplete="current-password" required />
      </label>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

export function SignUpForm({
  defaultRole,
  defaultCode,
}: {
  defaultRole: "researcher" | "participant";
  defaultCode?: string;
}) {
  const [role, setRole] = useState<"researcher" | "participant">(defaultRole);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      action={(fd) => {
        start(async () => {
          const r = await signUpAction(fd);
          if (r?.error) setError(r.error);
        });
      }}
    >
      <fieldset>
        <legend className="text-sm font-medium text-slate-900">I am a</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(
            [
              ["researcher", "Researcher"],
              ["participant", "Participant"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-sm font-medium",
                role === value ? "border-brand-500 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-600",
              )}
            >
              <input type="radio" name="role" value={value} className="sr-only" checked={role === value} onChange={() => setRole(value)} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block text-sm font-medium text-slate-900">
        Full name
        <input className={input} name="display_name" required autoComplete="name" />
      </label>
      <label className="block text-sm font-medium text-slate-900">
        Email
        <input className={input} name="email" type="email" required autoComplete="email" />
      </label>
      <label className="block text-sm font-medium text-slate-900">
        Password
        <input className={input} name="password" type="password" required minLength={6} autoComplete="new-password" />
      </label>
      {role === "participant" && (
        <label className="block text-sm font-medium text-slate-900">
          Study invite code
          <input className={input} name="invite_code" defaultValue={defaultCode} required placeholder="e.g. PD-006J" />
        </label>
      )}
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating…" : "Create account"}
      </Button>
    </form>
  );
}

function RoleHint({ role }: { role: string }) {
  return (
    <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
      {role === "researcher" ? "Signing in as a study team member." : "Signing in as a participant."}
    </p>
  );
}
