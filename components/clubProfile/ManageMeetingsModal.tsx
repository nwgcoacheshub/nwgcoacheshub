"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import { meetingWhenLabel, weekPatternLabel } from "@/lib/clubProfile/format";
import {
  CYCLE_WEEK_NUMBERS,
  MEETING_CATEGORIES,
  type MeetingCategoryGroup,
} from "@/lib/clubProfile/meetings";
import type { RosterCoach } from "@/lib/clubProfile/attendance";
import Modal from "@/components/Modal";
import {
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
  rowActionClass,
} from "@/components/formStyles";

// day_of_week: 0=Monday..6=Sunday, matching club_meetings' convention (see
// lib/clubProfile/format.ts's meetingWhenLabel).
const DAY_OPTIONS = [
  { value: 0, label: "Monday" },
  { value: 1, label: "Tuesday" },
  { value: 2, label: "Wednesday" },
  { value: 3, label: "Thursday" },
  { value: 4, label: "Friday" },
  { value: 5, label: "Saturday" },
  { value: 6, label: "Sunday" },
] as const;

type MeetingRow = {
  id: string;
  category: string;
  title: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  location: string | null;
  attendeeIds: string[];
  attendeeNames: string[];
  cycleWeekNumbers: number[];
};

type Draft = {
  category: string;
  title: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  location: string;
  attendeeIds: string[];
  cycleWeekNumbers: number[];
};

