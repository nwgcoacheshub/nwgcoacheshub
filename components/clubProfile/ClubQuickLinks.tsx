"use client";

import { useState } from "react";
import HeroesModal, { type HeroSummary } from "./HeroesModal";
import StaffHoursModal from "./StaffHoursModal";
import StaffRolesModal, { type RoleGroup, type SiteAccount } from "./StaffRolesModal";
import type { WorkedTotal } from "@/lib/clubProfile/attendance";

type Panel = "heroes" | "hours" | "roles";

const TILES: { key: Panel; title: string; subtitle: string; icon: React.ReactNode }[] = [
  {
    key: "heroes",
    title: "Heroes tracker",
    subtitle: "Directory and hours logged",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3l2.4 5.2 5.6.7-4.1 3.9 1 5.6-4.9-2.8-4.9 2.8 1-5.6L4 8.9l5.6-.7Z" />
      </svg>
    ),
  },
  {
    key: "hours",
    title: "Staff hours",
    subtitle: "Hours worked this week",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </svg>
    ),
  },
  {
    key: "roles",
    title: "Staff roles",
    subtitle: "Who looks after what",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      </svg>
    ),
  },
];

/** The three quick-link tiles and the modals behind them. */
export default function ClubQuickLinks({
  siteId,
  isAdmin,
  currentUserId,
  heroes,
  workedTotals,
  weekRange,
  weekGenerated,
  roleGroups,
  siteAccounts,
}: {
  siteId: string;
  isAdmin: boolean;
  currentUserId: string | null;
  heroes: HeroSummary[];
  workedTotals: WorkedTotal[];
  weekRange: string;
  weekGenerated: boolean;
  roleGroups: RoleGroup[];
  siteAccounts: SiteAccount[];
}) {
  const [open, setOpen] = useState<Panel | null>(null);

  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h2 className="whitespace-nowrap text-sm font-bold uppercase tracking-[0.4px] text-slate-light">
          Quick links
        </h2>
        <span className="h-px flex-1 bg-line" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TILES.map((tile) => (
          <button
            key={tile.key}
            onClick={() => setOpen(tile.key)}
            className="flex items-center gap-3 rounded-card border border-line bg-card p-4 text-left shadow-card hover:border-orange-light"
          >
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-orange-pale text-orange">
              {tile.icon}
            </span>
            <span>
              <span className="block text-sm font-bold text-ink">{tile.title}</span>
              <span className="block text-[12.5px] text-slate-light">{tile.subtitle}</span>
            </span>
          </button>
        ))}
      </div>

      {open === "heroes" && (
        <HeroesModal
          heroes={heroes}
          currentUserId={currentUserId}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "hours" && (
        <StaffHoursModal
          totals={workedTotals}
          weekRange={weekRange}
          weekGenerated={weekGenerated}
          onClose={() => setOpen(null)}
        />
      )}
      {open === "roles" && (
        <StaffRolesModal
          roleGroups={roleGroups}
          isAdmin={isAdmin}
          siteId={siteId}
          siteAccounts={siteAccounts}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}
