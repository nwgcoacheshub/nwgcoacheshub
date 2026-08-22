// POST /api/policies/delete — remove a policy document and its row.
//
// Admin-only, re-checked server-side, matching 0023's policies_delete_admin_only
// (`is_active_coach() and is_admin()`).

import { NextResponse } from "next/server";
import { requireActiveAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { removePolicyObject } from "@/lib/policies/storage";
import { isUuid } from "@/lib/policies/validation";

export async function POST(request: Request) {
  const guard = await requireActiveAdmin();
  if ("error" in guard) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const id = (body as { id?: unknown } | null)?.id;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid policy id." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: existing, error: lookupError } = await admin
    .from("policies")
    .select("id, file_path")
    .eq("id", id)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: "Policy not found." }, { status: 404 });
  }

  // Row first, then the object — the same ordering rule the upload route
  // follows, for the same reason. Removing the object first and then failing to
  // delete the row would leave a row in the library pointing at a file that
  // isn't there, which every coach sees as a broken download. This way round
  // the worst case is an orphaned object: invisible, and costing only storage.
  const { error: deleteError } = await admin
    .from("policies")
    .delete()
    .eq("id", existing.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const removeError = await removePolicyObject(admin, existing.file_path);
  if (removeError) {
    // Non-fatal: the row is gone, so the document has left the library as far
    // as anyone using it is concerned.
    console.error(
      `[policies] deleted row ${existing.id} but could not remove object ${existing.file_path}: ${removeError}`
    );
  }

  return NextResponse.json({ success: true });
}
