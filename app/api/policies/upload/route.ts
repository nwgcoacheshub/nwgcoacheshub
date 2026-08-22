// POST /api/policies/upload — create or replace a policy document.
//
// Admin-only, re-checked server-side. The client's claimed role is never
// consulted: requireActiveAdmin() reads the caller's own profiles row through
// the RLS client and checks role and active itself.
//
// Handles both cases in one route, because from the caller's point of view it's
// one action ("put this document in the library") and the two differ only in
// whether a row already exists:
//
//   * `id` given          -> replace that row's file
//   * no `id`, title matches an existing row -> replace that row's file
//   * otherwise           -> new row
//
// No version history — replacing a document destroys the previous file, which
// is the confirmed intent.

import { NextResponse } from "next/server";
import { requireActiveAdmin } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { POLICIES_BUCKET } from "@/lib/policies/constants";
import { newPolicyObjectPath, removePolicyObject } from "@/lib/policies/storage";
import { validateUploadForm } from "@/lib/policies/validation";

export async function POST(request: Request) {
  // Before request.formData(), so an unauthenticated or non-admin caller never
  // gets us to buffer their upload.
  const guard = await requireActiveAdmin();
  if ("error" in guard) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a multipart form upload." },
      { status: 400 }
    );
  }

  const parsed = await validateUploadForm(form);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const admin = createAdminClient();

  // --- Resolve the overwrite target, if any -------------------------------

  let existing: { id: string; file_path: string } | null = null;

  if (parsed.policyId) {
    const { data, error } = await admin
      .from("policies")
      .select("id, file_path")
      .eq("id", parsed.policyId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Policy not found." }, { status: 404 });
    }
    existing = data;
  } else {
    // Exact, case-sensitive title match. Nothing stops two rows sharing a title
    // (there is no unique constraint on it), so a match set larger than one is
    // ambiguous and is refused rather than guessed at — the caller can say which
    // row it means by passing an explicit id.
    const { data, error } = await admin
      .from("policies")
      .select("id, file_path")
      .eq("title", parsed.title);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (data.length > 1) {
      return NextResponse.json(
        {
          error:
            "More than one policy already uses this title. Pass an explicit id to say which one to replace.",
        },
        { status: 409 }
      );
    }
    existing = data[0] ?? null;
  }

  // --- Upload the new object ----------------------------------------------
  //
  // Always to a new path, even on an overwrite. Writing over the existing key
  // in place would mean the old file is gone before the row is updated, so a
  // failure between the two would leave the row pointing at replaced content.
  //
  // upsert: false — a fresh UUID can't collide, so this can only fire if
  // something has gone badly wrong, and erroring is better than silently
  // clobbering an object another row still points at.

  const objectPath = newPolicyObjectPath();

  const { error: uploadError } = await admin.storage
    .from(POLICIES_BUCKET)
    .upload(objectPath, parsed.bytes, {
      contentType: parsed.contentType,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // --- Point a row at it ---------------------------------------------------
  //
  // Ordering throughout: write the new object, then move the row onto it, then
  // remove the object nothing references any more. At no point does a row point
  // at a file that isn't there. The failure mode this trades for is an orphaned
  // object, which costs storage and is invisible to users — strictly the better
  // of the two.

  if (existing) {
    const { error: updateError } = await admin
      .from("policies")
      .update({
        title: parsed.title,
        tags: parsed.tags,
        file_path: objectPath,
        file_size: parsed.fileSize,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (updateError) {
      // The row still points at the old file and is intact. Roll back the
      // object we just wrote so it doesn't linger unreferenced.
      await removePolicyObject(admin, objectPath);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Only now is the old object unreferenced. The equality guard is defensive
    // — a fresh UUID never equals the old path — but the cost of being wrong
    // here is deleting the file the row now points at.
    if (existing.file_path !== objectPath) {
      const removeError = await removePolicyObject(admin, existing.file_path);
      if (removeError) {
        // Non-fatal: the row and its new file are correct and the download
        // works. The old object is orphaned.
        console.error(
          `[policies] replaced ${existing.id} but could not remove old object ${existing.file_path}: ${removeError}`
        );
      }
    }

    return NextResponse.json({
      success: true,
      id: existing.id,
      file_path: objectPath,
      replaced: true,
    });
  }

  const { data: inserted, error: insertError } = await admin
    .from("policies")
    .insert({
      title: parsed.title,
      tags: parsed.tags,
      file_path: objectPath,
      file_size: parsed.fileSize,
      uploaded_by: guard.user.id,
    })
    .select("id")
    .single();

  if (insertError) {
    await removePolicyObject(admin, objectPath);

    // 23505 is 0024's unique constraint on file_path. Unreachable with a fresh
    // UUID, handled so it surfaces as something readable rather than a raw
    // Postgres error if it ever does.
    const status = insertError.code === "23505" ? 409 : 500;
    return NextResponse.json({ error: insertError.message }, { status });
  }

  return NextResponse.json({
    success: true,
    id: inserted.id,
    file_path: objectPath,
    replaced: false,
  });
}
