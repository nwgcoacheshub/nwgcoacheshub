// POST /api/policies/signed-url — mint a short-lived download URL.
//
// This is the read-side access check for the whole feature. The `policies`
// bucket has no storage.objects policies (0023), so no browser session can
// reach a document directly; the only way in is this route, and the only thing
// standing between a caller and a file is the guard below.
//
// Open to any ACTIVE coach, not just admins — reading policy is the point of
// the library. That matches policies_select_authenticated (0023), which gates
// select on is_active_coach() alone.
//
// POST rather than GET with a query string, deliberately. The response carries
// a bearer credential: anyone holding the signed URL can fetch the document
// without a session for as long as it lives. A GET would put the policy id in
// browser history, referrer headers and access logs, and make the response
// cacheable.

import { NextResponse } from "next/server";
import { requireActiveCoach } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { createClient } from "@/lib/supabaseServer";
import {
  POLICIES_BUCKET,
  POLICY_SIGNED_URL_TTL_SECONDS,
} from "@/lib/policies/constants";
import { downloadFilenameFor } from "@/lib/policies/storage";
import { isUuid } from "@/lib/policies/validation";

export async function POST(request: Request) {
  const guard = await requireActiveCoach();
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

  // Read the row through the RLS client, not the service-role one. The guard
  // above has already established the caller is an active coach; doing the
  // lookup this way makes the database re-establish it independently, via
  // policies_select_authenticated. Two gates, one of which is the same gate the
  // rest of the app relies on. A deactivated caller gets no row and so no URL,
  // even if the guard were ever loosened.
  const supabase = await createClient();

  const { data: policy, error } = await supabase
    .from("policies")
    .select("title, file_path")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!policy) {
    return NextResponse.json({ error: "Policy not found." }, { status: 404 });
  }

  // The service-role client is used for this call and nothing else — signing is
  // the one part a client session cannot do for itself.
  const admin = createAdminClient();

  const { data: signed, error: signError } = await admin.storage
    .from(POLICIES_BUCKET)
    .createSignedUrl(policy.file_path, POLICY_SIGNED_URL_TTL_SECONDS, {
      download: downloadFilenameFor(policy.title),
    });

  if (signError || !signed) {
    return NextResponse.json(
      { error: signError?.message ?? "Could not create a download link." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    url: signed.signedUrl,
    expires_in: POLICY_SIGNED_URL_TTL_SECONDS,
  });
}
