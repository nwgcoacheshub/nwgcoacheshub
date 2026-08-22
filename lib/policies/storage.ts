// Policies Library — storage helpers shared by the upload and delete routes.
//
// Server-only: every function here takes the service-role client. The `policies`
// bucket has no storage.objects RLS policies by design (0023), so the service
// role is the only thing that can reach it at all.

import { randomUUID } from "node:crypto";
import type { createAdminClient } from "@/lib/supabaseAdmin";
import { POLICIES_BUCKET } from "@/lib/policies/constants";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * A fresh object key for an upload.
 *
 * UUID-based, never the original filename: the filename is caller-controlled
 * and would otherwise put user input into an object path, and two documents
 * that happen to share a name would collide. A v4 UUID also means the key
 * cannot collide with the row being replaced on an overwrite, or with any other
 * row — which is what keeps 0024's unique constraint on file_path satisfied
 * without needing to check for a clash first.
 */
export function newPolicyObjectPath(): string {
  return `${randomUUID()}.pdf`;
}

/**
 * Removes an object, returning an error message rather than throwing so callers
 * can decide whether the failure matters. It usually doesn't: every call site
 * here removes an object that is already unreferenced, so a failure leaves an
 * orphan taking up space rather than anything a user can see.
 */
export async function removePolicyObject(
  admin: AdminClient,
  path: string
): Promise<string | null> {
  const { error } = await admin.storage.from(POLICIES_BUCKET).remove([path]);
  return error ? error.message : null;
}

/**
 * A human-readable filename for the download, derived from the title.
 *
 * Needed because the object key is a UUID — without this the browser saves
 * "9f3c….pdf". Reduced to a conservative charset: the value ends up in the
 * signed URL's download parameter and from there in a Content-Disposition
 * header, so quotes, newlines and path separators are stripped rather than
 * escaped.
 */
export function downloadFilenameFor(title: string): string {
  const cleaned = title
    .replace(/[^A-Za-z0-9 ._-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100)
    .trim();

  return `${cleaned || "policy"}.pdf`;
}
