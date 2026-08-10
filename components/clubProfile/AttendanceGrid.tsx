import { DAY_NAMES } from "@/lib/rota/board";
import { statusLabel, type AttendanceRow } from "@/lib/clubProfile/attendance";
import type { CoachStatus } from "@/lib/rota/board";

const STATUS_STYLES: Record<CoachStatus, string> = {
  working: "bg-[#E6F5EC] text-status-green",
  leave: "bg-[#FDF2DC] text-status-amber",
  sick: "bg-[#FDEAE0] text-[#C25218]",
};

function StatusBadge({ status }: { status: CoachStatus }) {
  return (
    <span
      className={`inline-block min-w-[38px] rounded-full px-2 py-1 text-[11px] font-bold ${STATUS_STYLES[status]}`}
    >
      {statusLabel(status)}
    </span>
  );
}

/**
 * Read-only Mon–Sun attendance for the current week. Status is owned by the
 * Rota tool — there's no edit affordance here on purpose.
 */
export default function AttendanceGrid({
  rows,
  weekRange,
  weekGenerated,
  siteSlug,
}: {
  rows: AttendanceRow[];
  weekRange: string;
  /** False when upsert_weekly_rota hasn't run for this site and week yet. */
  weekGenerated: boolean;
  siteSlug: string;
}) {
  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="whitespace-nowrap text-sm font-bold uppercase tracking-[0.4px] text-slate-light">
          This week
        </h2>
        <span className="h-px flex-1 bg-line" />
        <span className="whitespace-nowrap text-[13px] text-slate-light">{weekRange}</span>
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        {!weekGenerated || rows.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm font-semibold text-ink">
              {weekGenerated
                ? "No coaches rostered this week"
                : "This week's rota hasn't been generated yet"}
            </p>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] text-slate-light">
              {weekGenerated
                ? "The week exists but has no roster rows yet. Attendance appears here once coaches are on it."
                : "Attendance appears here once the week has been generated in the Rota tool."}
            </p>
            <a
              href={`/rota/${siteSlug}/week`}
              className="mt-3 inline-block text-[13px] font-bold text-orange"
            >
              Open the rota →
            </a>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[12px] font-bold uppercase tracking-[0.4px] text-slate-light">
                  <th className="px-5 py-3">Coach</th>
                  {DAY_NAMES.map((day) => (
                    <th key={day} className="px-3 py-3 text-center">
                      {day.slice(0, 3)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.coachId} className="border-b border-line last:border-b-0">
                    <td className="whitespace-nowrap px-5 py-3 font-semibold text-ink">
                      {row.name}
                    </td>
                    {row.days.map((status, i) => (
                      <td key={i} className="px-3 py-3 text-center">
                        {status ? (
                          <StatusBadge status={status} />
                        ) : (
                          <span className="text-slate-light">·</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
