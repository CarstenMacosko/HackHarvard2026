import { PageHeader } from "@/components/ui";
import { Builder } from "./builder";

export const metadata = { title: "Workflow builder" };

export default function BuilderPage() {
  return (
    <>
      <PageHeader
        title="Workflow builder"
        description="Describe a new condition. The builder drafts capture instructions, a quality gate, measurements and a validation plan from reusable CV components. A clinician approves before anything goes live."
      />
      <Builder />
    </>
  );
}
