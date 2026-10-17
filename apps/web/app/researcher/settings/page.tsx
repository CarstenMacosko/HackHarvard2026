import { CircleCheck, CircleDashed, CircleX } from "lucide-react";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { backend } from "@/lib/backend";
import { cvHealth } from "@/lib/cv-service";

export const metadata = { title: "System status" };
export const dynamic = "force-dynamic";

type State = "ok" | "off" | "error";

function Row({ state, title, detail, hint }: { state: State; title: string; detail: React.ReactNode; hint?: React.ReactNode }) {
  const Icon = state === "ok" ? CircleCheck : state === "error" ? CircleX : CircleDashed;
  const color = state === "ok" ? "text-emerald-600" : state === "error" ? "text-rose-600" : "text-slate-400";
  return (
    <div className="flex gap-3 border-b border-slate-100 px-5 py-4 last:border-0">
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${color}`} strokeWidth={1.75} />
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-900">
          {title} <span className="ml-1 text-xs font-normal text-slate-500">{state === "ok" ? "connected" : state === "error" ? "error" : "not configured"}</span>
        </div>
        <div className="mt-0.5 text-sm text-slate-600">{detail}</div>
        {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
      </div>
    </div>
  );
}

export default async function SettingsPage() {
  const db = backend();
  const supabase = db.mode === "supabase";
  const [cv, health] = await Promise.all([cvHealth(), supabase ? db.health().catch((e: Error) => ({ ok: false, tables: [], bucket: { ok: false, detail: e.message } })) : null]);
  const env = (k: string) => Boolean(process.env[k]?.trim());
  return (
    <>
      <PageHeader title="System status" description="Which services this deployment is connected to. Everything degrades gracefully, so the app works end to end with none of them." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Services" />
          <Row
            state={!supabase ? "off" : health?.ok ? "ok" : "error"}
            title="Database & storage (Supabase)"
            detail={
              !supabase
                ? "No database: uploads are kept in this server\u2019s memory only, so they vanish on restart and aren\u2019t shared between server instances (e.g. on Vercel). Connect Supabase to keep them."
                : health?.ok
                  ? "Every capture, review, reward, model, builder draft, Droid job and agent conversation is stored in Postgres; media in the private media bucket."
                  : `Connected, but: ${[...(health?.tables.filter((t) => t.error).map((t) => `${t.name}: ${t.error}`) ?? []), health?.bucket.ok ? null : `bucket: ${health?.bucket.detail}`].filter(Boolean).join("; ")}`
            }
            hint={
              !supabase
                ? "Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY (docs/DEPLOY.md)."
                : !health?.ok && "Run supabase/setup.sql in the project's SQL editor (see docs/DATABASE.md)."
            }
          />
          <Row
            state={cv.ok ? "ok" : cv.configured ? "error" : "off"}
            title="CV service (reference modules)"
            detail={
              cv.ok
                ? `${cv.url} · ${cv.modules.map((m) => `${m.id}@${m.version}`).join(", ")}`
                : cv.configured
                  ? `${cv.url}: ${cv.error}`
                  : "Uploads are analysed on-device only. The browser runs the same modules (parity-tested against the Python service)."
            }
            hint={!cv.ok && "Deploy services/cv (modal deploy modal_app.py) and set CV_SERVICE_URL to re-run every upload on the server."}
          />
          <Row
            state={env("ANTHROPIC_API_KEY") ? "ok" : "off"}
            title="Workflow builder LLM (Claude)"
            detail={env("ANTHROPIC_API_KEY") ? "Drafts new condition workflows with Claude, constrained to catalog components." : "The builder uses its offline keyword template."}
          />
          <Row
            state={env("PHOTON_PHONE_NUMBER") ? "ok" : "off"}
            title="Messaging (Photon 2.0)"
            detail={env("PHOTON_PHONE_NUMBER") ? `Participants text ${process.env.PHOTON_PHONE_NUMBER}.` : "The messaging agent runs as its own service (services/agent); set PHOTON_PHONE_NUMBER here to show participants the number."}
          />
          <Row
            state={env("CV_CALLBACK_SECRET") ? "ok" : "off"}
            title="Agent callback secret"
            detail={env("CV_CALLBACK_SECRET") ? "/api/cv-callback requires the shared secret." : "/api/cv-callback accepts unauthenticated posts. Set CV_CALLBACK_SECRET before going live."}
          />
          {health && (
            <CardBody className="border-t border-slate-100">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Tables (rows)</div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                {health.tables.map((t) => (
                  <div key={t.name} className="flex justify-between gap-2">
                    <dt className={t.error ? "font-mono text-xs text-rose-600" : "font-mono text-xs text-slate-600"}>{t.name}</dt>
                    <dd className="tabular text-slate-900">{t.rows ?? "!"}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 text-xs text-slate-500">
                Storage bucket <span className="font-mono">media</span>: {health.bucket.detail}
              </div>
            </CardBody>
          )}
        </Card>
        <Card>
          <CardHeader title="How analysis is routed" />
          <CardBody className="space-y-3 text-sm text-slate-600">
            <p>
              <span className="font-medium text-slate-900">Web uploads.</span> The participant&apos;s browser runs the module first (instant quality feedback, nothing uploaded until it passes). If the CV service is
              configured, the server re-runs the reference module on the stored media and its result is the one recorded. Otherwise the on-device result is recorded, marked as such.
            </p>
            <p>
              <span className="font-medium text-slate-900">Messaging.</span> The agent sends media to the CV service and posts each attempt to <code className="font-mono text-xs">/api/cv-callback</code>, which records it and
              awards points.
            </p>
            <p>
              <span className="font-medium text-slate-900">Custom models.</span> Active researcher-trained models are applied to every new usable capture from their module, adding a measurement tagged with the model&apos;s
              validation status.
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
