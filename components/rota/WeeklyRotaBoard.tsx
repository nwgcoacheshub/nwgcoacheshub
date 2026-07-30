"use client";

import { useMemo, useState } from "react";
import { weeklyDataSource } from "@/lib/rota/rotaDataSource";
import styles from "./rota-board.module.css";
import RotaBoard, {
  type CatalogueItem,
  type Category,
  type ClassRow,
  type Coach,
  type RosterRow,
} from "./RotaBoard";
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
  initialCoaches,
  initialRoster,
  initialClasses,
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
  initialCoaches: Coach[];
  initialRoster: RosterRow[];
  initialClasses: ClassRow[];
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
    // Left open on failure so the error is next to the action that caused it.
    if (await generate()) setConfirming(false);
  }

  return (
    <>
      <RotaBoard
        key={`${weeklyRotaId}:${generatedAt}`}
        dataSource={dataSource}
        scopeLabel={`Week of ${weekRange}`}
        siteId={siteId}
        categories={categories}
        catalogue={catalogue}
        initialCoaches={initialCoaches}
        initialRoster={initialRoster}
        initialClasses={initialClasses}
        toolbarExtra={
          <button className="btn btn-danger" onClick={() => setConfirming(true)}>
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
