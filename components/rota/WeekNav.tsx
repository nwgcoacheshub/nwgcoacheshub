import Link from "next/link";
import { addDays, formatWeekDate, parseWeekDate } from "@/lib/rota/week";

const CONTROL =
  "flex h-[30px] items-center justify-center rounded-lg border border-line bg-white px-2.5 text-[13px] font-semibold text-slate hover:text-ink";

/**
 * Week paging: back a week, forward a week, or jump to the current one.
 * `monday` and `currentMonday` are both YYYY-MM-DD Mondays.
 */
export default function WeekNav({
  siteSlug,
  monday,
  currentMonday,
}: {
  siteSlug: string;
  monday: string;
  currentMonday: string;
}) {
  // Safe to assert: every caller has already parsed and canonicalised this.
  const parsed = parseWeekDate(monday)!;
  const base = `/rota/${siteSlug}/week`;
  const prev = `${base}/${formatWeekDate(addDays(parsed, -7))}`;
  const next = `${base}/${formatWeekDate(addDays(parsed, 7))}`;
  const isCurrent = monday === currentMonday;

  return (
    <div className="flex items-center gap-1.5">
      <Link href={prev} aria-label="Previous week" className={CONTROL}>
        ‹
      </Link>
      {isCurrent ? (
        <span
          aria-disabled="true"
          className="flex h-[30px] items-center rounded-lg border border-line bg-background px-2.5 text-[13px] font-semibold text-slate-light"
        >
          Today
        </span>
      ) : (
        <Link href={`${base}/${currentMonday}`} className={CONTROL}>
          Today
        </Link>
      )}
      <Link href={next} aria-label="Next week" className={CONTROL}>
        ›
      </Link>
    </div>
  );
}
