"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Card } from "@/components/ui";
import { enroll, lookupInvite, type LookupResult } from "./actions";

type Step = "code" | "consent" | "contact" | "done";

export function JoinFlow({ initialCode, photonNumber }: { initialCode: string; photonNumber: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("code");
  const [code, setCode] = useState(initialCode);
  const [invite, setInvite] = useState<Extract<LookupResult, { ok: true }> | null>(null);
  const [consent, setConsent] = useState(false);
  const [phone, setPhone] = useState("");
  const [time, setTime] = useState("18:00");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const steps: Step[] = ["code", "consent", "contact", "done"];
  const input = "w-full rounded-lg border border-slate-300 px-3 py-2.5";
  const primary = "w-full rounded-lg bg-brand-600 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-50";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Join your study</h1>
        <div className="mt-3 flex gap-1.5">
          {steps.map((s, i) => <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= steps.indexOf(step) ? "bg-brand-500" : "bg-slate-200"}`} />)}
        </div>
      </div>

      {step === "code" && (
        <Card className="space-y-3">
          <label className="block text-sm font-medium" htmlFor="code">Invite code from your study team</label>
          <input id="code" className={`${input} font-mono uppercase`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="PD-006J" />
          <p className="text-xs text-slate-400">Demo codes: PD-006J (Parkinson&apos;s) · AD-106J (eczema)</p>
          <button
            className={primary}
            disabled={pending || !code}
            onClick={() =>
              start(async () => {
                const r = await lookupInvite(code);
                if (!r.ok) return setError(r.error);
                setError(null);
                setInvite(r);
                setStep("consent");
              })
            }
          >
            Continue
          </button>
        </Card>
      )}

      {step === "consent" && invite && (
        <Card className="space-y-3 text-sm">
          <div className="font-semibold">{invite.studyName}</div>
          <p className="text-slate-600">You&apos;ll get a text when each check-in is due: <b>{invite.taskLabel.toLowerCase()}</b>. It takes about a minute.</p>
          <ul className="list-disc space-y-1 pl-5 text-slate-600">
            <li>Your photos/videos are analyzed by software and reviewed by the study clinicians.</li>
            <li>Only your study team can see your submissions. You can stop at any time by texting STOP.</li>
            <li>You earn points for every usable check-in, redeemable for study thank-you rewards.</li>
            <li>This does not replace visits or tests required by your study protocol.</li>
          </ul>
          <label className="flex items-start gap-2 rounded-lg bg-slate-50 p-3">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
            <span>I have read the study information sheet and agree to take part in remote follow-up.</span>
          </label>
          <button className={primary} disabled={!consent} onClick={() => setStep("contact")}>I agree</button>
        </Card>
      )}

      {step === "contact" && (
        <Card className="space-y-3">
          <label className="block text-sm font-medium" htmlFor="phone">Mobile number (we&apos;ll text you here)</label>
          <input id="phone" className={input} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 617 555 0123" />
          <label className="block text-sm font-medium" htmlFor="time">Best time for reminders</label>
          <input id="time" className={input} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          <button
            className={primary}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await enroll({ code, phone, preferredTime: time, consent });
                if (!r.ok) return setError(r.error ?? "Something went wrong");
                setError(null);
                setStep("done");
              })
            }
          >
            Finish
          </button>
        </Card>
      )}

      {step === "done" && (
        <Card className="space-y-3 text-center">
          <div className="text-4xl">🎉</div>
          <div className="text-lg font-semibold">You&apos;re in!</div>
          <p className="text-sm text-slate-600">
            Save our number: <b>{photonNumber}</b>. Text <b>HI</b> to say hello. Your first check-in earns a +25 pt welcome badge.
          </p>
          <button className={primary} onClick={() => { router.push("/participant"); router.refresh(); }}>Go to my dashboard</button>
        </Card>
      )}

      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}
