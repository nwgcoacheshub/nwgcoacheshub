"use client";

import styles from "./rota-board.module.css";
import { useGenerateRestructure } from "./useGenerateRestructure";

/**
 * Shown when there's no rota_restructures row for this site yet.
 *
 * First-time generation isn't destructive — there's nothing to overwrite — so
 * it fires straight away with no confirmation step, same as WeeklyRotaEmpty.
 */
export default function RestructureEmpty({
  siteId,
  siteName,
  canEdit,
}: {
  siteId: string;
  siteName: string;
  /**
   * Resolved server-side by getCanEditRota(). upsert_restructure carries the
   * same job_title check, so generating is blocked for a Coach-level account
   * whether or not this button is offered.
   */
  canEdit: boolean;
}) {
  const { generate, pending, error, dismissError } = useGenerateRestructure(siteId);

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
          No restructure built yet for {siteName}
        </h2>
        <p className="mt-2 text-sm text-slate">
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
            {pending ? "Generating…" : "Generate restructure"}
          </button>
        </div>
      </div>
    </div>
  );
}
