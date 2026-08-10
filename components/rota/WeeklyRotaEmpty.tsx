"use client";

import styles from "./rota-board.module.css";
import { useGenerateWeek } from "./useGenerateWeek";

/**
 * Shown when there's no rota_weekly_rotas row for this site and week.
 *
 * First-time generation isn't destructive — there's nothing to overwrite — so
 * it fires straight away with no confirmation step.
 */
export default function WeeklyRotaEmpty({
  siteId,
  siteName,
  weekStart,
  weekRange,
  canEdit,
}: {
  siteId: string;
  siteName: string;
  /** Monday as YYYY-MM-DD — what the RPC is given. */
  weekStart: string;
  /** Same week, for reading, e.g. "4–10 Aug 2026". */
  weekRange: string;
  /**
   * Resolved server-side by getCanEditRota(). upsert_weekly_rota carries the
   * same job_title check since migration 0013, so generating is blocked for a
   * Coach-level account whether or not this button is offered.
   */
  canEdit: boolean;
}) {
  const { generate, pending, error, dismissError } = useGenerateWeek(siteId, weekStart);

  return (
    <div className={styles.root}>
      {error && (
        <div className="board-error">
          <span>Couldn&apos;t generate: {error}</span>
          <button onClick={dismissError} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <div className="max-w-xl rounded-card border border-line bg-card p-5 shadow-card">
        <h2 className="text-base font-bold text-ink">
          No rota generated for this week yet
        </h2>
        <p className="mt-2 text-sm text-slate">
          {siteName} doesn&apos;t have a rota built for the week of {weekRange}.{" "}
          {canEdit
            ? "Generate one from the current Standard Rota template to get started."
            : "Ask a Lead Coach or an admin to generate it from the Standard Rota template."}
        </p>
        <div className="mt-4 flex">
          <button
            className="add-btn"
            disabled={pending || !canEdit}
            title={
              canEdit ? undefined : "Your job title doesn't have rota edit rights."
            }
            onClick={() => generate()}
          >
            {pending ? "Generating…" : "Generate this week's rota"}
          </button>
        </div>
      </div>
    </div>
  );
}
