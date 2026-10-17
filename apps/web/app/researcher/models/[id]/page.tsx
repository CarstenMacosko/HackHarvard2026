import { notFound } from "next/navigation";
import { Badge, Card, CardBody, CardHeader, KeyValues, PageHeader, SectionLabel, Table, Td, Th, THead, Tr, ValidationBadge } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { modelDetail } from "@/lib/queries";
import { ModelActions } from "../model-actions";

export const dynamic = "force-dynamic";

const fmt = (v: number | null | undefined, d = 3) => (v === null || v === undefined ? "–" : v.toFixed(d));

export default async function ModelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await modelDetail(id);
  if (!d) notFound();
  const { model: m, evaluation: ev } = d;
  const p = m.provenance;
  // the interpretable part of the model: largest standardised weights outside the embedding group
  const top = m.features
    .map((f, j) => ({ f, w: m.weights[j] }))
    .filter((x) => !/^mnv3s_\d+$/.test(x.f))
    .sort((a, b) => Math.abs(b.w) - Math.abs(a.w))
    .slice(0, 8);
  const embeddingCount = m.features.filter((f) => /^mnv3s_\d+$/.test(f)).length;

  return (
    <>
      <PageHeader
        title={m.name}
        description={m.description}
        actions={
          <div className="flex items-center gap-3">
            {m.active ? <ValidationBadge status={m.status} /> : <Badge>inactive</Badge>}
            <ModelActions id={m.id} active={m.active} status={m.status} n={m.metrics.n} />
          </div>
        }
      />
      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Performance" description={`Out-of-fold over ${m.metrics.folds} folds${p ? ", grouped by case so photos of one case never sit on both sides" : ""}.`} />
            <CardBody className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-4">
                <div>
                  <SectionLabel>MAE</SectionLabel>
                  <div className="tabular text-lg font-semibold">{fmt(m.metrics.mae)}</div>
                  <div className="text-xs text-slate-500">predicting the mean: {fmt(m.metrics.baseline_mae)}</div>
                </div>
                <div>
                  <SectionLabel>RMSE</SectionLabel>
                  <div className="tabular text-lg font-semibold">{fmt(m.metrics.rmse)}</div>
                </div>
                <div>
                  <SectionLabel>Pearson r</SectionLabel>
                  <div className="tabular text-lg font-semibold">{fmt(m.metrics.r)}</div>
                </div>
                <div>
                  <SectionLabel>AUC</SectionLabel>
                  <div className="tabular text-lg font-semibold">{fmt(p?.auc ?? ev?.overall.auc)}</div>
                  {ev?.overall.n_positive !== undefined && <div className="text-xs text-slate-500">{ev.overall.n_positive} positives (label ≥ 0.5)</div>}
                </div>
              </div>
              {ev?.subgroups && (
                <div>
                  <SectionLabel>By subgroup</SectionLabel>
                  <Table>
                    <THead>
                      <Th>Group</Th>
                      <Th className="text-right">n</Th>
                      <Th className="text-right">MAE</Th>
                      <Th className="text-right">r</Th>
                      <Th className="text-right">AUC</Th>
                      <Th className="text-right">Excluded by quality gate</Th>
                    </THead>
                    <tbody>
                      {Object.entries(ev.subgroups.groups).map(([g, row]) => (
                        <Tr key={g} className={ev.subgroups?.worst?.name === g ? "bg-amber-50" : ""}>
                          <Td>
                            {g} {ev.subgroups?.worst?.name === g && <Badge tone="amber">worst</Badge>}
                          </Td>
                          <Td className="tabular text-right">{row.n}</Td>
                          <Td className="tabular text-right">{fmt(row.mae)}</Td>
                          <Td className="tabular text-right">{fmt(row.r ?? null, 2)}</Td>
                          <Td className="tabular text-right">{fmt(row.auc ?? null, 2)}</Td>
                          <Td className="tabular text-right">
                            {row.excluded_by_quality} {row.exclusion_rate !== null && <span className="text-xs text-slate-400">({Math.round(row.exclusion_rate * 100)}%)</span>}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
            </CardBody>
          </Card>
          {d.card && (
            <Card>
              <CardHeader title="Model card" description={p ? <span className="font-mono">{p.card_path}</span> : undefined} />
              <CardBody>
                <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">{d.card}</pre>
              </CardBody>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Model" />
            <CardBody>
              <KeyValues
                items={[
                  ["Measurement", `${m.target.label} (${m.target.unit})`],
                  ["Base module", <span key="m" className="font-mono">{m.module}</span>],
                  ["Applies to", d.study_name],
                  ["Inputs", `${m.features.length - embeddingCount} module features${embeddingCount ? ` + ${embeddingCount}-value image embedding` : ""}`],
                  ["Ridge λ", m.lambda],
                  ["Output range", `${fmt(m.metrics.label_min, 2)} – ${fmt(m.metrics.label_max, 2)} (clamped)`],
                  ["Version", `v${m.version} · ${m.created_by} · ${dateTime(m.created_at)}`],
                  ["Applied to", `${d.applied} observations`],
                ]}
              />
            </CardBody>
          </Card>
          {p && (
            <Card>
              <CardHeader title="Data" />
              <CardBody className="space-y-3 text-sm">
                <KeyValues
                  items={[
                    ["Dataset", p.url ? <a key="d" href={p.url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">{p.dataset_title}</a> : p.dataset_title],
                    ["Licence", p.licence],
                    ["Labels", p.label_kind.replace("_", " ")],
                    ["Cases", p.n_cases],
                    ["Excluded by quality gate", p.n_excluded_quality],
                    ["Built by", p.source === "droid" ? "Factory Droid (training kit)" : `Training kit v${p.kit_version}`],
                  ]}
                />
                {p.citation && <p className="text-xs text-slate-500">{p.citation}</p>}
              </CardBody>
            </Card>
          )}
          {top.length > 0 && embeddingCount === 0 && (
            <Card>
              <CardHeader title="Largest module-feature weights" description="Standardised, so they compare across features." />
              <CardBody>
                <ul className="space-y-1 text-sm">
                  {top.map((x) => (
                    <li key={x.f} className="flex justify-between gap-3">
                      <span className="font-mono text-xs">{x.f}</span>
                      <span className={`tabular ${x.w >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{x.w >= 0 ? "+" : ""}{x.w.toFixed(3)}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
