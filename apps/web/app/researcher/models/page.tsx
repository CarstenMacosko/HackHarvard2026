import { CircleCheck, CircleDashed } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, SectionLabel, ValidationBadge } from "@/components/ui";
import { DroidJobs } from "@/components/droid";
import { listCreatedModules } from "@/lib/created-modules";
import { cvHealth } from "@/lib/cv-service";
import { CHECK_LABEL } from "@/lib/format";
import { BUILTIN_MODULES } from "@/lib/modules";

export const metadata = { title: "CV modules" };
export const dynamic = "force-dynamic";

export default async function ModelsPage() {
  const [cv, created] = await Promise.all([cvHealth(), listCreatedModules()]);
  return (
    <>
      <PageHeader
        title="CV modules"
        description="Foundational analyzers ship with the product. Approved candidates from Generate module appear under Created Modules and are immediately usable in studies."
      />

      <SectionLabel>Foundational Modules</SectionLabel>
      <div className="mb-10 grid items-start gap-6 xl:grid-cols-2">
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
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      <SectionLabel>Created Modules</SectionLabel>
      {created.length === 0 ? (
        <div className="mb-10">
          <EmptyState title="No created modules yet">
            Generate a writing-posture module for focal hand dystonia, then approve the candidate. It will appear here and in the study builder.
          </EmptyState>
        </div>
      ) : (
        <div className="mb-10 grid items-start gap-6 xl:grid-cols-2">
          {created.map((m) => {
            const onServer = cv.modules.find((x) => x.id === m.id);
            return (
              <Card key={m.id}>
                <CardHeader title={m.label} description={<span className="font-mono">{m.id}@{m.version}</span>} actions={<Badge tone="green">created</Badge>} />
                <CardBody className="space-y-4">
                  <p className="text-sm text-slate-600">{m.description || "Approved Droid + Daytona candidate."}</p>
                  <p className="text-xs text-slate-500">
                    Condition: {m.condition} · Approved {new Date(m.approved_at).toLocaleString()}
                  </p>
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
                  <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
                    <span className="flex items-center gap-1.5">
                      {onServer ? <CircleCheck className="h-3.5 w-3.5 text-emerald-600" /> : <CircleDashed className="h-3.5 w-3.5 text-slate-400" />}
                      CV service {onServer ? `@${onServer.version}` : cv.configured ? "(refresh page after approve)" : "(not configured)"}
                    </span>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}

      <div id="droid" className="scroll-mt-20">
        <DroidJobs />
      </div>
    </>
  );
}
