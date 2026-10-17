import { PageHeader } from "@/components/ui";
import { listStudies } from "@/lib/queries";
import { TrainingWizard } from "./wizard";

export const metadata = { title: "Train a model" };

export default async function NewModelPage() {
  const studies = await listStudies();
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Model registry", href: "/researcher/models" }, { label: "Train a model" }]}
        title="Train a study-specific model"
        description="Turn your clinicians' ratings into a measurement. The browser extracts each capture's feature vector with a built-in CV module, fits a cross-validated ridge model, and registers it so it runs on every new capture."
      />
      <TrainingWizard studies={studies.map((s) => ({ id: s.id, name: s.name, condition: s.condition }))} />
    </>
  );
}
