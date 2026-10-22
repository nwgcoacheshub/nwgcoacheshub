import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { JOB_TITLES, SITES } from "@/lib/profileOptions";

// Secret-key route, so requireCapability() is the whole boundary: an active
// manage_users holder only.
//
// Permissions come from job_title alone. Any `role` in the request body is
// ignored and never written; the column keeps its default until P5 drops it.

export async function POST(request: Request) {
  const guard = await requireCapability("manage_users");
  if ("error" in guard) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const body = await request.json();
  const { email, full_name, job_title, site, temp_password } = body;

  if (!email || !full_name || !job_title || !site || !temp_password) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  if (!JOB_TITLES.includes(job_title)) {
    return NextResponse.json({ error: "Invalid job title." }, { status: 400 });
  }
  if (!SITES.includes(site)) {
    return NextResponse.json({ error: "Invalid site." }, { status: 400 });
  }

  const adminClient = createAdminClient();

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password: temp_password,
    email_confirm: true,
  });

  if (createError || !created.user) {
    return NextResponse.json(
      { error: createError?.message ?? "Failed to create user." },
      { status: 400 }
    );
  }

  const { error: profileError } = await adminClient.from("profiles").insert({
    id: created.user.id,
    email,
    full_name,
    job_title,
    site,
  });

  if (profileError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
