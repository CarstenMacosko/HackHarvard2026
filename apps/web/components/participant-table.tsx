import Link from "next/link";
import type { ParticipantSummary } from "@/lib/types";
import { pct, relTime } from "@/lib/format";
import { ScoreBadge } from "./score";
import { Badge, EmptyState, STATUS_TONE, Table, Td, Th, THead, Tr } from "./ui";

export function ParticipantTable({ rows, showStudy = false }: { rows: (ParticipantSummary & { study_name?: string })[]; showStudy?: boolean }) {
  if (!rows.length) return <EmptyState title="No participants match" />;
  return (
    <Table>
      <THead>
        <Th>Participant</Th>
        {showStudy && <Th>Study</Th>}
        <Th>Status</Th>
        <Th className="text-right">Completion</Th>
        <Th className="text-right">Streak</Th>
        <Th>Last check-in</Th>
        <Th>Latest score</Th>
        <Th>Flags</Th>
        <Th className="text-right">Points</Th>
      </THead>
      <tbody>
        {rows.map((p) => (
          <Tr key={p.id}>
            <Td>
              <Link href={`/researcher/participants/${p.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                {p.display_name}
              </Link>
              {p.status === "invited" && (
                <div className="text-xs text-slate-400">
                  invite code <span className="font-mono">{p.invite_code}</span>
                </div>
              )}
            </Td>
            {showStudy && <Td className="text-slate-600">{p.study_name?.split(":")[0]}</Td>}
            <Td>
              <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
            </Td>
            <Td className={`tabular text-right ${p.status === "active" && p.completion_rate < 0.75 ? "font-medium text-rose-600" : ""}`}>{p.status === "invited" ? "—" : pct(p.completion_rate)}</Td>
            <Td className="tabular text-right">{p.streak || "—"}</Td>
            <Td className="text-slate-600">{relTime(p.last_submission_at)}</Td>
            <Td>
              <ScoreBadge value={p.latest_score} />
            </Td>
            <Td>
              <div className="flex gap-1">
                {p.pending_reviews > 0 && <Badge tone="amber">{p.pending_reviews} to review</Badge>}
                {p.escalations > 0 && <Badge tone="red">{p.escalations} escalated</Badge>}
              </div>
            </Td>
            <Td className="tabular text-right">{p.points}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
