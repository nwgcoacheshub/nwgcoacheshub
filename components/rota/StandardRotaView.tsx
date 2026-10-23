"use client";

import { useMemo } from "react";
import { standardDataSource } from "@/lib/rota/rotaDataSource";
import type { RotaExportSpec } from "./RotaExportButton";
import RotaBoard, {
  type CatalogueItem,
  type Category,
  type ClassRow,
  type RosterRow,
} from "./RotaBoard";
import type { RosterCandidate, RotaPerson } from "@/lib/rota/people";

/**
 * Standard Rota board, wired to the site's template tables.
 *
 * This exists purely because a data source is an object of functions, and
 * functions can't cross the server/client boundary — so the page can't build
 * one and hand it over. It's constructed here instead, on the client.
 */
export default function StandardRotaView({
  siteId,
  siteName,
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
  categories: Category[];
  catalogue: CatalogueItem[];
  people: RotaPerson[];
  rosterCandidates: RosterCandidate[];
  initialRoster: RosterRow[];
  initialClasses: ClassRow[];
  exportSpec: RotaExportSpec;
  /** manage_users, resolved server-side: makes "Admin › Users" a link. */
  canManageUsers: boolean;
  /** edit_rota at this site, resolved server-side; passed straight through. */
  canEdit: boolean;
}) {
  const dataSource = useMemo(() => standardDataSource(siteId), [siteId]);

  return (
    <RotaBoard
      dataSource={dataSource}
      scopeLabel={siteName}
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
    />
  );
}
