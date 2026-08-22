"use client";

// The What's New page's whole interactive surface: the dense list, its
// click-to-expand behaviour, and the admin create/edit/delete forms.
//
// One component file for the page, following PoliciesLibrary and UsersTable.
// The CRUD shape — inline forms rather than modals, an inline delete
// confirmation, router.refresh() after each write — is taken from
// components/clubProfile/ClubUpdates.tsx, which writes to club_updates the same
// way this writes to whats_new.
//
// Writes are admin-only in the database (0025's insert/update/delete policies
// check is_active_coach() and is_admin()), so `isAdmin` here only decides
// whether the controls render; it isn't what enforces the rule. A coach who
// forced it true in the browser would have every write refused by RLS.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { formatPublished } from "@/lib/whatsNew/format";
import {
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  rowActionClass,
} from "@/components/formStyles";

export type WhatsNewItem = {
  id: string;
  title: string;
  body: string;
  link_url: string | null;
  link_label: string | null;
  published_at: string;
};

type Draft = { title: string; body: string; linkUrl: string; linkLabel: string };

const EMPTY_DRAFT: Draft = { title: "", body: "", linkUrl: "", linkLabel: "" };

function draftFrom(item: WhatsNewItem): Draft {
  return {
    title: item.title,
    body: item.body,
    linkUrl: item.link_url ?? "",
    linkLabel: item.link_label ?? "",
  };
}

/** Both link columns are nullable — an empty field stores null, not "". */
function nullableTrim(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

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
          rows={4}
          value={draft.body}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <div>
          <label className={labelClass} htmlFor={`${idPrefix}-link-url`}>
            Link URL <span className="font-normal text-slate-light">(optional)</span>
          </label>
          <input
            id={`${idPrefix}-link-url`}
            type="url"
            value={draft.linkUrl}
            onChange={(e) => setDraft({ ...draft, linkUrl: e.target.value })}
            placeholder="https://…"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor={`${idPrefix}-link-label`}>
            Link label <span className="font-normal text-slate-light">(optional)</span>
          </label>
          <input
            id={`${idPrefix}-link-label`}
            type="text"
            value={draft.linkLabel}
            onChange={(e) => setDraft({ ...draft, linkLabel: e.target.value })}
            placeholder="Open link"
            className={inputClass}
          />
        </div>
      </div>
    </>
  );
}

