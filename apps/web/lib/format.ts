export const pct = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${Math.round(x * 100)}%`);

export function relTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const d = ms / 86_400_000;
  if (d < 0) {
    const ahead = -d;
    return ahead < 1 ? `in ${Math.max(1, Math.round(ahead * 24))}h` : `in ${Math.round(ahead)}d`;
  }
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min ago`;
  if (d < 1) return `${Math.round(ms / 3_600_000)}h ago`;
  if (d < 2) return "yesterday";
  return `${Math.floor(d)}d ago`;
}

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export const CONDITION_LABEL: Record<string, string> = {
  parkinsons: "Parkinson's disease",
  eczema: "Atopic dermatitis",
  other: "Other",
};

export const conditionLabel = (condition: string) => CONDITION_LABEL[condition] ?? condition;

export const studyShortName = (name: string) => name.split(":")[0];

export const CHECK_LABEL: Record<string, string> = {
  blur: "Sharpness",
  exposure: "Lighting",
  duration_s: "Length",
  fps: "Frame rate",
  hand_visible: "Hand in view",
  skin_coverage: "Skin in frame",
  task_completed: "Task done",
};
