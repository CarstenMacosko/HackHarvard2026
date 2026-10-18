import { CircleCheck, CircleDashed, CircleX } from "lucide-react";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui";
import { backend } from "@/lib/backend";
import { cvHealth } from "@/lib/cv-service";
import { liveIntegrationStatus } from "@/lib/live-keys";

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
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {title} <span className="ml-1 text-xs font-normal text-slate-500">{state === "ok" ? "connected" : state === "error" ? "error" : "not configured"}</span>
        </div>
        <div className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{detail}</div>
        {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
      </div>
    </div>
  );
}

export default async function SettingsPage() {
  const db = backend();
  const supabase = db.mode === "supabase";
  const live = liveIntegrationStatus();
  const [cv, health] = await Promise.all([cvHealth(), supabase ? db.health().catch((e: Error) => ({ ok: false, tables: [], bucket: { ok: false, detail: e.message } })) : null]);
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
                  ? "Every capture, review, Droid job and observation note is stored in Postgres; media in the private media bucket."
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
            hint={!cv.ok && "Deploy services/cv (modal deploy modal_app.py) and set CV_SERVICE_URL on Vercel / .env.local to re-run every upload on the server."}
          />
          <Row
            state={live.droid ? "ok" : "off"}
            title="Factory Droid"
            detail={live.droid ? `Live drafting via ${live.droid_exec}` : "FACTORY_API_KEY not set — Generate module uses the offline template."}
            hint={!live.droid && "Set FACTORY_API_KEY for live Droid drafts on /researcher/generate (and on Vercel for deploy)."}
          />
          <Row
            state={live.daytona ? "ok" : "off"}
            title="Daytona"
            detail={live.daytona ? "Live landmark-track experiment sandboxes enabled." : "DAYTONA_API_KEY not set — experiments run in local Python workers only."}
            hint={!live.daytona && "Set DAYTONA_API_KEY (optional DAYTONA_API_URL) for cloud Daytona checks on deploy."}
          />
          {health && (
            <CardBody className="border-t border-slate-100">
              <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Tables (rows)</div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                {health.tables.map((t) => (
                  <div key={t.name} className="flex justify-between gap-2">
                    <dt className={t.error ? "font-mono text-xs text-rose-600 dark:text-rose-400" : "font-mono text-xs text-slate-600 dark:text-slate-400"}>{t.name}</dt>
                    <dd className="tabular text-slate-900 dark:text-slate-100">{t.rows ?? "!"}</dd>
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
          <CardBody className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
            <p>
              <span className="font-medium text-slate-900 dark:text-slate-100">Web uploads.</span> The participant&apos;s browser runs the module first (instant quality feedback, nothing uploaded until it passes). If the CV service is
              configured, the server re-runs the reference module on the stored media and its result is the one recorded. Otherwise the on-device result is recorded, marked as such.
            </p>
            <p>
              <span className="font-medium text-slate-900 dark:text-slate-100">Generated modules.</span> Approve a Droid + Daytona candidate under Generate module to write a sandboxed <code className="font-mono text-xs">gen_*</code> analyzer for participant captures.
            </p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
