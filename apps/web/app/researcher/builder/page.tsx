import { PageHeader } from "@/components/ui";
import { Builder } from "./builder";

export default function BuilderPage() {
  return (
    <>
      <PageHeader
        title="Workflow builder"
        subtitle="Describe a new condition. The builder drafts capture instructions, quality checks, measurements and a validation plan from reusable CV components. A clinician approves before anything goes live."
      />
      <Builder />
    </>
  );
}
