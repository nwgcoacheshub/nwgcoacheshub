import Link from "next/link";
import type { ReactNode } from "react";
import { DAY_NAMES } from "@/lib/rota/board";
import type { WeekSummary } from "@/lib/rota/landing";
import RotaStatusChip from "./RotaStatusChip";
import AddWeek, { type AddWeekProps } from "./AddWeek";

/**
 * This week and every created week after it, as a row of cards. Each card is a
 * link that selects its week (?week=), so the page stays a server component.
 * `children` is the previous-weeks disclosure, shown under the row. `addWeek`
 * is null for anyone without edit_rota, and then there's no Add week tile.
 */
export default function RotaWeekStrip({
  siteSlug,
  weeks,
  selectedMonday,
  maxClasses,
  addWeek,
  children,
}: {
  siteSlug: string;
  weeks: WeekSummary[];
  selectedMonday: string | null;
  /** Tallest day across every card, so bars compare between weeks. */
  maxClasses: number;
  addWeek: AddWeekProps | null;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-card border border-line bg-card p-4 shadow-card">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h2 className="text-[15px] font-bold text-ink">Weeks</h2>
        <span className="text-xs text-slate-light">
          Bars show classes per day, Monday to Sunday. Red means a class has no coach.
        </span>
      </div>

      {weeks.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-slate">No upcoming weeks have been created.</p>
          {addWeek && <AddWeek variant="button" {...addWeek} />}
        </div>
      ) : (
        <div className="grid auto-cols-[minmax(140px,1fr)] grid-flow-col gap-2.5 overflow-x-auto pb-0.5">
          {weeks.map((w) => {
            const selected = w.monday === selectedMonday;
            return (
              <Link
                key={w.id}
                href={`/rota/${siteSlug}?week=${w.monday}`}
                scroll={false}
                aria-current={selected ? "true" : undefined}
                className={`flex min-w-[130px] flex-col gap-[7px] rounded-[10px] border px-2.5 pb-[9px] pt-2.5 ${
                  selected
                    ? "border-orange bg-card ring-1 ring-orange"
                    : "border-line bg-background hover:border-slate-light"
                }`}
              >
                <span
                  className={`text-[11.5px] font-semibold ${
                    w.offset === 0 ? "text-orange-dark" : "text-slate-light"
                  }`}
                >
                  {w.label}
                </span>
                <span className="text-sm font-bold text-ink">{w.range}</span>
                <span aria-hidden className="grid h-[34px] grid-cols-7 items-end gap-[3px]">
                  {w.days.map((d, i) =>
                    d.classes === 0 ? (
                      <i key={i} className="block h-[3px] bg-line" />
                    ) : (
                      <i
                        key={i}
                        className={`block min-h-[3px] rounded-t-[2px] ${
                          d.withoutCoach > 0 ? "bg-[#a02a1c]" : "bg-status-green"
                        }`}
                        style={{ height: `${Math.round((d.classes / maxClasses) * 100)}%` }}
                      />
                    )
                  )}
                </span>
                <span
                  aria-hidden
                  className="-mt-1 grid grid-cols-7 gap-[3px] text-center text-[9.5px] text-slate-light"
                >
                  {DAY_NAMES.map((name, i) => (
                    <span key={i}>{name[0]}</span>
                  ))}
                </span>
                <RotaStatusChip status={w.status} />
              </Link>
            );
          })}
          {addWeek && <AddWeek variant="tile" {...addWeek} />}
        </div>
      )}

      {children}
    </section>
  );
}
