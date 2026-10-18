import { redirect } from "next/navigation";

/** Rewards were removed from the participant portal. */
export default function RewardsPage() {
  redirect("/participant");
}
