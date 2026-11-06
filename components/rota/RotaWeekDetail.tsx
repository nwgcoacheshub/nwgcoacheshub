import Link from "next/link";
import { DAY_NAMES } from "@/lib/rota/board";
import type { WeekSummary } from "@/lib/rota/landing";
import { primaryButtonClass } from "@/components/formStyles";
import RotaStatusChip from "./RotaStatusChip";
import RotaWeekExport, { type RotaWeekExportProps } from "./RotaWeekExport";
import DeleteWeek from "./DeleteWeek";

/**
 * The selected week: its numbers, then a row per day. Read only, apart from
 * Delete week for edit_rota holders (`canDelete`).
 */
export default function RotaWeekDetail({
  siteSlug,
  week,
  exportProps,
  canDelete,
}: {
  siteSlug: string;
  week: WeekSummary;
  exportProps: RotaWeekExportProps;
  canDelete: boolean;
}) {
  const stats = [
    { label: "Coaches working", value: week.totals.coachesWorking, warn: false },
    { label: "Classes", value: week.totals.classes, warn: false },
    { label: "Covered by another coach", value: week.totals.covered, warn: false },
    { label: "Without a coach", value: week.totals.withoutCoach, warn: week.totals.withoutCoach > 0 },
  ];

  return (
    <section
      id="week-detail"
      className="scroll-mt-4 rounded-card border border-line bg-card p-4 shadow-card"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <div className="text-xs font-semibold text-slate-light">{week.label}</div>
          <h2 className="text-xl font-bold tracking-[-0.2px] text-ink">Week of {week.range}</h2>
          <div className="mt-1">
            <RotaStatusChip status={week.status} />
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Keyed on the week so its confirm modal can't stay open over the
              week selected after a delete. */}
          {canDelete && (
            <DeleteWeek key={week.id} weekId={week.id} siteSlug={siteSlug} range={week.range} />
          )}
          <RotaWeekExport {...exportProps} />
          <Link
            href={`/rota/${siteSlug}/week/${week.monday}`}
            className={`inline-block ${primaryButtonClass}`}
          >
            Open week
          </Link>
        </div>
      </div>

      <div className="my-3.5 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-card px-3 py-2.5">
            <b className={`block text-xl font-bold ${s.warn ? "text-[#a02a1c]" : "text-ink"}`}>
              {s.value}
            </b>
            <span className="text-xs text-slate">{s.label}</span>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-[10px] border border-line">
        {week.days.map((day, d) => (
          <div
            key={d}
            className="grid grid-cols-[70px_1fr] items-center gap-3 border-t border-line px-3 py-[9px] text-[13px] first:border-t-0 md:grid-cols-[92px_1fr_auto]"
          >
            <div className="font-bold text-ink">
              {DAY_NAMES[d].slice(0, 3)}
              <small className="block text-[11.5px] font-medium text-slate-light">{day.date}</small>
            </div>
            {day.classes === 0 ? (
              <div className="text-slate-light">No classes</div>
            ) : (
              <div>
                {day.coaches.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {day.coaches.map((c) => (
                      <span
                        key={c.id}
                        className="rounded-md border border-line bg-background px-[7px] py-px text-xs text-ink"
                      >
                        {c.label}
                        {c.cover ? " (cover)" : ""}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-[3px] text-xs text-slate-light">
                  {day.classes === 1 ? "1 class" : `${day.classes} classes`}
                </div>
              </div>
            )}
            {day.withoutCoach > 0 ? (
              <span className="col-start-2 text-xs font-semibold text-[#a02a1c] md:col-start-auto">
                {day.withoutCoach} without a coach
              </span>
            ) : day.covered > 0 ? (
              <span className="col-start-2 text-xs font-semibold text-slate md:col-start-auto">
                {day.covered} covered
              </span>
            ) : (
              <span className="hidden md:block" />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
