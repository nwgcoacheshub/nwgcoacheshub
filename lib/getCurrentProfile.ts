import { cache } from "react";
import { createClient } from "@/lib/supabaseServer";

export const getCurrentProfile = cache(async () => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, job_title, site, role, active")
    .eq("id", user.id)
    .single();

  return { user, profile };
});
