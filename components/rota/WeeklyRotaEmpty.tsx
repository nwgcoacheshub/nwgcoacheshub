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
}: {
  siteId: string;
  siteName: string;
  /** Monday as YYYY-MM-DD — what the RPC is given. */
  weekStart: string;
  /** Same week, for reading, e.g. "4–10 Aug 2026". */
  weekRange: string;
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
          {siteName} doesn&apos;t have a rota built for the week of {weekRange}. Generate
          one from the current Standard Rota template to get started.
        </p>
        <div className="mt-4 flex">
          <button className="add-btn" disabled={pending} onClick={() => generate()}>
            {pending ? "Generating…" : "Generate this week's rota"}
          </button>
        </div>
      </div>
    </div>
  );
}
