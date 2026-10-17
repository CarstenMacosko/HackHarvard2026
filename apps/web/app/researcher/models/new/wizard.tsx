"use client";

import { trainRidgeCV, type TrainedHead } from "@vf/shared";
import { CheckCircle2, Loader2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { Dropzone } from "@/components/dropzone";
import { Badge, Button, ButtonLink, Card, CardBody, CardHeader, KeyValues, SectionLabel, cn } from "@/components/ui";
import { analyzePhotoFile, analyzeVideoFile, type VideoModuleId } from "@/lib/cv-client/analyze";
import { syntheticSkinDataset } from "@/lib/cv-client/synthetic";
import { CHECK_LABEL } from "@/lib/format";
import { BUILTIN_MODULES } from "@/lib/modules";

interface Item {
  id: string;
  file: File;
  label: string;
  status: "pending" | "running" | "ok" | "excluded";
  reason?: string;
  features?: Record<string, number>;
  thumb?: string;
}

const snake = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "m_$1")
    .slice(0, 48) || "custom_score";

function parseLabelCsv(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const [name, label] = line.split(",").map((s) => s?.trim().replace(/^"|"$/g, ""));
    if (name && label && !Number.isNaN(Number(label))) map.set(name, label);
  }
  return map;
}

function Step({ n, title, done, children, disabled }: { n: number; title: string; done?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Card className={cn(disabled && "pointer-events-none opacity-50")}>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold", done ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-700")}>
              {done ? "✓" : n}
            </span>
            {title}
          </span>
        }
      />
      <CardBody>{children}</CardBody>
    </Card>
  );
}

