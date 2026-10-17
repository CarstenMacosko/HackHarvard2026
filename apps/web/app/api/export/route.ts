import { backend } from "@/lib/backend";

/**
 * Analysis-ready export of a study's observations in long format: one row per measurement.
 * By default only clinician-reviewed results (accepted or corrected) are included.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const study = url.searchParams.get("study");
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  const includeAll = url.searchParams.get("include") === "all";
  const db = backend();
  const studies = await db.studies();
  if (!study || !studies.some((s) => s.id === study)) return new Response("unknown study", { status: 400 });

  const obs = (await db.observations({ studyId: study })).filter((o) => includeAll || o.review_status === "accepted" || o.review_status === "corrected");
  const rows = obs.flatMap((o) =>
    o.measurements.map((m) => ({
      study_id: o.study_id,
      participant_id: o.participant_id,
      observation_id: o.id,
      captured_at: o.captured_at,
      task: o.task_label,
      measurement: m.name,
      value: m.value,
      unit: m.unit,
      uncertainty: m.uncertainty ?? "",
      validation_status: m.validation_status,
      review_status: o.review_status,
      reviewer: o.reviewer ?? "",
      model_version: o.model_version,
      analysis_runtime: String(o.context.analysis_runtime ?? ""),
      attempts: String(o.context.attempts ?? ""),
      patient_report: JSON.stringify(o.patient_report),
    })),
  );
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "json") {
    return new Response(JSON.stringify(rows, null, 1), {
      headers: { "content-type": "application/json", "content-disposition": `attachment; filename="${study}-${stamp}.json"` },
    });
  }
  const cols = Object.keys(rows[0] ?? { study_id: "" });
  const esc = (v: unknown) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc((r as Record<string, unknown>)[c])).join(","))].join("\n");
  return new Response(csv + "\n", {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${study}-${stamp}.csv"` },
  });
}
