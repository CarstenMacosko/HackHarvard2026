import { CircleCheck, CircleDashed } from "lucide-react";
import Link from "next/link";
import { Badge, ButtonLink, Card, CardBody, CardHeader, EmptyState, PageHeader, SectionLabel, Table, Td, Th, THead, Tr, ValidationBadge } from "@/components/ui";
import { cvHealth } from "@/lib/cv-service";
import { CHECK_LABEL, shortDate } from "@/lib/format";
import { BUILTIN_MODULES } from "@/lib/modules";
import { modelRegistry } from "@/lib/queries";
import { DroidJobs } from "@/components/droid";
import { ModelActions } from "./model-actions";

export const metadata = { title: "Model registry" };

const LABEL_KIND = { expert: "Dermatologist labels", self_report: "Self-reported labels", synthetic: "Synthetic labels", researcher: "Researcher labels" } as const;
const LABEL_TONE = { expert: "green", self_report: "amber", synthetic: "red", researcher: "slate" } as const;
export const dynamic = "force-dynamic";

export default async function ModelsPage() {
  const [{ models }, cv] = await Promise.all([modelRegistry(), cvHealth()]);
  return (
    <>
      <PageHeader
        title="Model registry"
        description="Inspect versioned CV modules and previously registered models. Writing posture currently runs in the CV service; generated source remains a candidate until evaluated with consented captures."
        actions={
          <>
            <ButtonLink href="/researcher/generate" variant="secondary">
              Generate module
            </ButtonLink>
          </>
        }
      />

      <h2 className="mb-3 text-sm font-semibold text-slate-900">Built-in CV modules</h2>
      <div className="mb-8 grid items-start gap-6 xl:grid-cols-2">
        {BUILTIN_MODULES.map((m) => {
          const onServer = cv.modules.find((x) => x.id === m.id);
          return (
            <Card key={m.id}>
              <CardHeader title={m.label} description={<span className="font-mono">{m.id}@{m.version}</span>} actions={<Badge>{m.media_type}</Badge>} />
              <CardBody className="space-y-4">
                <p className="text-sm text-slate-600">{m.summary}</p>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <SectionLabel>Measurements</SectionLabel>
                    <ul className="space-y-1.5 text-sm">
                      {m.measurements.map((x) => (
                        <li key={x.name} className="flex items-center justify-between gap-2">
                          <span>
                            {x.label} <span className="text-slate-400">({x.unit})</span>
                          </span>
                          <ValidationBadge status="reusable_needs_validation" />
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <SectionLabel>Quality gate defaults</SectionLabel>
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(m.default_criteria).map(([k, v]) => (
                        <Badge key={k}>
                          {CHECK_LABEL[k.replace(/_(min|max)$/, "")] ?? k} {k.endsWith("_max") ? "≤" : "≥"} {v}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <CircleCheck className="h-3.5 w-3.5 text-emerald-600" /> On-device (browser)
                  </span>
                  <span className="flex items-center gap-1.5">
                    {onServer ? <CircleCheck className="h-3.5 w-3.5 text-emerald-600" /> : <CircleDashed className="h-3.5 w-3.5 text-slate-400" />}
                    CV service {onServer ? `@${onServer.version}` : cv.configured ? "(unreachable)" : "(not configured)"}
                  </span>
                  <span>{m.feature_names.length}-value feature vector for custom models</span>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      <Card className="mb-8">
        <CardHeader title="Writing posture (CV service)" description="writing_posture@0.1.0 · index-finger straightening during a fixed side-view pen hold and repeated phrase" />
        <CardBody className="text-sm text-slate-600">Measures writing-phase index PIP angle and the fraction of visible frames above a provisional straightening threshold. A missing or obscured index finger fails the quality gate. This module is not yet available in the browser capture flow and is not a diagnostic score.</CardBody>
      </Card>

      <h2 className="mb-3 text-sm font-semibold text-slate-900">Trained models</h2>
      <Card className="mb-8">
        {models.length === 0 ? (
          <EmptyState title="No trained models yet">
            The offline training kit remains available for future labeled studies. Generated candidate modules do not appear here as trained models.
          </EmptyState>
        ) : (
          <Table>
            <THead>
              <Th>Model</Th>
              <Th>Trained on</Th>
              <Th className="text-right">n</Th>
              <Th className="text-right">Out-of-fold error</Th>
              <Th>Worst subgroup</Th>
              <Th>Status</Th>
              <Th className="text-right">Applied</Th>
              <Th />
            </THead>
            <tbody>
              {models.map((m) => {
                const p = m.provenance;
                return (
                  <Tr key={m.id}>
                    <Td>
                      <Link href={`/researcher/models/${m.id}`} className="font-medium text-slate-900 hover:underline">
                        {m.name}
                      </Link>{" "}
                      <span className="text-slate-400">v{m.version}</span>
                      <div className="text-xs text-slate-500">
                        → {m.target.label} ({m.target.unit}) · <span className="font-mono">{m.module}</span> · {m.n_features} features · {m.study_name.split(":")[0]}
                      </div>
                    </Td>
                    <Td className="text-xs">
                      {p ? (
                        <>
                          <div className="text-slate-700">{p.dataset_title.split(":")[0]}</div>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            <Badge tone={p.source === "droid" ? "blue" : "slate"}>{p.source === "droid" ? "Droid" : "Training kit"}</Badge>
                            <Badge tone={LABEL_TONE[p.label_kind]}>{LABEL_KIND[p.label_kind]}</Badge>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-slate-700">Researcher upload</div>
                          <div className="mt-0.5">
                            <Badge>Legacy browser wizard · {shortDate(m.created_at)}</Badge>
                          </div>
                        </>
                      )}
                    </Td>
                    <Td className="tabular text-right">{m.metrics.n}</Td>
                    <Td className="tabular text-right">
                      {p?.auc != null && <div>AUC {p.auc.toFixed(2)}</div>}
                      <div className={p?.auc != null ? "text-xs text-slate-500" : ""}>
                        MAE {m.metrics.mae.toFixed(2)} <span className="text-xs text-slate-400">vs {m.metrics.baseline_mae.toFixed(2)}</span>
                      </div>
                    </Td>
                    <Td className="text-xs text-slate-600">
                      {p?.worst_subgroup ? (
                        <>
                          {p.worst_subgroup.name} <span className="text-slate-400">({p.worst_subgroup.metric.toUpperCase()} {p.worst_subgroup.value.toFixed(2)})</span>
                        </>
                      ) : (
                        "–"
                      )}
                    </Td>
                    <Td>{m.provenance?.source === "droid" && m.metrics.folds === 0 ? <Badge tone="red">legacy placeholder blocked</Badge> : m.active ? <ValidationBadge status={m.status} /> : <Badge>inactive</Badge>}</Td>
                    <Td className="tabular text-right">{m.applied}</Td>
                    <Td className="text-right">
                      <ModelActions id={m.id} active={m.active} status={m.status} n={m.metrics.n} />
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <div id="droid" className="mb-8 scroll-mt-20">
        <DroidJobs />
      </div>

      <h2 className="mb-3 text-sm font-semibold text-slate-900">Bring your own CV</h2>
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="1 · Offline training kit" />
          <CardBody className="text-sm text-slate-600">
            The <code className="font-mono text-xs">training/vfcv</code> kit remains for future labeled datasets and study-specific heads. Browser training has been removed from researcher workflows.
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="2 · Generate with Droid + Daytona" />
          <CardBody className="text-sm text-slate-600">
            Droid drafts a writing-posture candidate from shared hand landmarks. Daytona runs the shared feature on landmark tracks. The source and results stay in the generation job for review.{" "}
            <Link href="/researcher/generate" className="font-medium text-brand-700 hover:underline">
              Open the generator →
            </Link>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="3 · Add a module" />
          <CardBody className="text-sm text-slate-600">
            Implement a <code className="font-mono text-xs">CVModule</code> in <code className="font-mono text-xs">services/cv/app/modules/</code> (prepare → quality checks → measure + features),
            decorate it with <code className="font-mono text-xs">@register</code>, and port it to <code className="font-mono text-xs">packages/cv</code> if it should run on-device. Parity fixtures keep both in sync.
          </CardBody>
        </Card>
      </div>
    </>
  );
}
