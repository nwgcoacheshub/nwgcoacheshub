"use client";

import { useMemo, useState } from "react";
import { weeklyDataSource } from "@/lib/rota/rotaDataSource";
import styles from "./rota-board.module.css";
import RotaBoard, {
  type CatalogueItem,
  type Category,
  type ClassRow,
  type RosterRow,
} from "./RotaBoard";
import type { RosterCandidate, RotaPerson } from "@/lib/rota/people";
import type { RotaExportSpec } from "./RotaExportButton";
import { useGenerateWeek } from "./useGenerateWeek";

/**
 * A generated week. Every edit goes to rota_weekly_roster/rota_weekly_classes
 * via the weekly data source, so changing a week leaves the Standard Rota it
 * was copied from alone.
 *
 * Regenerating throws away those edits, so unlike first-time generation it's
 * behind a confirmation step.
 */
export default function WeeklyRotaBoard({
  siteId,
  siteName,
  weeklyRotaId,
  generatedAt,
  weekStart,
  weekRange,
  categories,
  catalogue,
  people,
  rosterCandidates,
  initialRoster,
  initialClasses,
  exportSpec,
  canManageUsers,
  canEdit,
}: {
  siteId: string;
  siteName: string;
  weeklyRotaId: string;
  /** Bumped by the RPC on every run — used to remount the board after one. */
  generatedAt: string;
  weekStart: string;
  weekRange: string;
  categories: Category[];
  catalogue: CatalogueItem[];
  people: RotaPerson[];
  rosterCandidates: RosterCandidate[];
  initialRoster: RosterRow[];
  initialClasses: ClassRow[];
  exportSpec: RotaExportSpec;
  /** manage_users, resolved server-side: makes "Admin › Users" a link. */
  canManageUsers: boolean;
  /**
   * Resolved server-side as edit_rota at this site. Gates regeneration as well
   * as the board itself: upsert_weekly_rota carries the same edit_rota check
   * (0026), so a Coach-level account is rejected by the RPC before any row is
   * touched.
   */
  canEdit: boolean;
}) {
  const dataSource = useMemo(() => weeklyDataSource(weeklyRotaId), [weeklyRotaId]);
  const { generate, pending, error, dismissError } = useGenerateWeek(siteId, weekStart);
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
        key={`${weeklyRotaId}:${generatedAt}`}
        dataSource={dataSource}
        scopeLabel={`Week of ${weekRange}`}
        siteName={siteName}
        categories={categories}
        catalogue={catalogue}
        people={people}
        rosterCandidates={rosterCandidates}
        initialRoster={initialRoster}
        initialClasses={initialClasses}
        exportSpec={exportSpec}
        canManageUsers={canManageUsers}
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
              <h2>Regenerate this week&apos;s rota?</h2>
              <p>
                This replaces everything currently in {siteName}&apos;s rota for the week
                of {weekRange} — including any shift times, cover, or classes changed
                since it was generated. It will be rebuilt from the current Standard Rota
                template. This can&apos;t be undone.
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
                  {pending ? "Regenerating…" : "Regenerate week"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