export function TrainingWizard({ studies }: { studies: { id: string; name: string; condition: string }[] }) {
  const [moduleId, setModuleId] = useState(BUILTIN_MODULES[0].id);
  const mod = BUILTIN_MODULES.find((m) => m.id === moduleId)!;
  const [studyId, setStudyId] = useState<string>(studies.find((s) => s.condition === mod.condition)?.id ?? "");
  const [targetLabel, setTargetLabel] = useState("Clinician erythema grade");
  const [unit, setUnit] = useState("0–4");
  const [description, setDescription] = useState("Predicts the study dermatologists' regional erythema grade from the skin-photo feature vector.");
  const [items, setItems] = useState<Item[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState("");
  const [head, setHead] = useState<TrainedHead | null>(null);
  const [trainError, setTrainError] = useState<string | null>(null);
  const [registered, setRegistered] = useState<{ id: string; version: number } | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // revoke thumbnail URLs only when they leave the page, not on every edit
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => () => itemsRef.current.forEach((i) => i.thumb && URL.revokeObjectURL(i.thumb)), []);

  const usable = items.filter((i) => i.status === "ok" && i.label !== "" && Number.isFinite(Number(i.label)));
  const extracted = items.length > 0 && items.every((i) => i.status === "ok" || i.status === "excluded");

  function addFiles(files: File[]) {
    const csv = files.find((f) => f.name.toLowerCase().endsWith(".csv"));
    const media = files.filter((f) => f.type.startsWith(mod.media_type === "photo" ? "image/" : "video/"));
    const apply = (labels: Map<string, string>) =>
      setItems((prev) => {
        const next = [
          ...prev,
          ...media.map((file) => ({
            id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 6)}`,
            file,
            label: "",
            status: "pending" as const,
            thumb: mod.media_type === "photo" ? URL.createObjectURL(file) : undefined,
          })),
        ];
        return next.map((i) => (labels.has(i.file.name) ? { ...i, label: labels.get(i.file.name)! } : i));
      });
    setHead(null);
    setRegistered(null);
    if (csv) void csv.text().then((t) => apply(parseLabelCsv(t)));
    else apply(new Map());
  }

  async function addSynthetic() {
    setGenerating(true);
    const data = await syntheticSkinDataset(40);
    itemsRef.current.forEach((i) => i.thumb && URL.revokeObjectURL(i.thumb));
    setItems(data.map(({ file, label }) => ({ id: file.name, file, label: String(label), status: "pending", thumb: URL.createObjectURL(file) })));
    setHead(null);
    setRegistered(null);
    setGenerating(false);
  }

  async function extract() {
    setExtracting(true);
    setHead(null);
    const list = [...items];
    for (let k = 0; k < list.length; k++) {
      const it = list[k];
      if (it.status === "ok") continue;
      setProgress(`Analysing ${k + 1} of ${list.length}: ${it.file.name}`);
      setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, status: "running" } : x)));
      let patch: Partial<Item>;
      try {
        const { result } =
          mod.media_type === "photo" ? await analyzePhotoFile(it.file, mod.default_criteria) : await analyzeVideoFile(it.file, mod.id as VideoModuleId, mod.default_criteria);
        patch = result.quality.accepted
          ? { status: "ok", features: result.features }
          : { status: "excluded", reason: result.quality.checks.filter((c) => !c.passed).map((c) => CHECK_LABEL[c.name] ?? c.name).join(", ") };
      } catch (e) {
        patch = { status: "excluded", reason: e instanceof Error ? e.message : "could not read file" };
      }
      list[k] = { ...it, ...patch };
      setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, ...patch } : x)));
    }
    setProgress("");
    setExtracting(false);
  }

  function train() {
    setTrainError(null);
    setRegistered(null);
    try {
      const X = usable.map((i) => mod.feature_names.map((f) => i.features![f]));
      const y = usable.map((i) => Number(i.label));
      setHead(trainRidgeCV(X, y));
    } catch (e) {
      setHead(null);
      setTrainError(e instanceof Error ? e.message : String(e));
    }
  }

  async function register() {
    if (!head) return;
    setRegisterError(null);
    const res = await fetch("/api/models", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: targetLabel,
        description,
        study_id: studyId || null,
        module: mod.id,
        target: { name: snake(targetLabel), label: targetLabel, unit },
        kind: "ridge",
        features: mod.feature_names,
        weights: head.fit.weights,
        intercept: head.fit.intercept,
        feature_means: head.fit.means,
        feature_stds: head.fit.stds,
        lambda: head.lambda,
        metrics: head.metrics,
      }),
    });
    const body = await res.json();
    if (!res.ok) return setRegisterError(body.error ?? "Registration failed");
    setRegistered({ id: body.id, version: body.version });
  }

  const scatter = useMemo(
    () => (head ? usable.map((i, k) => ({ actual: Number(i.label), predicted: Math.round(head.oof[k] * 100) / 100, name: i.file.name })) : []),
    [head, usable],
  );
  const weights = head
    ? mod.feature_names.map((f, j) => ({ f, w: head.fit.weights[j] })).sort((a, b) => Math.abs(b.w) - Math.abs(a.w)).slice(0, 8)
    : [];
  const maxW = Math.max(1e-9, ...weights.map((x) => Math.abs(x.w)));
  const lo = scatter.length ? Math.min(...scatter.flatMap((p) => [p.actual, p.predicted])) : 0;
  const hi = scatter.length ? Math.max(...scatter.flatMap((p) => [p.actual, p.predicted])) : 1;
  const input = "h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm";

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(320px,400px)_1fr]">
      <div className="space-y-6">
        <Step n={1} title="Define the measurement" done={Boolean(targetLabel && unit)}>
          <div className="space-y-3 text-sm">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Base CV module (provides the features)</span>
              <select
                className={input}
                value={moduleId}
                onChange={(e) => {
                  const m = BUILTIN_MODULES.find((x) => x.id === e.target.value)!;
                  setModuleId(m.id);
                  setStudyId(studies.find((s) => s.condition === m.condition)?.id ?? "");
                  setItems([]);
                  setHead(null);
                  setRegistered(null);
                }}
              >
                {BUILTIN_MODULES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} ({m.feature_names.length} features)
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Apply to study</span>
              <select className={input} value={studyId} onChange={(e) => setStudyId(e.target.value)}>
                <option value="">All studies using this module</option>
                {studies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="col-span-2 block">
                <span className="mb-1 block text-xs font-medium text-slate-600">What it predicts</span>
                <input className={input} value={targetLabel} onChange={(e) => setTargetLabel(e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Unit / scale</span>
                <input className={input} value={unit} onChange={(e) => setUnit(e.target.value)} />
              </label>
            </div>
            <div className="text-xs text-slate-500">
              Stored as <code className="font-mono">{snake(targetLabel)}</code> on each observation.
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-600">Description</span>
              <textarea className="w-full rounded-md border border-slate-300 px-2.5 py-1.5" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
          </div>
        </Step>

        <Step n={2} title="Add labelled examples" done={items.length > 0}>
          <Dropzone
            accept={mod.media_type === "photo" ? "image/*,.csv" : "video/*,.csv"}
            multiple
            onFiles={addFiles}
            title={`Drop ${mod.media_type === "photo" ? "photos" : "videos"} (and optionally a labels CSV)`}
            hint={
              <>
                CSV format: <code className="font-mono">filename,label</code>. You can also type labels below.
              </>
            }
            compact
          />
          {mod.media_type === "photo" && (
            <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={addSynthetic} disabled={generating}>
              <Wand2 className="h-3.5 w-3.5" /> {generating ? "Generating…" : "Use a synthetic demo dataset (40 labelled photos)"}
            </Button>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Labels should come from your raters, ideally two blinded clinicians. At least 10 examples are needed to train and 30 to mark a model validated.
          </p>
        </Step>
      </div>

      <div className="space-y-6">
        <Step n={3} title={`Extract features on-device · ${items.length} file${items.length === 1 ? "" : "s"}`} done={extracted} disabled={!items.length}>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Button onClick={extract} disabled={extracting || !items.length || extracted}>
              {extracting && <Loader2 className="h-4 w-4 animate-spin" />}
              {extracted ? "Features extracted" : "Run the quality gate and extract features"}
            </Button>
            <span className="text-xs text-slate-500">{progress || (extracted ? `${items.filter((i) => i.status === "ok").length} usable · ${items.filter((i) => i.status === "excluded").length} excluded by the quality gate` : "")}</span>
          </div>
          {items.length > 0 && (
            <div className="max-h-80 overflow-y-auto rounded-md border border-slate-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium">File</th>
                    <th className="px-3 py-1.5 text-left font-medium">Label</th>
                    <th className="px-3 py-1.5 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id} className="border-t border-slate-100">
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {i.thumb && <img src={i.thumb} alt="" className="h-8 w-10 rounded object-cover" />}
                          <span className="truncate text-slate-700">{i.file.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          value={i.label}
                          inputMode="decimal"
                          aria-label={`Label for ${i.file.name}`}
                          onChange={(e) => {
                            setHead(null);
                            setItems((prev) => prev.map((x) => (x.id === i.id ? { ...x, label: e.target.value } : x)));
                          }}
                          className="tabular h-7 w-20 rounded border border-slate-300 px-1.5 text-sm"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        {i.status === "ok" && <Badge tone="green">usable</Badge>}
                        {i.status === "pending" && <Badge>queued</Badge>}
                        {i.status === "running" && <Badge tone="blue">analysing</Badge>}
                        {i.status === "excluded" && <Badge tone="amber">excluded: {i.reason}</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Step>

        <Step n={4} title="Train and cross-validate" done={Boolean(head)} disabled={!extracted}>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Button onClick={train} disabled={usable.length === 0}>
              Train ridge model on {usable.length} labelled example{usable.length === 1 ? "" : "s"}
            </Button>
            {trainError && <span className="text-sm text-rose-600">{trainError}</span>}
          </div>
          {head && (
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <SectionLabel>Out-of-fold predictions vs. labels</SectionLabel>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 8, right: 8, bottom: 8, left: -12 }}>
                      <CartesianGrid stroke="#e2e8f0" />
                      <XAxis type="number" dataKey="actual" name="Label" domain={[Math.floor(lo), Math.ceil(hi)]} tick={{ fontSize: 11, fill: "#64748b" }} />
                      <YAxis type="number" dataKey="predicted" name="Predicted" domain={[Math.floor(lo), Math.ceil(hi)]} tick={{ fontSize: 11, fill: "#64748b" }} />
                      <ReferenceLine segment={[{ x: Math.floor(lo), y: Math.floor(lo) }, { x: Math.ceil(hi), y: Math.ceil(hi) }]} stroke="#94a3b8" strokeDasharray="4 4" />
                      <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ fontSize: 12, borderRadius: 6 }} />
                      <Scatter data={scatter} fill="#2a78d6" isAnimationActive={false} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-slate-500">Each point is predicted by a model that never saw it ({head.metrics.folds}-fold cross-validation). The dashed line is perfect agreement.</p>
              </div>
              <div className="space-y-5">
                <div>
                  <SectionLabel>Cross-validated performance</SectionLabel>
                  <KeyValues
                    items={[
                      ["Examples", head.metrics.n],
                      ["Mean absolute error", `${head.metrics.mae.toFixed(3)} ${unit}`],
                      ["Baseline (predict the mean)", `${head.metrics.baseline_mae.toFixed(3)} ${unit}`],
                      ["Correlation (r)", head.metrics.r.toFixed(3)],
                      ["Regularisation (λ)", head.lambda],
                    ]}
                  />
                  {head.metrics.mae >= head.metrics.baseline_mae && (
                    <p className="mt-2 text-xs text-rose-600">The model does no better than predicting the average. Add more or better-labelled examples before registering.</p>
                  )}
                </div>
                <div>
                  <SectionLabel>Most influential features (standardised weights)</SectionLabel>
                  <ul className="space-y-1.5">
                    {weights.map(({ f, w }) => (
                      <li key={f} className="grid grid-cols-[140px_1fr_52px] items-center gap-2 text-xs">
                        <span className="truncate font-mono text-slate-600">{f}</span>
                        <div className="h-1.5 rounded-full bg-slate-100">
                          <div className="h-1.5 rounded-full" style={{ width: `${(Math.abs(w) / maxW) * 100}%`, background: w >= 0 ? "#2a78d6" : "#eb6834" }} />
                        </div>
                        <span className="tabular text-right text-slate-700">{w.toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-slate-500">Blue increases the prediction, orange decreases it.</p>
                </div>
              </div>
            </div>
          )}
        </Step>

        <Step n={5} title="Register" done={Boolean(registered)} disabled={!head}>
          {registered ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <span>
                Registered <span className="font-medium">{targetLabel}</span> v{registered.version}. It now runs on every new usable capture from <span className="font-mono">{mod.id}</span>
                {studyId ? " in the selected study" : ""}, tagged “needs validation”.
              </span>
              <ButtonLink href="/researcher/models" variant="secondary" size="sm">
                Open registry
              </ButtonLink>
            </div>
          ) : (
            <div className="space-y-2">
              <Button variant="success" onClick={register} disabled={!head || (head?.metrics.mae ?? 0) >= (head?.metrics.baseline_mae ?? 0)}>
                Register model
              </Button>
              {registerError && <p className="text-sm text-rose-600">{registerError}</p>}
              <p className="text-xs text-slate-500">
                New models start as “needs validation”: results appear on timelines and in exports with that tag until you mark the model validated in the{" "}
                <Link href="/researcher/models" className="text-brand-700 hover:underline">
                  registry
                </Link>
                .
              </p>
            </div>
          )}
        </Step>
      </div>
    </div>
  );
}
