"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";

export async function login(_prevState: string | undefined, formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return "Invalid email or password.";
  }

  redirect("/");
}
