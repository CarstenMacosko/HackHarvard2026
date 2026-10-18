import { PageHeader } from "@/components/ui";
import { JoinFlow } from "./join-flow";

export const metadata = { title: "Join a study" };

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ code?: string; reset?: string }> }) {
  const { code, reset } = await searchParams;
  return (
    <>
      <PageHeader title="Join your study" description="Use the invite code from your study team. It takes about a minute." />
      {reset && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-600/20">
          We couldn&apos;t find the account this browser was signed in with, so you&apos;ve been signed out. Join again with your invite code.
        </p>
      )}
      <JoinFlow initialCode={code ?? ""} />
    </>
  );
}
