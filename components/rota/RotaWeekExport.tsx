"use client";

import { useMemo } from "react";
import { makeDirectory, type RosterCandidate, type RotaPerson } from "@/lib/rota/people";
import styles from "./rota-board.module.css";
import RotaExportButton, { type RotaExportSpec } from "./RotaExportButton";
import type { Category, ClassRow, RosterRow } from "./RotaBoard";

export type RotaWeekExportProps = {
  siteName: string;
  people: RotaPerson[];
  rosterCandidates: RosterCandidate[];
  roster: RosterRow[];
  classes: ClassRow[];
  categories: Category[];
  spec: RotaExportSpec;
};

/**
 * "Export week" on the rota landing page. A directory is functions, which can't
 * cross from a server component, so it's built here from the same people and
 * roster lists the board uses. The PDF matches exporting from the week's board.
 */
export default function RotaWeekExport({
  siteName,
  people,
  rosterCandidates,
  roster,
  classes,
  categories,
  spec,
}: RotaWeekExportProps) {
  const directory = useMemo(
    () => makeDirectory(people, rosterCandidates, siteName),
    [people, rosterCandidates, siteName]
  );

  // .root scopes the board's .btn styles the export button uses.
  return (
    <div className={`${styles.root} flex flex-wrap items-center gap-2`}>
      <RotaExportButton
        spec={spec}
        directory={directory}
        roster={roster}
        classes={classes}
        categories={categories}
        label="Export week"
      />
    </div>
  );
}
