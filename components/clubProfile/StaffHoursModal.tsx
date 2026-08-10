"use client";

import Modal from "@/components/Modal";
import { formatMinutes } from "@/lib/clubProfile/format";
import type { WorkedTotal } from "@/lib/clubProfile/attendance";

/**
 * Hours worked per coach across the current week. Read-only.
 *
 * "Hours worked" rather than just "hours": this counts rows with status
 * 'working' only, so it's deliberately lower than the rota board's shift bars,
 * which are drawn for leave and sick rows too.
 */
export default function StaffHoursModal({
  totals,
  weekRange,
  weekGenerated,
  onClose,
}: {
  totals: WorkedTotal[];
  weekRange: string;
  weekGenerated: boolean;
  onClose: () => void;
}) {
  const grandTotal = totals.reduce((sum, t) => sum + t.minutes, 0);

  return (
    <Modal title="Staff hours this week" onClose={onClose} wide>
      <p className="mb-3 text-[13px] text-slate-light">
        Week of {weekRange} · hours worked, excluding annual leave and sickness.
      </p>

      {!weekGenerated || totals.length === 0 ? (
        <p className="text-sm text-slate">
          {weekGenerated
            ? "No working shifts are rostered for this week yet."
            : "This week's rota hasn't been generated yet, so there are no hours to total."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[12px] font-bold uppercase tracking-[0.4px] text-slate-light">
                <th className="px-4 py-2.5">Coach</th>
                <th className="px-4 py-2.5">Hours worked</th>
              </tr>
            </thead>
            <tbody>
              {totals.map((total) => (
                <tr key={total.coachId} className="border-b border-line">
                  <td className="px-4 py-2.5 font-semibold text-ink">{total.name}</td>
                  <td className="px-4 py-2.5 text-slate">{formatMinutes(total.minutes)}</td>
                </tr>
              ))}
              <tr className="bg-background">
                <td className="px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.4px] text-slate-light">
                  Total
                </td>
                <td className="px-4 py-2.5 font-bold text-ink">
                  {formatMinutes(grandTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
