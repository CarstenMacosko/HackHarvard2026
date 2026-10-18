import { redirect } from "next/navigation";

/** Workflow builder removed from the product surface. */
export default function BuilderRedirect() {
  redirect("/researcher/studies");
}
