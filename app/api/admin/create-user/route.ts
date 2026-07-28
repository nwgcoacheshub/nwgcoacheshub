import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { ROLES, JOB_TITLES, SITES } from "@/lib/profileOptions";

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const body = await request.json();
  const { email, full_name, role, job_title, site, temp_password } = body;

  if (!email || !full_name || !role || !job_title || !site || !temp_password) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
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
    role,
    job_title,
    site,
  });

  if (profileError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
