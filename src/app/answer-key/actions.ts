"use server";

import { redirect } from "next/navigation";
import {
  grantAccess,
  isAnswerKeyEnabled,
  passwordMatches,
  revokeAccess,
} from "@/lib/answerKeyAuth";

/**
 * Login for the answer key. Returns an error string for the form to show, or
 * redirects on success.
 *
 * The deliberate ~400ms pause on a wrong password is the only brute-force
 * brake here: a per-instance counter would be close to useless on serverless,
 * where consecutive attempts can land on different instances. It costs an
 * attacker time and costs the one legitimate user nothing.
 */
export async function unlockAnswerKey(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  if (!isAnswerKeyEnabled()) return "This page is not configured.";

  const password = String(formData.get("password") ?? "");
  if (!password) return "Enter the password.";

  if (!passwordMatches(password)) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return "That password is not right.";
  }

  await grantAccess();
  redirect("/answer-key");
}

export async function lockAnswerKey(): Promise<void> {
  await revokeAccess();
  redirect("/answer-key");
}
