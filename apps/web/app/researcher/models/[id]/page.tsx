import { redirect } from "next/navigation";

/** Trained model detail pages were removed; keep CV modules + Generate. */
export default function ModelDetailPage() {
  redirect("/researcher/models");
}
