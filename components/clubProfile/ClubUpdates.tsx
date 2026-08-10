"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { relativeDay } from "@/lib/clubProfile/format";
import {
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  rowActionClass,
} from "@/components/formStyles";

export type ClubUpdate = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
  /** Already resolved server-side through resolve_profile_names(). */
  authorName: string;
};

type Draft = { title: string; body: string; pinned: boolean };

const EMPTY_DRAFT: Draft = { title: "", body: "", pinned: false };

function DraftFields({
  draft,
  setDraft,
  idPrefix,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  idPrefix: string;
}) {
  return (
    <>
      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-title`}>
          Title
        </label>
        <input
          id={`${idPrefix}-title`}
          type="text"
          required
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor={`${idPrefix}-body`}>
          Body
        </label>
        <textarea
          id={`${idPrefix}-body`}
          required
          rows={3}
          value={draft.body}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          className={inputClass}
        />
      </div>
      <label className="flex items-center gap-2 text-[13px] font-semibold text-slate-dark">
        <input
          type="checkbox"
          checked={draft.pinned}
          onChange={(e) => setDraft({ ...draft, pinned: e.target.checked })}
          className="h-3.5 w-3.5 accent-orange"
        />
        Pin to the top
      </label>
    </>
  );
}

/**
 * The club's updates feed. Pinned items first, then newest — the order comes
 * from the server query, so this component never re-sorts.
 *
 * Writes are admin-only in the database too (0009's insert/update/delete
 * policies check is_admin()), so `isAdmin` here only decides whether the
 * controls render; it isn't what enforces the rule.
 */
export default function ClubUpdates({
  siteId,
  isAdmin,
  currentUserId,
  initialUpdates,
}: {
  siteId: string;
  isAdmin: boolean;
  currentUserId: string | null;
  initialUpdates: ClubUpdate[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addDraft.title.trim() || !addDraft.body.trim()) return;
    setBusy(true);
    setError(null);

    const { error: insertError } = await supabase.from("club_updates").insert({
      site_id: siteId,
      title: addDraft.title.trim(),
      body: addDraft.body.trim(),
      pinned: addDraft.pinned,
      created_by: currentUserId,
    });

    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setAddDraft(EMPTY_DRAFT);
    setAdding(false);
    router.refresh();
  }

  async function handleSaveEdit(id: string) {
    if (!editDraft.title.trim() || !editDraft.body.trim()) return;
    setBusy(true);
    setError(null);

    const { error: updateError } = await supabase
      .from("club_updates")
      .update({
        title: editDraft.title.trim(),
        body: editDraft.body.trim(),
        pinned: editDraft.pinned,
        // No database trigger maintains this (confirmed when 0009 was written),
        // so it has to be set here or the timestamp silently stays at creation.
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  async function handleDelete(id: string) {
    setBusy(true);
    setError(null);
    const { error: deleteError } = await supabase
      .from("club_updates")
      .delete()
      .eq("id", id);
    setBusy(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setConfirmDeleteId(null);
    router.refresh();
  }

  function startEdit(update: ClubUpdate) {
    setError(null);
    setEditingId(update.id);
    setEditDraft({ title: update.title, body: update.body, pinned: update.pinned });
  }

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="whitespace-nowrap text-sm font-bold uppercase tracking-[0.4px] text-slate-light">
          Club updates
        </h2>
        <span className="h-px flex-1 bg-line" />
        {isAdmin && !adding && (
          <button
            onClick={() => {
              setError(null);
              setAdding(true);
            }}
            className={primaryButtonClass}
          >
            + Add update
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        {error && (
          <div className="border-b border-line bg-[#FDEAE0] px-5 py-2.5 text-[13px] font-semibold text-[#C25218]">
            {error}
          </div>
        )}

        {isAdmin && adding && (
          <form onSubmit={handleAdd} className="space-y-3.5 border-b border-line px-5 py-4">
            <DraftFields draft={addDraft} setDraft={setAddDraft} idPrefix="add-update" />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setAddDraft(EMPTY_DRAFT);
                }}
                className={secondaryButtonClass}
              >
                Cancel
              </button>
              <button type="submit" disabled={busy} className={primaryButtonClass}>
                {busy ? "Posting…" : "Post update"}
              </button>
            </div>
          </form>
        )}

        {initialUpdates.length === 0 && !adding && (
          <div className="px-5 py-8 text-center">
            <p className="text-sm font-semibold text-ink">No updates yet</p>
            <p className="mt-1.5 text-[13px] text-slate-light">
              {isAdmin
                ? "Post one to let the club know what's happening."
                : "Nothing has been posted for this club yet."}
            </p>
          </div>
        )}

        {initialUpdates.map((update) => (
          <article key={update.id} className="border-b border-line px-5 py-4 last:border-b-0">
            {editingId === update.id ? (
              <div className="space-y-3.5">
                <DraftFields
                  draft={editDraft}
                  setDraft={setEditDraft}
                  idPrefix={`edit-${update.id}`}
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className={secondaryButtonClass}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleSaveEdit(update.id)}
                    className={primaryButtonClass}
                  >
                    {busy ? "Saving…" : "Save changes"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {update.pinned && (
                      <span className="rounded-full bg-orange-pale px-2 py-1 text-[11px] font-bold text-orange">
                        Pinned
                      </span>
                    )}
                    <h3 className="text-[15px] font-bold text-ink">{update.title}</h3>
                  </div>
                  {isAdmin && (
                    <div className="flex flex-wrap gap-1.5">
                      <button className={rowActionClass} onClick={() => startEdit(update)}>
                        Edit
                      </button>
                      <button
                        className={rowActionClass}
                        onClick={() => {
                          setError(null);
                          setConfirmDeleteId(update.id);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                <p className="mt-1.5 whitespace-pre-wrap text-sm leading-[1.5] text-slate">
                  {update.body}
                </p>
                <p className="mt-2 text-[11.5px] text-slate-light">
                  {update.authorName} · {relativeDay(update.created_at)}
                </p>

                {confirmDeleteId === update.id && (
                  <div className="mt-3 rounded-lg border border-line bg-background px-3.5 py-3">
                    <p className="text-[13px] font-semibold text-ink">
                      Delete “{update.title}”?
                    </p>
                    <p className="mt-1 text-[12.5px] text-slate-light">
                      This can&apos;t be undone.
                    </p>
                    <div className="mt-2.5 flex justify-end gap-2">
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className={secondaryButtonClass}
                      >
                        Cancel
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => handleDelete(update.id)}
                        className="rounded-lg bg-[#C25218] px-3.5 py-2 text-[13px] font-bold text-white hover:bg-[#A84614] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busy ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
