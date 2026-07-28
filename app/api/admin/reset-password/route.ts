import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if ("error" in guard) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { user_id, new_password } = await request.json();

  if (!user_id || !new_password) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  const adminClient = createAdminClient();

  const { error } = await adminClient.auth.admin.updateUserById(user_id, {
    password: new_password,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
