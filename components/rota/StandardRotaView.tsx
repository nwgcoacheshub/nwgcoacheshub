"use client";

import { useMemo } from "react";
import { standardDataSource } from "@/lib/rota/rotaDataSource";
import type { RotaExportSpec } from "./RotaExportButton";
import RotaBoard, {
  type CatalogueItem,
  type Category,
  type ClassRow,
  type Coach,
  type RosterRow,
} from "./RotaBoard";

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
  initialCoaches,
  initialRoster,
  initialClasses,
  exportSpec,
}: {
  siteId: string;
  siteName: string;
  categories: Category[];
  catalogue: CatalogueItem[];
  initialCoaches: Coach[];
  initialRoster: RosterRow[];
  initialClasses: ClassRow[];
  exportSpec: RotaExportSpec;
}) {
  const dataSource = useMemo(() => standardDataSource(siteId), [siteId]);

  return (
    <RotaBoard
      dataSource={dataSource}
      scopeLabel={siteName}
      siteId={siteId}
      categories={categories}
      catalogue={catalogue}
      initialCoaches={initialCoaches}
      initialRoster={initialRoster}
      initialClasses={initialClasses}
      exportSpec={exportSpec}
      canManageCoaches
    />
  );
}
