import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { JoinFlow } from "./join-flow";

export const metadata = { title: "Join a study" };

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ as?: string; code?: string }> }) {
  const { as, code } = await searchParams;
  // cookies can only be set from a route handler or server action, not during render
  if (as) redirect(`/participant/view-as?id=${encodeURIComponent(as)}`);
  return (
    <>
      <PageHeader title="Join your study" description="Use the invite code from your study team. It takes about a minute." />
      <JoinFlow initialCode={code ?? ""} photonNumber={process.env.PHOTON_PHONE_NUMBER || "+1 (555) 010-2026"} />
    </>
  );
}