export default function WhatsNewFeed({
  isAdmin,
  currentUserId,
  initialItems,
  focusId,
}: {
  isAdmin: boolean;
  currentUserId: string | null;
  initialItems: WhatsNewItem[];
  /**
   * The item to open and scroll to on arrival, from ?id= on the dashboard
   * panel's links. Already checked against initialItems by the page, so it is
   * either a row that exists or null. Seeds initial state and nothing more.
   */
  focusId: string | null;
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

  // Plain client state, and a set rather than a single id because more than one
  // row may be open at a time. Deliberately not synced to the URL: expanding a
  // row isn't a destination, and a search param would put a history entry behind
  // every click and re-run the server component for a purely local toggle. That
  // is what caused the reload-and-scroll-reset trouble on the meetings feature.
  //
  // focusId only seeds the set, through a lazy initialiser that React runs on
  // the first render and never again. There is deliberately no effect syncing
  // later focusId changes into this state: re-seeding would spring open a row
  // the user had since collapsed. Every visit from the panel is a fresh mount of
  // this route, so there is no case where that matters.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() =>
    focusId ? new Set([focusId]) : new Set()
  );

  // Scrolled to on mount, not on every toggle — the dependency is focusId,
  // which the page derives from the URL and does not change while the page is
  // open. The ref is attached to the focused row only, so with no ?id= there is
  // nothing to scroll and the effect returns immediately.
  const focusRowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!focusId) return;
    focusRowRef.current?.scrollIntoView({ block: "center" });
  }, [focusId]);

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addDraft.title.trim() || !addDraft.body.trim()) return;
    setBusy(true);
    setError(null);

    // published_at is left out on purpose so the column's default now() applies
    // (0025). There is no date field in this form.
    const { error: insertError } = await supabase.from("whats_new").insert({
      title: addDraft.title.trim(),
      body: addDraft.body.trim(),
      link_url: nullableTrim(addDraft.linkUrl),
      link_label: nullableTrim(addDraft.linkLabel),
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
      .from("whats_new")
      .update({
        title: editDraft.title.trim(),
        body: editDraft.body.trim(),
        link_url: nullableTrim(editDraft.linkUrl),
        link_label: nullableTrim(editDraft.linkLabel),
        // No database trigger maintains this — 0025 restates 0009's decision
        // that there is no updated_at trigger convention here — so it has to be
        // set from the writer or the timestamp silently stays at creation.
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
    const { error: deleteError } = await supabase.from("whats_new").delete().eq("id", id);
    setBusy(false);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setConfirmDeleteId(null);
    router.refresh();
  }

  function startEdit(item: WhatsNewItem) {
    setError(null);
    setConfirmDeleteId(null);
    setEditingId(item.id);
    setEditDraft(draftFrom(item));
  }

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-[46ch] text-sm text-slate-light">
          Everything that&apos;s been posted for the club, newest first. Click an item to
          read it in full.
        </p>
        {isAdmin && !adding && (
          <button
            onClick={() => {
              setError(null);
              setAdding(true);
            }}
            className={`${primaryButtonClass} shrink-0`}
          >
            + Add item
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
            <DraftFields draft={addDraft} setDraft={setAddDraft} idPrefix="add-item" />
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
                {busy ? "Posting…" : "Post item"}
              </button>
            </div>
          </form>
        )}

        {initialItems.length === 0 && !adding && (
          <div className="px-5 py-12 text-center">
            <h3 className="mb-1 text-[15px] font-bold text-ink">Nothing posted yet</h3>
            <p className="text-[13px] text-slate-light">
              {isAdmin
                ? "Post the first item to let the club know what's happening."
                : "Nothing has been posted yet."}
            </p>
          </div>
        )}

        {initialItems.map((item) => {
          const expanded = expandedIds.has(item.id);
          const isEditing = editingId === item.id;

          if (isEditing) {
            return (
              <div key={item.id} className="border-b border-line px-5 py-4 last:border-b-0">
                <div className="space-y-3.5">
                  <DraftFields
                    draft={editDraft}
                    setDraft={setEditDraft}
                    idPrefix={`edit-${item.id}`}
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
                      onClick={() => handleSaveEdit(item.id)}
                      className={primaryButtonClass}
                    >
                      {busy ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </div>
              </div>
            );
          }

          return (
            // The whole row is the toggle, so the click handler sits on the
            // container. The title is also a real button so the row is reachable
            // and operable from the keyboard and can carry aria-expanded; it
            // stops propagation so a click on it toggles once rather than twice.
            // Anything else interactive inside the row does the same.
            <div
              key={item.id}
              ref={item.id === focusId ? focusRowRef : null}
              onClick={() => toggleExpanded(item.id)}
              className="flex cursor-pointer items-start gap-2 border-b border-line px-5 py-3 last:border-b-0 hover:bg-background/60"
            >
              {/* Same fixed accent as the dashboard panel, and positioned the
                  same way: a sibling of the text column rather than part of the
                  title line, so the title, the snippet, the expanded body and
                  the confirmation block all share the column's left edge. The
                  dot plus the gap is the whole of the item's indent from the
                  page heading. Outside the title button now, which leaves the
                  button's accessible name as the title alone; it still sits in
                  the always-rendered part of the row, so it looks the same
                  collapsed or expanded. */}
              <span className="mt-[6px] h-[7px] w-[7px] shrink-0 rounded-full bg-orange" />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpanded(item.id);
                    }}
                    className="min-w-0 flex-1 text-left text-sm font-semibold text-ink"
                  >
                    {item.title}
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-[11.5px] text-slate-light">
                      {formatPublished(item.published_at)}
                    </span>
                    {isAdmin && (
                      <div className="flex gap-1.5">
                        <button
                          className={rowActionClass}
                          onClick={(e) => {
                            e.stopPropagation();
                            startEdit(item);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className={rowActionClass}
                          onClick={(e) => {
                            e.stopPropagation();
                            setError(null);
                            setConfirmDeleteId(item.id);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {expanded ? (
                  <>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-[1.5] text-slate">
                      {item.body}
                    </p>
                    {item.link_url && (
                      <a
                        href={item.link_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className={`${secondaryButtonClass} mt-2.5 inline-block`}
                      >
                        {item.link_label || "Open link"}
                      </a>
                    )}
                  </>
                ) : (
                  <p className="mt-0.5 line-clamp-1 text-[13px] text-slate-light">{item.body}</p>
                )}

                {confirmDeleteId === item.id && (
                  // Same mechanism and copy as ClubUpdates' inline confirmation.
                  // The danger button's classes are a literal there rather than a
                  // formStyles export; duplicated verbatim here so the two stay
                  // identical without refactoring ClubUpdates.
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="mt-3 rounded-lg border border-line bg-background px-3.5 py-3"
                  >
                    <p className="text-[13px] font-semibold text-ink">Delete “{item.title}”?</p>
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
                        onClick={() => handleDelete(item.id)}
                        className="rounded-lg bg-[#C25218] px-3.5 py-2 text-[13px] font-bold text-white hover:bg-[#A84614] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busy ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
