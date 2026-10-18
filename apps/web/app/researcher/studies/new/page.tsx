import { PageHeader } from "@/components/ui";
import { listCreatedModules } from "@/lib/created-modules";
import { StudyForm } from "./study-form";

export const metadata = { title: "New study" };
export const dynamic = "force-dynamic";

export default async function NewStudyPage() {
  const created = await listCreatedModules();
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Studies", href: "/researcher/studies" }, { label: "New" }]}
        title="Create a study"
        description="Consent form, required evaluations, and how often each test should be completed."
      />
      <StudyForm
        createdModules={created.map((m) => ({
          id: m.id,
          label: m.label,
          condition: m.condition,
          description: m.description,
          measurements: m.measurements,
        }))}
      />
    </>
  );
}
