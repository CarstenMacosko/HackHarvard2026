"use client";

import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Card, CardBody, cn } from "@/components/ui";
import { enroll, lookupInvite, type LookupResult } from "./actions";

const STEPS = ["Invite code", "Consent", "Contact", "Done"] as const;

export function JoinFlow({ initialCode, photonNumber }: { initialCode: string; photonNumber: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [code, setCode] = useState(initialCode);
  const [invite, setInvite] = useState<Extract<LookupResult, { ok: true }> | null>(null);
  const [consent, setConsent] = useState(false);
  const [phone, setPhone] = useState("");
  const [time, setTime] = useState("18:00");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = "h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm";

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <Card className="max-w-2xl">
        <div className="flex border-b border-slate-100">
          {STEPS.map((s, i) => (
            <div key={s} className={cn("flex-1 border-b-2 px-3 py-2.5 text-center text-xs font-medium", i <= step ? "border-brand-600 text-brand-700" : "border-transparent text-slate-400")}>
              {i + 1}. {s}
            </div>
          ))}
        </div>
        <CardBody className="space-y-4 py-6">
          {step === 0 && (
            <>
              <label className="block text-sm font-medium text-slate-900" htmlFor="code">
                Invite code from your study team
              </label>
              <input id="code" className={cn(input, "font-mono uppercase")} value={code} onChange={(e) => setCode(e.target.value)} placeholder="PD-006J" />
              <p className="text-xs text-slate-500">Demo codes: PD-006J (Parkinson&apos;s) · AD-106J (eczema)</p>
              <Button
                disabled={pending || !code}
                onClick={() =>
                  start(async () => {
                    const r = await lookupInvite(code);
                    if (!r.ok) return setError(r.error);
                    setError(null);
                    setInvite(r);
                    setStep(1);
                  })
                }
              >
                Continue
              </Button>
            </>
          )}
          {step === 1 && invite && (
            <div className="space-y-4 text-sm">
              <div>
                <div className="font-semibold text-slate-900">{invite.studyName}</div>
                <p className="mt-1 text-slate-600">
                  When each check-in is due, you&apos;ll get a text asking for a short {invite.mediaType}: <b>{invite.taskLabel.toLowerCase()}</b>. You can reply by text or upload it here. It takes about a minute.
                </p>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-slate-600">
                <li>Your phone checks each capture for quality before sending it, and the software measures it.</li>
                <li>Every result is reviewed by your study clinicians before it enters the study record.</li>
                <li>Only your study team can see your submissions. You can stop at any time by texting STOP.</li>
                <li>You earn points for usable check-ins (simulated rewards in this prototype).</li>
                <li>This complements, and does not replace, the visits and tests in your study protocol.</li>
              </ul>
              <label className="flex items-start gap-2.5 rounded-md bg-slate-50 p-3">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4" />
                <span>I have read the study information sheet and agree to take part in remote follow-up.</span>
              </label>
              <Button disabled={!consent} onClick={() => setStep(2)}>
                I agree
              </Button>
            </div>
          )}
          {step === 2 && (
            <>
              <label className="block text-sm font-medium text-slate-900" htmlFor="phone">
                Mobile number (we&apos;ll text you here)
              </label>
              <input id="phone" className={input} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 617 555 0123" />
              <label className="block text-sm font-medium text-slate-900" htmlFor="time">
                Best time for reminders
              </label>
              <input id="time" className={cn(input, "w-40")} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              <div>
                <Button
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await enroll({ code, phone, preferredTime: time, consent });
                      if (!r.ok) return setError(r.error ?? "Something went wrong");
                      setError(null);
                      setStep(3);
                    })
                  }
                >
                  Finish
                </Button>
              </div>
            </>
          )}
          {step === 3 && (
            <div className="flex flex-col items-center py-4 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" strokeWidth={1.5} />
              <div className="mt-2 text-lg font-semibold text-slate-900">You&apos;re in</div>
              <p className="mt-1 max-w-sm text-sm text-slate-600">
                Save our number, <b>{photonNumber}</b>, and text <b>HI</b> to say hello. Your first usable check-in earns a welcome badge.
              </p>
              <Button
                className="mt-4"
                onClick={() => {
                  router.push("/participant");
                  router.refresh();
                }}
              >
                Go to my dashboard
              </Button>
            </div>
          )}
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </CardBody>
      </Card>
      <Card className="h-fit">
        <CardBody className="space-y-2 text-sm text-slate-600">
          <div className="font-medium text-slate-900">Trying it out?</div>
          <p>Use an invite code above, or use one of the open test accounts (no history, everything you send is real data):</p>
          <div className="flex flex-col gap-1">
            <a className="text-brand-700 hover:underline" href="/participant/view-as?id=p_001">
              Participant 001 · Parkinson&apos;s finger tapping (video)
            </a>
            <a className="text-brand-700 hover:underline" href="/participant/view-as?id=p_201">
              Participant 201 · rest tremor (video)
            </a>
            <a className="text-brand-700 hover:underline" href="/participant/view-as?id=p_101">
              Participant 101 · eczema (photo)
            </a>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
