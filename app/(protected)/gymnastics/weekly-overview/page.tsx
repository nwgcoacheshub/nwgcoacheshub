import { createClient } from "@/lib/supabaseServer";
import { currentMonday, parseWeekDate } from "@/lib/rota/week";
import WeeklyFocusHero from "@/components/dashboard/WeeklyFocusHero";
import WeeklyOverviewAccordion, {
  type MonthGroup,
  type WeekRow,
} from "@/components/gymnastics/WeeklyOverviewAccordion";

// Spelled out rather than taken from Intl, for the same reason as
// lib/rota/week.ts's MONTHS_SHORT: abbreviation/name output isn't guaranteed
// stable across ICU versions.
const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const MONTHS_FULL = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function wcLabel(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS_SHORT[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function monthLabel(date: Date): string {
  return `${MONTHS_FULL[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export default async function WeeklyOverviewPage() {
  const supabase = await createClient();

  const [{ data: gymnasticsRows }, { data: preschoolRows }] = await Promise.all([
    supabase
      .from("programme_gymnastics_weeks")
      .select("week_commencing, week_number, rotation, warm_up, skill_focus")
      .order("week_commencing", { ascending: true }),
    supabase
      .from("programme_preschool_weeks")
      .select("week_commencing, week_number, category, mini_theme")
      .order("week_commencing", { ascending: true }),
  ]);

  const gymnasticsByWeek = new Map(
    (gymnasticsRows ?? []).map((row) => [row.week_commencing as string, row])
  );
  const preschoolByWeek = new Map(
    (preschoolRows ?? []).map((row) => [row.week_commencing as string, row])
  );

  const allWeekCommencing = Array.from(
    new Set([...gymnasticsByWeek.keys(), ...preschoolByWeek.keys()])
  ).sort();

  const months = new Map<string, MonthGroup>();

  allWeekCommencing.forEach((weekCommencing) => {
    const monday = parseWeekDate(weekCommencing);
    if (!monday) return;

    const gymnastics = gymnasticsByWeek.get(weekCommencing);
    const preschool = preschoolByWeek.get(weekCommencing);
    const monthKey = weekCommencing.slice(0, 7);

    // Gymnastics week_number is the source of truth for the row label — it's
    // what's driven the "Week X" pattern throughout this feature. Only falls
    // back to the pre-school cycle's own numbering on weeks with no
    // gymnastics row at all.
    const weekNumber = gymnastics?.week_number ?? preschool?.week_number ?? null;

    const row: WeekRow = {
      weekCommencing,
      weekLabel: weekNumber != null ? `${weekNumber}` : "—",
      wcLabel: wcLabel(monday),
      rotation: gymnastics?.rotation ?? null,
      warmUp: gymnastics?.warm_up ?? null,
      skillFocus: gymnastics?.skill_focus ?? null,
      category: preschool?.category ?? null,
      miniTheme: preschool?.mini_theme ?? null,
    };

    if (!months.has(monthKey)) {
      months.set(monthKey, { key: monthKey, label: monthLabel(monday), rows: [] });
    }
    months.get(monthKey)!.rows.push(row);
  });

  const thisMonday = currentMonday();

  return (
    <main className="mx-auto max-w-[1280px] p-6">
      <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-[26px] font-extrabold tracking-[-0.3px] text-slate-dark">Weekly Overview</h1>
        <div className="text-[13px] text-slate-light">
          Home / Gymnastics / <b className="font-bold text-orange">Weekly Overview</b>
        </div>
      </div>

      <WeeklyFocusHero />

      <WeeklyOverviewAccordion
        months={Array.from(months.values())}
        currentMonthKey={thisMonday.slice(0, 7)}
        currentWeekCommencing={thisMonday}
      />
    </main>
  );
}
