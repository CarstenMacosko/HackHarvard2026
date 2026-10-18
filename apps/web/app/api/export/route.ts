import { NextResponse } from "next/server";
import { currentResearcher } from "@/lib/auth";
import { backend } from "@/lib/backend";
import type { ObservationNote, Submission } from "@/lib/types";

export const dynamic = "force-dynamic";

const REVIEW_STATUSES = ["accepted", "corrected", "pending", "rejected"] as const;
type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/**
 * Researcher-only, analysis-ready export of a study's observations in long format
 * (one row per measurement). IDs only — no participant display names or media URLs.
 * patient_report stays a single JSON column.
 */
export async function GET(req: Request) {
  if (!(await currentResearcher())) {
    return NextResponse.json({ error: "Sign in as a researcher to export." }, { status: 401 });
  }

  const url = new URL(req.url);
  const study = url.searchParams.get("study");
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  const statusParam = url.searchParams.get("status");
  const statuses: ReviewStatus[] = statusParam
    ? (statusParam.split(",").map((s) => s.trim()).filter((s): s is ReviewStatus => (REVIEW_STATUSES as readonly string[]).includes(s)))
    : ["accepted", "corrected"];
  if (!statuses.length) {
    return NextResponse.json({ error: "Select at least one review status." }, { status: 400 });
  }

  const db = backend();
  const studies = await db.studies();
  const studyRow = studies.find((s) => s.id === study);
  if (!study || !studyRow) return new Response("unknown study", { status: 400 });

  const [allObs, submissions] = await Promise.all([db.observations({ studyId: study }), db.submissions({ studyId: study })]);
  const obs = allObs.filter((o) => statuses.includes(o.review_status as ReviewStatus));
  const subById = new Map(submissions.map((s) => [s.id, s]));
  const subByObs = new Map<string, Submission>();
  for (const s of submissions) {
    if (s.observation_id) subByObs.set(s.observation_id, s);
  }

  const noteLists = await Promise.all(obs.map((o) => db.observationNotes(o.id)));
  const notesByObs = new Map<string, ObservationNote[]>();
  obs.forEach((o, i) => notesByObs.set(o.id, noteLists[i] ?? []));

  type ExportRow = Record<string, string | number>;
  const rows: ExportRow[] = [];
  for (const o of obs) {
    const sub = subByObs.get(o.id) ?? (o.submission_id ? subById.get(o.submission_id) : undefined);
    const notes = notesByObs.get(o.id) ?? [];
    const failed = o.quality.checks.filter((c) => !c.passed && !c.advisory).map((c) => c.name);
    const base: ExportRow = {
      study_id: o.study_id,
      participant_id: o.participant_id,
      observation_id: o.id,
      submission_id: o.submission_id || sub?.id || "",
      scheduled_task_id: sub?.scheduled_task_id ?? "",
      captured_at: o.captured_at,
      module: o.module,
      task_label: o.task_label,
      review_status: o.review_status,
      reviewer: o.reviewer ?? "",
      reviewed_at: o.reviewed_at ?? "",
      review_note: o.review_note ?? "",
      model_version: o.model_version,
      analysis_runtime: String(o.context.analysis_runtime ?? ""),
      attempts: String(o.context.attempts ?? sub?.attempt ?? ""),
      source: sub?.source ?? String(o.context.source ?? ""),
      submission_accepted: sub ? String(sub.accepted) : "",
      quality_accepted: String(o.quality.accepted),
      quality_failed_checks: JSON.stringify(failed),
      patient_report: JSON.stringify(o.patient_report ?? {}),
      note_ids: JSON.stringify(notes.map((n) => n.id)),
      notes_json: JSON.stringify(notes.map((n) => ({ id: n.id, author: n.author, body: n.body, created_at: n.created_at }))),
    };
    if (!o.measurements.length) {
      rows.push({ ...base, measurement: "", measurement_label: "", value: "", unit: "", uncertainty: "", validation_status: "" });
      continue;
    }
    for (const m of o.measurements) {
      rows.push({
        ...base,
        measurement: m.name,
        measurement_label: m.label,
        value: m.value,
        unit: m.unit,
        uncertainty: m.uncertainty ?? "",
        validation_status: m.validation_status,
      });
    }
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${study}-export-${stamp}`;
  if (format === "json") {
    return new Response(JSON.stringify(rows, null, 1), {
      headers: { "content-type": "application/json", "content-disposition": `attachment; filename="${filename}.json"` },
    });
  }

  const cols = [
    "study_id",
    "participant_id",
    "observation_id",
    "submission_id",
    "scheduled_task_id",
    "captured_at",
    "module",
    "task_label",
    "measurement",
    "measurement_label",
    "value",
    "unit",
    "uncertainty",
    "validation_status",
    "review_status",
    "reviewer",
    "reviewed_at",
    "review_note",
    "model_version",
    "analysis_runtime",
    "attempts",
    "source",
    "submission_accepted",
    "quality_accepted",
    "quality_failed_checks",
    "patient_report",
    "note_ids",
    "notes_json",
  ];
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  return new Response(csv + "\n", {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${filename}.csv"` },
  });
}
