"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { deleteStudyAction } from "./actions";

/** Hard-delete this study and all tied captures / participants (demo expedience). Created modules stay. */
export function DeleteStudyButton({ studyId, studyName }: { studyId: string; studyName: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    const ok = window.confirm(
      `Delete “${studyName}” and all participants, captures, and rewards for this study?\n\nThis cannot be undone. Created CV modules are kept.`,
    );
    if (!ok) return;
    setError(null);
    start(async () => {
      const r = await deleteStudyAction(studyId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.push("/researcher/studies");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="ghost" size="sm" onClick={onDelete} disabled={pending} className="text-rose-700 hover:bg-rose-50 hover:text-rose-800">
        <Trash2 />
        {pending ? "Deleting…" : "Delete study"}
      </Button>
      {error && <p className="max-w-xs text-right text-xs text-rose-600">{error}</p>}
    </div>
  );
}
