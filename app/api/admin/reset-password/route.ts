import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { isUuid } from "@/lib/policies/validation";

// Secret-key route, so the checks here are the whole boundary.
//
// Caller: an active manage_users holder (requireCapability).
//
// Target: must be an existing Hub profile, must not be the caller, and must not
// have a job_title that holds manage_users — active or not. Otherwise anyone
// with this route could take over an account with the same reach as their own,
// or set a password on a deactivated full-access account that would then
// work the moment it was reactivated. Full-access accounts are reset in the
// Supabase dashboard instead.
//
// The full-access test asks the matrix itself, title_has_capability() (0026),
// through the service-role grant made explicit in 0027 — there is no title list
// in the app to drift from it.

export async function POST(request: Request) {
  const guard = await requireCapability("manage_users");
  if ("error" in guard) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { user_id, new_password } = await request.json();

  if (!user_id || !new_password) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  if (!isUuid(user_id)) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  if (user_id === guard.user.id) {
    return NextResponse.json(
      { error: "You can't reset your own password here." },
      { status: 403 }
    );
  }

  const adminClient = createAdminClient();

  const { data: target, error: lookupError } = await adminClient
    .from("profiles")
    .select("id, job_title")
    .eq("id", user_id)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const { data: fullAccess, error: capError } = await adminClient.rpc("title_has_capability", {
    p_job_title: target.job_title,
    p_cap: "manage_users",
  });

  // Fail closed: if the matrix can't be asked, don't reset.
  if (capError || typeof fullAccess !== "boolean") {
    return NextResponse.json(
      { error: capError?.message ?? "Could not check the target account." },
      { status: 500 }
    );
  }
  if (fullAccess) {
    return NextResponse.json(
      {
        error:
          "Full-access accounts can't be reset here. Reset this password in the Supabase dashboard.",
      },
      { status: 403 }
    );
  }

  const { error } = await adminClient.auth.admin.updateUserById(user_id, {
    password: new_password,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
