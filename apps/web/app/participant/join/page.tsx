import { redirect } from "next/navigation";
import { JoinFlow } from "./join-flow";
import { viewAs } from "./actions";

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ as?: string; code?: string }> }) {
  const { as, code } = await searchParams;
  if (as) {
    await viewAs(as);
    redirect("/participant");
  }
  return <JoinFlow initialCode={code ?? ""} photonNumber={process.env.PHOTON_PHONE_NUMBER || "+1 (555) 010-2026"} />;
}
