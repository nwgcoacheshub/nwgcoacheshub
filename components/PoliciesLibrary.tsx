"use client";

// The Policies Library list, filters, and admin actions.
//
// One component file for the whole page's interactive surface, following
// UsersTable — which likewise keeps its list and its three modals together
// rather than splitting a single page's parts across files.
//
// Every write goes through the Phase 3 API routes (/api/policies/*), never
// straight to Supabase. Those routes hold the service-role key and are the only
// thing that can reach the `policies` bucket, which has no storage.objects
// policies of its own by design. Reads are the exception: the list itself is a
// plain RLS-gated select, gated in the database by policies_select_authenticated.

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { POLICY_MAX_FILE_BYTES } from "@/lib/policies/constants";
import Modal from "@/components/Modal";
import {
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/formStyles";

export type Policy = {
  id: string;
  title: string;
  tags: string[];
  file_size: number;
  updated_at: string;
};

// The tag vocabulary offered by the filter row and the upload picker. 0023
// deliberately left policies.tags as free text with no check constraint, so
// this list is a UI convention, not a database one — a tag added by hand in the
// Table Editor still stores and still shows on its row, it just won't have a
// filter chip. Filtering matches the literal tag, including "Other".
const POLICY_TAGS = [
  "Safeguarding",
  "HR",
  "Health & Safety",
  "Operations",
  "Gymnastics",
  "Other",
] as const;

const MAX_FILE_MB = Math.round(POLICY_MAX_FILE_BYTES / (1024 * 1024));

const POLICY_COLUMNS = "id, title, tags, file_size, updated_at";

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * "14 Aug 2026". Pinned to UTC for the same reason relativeDay() in
 * lib/clubProfile/format.ts is: this renders on the server and hydrates on the
 * client, and a timezone-dependent date can disagree between the two.
 */
function formatUpdated(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-2.5 py-1 text-[12px] font-bold ${
        active
          ? "border-orange bg-orange-pale text-orange-dark"
          : "border-line bg-card text-slate hover:bg-background"
      }`}
    >
      {label}
    </button>
  );
}

const iconButtonClass =
  "rounded-md border border-line bg-white p-1.5 text-slate-dark hover:bg-background disabled:cursor-not-allowed disabled:opacity-60";

const dangerIconButtonClass =
  "rounded-md border border-line bg-white p-1.5 text-slate-dark hover:border-[#F3B9B9] hover:bg-[#FDECEC] hover:text-[#C25218] disabled:cursor-not-allowed disabled:opacity-60";

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function ReplaceIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
    </svg>
  );
}

export default function PoliciesLibrary({
  initialPolicies,
  isAdmin,
}: {
  initialPolicies: Policy[];
  isAdmin: boolean;
}) {
  const [policies, setPolicies] = useState<Policy[]>(initialPolicies);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string>("All");
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<Policy | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Policy | null>(null);

  const supabase = createClient();

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return policies.filter((policy) => {
      if (needle && !policy.title.toLowerCase().includes(needle)) return false;
      if (activeTag !== "All" && !policy.tags.includes(activeTag)) return false;
      return true;
    });
  }, [policies, search, activeTag]);

  async function refreshPolicies() {
    const { data } = await supabase
      .from("policies")
      .select(POLICY_COLUMNS)
      .order("updated_at", { ascending: false });
    if (data) setPolicies(data);
  }

  async function handleDownload(policy: Policy) {
    setError(null);
    setDownloadingId(policy.id);

    const res = await fetch("/api/policies/signed-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: policy.id }),
    });
    const json = await res.json().catch(() => ({}));
    setDownloadingId(null);

    if (!res.ok) {
      setError(json.error ?? "Could not open that policy.");
      return;
    }

    // The signed URL carries a download disposition, so the browser saves the
    // file and stays on the page. location.assign() rather than window.open()
    // because the open() would follow an await and be treated as an unrequested
    // popup — and rather than setting location.href, which the compiler's
    // immutability rule reads as mutating a value from outside the component.
    window.location.assign(json.url);
  }

  async function handleUpload(payload: {
    title: string;
    tags: string[];
    file: File;
    id?: string;
  }): Promise<string | null> {
    const form = new FormData();
    form.append("title", payload.title);
    form.append("file", payload.file);
    // One field per tag — the route reads these with getAll("tags"). Not a JSON
    // string.
    for (const tag of payload.tags) form.append("tags", tag);
    if (payload.id) form.append("id", payload.id);

    // No Content-Type header: the browser has to set it itself so the multipart
    // boundary is included.
    const res = await fetch("/api/policies/upload", { method: "POST", body: form });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 409) {
        // The route's own message tells the caller to pass an explicit id,
        // which is not something an admin can do from here. The equivalent
        // action in the UI is Replace on the row they meant.
        return "More than one policy already uses that title. Rename this one, or close this and use Replace on the policy you meant to update.";
      }
      return json.error ?? "Upload failed.";
    }

    await refreshPolicies();
    setUploadOpen(false);
    setReplaceTarget(null);
    return null;
  }

  async function handleDelete(policy: Policy): Promise<string | null> {
    const res = await fetch("/api/policies/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: policy.id }),
    });
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      return json.error ?? "Could not delete that policy.";
    }

    await refreshPolicies();
    setDeleteTarget(null);
    return null;
  }

  const hasAny = policies.length > 0;

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-[46ch] text-sm text-slate-light">
          Current policy documents for all coaches. Search or filter by tag to find what
          you need.
        </p>
        {isAdmin && (
          <button
            onClick={() => setUploadOpen(true)}
            className={`${primaryButtonClass} shrink-0`}
          >
            + Upload policy
          </button>
        )}
      </div>

      <div className="relative mb-2.5">
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-light"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search policies by title…"
          aria-label="Search policies by title"
          className="w-full rounded-lg border border-line bg-white py-2 pl-9 pr-3.5 text-sm text-ink placeholder:text-slate-light focus:border-orange focus:outline-none"
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Chip label="All" active={activeTag === "All"} onClick={() => setActiveTag("All")} />
        {POLICY_TAGS.map((tag) => (
          <Chip
            key={tag}
            label={tag}
            active={activeTag === tag}
            onClick={() => setActiveTag(tag)}
          />
        ))}
      </div>

      {error && (
        <div className="mb-3 rounded-lg bg-[#FDEAE0] px-4 py-2.5 text-[13px] font-semibold text-[#C25218]">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        {filtered.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <h3 className="mb-1 text-[15px] font-bold text-ink">
              {hasAny ? "No policies match" : "No policies yet"}
            </h3>
            <p className="text-[13px] text-slate-light">
              {hasAny
                ? "Try a different search, or pick another tag."
                : isAdmin
                  ? "Upload the first one to get started."
                  : "Nothing has been uploaded yet."}
            </p>
          </div>
        ) : (
          filtered.map((policy) => (
            <div
              key={policy.id}
              className="flex flex-col gap-3 border-b border-line px-4 py-3 last:border-b-0 hover:bg-background/60 sm:flex-row sm:items-center sm:gap-3.5"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3.5">
                <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg bg-orange-pale text-[11px] font-extrabold text-orange-dark">
                  PDF
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{policy.title}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-slate-light">
                    {policy.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-background px-2 py-0.5 text-[11px] font-semibold text-slate"
                      >
                        {tag}
                      </span>
                    ))}
                    <span>{formatFileSize(policy.file_size)}</span>
                    <span className="opacity-40">•</span>
                    <span>Updated {formatUpdated(policy.updated_at)}</span>
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {isAdmin && (
                  <button
                    onClick={() => setReplaceTarget(policy)}
                    className={iconButtonClass}
                    title="Replace file"
                    aria-label={`Replace file for ${policy.title}`}
                  >
                    <ReplaceIcon />
                  </button>
                )}
                <button
                  onClick={() => handleDownload(policy)}
                  disabled={downloadingId === policy.id}
                  className={iconButtonClass}
                  title="Download"
                  aria-label={`Download ${policy.title}`}
                >
                  <DownloadIcon />
                </button>
                {isAdmin && (
                  <button
                    onClick={() => setDeleteTarget(policy)}
                    className={dangerIconButtonClass}
                    title="Delete"
                    aria-label={`Delete ${policy.title}`}
                  >
                    <DeleteIcon />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {uploadOpen && (
        <UploadPolicyModal onClose={() => setUploadOpen(false)} onSubmit={handleUpload} />
      )}
      {replaceTarget && (
        <UploadPolicyModal
          policy={replaceTarget}
          onClose={() => setReplaceTarget(null)}
          onSubmit={handleUpload}
        />
      )}
      {deleteTarget && (
        <DeletePolicyModal
          policy={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onSubmit={handleDelete}
        />
      )}
    </>
  );
}

/**
 * Upload, or replace an existing policy's file.
 *
 * Both are the same form and the same endpoint — passing `policy` just
 * pre-fills the fields and sends its id, which is what makes the route replace
 * that row instead of matching on title.
 *
 * A file is required either way. The upload route has no metadata-only path, so
 * there is no way from here to correct a title or a tag without also choosing a
 * PDF.
 */
function UploadPolicyModal({
  policy,
  onClose,
  onSubmit,
}: {
  policy?: Policy;
  onClose: () => void;
  onSubmit: (payload: {
    title: string;
    tags: string[];
    file: File;
    id?: string;
  }) => Promise<string | null>;
}) {
  const [title, setTitle] = useState(policy?.title ?? "");
  const [tags, setTags] = useState<string[]>(policy?.tags ?? []);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function toggleTag(tag: string) {
    setTags((current) =>
      current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]
    );
  }

  // Convenience only — the route re-checks the type and the size, and also
  // checks the file actually starts with a PDF header, which nothing here can
  // see. This just saves an upload round-trip on an obvious mistake.
  function pickFile(candidate: File) {
    if (candidate.type !== "application/pdf") {
      setError("Only PDF files can be uploaded.");
      return;
    }
    if (candidate.size > POLICY_MAX_FILE_BYTES) {
      setError(`That file is too large. The limit is ${MAX_FILE_MB} MB.`);
      return;
    }
    setError(null);
    setFile(candidate);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose a PDF to upload.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const result = await onSubmit({
      title: title.trim(),
      tags,
      file,
      id: policy?.id,
    });
    setSubmitting(false);
    if (result) setError(result);
  }

  return (
    <Modal title={policy ? "Replace policy" : "Upload policy"} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3.5">
        <p className="text-[12.5px] text-slate-light">
          {policy
            ? "Choose a new PDF for this policy. The old file is replaced — there's no version history. You can update the title and tags at the same time."
            : "Uploading with the title of an existing policy replaces that policy's file."}
        </p>

        {error && <p className="text-[13px] font-semibold text-[#C25218]">{error}</p>}

        <div>
          <label className={labelClass}>Title</label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Safeguarding & Child Protection Policy"
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>Tags</label>
          <div className="flex flex-wrap gap-1.5">
            {POLICY_TAGS.map((tag) => (
              <Chip
                key={tag}
                label={tag}
                active={tags.includes(tag)}
                onClick={() => toggleTag(tag)}
              />
            ))}
          </div>
        </div>

        <div>
          <label className={labelClass}>File</label>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) pickFile(dropped);
            }}
            className={`block cursor-pointer rounded-[10px] border-[1.5px] border-dashed px-4 py-5 text-center text-[12.5px] ${
              dragging
                ? "border-orange bg-orange-pale text-orange-dark"
                : "border-line bg-background text-slate-light"
            }`}
          >
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const chosen = e.target.files?.[0];
                if (chosen) pickFile(chosen);
              }}
            />
            {file ? (
              <>
                <strong className="text-ink">{file.name}</strong>
                <br />
                {formatFileSize(file.size)} · click to choose a different file
              </>
            ) : (
              <>
                <strong className="text-orange-dark">Click to choose a PDF</strong> or drag
                it here
                <br />
                PDF only, up to {MAX_FILE_MB} MB
              </>
            )}
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Cancel
          </button>
          <button type="submit" disabled={submitting} className={primaryButtonClass}>
            {submitting ? "Uploading…" : policy ? "Replace file" : "Upload"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeletePolicyModal({
  policy,
  onClose,
  onSubmit,
}: {
  policy: Policy;
  onClose: () => void;
  onSubmit: (policy: Policy) => Promise<string | null>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleDelete() {
    setError(null);
    setSubmitting(true);
    const result = await onSubmit(policy);
    setSubmitting(false);
    if (result) setError(result);
  }

  return (
    <Modal title="Delete policy" onClose={onClose}>
      <div className="space-y-4">
        {error && <p className="text-[13px] font-semibold text-[#C25218]">{error}</p>}
        <p className="text-sm text-slate">
          This removes <b className="font-semibold text-ink">{policy.title}</b> and its file
          for everyone. It can&rsquo;t be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={submitting}
            className={primaryButtonClass}
          >
            {submitting ? "Deleting…" : "Delete policy"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
