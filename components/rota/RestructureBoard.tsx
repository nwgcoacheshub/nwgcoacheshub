"use client";

import { useMemo, useState } from "react";
import { restructureDataSource } from "@/lib/rota/rotaDataSource";
import styles from "./rota-board.module.css";
import RotaBoard, {
  type CatalogueItem,
  type Category,
  type ClassRow,
  type Coach,
  type RosterRow,
} from "./RotaBoard";
import { useGenerateRestructure } from "./useGenerateRestructure";

/**
 * The site's Restructure snapshot. Every edit goes to
 * rota_restructure_roster/rota_restructure_classes via the restructure data
 * source, so changing it leaves the Standard Rota it was copied from alone.
 *
 * There's no date dimension here — one Restructure per site, not one per
 * site+week — so unlike WeeklyRotaBoard there's no week range/nav to carry.
 * PDF export isn't wired up for this view yet; that's a deliberate exclusion
 * for this session rather than an oversight.
 *
 * Regenerating throws away edits made since it was last built, so like the
 * weekly board it's behind a confirmation step.
 */
export default function RestructureBoard({
  siteId,
  siteName,
  restructureId,
  generatedAt,
  categories,
  catalogue,
  initialCoaches,
  initialRoster,
  initialClasses,
  canEdit,
}: {
  siteId: string;
  siteName: string;
  restructureId: string;
  /** Bumped by the RPC on every run — used to remount the board after one. */
  generatedAt: string;
  categories: Category[];
  catalogue: CatalogueItem[];
  initialCoaches: Coach[];
  initialRoster: RosterRow[];
  initialClasses: ClassRow[];
  /**
   * Resolved server-side by getCanEditRota(). Gates regeneration as well as
   * the board itself: upsert_restructure carries the same job_title check, so
   * a Coach-level account is rejected by the RPC before any row is touched.
   */
  canEdit: boolean;
}) {
  const dataSource = useMemo(
    () => restructureDataSource(restructureId),
    [restructureId]
  );
  const { generate, pending, error, dismissError } = useGenerateRestructure(siteId);
  const [confirming, setConfirming] = useState(false);

  function closeConfirm() {
    // Not while the write is in flight — cancelling wouldn't undo it.
    if (pending) return;
    dismissError();
    setConfirming(false);
  }

  async function confirmRegenerate() {
    if (!canEdit) return;
    // Left open on failure so the error is next to the action that caused it.
    if (await generate()) setConfirming(false);
  }

  return (
    <>
      <RotaBoard
        key={`${restructureId}:${generatedAt}`}
        dataSource={dataSource}
        scopeLabel={`${siteName}'s Restructure`}
        siteId={siteId}
        categories={categories}
        catalogue={catalogue}
        initialCoaches={initialCoaches}
        initialRoster={initialRoster}
        initialClasses={initialClasses}
        canEdit={canEdit}
        toolbarExtra={
          <button
            className="btn btn-danger"
            disabled={!canEdit}
            title={
              canEdit ? undefined : "Your job title doesn't have rota edit rights."
            }
            onClick={() => setConfirming(true)}
          >
            Regenerate from Standard Rota
          </button>
        }
      />

      {confirming && (
        <div className={styles.root}>
          <div
            className="overlay"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeConfirm();
            }}
          >
            <div className="modal">
              <h2>Regenerate this restructure?</h2>
              <p>
                This replaces everything currently in {siteName}&apos;s Restructure —
                it will be rebuilt from the current Standard Rota template. This
                can&apos;t be undone.
              </p>

              {error && (
                <div className="board-error" style={{ marginTop: 12, marginBottom: 0 }}>
                  <span>Couldn&apos;t regenerate: {error}</span>
                  <button onClick={dismissError} aria-label="Dismiss">
                    ✕
                  </button>
                </div>
              )}

              <div className="modal-actions">
                <div style={{ flex: 1 }} />
                <button className="btn btn-ghost" disabled={pending} onClick={closeConfirm}>
                  Cancel
                </button>
                <button
                  className="btn btn-danger"
                  disabled={pending}
                  onClick={confirmRegenerate}
                >
                  {pending ? "Regenerating…" : "Regenerate"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