const EMPTY_DRAFT: Draft = {
  category: MEETING_CATEGORIES[0],
  title: "",
  dayOfWeek: 0,
  startTime: "09:00",
  endTime: "09:30",
  location: "",
  attendeeIds: [],
  cycleWeekNumbers: [],
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function DraftFields({
  draft,
  setDraft,
  coaches,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  coaches: RosterCoach[];
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Category</label>
          <select
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            className={inputClass}
          >
            {MEETING_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Day</label>
          <select
            value={draft.dayOfWeek}
            onChange={(e) => setDraft({ ...draft, dayOfWeek: Number(e.target.value) })}
            className={inputClass}
          >
            {DAY_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className={labelClass}>Title</label>
        <input
          type="text"
          required
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Start time</label>
          <input
            type="time"
            required
            value={draft.startTime}
            onChange={(e) => setDraft({ ...draft, startTime: e.target.value })}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>End time</label>
          <input
            type="time"
            required
            value={draft.endTime}
            onChange={(e) => setDraft({ ...draft, endTime: e.target.value })}
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label className={labelClass}>
          Location <span className="font-normal text-slate-light">(optional)</span>
        </label>
        <input
          type="text"
          value={draft.location}
          onChange={(e) => setDraft({ ...draft, location: e.target.value })}
          className={inputClass}
        />
      </div>
      <div>
        <label className={labelClass}>Attendees</label>
        {coaches.length === 0 ? (
          <p className="text-[13px] text-slate-light">
            No coaches on this club&apos;s roster yet.
          </p>
        ) : (
          <div className="max-h-36 overflow-y-auto rounded-lg border border-line px-2.5 py-1.5">
            {coaches.map((coach) => (
              <label
                key={coach.id}
                className="flex items-center gap-2 py-0.5 text-[13px] text-ink"
              >
                <input
                  type="checkbox"
                  checked={draft.attendeeIds.includes(coach.id)}
                  onChange={() =>
                    setDraft({ ...draft, attendeeIds: toggle(draft.attendeeIds, coach.id) })
                  }
                  className="h-3.5 w-3.5 accent-orange"
                />
                {coach.name}
              </label>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className={labelClass}>
          Weeks{" "}
          <span className="font-normal text-slate-light">
            (leave all unticked to run every week)
          </span>
        </label>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {CYCLE_WEEK_NUMBERS.map((n) => (
            <label key={n} className="flex items-center gap-1.5 text-[13px] text-ink">
              <input
                type="checkbox"
                checked={draft.cycleWeekNumbers.includes(n)}
                onChange={() =>
                  setDraft({
                    ...draft,
                    cycleWeekNumbers: toggle(draft.cycleWeekNumbers, n).sort((a, b) => a - b),
                  })
                }
                className="h-3.5 w-3.5 accent-orange"
              />
              {n}
            </label>
          ))}
        </div>
      </div>
    </>
  );
}

/**
 * Add/edit/deactivate this site's meeting definitions, including each one's
 * fixed attendee list and its week pattern.
 *
 * Only active meetings are ever listed here, because the page's Promise.all
 * only fetches active=true (matching HeroesModal, which has no reactivate path
 * either) — deactivating one simply drops it from this list on refresh.
 *
 * The attendee picker lists every rota_coaches row for the site with no active
 * filter, matching the roster convention used elsewhere on this page.
 */
export default function ManageMeetingsModal({
  siteId,
  categoryGroups,
  coaches,
  onClose,
}: {
  siteId: string;
  categoryGroups: MeetingCategoryGroup[];
  coaches: RosterCoach[];
  onClose: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();

  const meetings: MeetingRow[] = categoryGroups.flatMap((group) =>
    group.meetings.map((m) => ({
      id: m.id,
      category: m.category,
      title: m.title,
      dayOfWeek: m.dayOfWeek,
      startTime: m.startTime,
      endTime: m.endTime,
      location: m.location,
      attendeeIds: m.attendeeIds,
      attendeeNames: m.attendeeNames,
      cycleWeekNumbers: m.cycleWeekNumbers,
    }))
  );

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY_DRAFT);

  /**
   * Replaces the meeting's attendee and cycle-week rows wholesale — both tables
   * are small per-meeting sets with no history to preserve, so delete-then-
   * insert is simpler than diffing and can't leave a stale row behind.
   * Returns an error message, or null on success.
   */
  async function replaceAttendeesAndWeeks(
    meetingId: string,
    draft: Draft
  ): Promise<string | null> {
    const { error: deleteAttendeesError } = await supabase
      .from("club_meeting_attendees")
      .delete()
      .eq("meeting_id", meetingId);
    if (deleteAttendeesError) return deleteAttendeesError.message;

    if (draft.attendeeIds.length) {
      const { error: insertAttendeesError } = await supabase
        .from("club_meeting_attendees")
        .insert(
          draft.attendeeIds.map((coachId) => ({ meeting_id: meetingId, coach_id: coachId }))
        );
      if (insertAttendeesError) return insertAttendeesError.message;
    }

    const { error: deleteWeeksError } = await supabase
      .from("club_meeting_cycle_weeks")
      .delete()
      .eq("meeting_id", meetingId);
    if (deleteWeeksError) return deleteWeeksError.message;

    if (draft.cycleWeekNumbers.length) {
      const { error: insertWeeksError } = await supabase
        .from("club_meeting_cycle_weeks")
        .insert(
          draft.cycleWeekNumbers.map((n) => ({
            meeting_id: meetingId,
            cycle_week_number: n,
          }))
        );
      if (insertWeeksError) return insertWeeksError.message;
    }

    return null;
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addDraft.title.trim()) return;
    setBusy(true);
    setError(null);

    const { data: inserted, error: insertError } = await supabase
      .from("club_meetings")
      .insert({
        site_id: siteId,
        category: addDraft.category,
        title: addDraft.title.trim(),
        day_of_week: addDraft.dayOfWeek,
        start_time: addDraft.startTime,
        end_time: addDraft.endTime,
        location: addDraft.location.trim() || null,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      setBusy(false);
      setError(insertError?.message ?? "Failed to add meeting.");
      return;
    }

    const childError = await replaceAttendeesAndWeeks(inserted.id, addDraft);
    setBusy(false);
    if (childError) {
      setError(childError);
      router.refresh();
      return;
    }
    setAddDraft(EMPTY_DRAFT);
    setAdding(false);
    router.refresh();
  }

  function startEdit(meeting: MeetingRow) {
    setError(null);
    setEditingId(meeting.id);
    setEditDraft({
      category: meeting.category,
      title: meeting.title,
      dayOfWeek: meeting.dayOfWeek,
      startTime: meeting.startTime.slice(0, 5),
      endTime: meeting.endTime.slice(0, 5),
      location: meeting.location ?? "",
      attendeeIds: meeting.attendeeIds,
      cycleWeekNumbers: meeting.cycleWeekNumbers,
    });
  }

  async function handleSaveEdit(id: string) {
    if (!editDraft.title.trim()) return;
    setBusy(true);
    setError(null);

    const { error: updateError } = await supabase
      .from("club_meetings")
      .update({
        category: editDraft.category,
        title: editDraft.title.trim(),
        day_of_week: editDraft.dayOfWeek,
        start_time: editDraft.startTime,
        end_time: editDraft.endTime,
        location: editDraft.location.trim() || null,
      })
      .eq("id", id);

    if (updateError) {
      setBusy(false);
      setError(updateError.message);
      return;
    }

    const childError = await replaceAttendeesAndWeeks(id, editDraft);
    setBusy(false);
    if (childError) {
      setError(childError);
      router.refresh();
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  async function handleDeactivate(id: string) {
    setBusyId(id);
    setError(null);
    const { error: updateError } = await supabase
      .from("club_meetings")
      .update({ active: false })
      .eq("id", id);
    setBusyId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.refresh();
  }

  return (
    <Modal title="Manage meetings" onClose={onClose} wide>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[13px] text-slate-light">
          Add, edit or deactivate this club&apos;s recurring meetings.
        </p>
        {!adding && (
          <button
            onClick={() => {
              setError(null);
              setAdding(true);
            }}
            className={primaryButtonClass}
          >
            + Add meeting
          </button>
        )}
      </div>

      {error && <p className="mb-3 text-[13px] font-semibold text-[#C25218]">{error}</p>}

      {adding && (
        <form onSubmit={handleAdd} className="mb-4 space-y-3.5 rounded-lg border border-line px-4 py-4">
          <DraftFields draft={addDraft} setDraft={setAddDraft} coaches={coaches} />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setAddDraft(EMPTY_DRAFT);
              }}
              className={secondaryButtonClass}
            >
              Cancel
            </button>
            <button type="submit" disabled={busy} className={primaryButtonClass}>
              {busy ? "Adding…" : "Add meeting"}
            </button>
          </div>
        </form>
      )}

      {meetings.length === 0 && !adding ? (
        <p className="text-sm text-slate-light">No active meetings yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line">
          {meetings.map((meeting) => (
            <div key={meeting.id} className="border-b border-line px-4 py-3 last:border-b-0">
              {editingId === meeting.id ? (
                <div className="space-y-3.5">
                  <DraftFields draft={editDraft} setDraft={setEditDraft} coaches={coaches} />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className={secondaryButtonClass}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => handleSaveEdit(meeting.id)}
                      className={primaryButtonClass}
                    >
                      {busy ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-light">
                      {meeting.category}
                    </div>
                    <div className="text-sm font-bold text-ink">{meeting.title}</div>
                    <div className="text-[12.5px] text-slate-light">
                      {meetingWhenLabel(meeting.dayOfWeek, meeting.startTime, meeting.endTime)}
                      {meeting.location ? ` · ${meeting.location}` : ""}
                      {` · ${weekPatternLabel(meeting.cycleWeekNumbers) ?? "Every week"}`}
                    </div>
                    <div className="text-[12.5px] text-slate-light">
                      {meeting.attendeeNames.length
                        ? meeting.attendeeNames.join(", ")
                        : "No attendees set"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button className={rowActionClass} onClick={() => startEdit(meeting)}>
                      Edit
                    </button>
                    <button
                      className={rowActionClass}
                      disabled={busyId === meeting.id}
                      onClick={() => handleDeactivate(meeting.id)}
                    >
                      Deactivate
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
