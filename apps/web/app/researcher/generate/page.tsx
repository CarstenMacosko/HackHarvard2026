import { PageHeader } from "@/components/ui";
import { ModuleGenerator } from "@/components/module-generator";

export const metadata = { title: "Generate CV module" };
export const dynamic = "force-dynamic";

export default function GenerateModulePage() {
  return (
    <>
      <PageHeader
        title="Generate a CV module"
        description="Factory Droid drafts a task-specific analyzer from our MediaPipe modules; Daytona runs ~20 parameter experiments in parallel sandboxes. Approve a successful module into the registry for participant uploads."
      />
      <ModuleGenerator />
    </>
  );
}
