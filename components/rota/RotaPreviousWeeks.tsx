import Link from "next/link";
import type { WeekSummary } from "@/lib/rota/landing";

/**
 * The 8 most recent created weeks before this one, newest first. Collapsed
 * unless one of them is selected, or there are no upcoming weeks to show above.
 */
export default function RotaPreviousWeeks({
  siteSlug,
  weeks,
  selectedMonday,
  forceOpen = false,
}: {
  siteSlug: string;
  weeks: WeekSummary[];
  selectedMonday: string | null;
  forceOpen?: boolean;
}) {
  if (weeks.length === 0) return null;
  const open = forceOpen || weeks.some((w) => w.monday === selectedMonday);

  return (
    <details open={open} className="mt-2.5 text-[12.5px]">
      <summary className="cursor-pointer font-semibold text-slate">Previous weeks</summary>
      <ul className="mt-2 flex flex-wrap gap-2">
        {weeks.map((w) => {
          const selected = w.monday === selectedMonday;
          return (
            <li key={w.id}>
              <Link
                href={`/rota/${siteSlug}?week=${w.monday}`}
                scroll={false}
                aria-current={selected ? "true" : undefined}
                className={`inline-block rounded-lg border px-2.5 py-[5px] text-ink ${
                  selected
                    ? "border-orange bg-card ring-1 ring-orange"
                    : "border-line bg-background hover:border-slate-light"
                }`}
              >
                {w.label} · {w.range}
              </Link>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
