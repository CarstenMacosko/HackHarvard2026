"use server";

import { redirect } from "next/navigation";
import { continueAsDemoResearcher, signIn, signOut, signUp } from "@/lib/auth";
import type { PortalUserRole } from "@/lib/types";

export async function signUpAction(formData: FormData): Promise<{ error?: string }> {
  const role = String(formData.get("role") ?? "participant") as PortalUserRole;
  const result = await signUp({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    displayName: String(formData.get("display_name") ?? ""),
    role,
    inviteCode: String(formData.get("invite_code") ?? "") || undefined,
  });
  if (!result.ok) return { error: result.error };
  redirect(role === "researcher" ? "/researcher" : "/participant");
}

export async function signInAction(formData: FormData): Promise<{ error?: string }> {
  const result = await signIn({
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (!result.ok) return { error: result.error };
  redirect(result.user.role === "researcher" ? "/researcher" : "/participant");
}

export async function signOutAction() {
  await signOut();
  redirect("/auth/sign-in");
}

export async function demoResearcherAction() {
  await continueAsDemoResearcher();
  redirect("/researcher");
}
