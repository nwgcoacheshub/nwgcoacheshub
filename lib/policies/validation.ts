// Policies Library — parses and validates the multipart upload form.
//
// Split out of the route so the whole "is this an acceptable document" decision
// sits in one place and can be read without the storage and database plumbing
// around it. Every check here runs before anything is written to storage.
//
// Failures use the same { error, status } shape as lib/admin-guard.ts, so a
// route discriminates the result with `"error" in parsed` exactly as it does
// with a guard result.

import {
  PDF_MAGIC_BYTES,
  POLICY_ALLOWED_MIME_TYPES,
  POLICY_MAX_FILE_BYTES,
} from "@/lib/policies/constants";

export type ValidatedUpload = {
  title: string;
  tags: string[];
  /** Explicit overwrite target, if the caller named one. */
  policyId: string | null;
  bytes: Uint8Array;
  /** Byte length of `bytes` — the measured size, not the client's claim. */
  fileSize: number;
  contentType: string;
};

export type ValidationFailure = { error: string; status: number };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

/**
 * Tags as sent by the form: one `tags` field per tag. Trimmed, blanks dropped,
 * duplicates collapsed, original order kept.
 *
 * No vocabulary check and no length or count cap. 0023 decided deliberately not
 * to constrain the tags column, on the grounds that no tag list has been agreed
 * — inventing one here in the app layer would be the same unilateral decision
 * the migration declined to make, just somewhere harder to find.
 */
function normaliseTags(raw: FormDataEntryValue[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const tag = entry.trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

function startsWithPdfMagic(bytes: Uint8Array): boolean {
  if (bytes.byteLength < PDF_MAGIC_BYTES.length) return false;
  return PDF_MAGIC_BYTES.every((byte, i) => bytes[i] === byte);
}

export async function validateUploadForm(
  form: FormData
): Promise<ValidatedUpload | ValidationFailure> {
  const rawTitle = form.get("title");
  if (typeof rawTitle !== "string" || !rawTitle.trim()) {
    return { error: "A title is required.", status: 400 };
  }
  const title = rawTitle.trim();

  const rawId = form.get("id");
  if (rawId !== null && !isUuid(rawId)) {
    return { error: "Invalid policy id.", status: 400 };
  }
  const policyId = typeof rawId === "string" ? rawId : null;

  const file = form.get("file");
  if (!(file instanceof File)) {
    return { error: "A file is required.", status: 400 };
  }

  // The declared MIME type is checked first because it's free, but it is only
  // the caller's claim about the file — the content check below is what
  // actually establishes this is a PDF.
  if (!POLICY_ALLOWED_MIME_TYPES.includes(file.type as (typeof POLICY_ALLOWED_MIME_TYPES)[number])) {
    return { error: "Only PDF files can be uploaded.", status: 400 };
  }

  // Checked against the declared size before buffering, so an oversized upload
  // is rejected without materialising it in memory, and again against the real
  // byte length after — the second is the one that counts.
  if (file.size > POLICY_MAX_FILE_BYTES) {
    return {
      error: `File is too large. The limit is ${megabytes(POLICY_MAX_FILE_BYTES)}.`,
      status: 400,
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  if (bytes.byteLength === 0) {
    return { error: "File is empty.", status: 400 };
  }
  if (bytes.byteLength > POLICY_MAX_FILE_BYTES) {
    return {
      error: `File is too large. The limit is ${megabytes(POLICY_MAX_FILE_BYTES)}.`,
      status: 400,
    };
  }

  // Content check. A caller can set any content-type it likes on a multipart
  // part, so without this "PDF only" would mean "anything, labelled PDF" —
  // including a file the Storage API would happily accept, since it trusts the
  // same header we send it.
  //
  // This is a strict prefix test. A PDF with bytes before its %PDF- header is
  // malformed but is tolerated by most readers, so if a document that opens
  // fine elsewhere is ever rejected here, this check is why.
  if (!startsWithPdfMagic(bytes)) {
    return {
      error: "That file isn't a PDF. Check the file and try again.",
      status: 400,
    };
  }

  return {
    title,
    tags: normaliseTags(form.getAll("tags")),
    policyId,
    bytes,
    fileSize: bytes.byteLength,
    contentType: file.type,
  };
}
