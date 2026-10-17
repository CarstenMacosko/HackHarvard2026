export const pct = (x: number) => `${Math.round(x * 100)}%`;

export function relTime(iso: string | null): string {
  if (!iso) return "—";
  const d = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  if (d < 0) return `in ${Math.ceil(-d)}d`;
  if (d < 1) return "today";
  if (d < 2) return "yesterday";
  return `${Math.floor(d)}d ago`;
}

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export const CONDITION_LABEL = { parkinsons: "Parkinson's disease", eczema: "Atopic dermatitis" } as const;
