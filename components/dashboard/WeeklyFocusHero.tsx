import { createClient } from "@/lib/supabaseServer";
import { currentMonday, londonToday, parseWeekDate, weekDayLabels } from "@/lib/rota/week";

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function QuoteIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      className={className}
    >
      <path d="M7 8c-1.7 0-3 1.3-3 3v5h5v-5H6c0-1.1.9-2 2-2V8zm10 0c-1.7 0-3 1.3-3 3v5h5v-5h-3c0-1.1.9-2 2-2V8z" />
    </svg>
  );
}

export default async function WeeklyFocusHero() {
  const supabase = await createClient();
  const currentMonth = londonToday().getUTCMonth() + 1;
  const weekCommencing = currentMonday();

  const { data: mantra } = await supabase
    .from("mantras")
    .select("mantra_text")
    .eq("month_number", currentMonth)
    .maybeSingle();

  const { data: gymnasticsWeek } = await supabase
    .from("programme_gymnastics_weeks")
    .select("warm_up, skill_focus, rotation, week_number")
    .eq("week_commencing", weekCommencing)
    .maybeSingle();

  const { data: preschoolWeek } = await supabase
    .from("programme_preschool_weeks")
    .select("category, mini_theme, week_number")
    .eq("week_commencing", weekCommencing)
    .maybeSingle();

  const { data: nextPreschoolWeek } = await supabase
    .from("programme_preschool_weeks")
    .select("week_commencing, mini_theme")
    .gt("week_commencing", weekCommencing)
    .order("week_commencing", { ascending: true })
    .limit(1)
    .maybeSingle();

  const thisMondayLabel = weekDayLabels(parseWeekDate(weekCommencing)!)[0];
  const preschoolWeekNumber = preschoolWeek?.week_number ?? null;
  const nextPreschoolMonday = nextPreschoolWeek ? parseWeekDate(nextPreschoolWeek.week_commencing) : null;
  const nextPreschoolLabel = nextPreschoolMonday ? weekDayLabels(nextPreschoolMonday)[0] : null;

  return (
    <>
      <div className="mb-3 ml-0.5 flex items-center gap-2 text-xs font-bold uppercase tracking-[1.2px] text-slate-light">
        This week
        <span className="h-px flex-1 bg-line" />
      </div>

      <div
        className="mb-[26px] overflow-hidden rounded-card border border-line shadow-card"
        style={{ background: "linear-gradient(120deg, #fff 0%, #fff 55%, #FEF1E5 100%)" }}
      >
        <div className="flex items-center justify-between border-b border-line bg-white px-5 py-3.5">
          <div className="flex items-center gap-2.5 text-[15px] font-bold text-ink">
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-orange-pale text-orange">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
            </span>
            Week commencing {thisMondayLabel}
          </div>
        </div>

        {mantra?.mantra_text && (
          <div className="border-b border-line bg-white px-5 py-3.5 text-center">
            <div className="mb-1 text-[11.5px] font-bold uppercase tracking-wide text-orange">
              Mantra of the month
            </div>
            <p className="flex items-start justify-center gap-1.5 text-[19px] font-bold text-ink">
              <QuoteIcon className="mt-0.5 shrink-0 text-orange" />
              <span>{mantra.mantra_text}</span>
              <QuoteIcon className="mt-0.5 shrink-0 rotate-180 text-orange" />
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2">
          <div className="p-5">
            <div className="mb-[9px] text-[11.5px] font-bold uppercase tracking-wide text-orange">
              Weekly overview
            </div>
            {gymnasticsWeek ? (
              <>
                <h3 className="mb-[5px] text-[19px] font-bold text-ink">
                  Week {gymnasticsWeek.week_number}
                </h3>
                <div className="mb-3.5 text-[13.5px] text-slate">
                  <p>Rotation: {gymnasticsWeek.rotation}</p>
                  <p>Warm-up: {gymnasticsWeek.warm_up}</p>
                  <p>Skill focus: {gymnasticsWeek.skill_focus}</p>
                </div>
                <a
                  href="/gymnastics/weekly-overview"
                  className="inline-flex items-center gap-[5px] text-[13px] font-bold text-orange"
                >
                  Open full overview
                  <ArrowIcon />
                </a>
              </>
            ) : (
              <p className="text-[13.5px] text-slate-light">No schedule set for this week.</p>
            )}
          </div>

          <div className="border-t border-line p-5 sm:border-l sm:border-t-0">
            <div className="mb-[9px] text-[11.5px] font-bold uppercase tracking-wide text-orange">
              Pre-school theme
            </div>
            {preschoolWeek ? (
              <>
                <h3 className="mb-[5px] text-[19px] font-bold text-ink">{preschoolWeek.category}</h3>
                <p className="mb-3.5 text-[13.5px] text-slate">{preschoolWeek.mini_theme}</p>
                {preschoolWeekNumber != null && (
                  <div className="mt-1">
                    <div className="mb-2 flex gap-1">
                      {Array.from({ length: 9 }, (_, i) => {
                        const segment = i + 1;
                        const filled =
                          segment < preschoolWeekNumber
                            ? "bg-orange-light"
                            : segment === preschoolWeekNumber
                              ? "bg-orange"
                              : "bg-line";
                        return <span key={segment} className={`h-[7px] flex-1 rounded ${filled}`} />;
                      })}
                    </div>
                    <div className="text-xs text-slate-light">
                      <b className="text-ink">Week {preschoolWeekNumber} of 9</b>
                      {nextPreschoolWeek && nextPreschoolLabel && (
                        <>
                          {" "}
                          · Next: <b className="text-ink">{nextPreschoolWeek.mini_theme}</b> (w/c{" "}
                          {nextPreschoolLabel})
                        </>
                      )}
                    </div>
                  </div>
                )}
                <a
                  href="#"
                  className="mt-3.5 inline-flex items-center gap-[5px] text-[13px] font-bold text-orange"
                >
                  Open theme pack
                  <ArrowIcon />
                </a>
              </>
            ) : (
              <p className="text-[13.5px] text-slate-light">No schedule set for this week.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
