import Link from "next/link";

const CONTROL =
  "flex h-[30px] items-center justify-center rounded-lg border border-line bg-white px-2.5 text-[13px] font-semibold text-slate hover:text-ink";

const DISABLED =
  "flex h-[30px] items-center justify-center rounded-lg border border-line bg-background px-2.5 text-[13px] font-semibold text-slate-light";

/**
 * Week paging between created weeks only: back to the previous created week,
 * forward to the next, or jump to this week. The page looks the neighbours up,
 * so ‹ and › skip weeks that were never created. Every date is a YYYY-MM-DD
 * Monday; null means there's no such week.
 */
export default function WeekNav({
  siteSlug,
  monday,
  prevMonday,
  nextMonday,
  currentMonday,
}: {
  siteSlug: string;
  monday: string;
  prevMonday: string | null;
  nextMonday: string | null;
  /** This week's Monday, or null when this week hasn't been created. */
  currentMonday: string | null;
}) {
  const base = `/rota/${siteSlug}/week`;

  return (
    <div className="flex items-center gap-1.5">
      {prevMonday ? (
        <Link href={`${base}/${prevMonday}`} aria-label="Previous week" className={CONTROL}>
          ‹
        </Link>
      ) : (
        <span aria-disabled="true" aria-label="Previous week" className={DISABLED}>
          ‹
        </span>
      )}
      {currentMonday && currentMonday !== monday ? (
        <Link href={`${base}/${currentMonday}`} className={CONTROL}>
          This week
        </Link>
      ) : (
        <span
          aria-disabled="true"
          title={currentMonday ? undefined : "This week hasn't been created"}
          className={DISABLED}
        >
          This week
        </span>
      )}
      {nextMonday ? (
        <Link href={`${base}/${nextMonday}`} aria-label="Next week" className={CONTROL}>
          ›
        </Link>
      ) : (
        <span aria-disabled="true" aria-label="Next week" className={DISABLED}>
          ›
        </span>
      )}
    </div>
  );
}
