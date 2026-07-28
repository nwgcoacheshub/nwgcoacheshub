import { createClient } from "@/lib/supabaseServer";

type AdminGuardResult =
  | { user: { id: string; email: string | undefined } }
  | { error: string; status: number };

// Server-side only. Confirms the current session belongs to an admin before
// an API route touches the service-role client. Reused by every admin route
// so the check can't drift between them.
export async function requireAdmin(): Promise<AdminGuardResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated.", status: 401 };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") {
    return { error: "Admin access required.", status: 403 };
  }

  return { user: { id: user.id, email: user.email } };
}
