"use client";

import { Download, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, buttonClass, cn, fieldClass } from "@/components/ui";

const OPTIONS = [
  { id: "accepted", label: "Accepted", hint: "Clinician-accepted results" },
  { id: "corrected", label: "Corrected", hint: "Accepted with corrected values" },
  { id: "pending", label: "Pending review", hint: "Awaiting clinician decision" },
  { id: "rejected", label: "Rejected", hint: "Not entering the analysis set" },
] as const;

type StatusId = (typeof OPTIONS)[number]["id"];

export interface ExportStudyOption {
  id: string;
  name: string;
}

/** Modal to pick review statuses (and study if needed), then download the researcher-only long-format CSV. */
export function ExportCsvModal({
  studyId,
  studies,
  buttonLabel = "Export CSV",
  variant = "primary",
}: {
  /** Fixed study — used on the study Data tab. */
  studyId?: string;
  /** Study picker — used on Submissions when exporting from the inbox. */
  studies?: ExportStudyOption[];
  buttonLabel?: string;
  variant?: "primary" | "secondary";
}) {
  const initialStudy = studyId ?? studies?.[0]?.id ?? "";
  const [open, setOpen] = useState(false);
  const [pickedStudy, setPickedStudy] = useState(initialStudy);
  const [selected, setSelected] = useState<Record<StatusId, boolean>>({
    accepted: true,
    corrected: true,
    pending: false,
    rejected: false,
  });

  const effectiveStudy = studyId ?? pickedStudy;
  const needsStudyPicker = !studyId && (studies?.length ?? 0) > 0;

  const statusQuery = useMemo(
    () =>
      OPTIONS.filter((o) => selected[o.id])
        .map((o) => o.id)
        .join(","),
    [selected],
  );
  const canDownload = statusQuery.length > 0 && Boolean(effectiveStudy);
  const href = canDownload
    ? `/api/export?study=${encodeURIComponent(effectiveStudy)}&format=csv&status=${encodeURIComponent(statusQuery)}`
    : undefined;

  return (
    <>
      <Button
        type="button"
        variant={variant}
        onClick={() => {
          setPickedStudy(studyId ?? studies?.[0]?.id ?? "");
          setOpen(true);
        }}
        disabled={!studyId && !(studies?.length)}
      >
        <Download /> {buttonLabel}
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="export-csv-title">
          <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-md rounded-lg bg-white p-6 shadow-overlay ring-1 ring-slate-900/5 dark:bg-slate-900 dark:ring-white/10">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="export-csv-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Export submissions (CSV)
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Long format: one row per measurement. IDs only; clinical answers stay in a single <code className="text-xs">patient_report</code> JSON column.
                </p>
              </div>
              <button type="button" className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-100" onClick={() => setOpen(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>

            {needsStudyPicker && studies && (
              <label className="mt-4 block text-sm font-medium text-slate-900 dark:text-slate-100">
                Study
                <select
                  className={cn(fieldClass, "mt-1.5 h-10 w-full")}
                  value={pickedStudy}
                  onChange={(e) => setPickedStudy(e.target.value)}
                >
                  {studies.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name.split(":")[0]}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <fieldset className="mt-4 space-y-2">
              <legend className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Include review status</legend>
              {OPTIONS.map((o) => (
                <label
                  key={o.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2.5 text-sm",
                    selected[o.id] ? "border-brand-500 bg-brand-50/50 dark:bg-brand-900/40" : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800",
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4"
                    checked={selected[o.id]}
                    onChange={(e) => setSelected((s) => ({ ...s, [o.id]: e.target.checked }))}
                  />
                  <span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{o.label}</span>
                    <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{o.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            {!canDownload && <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{!effectiveStudy ? "Choose a study." : "Select at least one status."}</p>}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <a
                href={href}
                aria-disabled={!canDownload}
                onClick={(e) => {
                  if (!canDownload) e.preventDefault();
                  else setOpen(false);
                }}
                className={cn(buttonClass(), !canDownload && "pointer-events-none opacity-40")}
              >
                <Download /> Download CSV
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
