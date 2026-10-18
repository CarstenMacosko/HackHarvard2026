"use client";

import { useState, useTransition } from "react";
import { Button, cardClass, cn, Field, Input } from "@/components/ui";
import { signInAction, signUpAction } from "./actions";

const form = cn(cardClass, "space-y-5 p-6 sm:p-8");

export function SignInForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className={form}
      action={(fd) => {
        start(async () => {
          const r = await signInAction(fd);
          if (r?.error) setError(r.error);
        });
      }}
    >
      <Field label="Email">
        <Input className="h-10" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password">
        <Input className="h-10" name="password" type="password" autoComplete="current-password" required />
      </Field>
      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
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
      className={form}
      action={(fd) => {
        start(async () => {
          const r = await signUpAction(fd);
          if (r?.error) setError(r.error);
        });
      }}
    >
      <fieldset>
        <legend className="text-sm font-medium text-slate-800 dark:text-slate-200">I am a</legend>
        <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-800">
          {(
            [
              ["researcher", "Researcher"],
              ["participant", "Participant"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer items-center justify-center rounded px-3 py-1.5 text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand-500",
                role === value ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200",
              )}
            >
              <input type="radio" name="role" value={value} className="sr-only" checked={role === value} onChange={() => setRole(value)} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Full name">
        <Input className="h-10" name="display_name" required autoComplete="name" />
      </Field>
      <Field label="Email">
        <Input className="h-10" name="email" type="email" required autoComplete="email" />
      </Field>
      <Field label="Password">
        <Input className="h-10" name="password" type="password" required minLength={6} autoComplete="new-password" />
      </Field>
      {role === "participant" && (
        <Field label="Study invite code">
          <Input className="h-10 font-mono uppercase" name="invite_code" defaultValue={defaultCode} required placeholder="e.g. PD-006J" />
        </Field>
      )}
      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Creating…" : "Create account"}
      </Button>
    </form>
  );
}
