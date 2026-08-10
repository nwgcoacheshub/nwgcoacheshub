import { createClient } from "@/lib/supabaseServer";
import { londonToday } from "@/lib/rota/week";

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function QuoteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M7 8c-1.7 0-3 1.3-3 3v5h5v-5H6c0-1.1.9-2 2-2V8zm10 0c-1.7 0-3 1.3-3 3v5h5v-5h-3c0-1.1.9-2 2-2V8z" />
    </svg>
  );
}

export default async function WeeklyFocusHero() {
  const supabase = await createClient();
  const currentMonth = londonToday().getUTCMonth() + 1;
  const { data: mantra } = await supabase
    .from("mantras")
    .select("mantra_text")
    .eq("month_number", currentMonth)
    .maybeSingle();

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
            Week commencing 27 July
          </div>
          <div className="text-[13px] font-semibold text-slate-light">Same across all clubs</div>
        </div>

        {mantra?.mantra_text && (
          <div className="flex items-start gap-2.5 border-b border-line bg-white px-5 py-3.5">
            <span className="mt-0.5 shrink-0 text-orange">
              <QuoteIcon />
            </span>
            <div>
              <div className="mb-1 text-[11.5px] font-bold uppercase tracking-wide text-orange">
                Mantra of the month
              </div>
              <p className="text-[14px] font-semibold text-ink">{mantra.mantra_text}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2">
          <div className="p-5">
            <div className="mb-[9px] text-[11.5px] font-bold uppercase tracking-wide text-orange">
              Weekly overview
            </div>
            <h3 className="mb-[5px] text-[19px] font-bold text-ink">Handstand Alignment</h3>
            <p className="mb-3.5 text-[13.5px] text-slate">
              This week&apos;s whole-club focus. Flat back, active shoulders, and consistent
              hollow-body positioning through conditioning and wall drills.
            </p>
            <div className="mb-3.5 flex flex-wrap gap-2">
              <span className="rounded-full bg-orange px-[11px] py-[5px] text-xs font-semibold text-white">
                Flat back
              </span>
              <span className="rounded-full bg-background px-[11px] py-[5px] text-xs font-semibold text-slate-dark">
                Active shoulders
              </span>
              <span className="rounded-full bg-background px-[11px] py-[5px] text-xs font-semibold text-slate-dark">
                Wall drills
              </span>
            </div>
            <a href="#" className="inline-flex items-center gap-[5px] text-[13px] font-bold text-orange">
              Open full overview
              <ArrowIcon />
            </a>
          </div>

          <div className="border-t border-line p-5 sm:border-l sm:border-t-0">
            <div className="mb-[9px] text-[11.5px] font-bold uppercase tracking-wide text-orange">
              Pre-school theme
            </div>
            <h3 className="mb-[5px] text-[19px] font-bold text-ink">Under the Sea 🐠</h3>
            <p className="mb-3.5 text-[13.5px] text-slate">
              Current theme in the 9-week Tiny Tumblers &amp; Little Flippers cycle. Songs,
              station ideas and apparatus set-ups included.
            </p>
            <div className="mt-1">
              <div className="mb-2 flex gap-1">
                <span className="h-[7px] flex-1 rounded bg-orange-light" />
                <span className="h-[7px] flex-1 rounded bg-orange-light" />
                <span className="h-[7px] flex-1 rounded bg-orange-light" />
                <span className="h-[7px] flex-1 rounded bg-orange" />
                <span className="h-[7px] flex-1 rounded bg-line" />
                <span className="h-[7px] flex-1 rounded bg-line" />
                <span className="h-[7px] flex-1 rounded bg-line" />
                <span className="h-[7px] flex-1 rounded bg-line" />
                <span className="h-[7px] flex-1 rounded bg-line" />
              </div>
              <div className="text-xs text-slate-light">
                <b className="text-ink">Week 4 of 9</b> · Next: <b className="text-ink">Jungle Adventure</b> (w/c 10 Aug)
              </div>
            </div>
            <a href="#" className="mt-3.5 inline-flex items-center gap-[5px] text-[13px] font-bold text-orange">
              Open theme pack
              <ArrowIcon />
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
