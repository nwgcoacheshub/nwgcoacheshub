"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabaseClient";
import Modal from "@/components/Modal";
import { secondaryButtonClass } from "@/components/formStyles";

// The board's error red (.board-error in rota-board.module.css), as on the
// landing page's "without a coach" chip and bars.
const DANGER_BUTTON =
  "rounded-lg border border-[#f3c9c4] bg-white px-3.5 py-2 text-[13px] font-bold text-[#a02a1c] hover:bg-[#fdecea] disabled:cursor-not-allowed disabled:opacity-60";
const DANGER_PRIMARY =
  "rounded-lg bg-[#a02a1c] px-3.5 py-2 text-[13px] font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";

/**
 * "Delete week" in the landing page's detail panel, for edit_rota holders only.
 * RLS (rota_weekly_rotas_delete_edit_rota_site) is what actually allows it, and
 * the week's roster and classes cascade with the row.
 */
export default function DeleteWeek({
  weekId,
  siteSlug,
  range,
}: {
  weekId: string;
  siteSlug: string;
  /** "9–15 Nov" */
  range: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [navigating, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const busy = saving || navigating;

  function close() {
    // Not while the delete is in flight: cancelling wouldn't undo it.
    if (busy) return;
    setError(null);
    setConfirming(false);
  }

  async function confirmDelete() {
    if (busy) return;
    setError(null);
    setSaving(true);
    // .select() returns the deleted rows, so a delete that matched nothing
    // (already gone, or hidden from this user by RLS) is told apart from one
    // that worked rather than both reporting success.
    const { data, error: deleteError } = await supabase
      .from("rota_weekly_rotas")
      .delete()
      .eq("id", weekId)
      .select("id");
    setSaving(false);

    if (deleteError) {
      setError(`Couldn't delete the week: ${deleteError.message}`);
      return;
    }
    if (!data || data.length !== 1) {
      setError("This week couldn't be deleted. It may already have been removed.");
      startTransition(() => router.refresh());
      return;
    }

    // Back to the clean URL, so the default-week rule picks what's selected
    // next. The refresh covers already being on that URL.
    startTransition(() => {
      router.push(`/rota/${siteSlug}`);
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" className={DANGER_BUTTON} onClick={() => setConfirming(true)}>
        Delete week
      </button>

      {confirming && (
        <Modal title="Delete week" onClose={close}>
          <p className="text-sm text-slate">
            Delete the week of {range}? This removes every class and coach on it.
          </p>

          {error && (
            <div className="mt-4 rounded-lg border border-[#f3c9c4] bg-[#fdecea] px-3 py-[9px] text-[12.5px] text-[#a02a1c]">
              {error}
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" className={secondaryButtonClass} disabled={busy} onClick={close}>
              Cancel
            </button>
            <button type="button" className={DANGER_PRIMARY} disabled={busy} onClick={confirmDelete}>
              {busy ? "Deleting…" : "Delete week"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
