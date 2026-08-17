"use client";

import { useState } from "react";
import { meetingWhenLabel, weekPatternLabel } from "@/lib/clubProfile/format";
import { parseWeekDate, weekDayLabels } from "@/lib/rota/week";
import {
  CYCLE_WEEK_COUNT,
  type MeetingCategoryGroup,
  type MeetingOccurrenceGroup,
} from "@/lib/clubProfile/meetings";
import type { RosterCoach } from "@/lib/clubProfile/attendance";
import { primaryButtonClass } from "@/components/formStyles";
import ManageMeetingsModal from "./ManageMeetingsModal";

/**
 * Per-site meetings schedule: a Weekly/Monthly read view plus, for Lead Coach
 * and above, the meeting-definitions modal.
 *
 * Both views are handed down already built, so the toggle is plain client
 * state — switching it re-renders the table without a fetch, a navigation or a
 * scroll reset.
 */
export default function ClubMeetings({
  siteId,
  canEdit,
  cycleWeekNumber,
  weeklyGroups,
  monthlyGroups,
  manageGroups,
  coaches,
}: {
  siteId: string;
  canEdit: boolean;
  cycleWeekNumber: number | null;
  weeklyGroups: MeetingCategoryGroup[];
  monthlyGroups: MeetingOccurrenceGroup[];
  manageGroups: MeetingCategoryGroup[];
  coaches: RosterCoach[];
}) {
  const [view, setView] = useState<"weekly" | "monthly">("weekly");
  const [manageOpen, setManageOpen] = useState(false);

  const weeklyRows = weeklyGroups.flatMap((group) =>
    group.meetings.map((meeting) => ({ category: group.category, meeting }))
  );
  const monthlyRows = monthlyGroups.flatMap((group) =>
    group.occurrences.map((occurrence) => ({ category: group.category, occurrence }))
  );
  const rowCount = view === "weekly" ? weeklyRows.length : monthlyRows.length;

  return (
    <section className="mb-6">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="whitespace-nowrap text-sm font-bold uppercase tracking-[0.4px] text-slate-light">
          Meetings
        </h2>
        <span className="h-px flex-1 bg-line" />
        {canEdit && (
          <button onClick={() => setManageOpen(true)} className={primaryButtonClass}>
            Manage meetings
          </button>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-white p-0.5">
          {(["weekly", "monthly"] as const).map((tab) => {
            const isActive = tab === view;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setView(tab)}
                aria-pressed={isActive}
                className={`rounded-md px-2.5 py-1.5 text-[13px] font-semibold ${
                  isActive ? "bg-orange-pale text-orange-dark" : "text-slate hover:text-ink"
                }`}
              >
                {tab === "weekly" ? "Weekly" : "Monthly"}
              </button>
            );
          })}
        </div>
        {cycleWeekNumber !== null && (
          <span className="text-[13px] text-slate-light">
            Cycle week {cycleWeekNumber} of {CYCLE_WEEK_COUNT}
          </span>
        )}
      </div>

      <div className="overflow-hidden rounded-card border border-line bg-card shadow-card">
        {rowCount === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm font-semibold text-ink">No meetings scheduled</p>
            <p className="mt-1.5 text-[13px] text-slate-light">
              {canEdit
                ? "Add one with Manage meetings above."
                : "Nothing has been scheduled for this club yet."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[12px] font-bold uppercase tracking-[0.4px] text-slate-light">
                  <th className="px-5 py-3">Meeting</th>
                  {view === "monthly" && <th className="px-5 py-3">Week</th>}
                  <th className="px-5 py-3">When</th>
                  <th className="px-5 py-3">Where</th>
                  <th className="px-5 py-3">Attendees</th>
                </tr>
              </thead>
              <tbody>
                {view === "weekly"
                  ? weeklyRows.map(({ category, meeting }) => (
                      <tr key={meeting.id} className="border-b border-line last:border-b-0">
                        <MeetingCell category={category} meeting={meeting} />
                        <WhenWhereCells meeting={meeting} />
                        <AttendeesCell names={meeting.attendeeNames} />
                      </tr>
                    ))
                  : monthlyRows.map(({ category, occurrence }) => (
                      <tr
                        key={occurrence.key}
                        className="border-b border-line last:border-b-0"
                      >
                        <MeetingCell category={category} meeting={occurrence.meeting} />
                        <td className="whitespace-nowrap px-5 py-3 text-slate">
                          Week {occurrence.weekNumber} · w/c{" "}
                          {weekDayLabels(parseWeekDate(occurrence.weekCommencing)!)[0]}
                        </td>
                        <WhenWhereCells meeting={occurrence.meeting} />
                        <AttendeesCell names={occurrence.meeting.attendeeNames} />
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {manageOpen && (
        <ManageMeetingsModal
          siteId={siteId}
          categoryGroups={manageGroups}
          coaches={coaches}
          onClose={() => setManageOpen(false)}
        />
      )}
    </section>
  );
}

function MeetingCell({
  category,
  meeting,
}: {
  category: string;
  meeting: MeetingCategoryGroup["meetings"][number];
}) {
  const pattern = weekPatternLabel(meeting.cycleWeekNumbers);
  return (
    <td className="px-5 py-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-light">
        {category}
      </div>
      <div className="text-sm font-bold text-ink">{meeting.title}</div>
      {pattern && <div className="text-[12.5px] text-slate-light">{pattern}</div>}
    </td>
  );
}

// When and Where are the same for every occurrence of a meeting, so both views
// render them identically — monthly only adds a Week column ahead of them.
// When is kept nowrap so the squeeze from that extra column lands on the
// attendee list, which is the one cell that wraps sensibly.
function WhenWhereCells({
  meeting,
}: {
  meeting: MeetingCategoryGroup["meetings"][number];
}) {
  return (
    <>
      <td className="whitespace-nowrap px-5 py-3 text-slate">
        {meetingWhenLabel(meeting.dayOfWeek, meeting.startTime, meeting.endTime)}
      </td>
      <td className="px-5 py-3 text-slate">{meeting.location ?? "—"}</td>
    </>
  );
}

function AttendeesCell({ names }: { names: string[] }) {
  return <td className="px-5 py-3 text-slate">{names.length ? names.join(", ") : "—"}</td>;
}
