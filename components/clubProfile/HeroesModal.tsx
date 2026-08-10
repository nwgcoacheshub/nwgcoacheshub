"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabaseClient";
import Modal from "@/components/Modal";
import { ageFromDob, formatMinutes } from "@/lib/clubProfile/format";
import { formatWeekDate, londonToday } from "@/lib/rota/week";
import {
  inputClass,
  labelClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/components/formStyles";

export type HeroSummary = {
  id: string;
  name: string;
  dob: string | null;
  totalMinutes: number;
};

/**
 * The club's heroes and their hours to date, plus a quick-log form.
 *
 * Logging only in this pass — existing entries can't be edited or deleted here,
 * so the running total only ever goes up from this screen.
 */
export default function HeroesModal({
  heroes,
  currentUserId,
  onClose,
}: {
  heroes: HeroSummary[];
  currentUserId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [heroId, setHeroId] = useState(heroes[0]?.id ?? "");
  const [date, setDate] = useState(formatWeekDate(londonToday()));
  const [duration, setDuration] = useState("60");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleLog(e: React.FormEvent) {
    e.preventDefault();
    const minutes = Number(duration);
    if (!heroId || !date || !Number.isFinite(minutes) || minutes <= 0) {
      setError("Pick a hero, a date, and a duration greater than zero.");
      return;
    }

    setBusy(true);
    setError(null);
    setSaved(false);

    const { error: insertError } = await supabase.from("hero_hours").insert({
      hero_id: heroId,
      date,
      duration_minutes: Math.round(minutes),
      logged_by_coach_id: currentUserId,
      notes: notes.trim() || null,
    });

    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNotes("");
    setSaved(true);
    router.refresh();
  }

  return (
    <Modal title="Heroes tracker" onClose={onClose} wide>
      {heroes.length === 0 ? (
        <p className="text-sm text-slate">
          No active heroes for this club yet. They&apos;re added directly in the
          Supabase table editor for now.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[12px] font-bold uppercase tracking-[0.4px] text-slate-light">
                  <th className="px-4 py-2.5">Hero</th>
                  <th className="px-4 py-2.5">Age</th>
                  <th className="px-4 py-2.5">Hours logged</th>
                </tr>
              </thead>
              <tbody>
                {heroes.map((hero) => {
                  const age = ageFromDob(hero.dob);
                  return (
                    <tr key={hero.id} className="border-b border-line last:border-b-0">
                      <td className="px-4 py-2.5 font-semibold text-ink">{hero.name}</td>
                      <td className="px-4 py-2.5 text-slate">{age ?? "—"}</td>
                      <td className="px-4 py-2.5 text-slate">
                        {formatMinutes(hero.totalMinutes)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <form onSubmit={handleLog} className="mt-5 space-y-3.5 border-t border-line pt-4">
            <h3 className="text-sm font-bold text-ink">Log hours</h3>

            {error && (
              <p className="text-[13px] font-semibold text-[#C25218]">{error}</p>
            )}
            {saved && !error && (
              <p className="text-[13px] font-semibold text-status-green">
                Hours logged.
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className={labelClass} htmlFor="hero-pick">
                  Hero
                </label>
                <select
                  id="hero-pick"
                  value={heroId}
                  onChange={(e) => setHeroId(e.target.value)}
                  className={inputClass}
                >
                  {heroes.map((hero) => (
                    <option key={hero.id} value={hero.id}>
                      {hero.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="hero-date">
                  Date
                </label>
                <input
                  id="hero-date"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="hero-duration">
                  Minutes
                </label>
                <input
                  id="hero-duration"
                  type="number"
                  min={1}
                  step={5}
                  required
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="hero-notes">
                Notes <span className="font-normal text-slate-light">(optional)</span>
              </label>
              <input
                id="hero-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className={secondaryButtonClass}>
                Close
              </button>
              <button type="submit" disabled={busy} className={primaryButtonClass}>
                {busy ? "Logging…" : "Log hours"}
              </button>
            </div>
          </form>
        </>
      )}
    </Modal>
  );
}
