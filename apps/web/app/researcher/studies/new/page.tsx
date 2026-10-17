import { PageHeader } from "@/components/ui";
import { StudyForm } from "./study-form";

export const metadata = { title: "New study" };

export default function NewStudyPage() {
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Studies", href: "/researcher/studies" }, { label: "New" }]}
        title="Create a study"
        description="Consent form, required evaluations, and the message intervals Photon will send after the participant texts you."
      />
      <StudyForm />
    </>
  );
}
