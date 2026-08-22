// Policies Library — shared constants for the server-side routes.
//
// POLICY_MAX_FILE_BYTES and POLICY_ALLOWED_MIME_TYPES MUST stay in step with
// supabase/migrations/0024_policies_bucket_hardening.sql, which sets the same
// two values on the `policies` bucket itself (file_size_limit,
// allowed_mime_types). If either changes, change BOTH this file and a new
// migration in the same pass — 0024's own header comment says the same thing
// from the other side.
//
// The duplication is deliberate, not redundant. The bucket limit is enforced by
// the Storage API and is the backstop that still holds if a future route forgets
// to validate; these are checked in our own code before a single byte is written,
// so the caller gets a useful message instead of a raw Storage error, and we
// never spend an upload round-trip on a file we already know is invalid.

export const POLICIES_BUCKET = "policies";

/** 20 MiB. Written as an expression so it reads the same way 0024 writes it. */
export const POLICY_MAX_FILE_BYTES = 20 * 1024 * 1024;

export const POLICY_ALLOWED_MIME_TYPES = ["application/pdf"] as const;

/**
 * How long a download URL stays valid. Short on purpose: the URL is a bearer
 * token — anyone holding it can fetch the document without a session — so it
 * should outlive the click that produced it and little else.
 */
export const POLICY_SIGNED_URL_TTL_SECONDS = 60;

/**
 * The five bytes every conforming PDF begins with ("%PDF-"). Checked against
 * the actual file content, because the MIME type on a multipart upload is a
 * client-supplied string and proves nothing on its own.
 */
export const PDF_MAGIC_BYTES = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;
