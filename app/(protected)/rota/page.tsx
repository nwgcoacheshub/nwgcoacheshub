import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";
import { getSiteAccess } from "@/lib/rota/siteAccess";
import { getCapabilities } from "@/lib/capabilities";
import { currentMonday } from "@/lib/rota/week";
import {
  gridWeeks,
  isNotSetUp,
  weekStatus,
  WEEK_SELECT,
  type WeekRow,
} from "@/lib/rota/landing";
import RotaUnavailable from "@/components/rota/RotaUnavailable";
import SiteSwitcher from "@/components/rota/SiteSwitcher";
import RotaStatusChip, { type ChipStatus } from "@/components/rota/RotaStatusChip";

type GridWeekRow = WeekRow & { site_id: string };

type SetupRow = {
  id: string;
  rota_standard_classes: { id: string }[] | null;
  rota_weekly_rotas: { id: string }[] | null;
};

const LEGEND: ChipStatus[] = ["ready", "withoutCoach", "noClasses", "notCreated"];

/**
 * /rota: the all-sites grid for view_all_sites holders, who land here. Everyone
 * else goes to their own site's landing page.
 *
 * One row per active site, one column per week from this London week to 3
 * ahead. A created week's chip is its landing-page status (lib/rota/landing.ts);
 * an uncreated one links to Add week with that week chosen; a site that isn't
 * set up links every cell to its first-run view.
 */
export default async function RotaIndexPage() {
  const access = await getSiteAccess();

  if (!access.ok) {
    return <RotaUnavailable access={access} title="Rota" />;
  }

  const { caps } = await getCapabilities();
  if (!caps.has("view_all_sites")) {
    redirect(`/rota/${access.homeSlug}`);
  }

  const thisMonday = currentMonday();
  const weeks = gridWeeks(thisMonday);
  const siteIds = access.sites.map((s) => s.id);
  const supabase = await createClient();

  // A fixed 2 queries plus one roster call per site, whatever the number of
  // weeks.
  const [[weeksRes, setupRes], rosterRes] = await Promise.all([
    Promise.all([
      // Every site's created weeks in the grid's 4, with their roster and class
      // rows embedded as on the landing page. At most 4 per site.
      supabase
        .from("rota_weekly_rotas")
        .select(`site_id, ${WEEK_SELECT}`)
        .in("site_id", siteIds)
        .gte("week_start_date", thisMonday)
        .lte("week_start_date", weeks[weeks.length - 1].monday),
      // Whether each site has any Standard Rota class and any created week at
      // all (not just in the grid's range): at most one embedded row of each.
      supabase
        .from("rota_sites")
        .select("id, rota_standard_classes(id), rota_weekly_rotas(id)")
        .in("id", siteIds)
        .limit(1, { referencedTable: "rota_standard_classes" })
        .limit(1, { referencedTable: "rota_weekly_rotas" }),
    ]),
    Promise.all(
      access.sites.map((s) => supabase.rpc("site_rota_roster", { p_site_id: s.id }))
    ),
  ]);

  const errors: string[] = [];
  if (weeksRes.error) errors.push(`Couldn't load weeks: ${weeksRes.error.message}`);
  if (setupRes.error) {
    errors.push(`Couldn't load which sites are set up: ${setupRes.error.message}`);
  }
  const rosterError = rosterRes.find((r) => r.error)?.error;
  if (rosterError) errors.push(`Couldn't load coach counts: ${rosterError.message}`);

  // Without both, a cell can't be told apart from "Not created".
  const statusKnown = !weeksRes.error && !setupRes.error;

  const weekRows = weeksRes.error ? [] : ((weeksRes.data ?? []) as unknown as GridWeekRow[]);
  const setupById = new Map(
    ((setupRes.data ?? []) as unknown as SetupRow[]).map((r) => [r.id, r])
  );

  const rows = access.sites.map((site, i) => {
    const setup = setupById.get(site.id);
    const notSetUp =
      statusKnown &&
      isNotSetUp(
        (setup?.rota_standard_classes?.length ?? 0) > 0,
        (setup?.rota_weekly_rotas?.length ?? 0) > 0
      );
    const roster = rosterRes[i];
    const coaches = roster.error ? null : ((roster.data ?? []) as unknown[]).length;

    const cells = weeks.map((w) => {
      if (!statusKnown) return { monday: w.monday, status: null, href: `/rota/${site.slug}` };
      if (notSetUp) {
        return { monday: w.monday, status: "notCreated" as const, href: `/rota/${site.slug}` };
      }
      const row = weekRows.find((r) => r.site_id === site.id && r.week_start_date === w.monday);
      return row
        ? {
            monday: w.monday,
            status: weekStatus(row, thisMonday),
            href: `/rota/${site.slug}?week=${w.monday}`,
          }
        : {
            monday: w.monday,
            status: "notCreated" as const,
            href: `/rota/${site.slug}?add=${w.monday}`,
          };
    });

    return { site, notSetUp, coaches, cells };
  });

  return (
    <main className="mx-auto max-w-[1280px] p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[26px] font-extrabold tracking-[-0.3px] text-slate-dark">Rota</h1>
          <SiteSwitcher sites={access.sites} canSwitch={access.canSwitch} />
        </div>
        <div className="text-[13px] text-slate-light">
          Home / <b className="font-bold text-orange">Rota</b>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="mb-4 rounded-lg border border-[#f3c9c4] bg-[#fdecea] px-3 py-[9px] text-[12.5px] text-[#a02a1c]">
          {errors.map((e) => (
            <p key={e}>{e}</p>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-card border border-line bg-card shadow-card">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr>
              <th className="bg-background px-3.5 py-2.5 text-left text-xs font-semibold text-slate">
                Site
              </th>
              {weeks.map((w, i) => (
                <th
                  key={w.monday}
                  className={`bg-background px-3.5 py-2.5 text-left text-xs font-semibold ${
                    i === 0 ? "text-orange-dark" : "text-slate"
                  }`}
                >
                  {w.label}
                  <span className="block font-medium">{w.range}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ site, notSetUp, coaches, cells }) => (
              <tr key={site.id}>
                <td className="border-t border-line px-3.5 py-2.5 text-[13px] font-bold text-ink">
                  <Link
                    href={`/rota/${site.slug}`}
                    className="rounded-sm text-orange-dark hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange"
                  >
                    {site.name}
                  </Link>
                  <small className="block text-[11.5px] font-medium text-slate-light">
                    {notSetUp
                      ? "Not set up"
                      : coaches === null
                        ? "—"
                        : `${coaches} ${coaches === 1 ? "coach" : "coaches"}`}
                  </small>
                </td>
                {cells.map((c) => (
                  <td key={c.monday} className="border-t border-line px-3.5 py-2.5 text-[13px]">
                    <Link href={c.href} className="inline-block rounded-full hover:brightness-95">
                      {c.status ? (
                        <RotaStatusChip status={c.status} />
                      ) : (
                        <span className="text-slate-light">—</span>
                      )}
                    </Link>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2.5 px-0.5 text-xs text-slate">
        {LEGEND.map((s) => (
          <RotaStatusChip key={s} status={s} />
        ))}
        <span>Select any status to open that site and week.</span>
      </div>
    </main>
  );
}
