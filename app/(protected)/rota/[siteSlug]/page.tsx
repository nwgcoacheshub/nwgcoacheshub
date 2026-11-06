import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";
import { getSiteAccess } from "@/lib/rota/siteAccess";
import { getCapabilities, hasSiteCapability } from "@/lib/capabilities";
import {
  currentMonday,
  formatWeekDate,
  mondayOf,
  parseWeekDate,
  weekDayLabels,
  weekRangeLabel,
} from "@/lib/rota/week";
import { makeDirectory, toRosterCandidates, toRotaPeople } from "@/lib/rota/people";
import {
  addWeekOptions,
  isNotSetUp,
  needsAttention,
  pickDefaultWeek,
  standardCoachCount,
  summariseWeek,
  WEEK_SELECT,
  type WeekRow,
} from "@/lib/rota/landing";
import RotaUnavailable from "@/components/rota/RotaUnavailable";
import SiteSwitcher from "@/components/rota/SiteSwitcher";
import RotaWeekStrip from "@/components/rota/RotaWeekStrip";
import RotaPreviousWeeks from "@/components/rota/RotaPreviousWeeks";
import RotaWeekDetail from "@/components/rota/RotaWeekDetail";
import RotaHomeSidebar from "@/components/rota/RotaHomeSidebar";
import RotaFirstRun from "@/components/rota/RotaFirstRun";
import RotaAllSitesLink from "@/components/rota/RotaAllSitesLink";
import type { Category } from "@/components/rota/RotaBoard";
import AddWeek, { type AddWeekProps } from "@/components/rota/AddWeek";

/**
 * The rota landing page for one site: created weeks from this week on, the 8
 * most recent past ones, the selected week's detail, and side cards. Read only,
 * apart from Add week and Delete week for edit_rota holders.
 *
 * The selected week is the ?week= search param, so every selection is a link
 * and a server render, with no client state. ?add= (from the all-sites grid's
 * "Not created" cells) opens Add week with that week chosen.
 *
 * A site with no Standard Rota classes and no weeks gets the first-run view
 * instead, from the same queries.
 */
export default async function RotaLandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteSlug: string }>;
  searchParams: Promise<{ week?: string | string[]; add?: string | string[] }>;
}) {
  const { siteSlug } = await params;
  const { week: weekParam, add: addParam } = await searchParams;

  const access = await getSiteAccess();
  if (!access.ok) {
    return <RotaUnavailable access={access} title="Rota" />;
  }

  // Only sites this user may view are in access.sites, so this covers an
  // unknown slug and a coach reaching for someone else's site alike.
  const site = access.sites.find((s) => s.slug === siteSlug);
  if (!site) {
    redirect(`/rota/${access.homeSlug}`);
  }

  // ?week= first by shape: not a single real date goes to the clean URL; any
  // other date is read as the Monday of its week. Whether that week is loaded
  // is checked once the weeks are in.
  let requested: string | null = null;
  if (weekParam !== undefined) {
    const parsed = typeof weekParam === "string" ? parseWeekDate(weekParam) : null;
    if (!parsed) {
      redirect(`/rota/${site.slug}`);
    }
    requested = formatWeekDate(mondayOf(parsed));
  }

  const capabilities = await getCapabilities();
  const canEdit = hasSiteCapability(capabilities, "edit_rota", site.id);
  const canManageUsers = capabilities.caps.has("manage_users");
  const viewAllSites = capabilities.caps.has("view_all_sites");
  const thisMonday = currentMonday();
  const supabase = await createClient();

  // A fixed 8 queries, whatever the number of weeks.
  const [
    currentRes,
    pastRes,
    peopleRes,
    candidatesRes,
    categoriesRes,
    standardRosterRes,
    standardClassesRes,
    restructureRes,
  ] = await Promise.all([
    // This week and every created week after it. create_weekly_rota allows up
    // to +16 weeks, so at most 17 rows.
    supabase
      .from("rota_weekly_rotas")
      .select(WEEK_SELECT)
      .eq("site_id", site.id)
      .gte("week_start_date", thisMonday)
      .order("week_start_date", { ascending: true })
      .order("sort_order", { referencedTable: "rota_weekly_roster" })
      .order("start_mins", { referencedTable: "rota_weekly_classes" }),
    // The 8 most recent created weeks before this one.
    supabase
      .from("rota_weekly_rotas")
      .select(WEEK_SELECT)
      .eq("site_id", site.id)
      .lt("week_start_date", thisMonday)
      .order("week_start_date", { ascending: false })
      .limit(8)
      .order("sort_order", { referencedTable: "rota_weekly_roster" })
      .order("start_mins", { referencedTable: "rota_weekly_classes" }),
    // Names and moved/inactive flags for every coach the site's rows reference.
    supabase.rpc("site_rota_people", { p_site_id: site.id }),
    // The assignable roster, for every role: its caller check admits own-site
    // Coaches, and only its size is shown (plus topping up the directory).
    supabase.rpc("site_rota_roster", { p_site_id: site.id }),
    // Export week only.
    supabase
      .from("rota_categories")
      .select("key, label, color_hex")
      .eq("active", true)
      .order("sort_order"),
    supabase.from("rota_standard_roster").select("coach_id, status").eq("site_id", site.id),
    supabase
      .from("rota_standard_classes")
      .select("id", { count: "exact", head: true })
      .eq("site_id", site.id),
    supabase.from("rota_restructures").select("id").eq("site_id", site.id).maybeSingle(),
  ]);

  const weeksError = currentRes.error ?? pastRes.error;
  const currentRows = weeksError ? [] : ((currentRes.data ?? []) as unknown as WeekRow[]);
  const pastRows = weeksError ? [] : ((pastRes.data ?? []) as unknown as WeekRow[]);
  const toWeek = (r: WeekRow) => ({ monday: r.week_start_date });

  // ?week= by content: a Monday that isn't loaded (never created, or older than
  // the last 8) goes to that week's own page, which shows the board or says the
  // week hasn't been created. A loaded week named by another day of it is
  // canonicalised to its Monday. Skipped if the weeks failed to load.
  if (requested && !weeksError) {
    const loaded = [...currentRows, ...pastRows].some((r) => r.week_start_date === requested);
    if (!loaded) {
      redirect(`/rota/${site.slug}/week/${requested}`);
    }
    if (requested !== weekParam) {
      redirect(`/rota/${site.slug}?week=${requested}`);
    }
  }

  const people = toRotaPeople(peopleRes.data);
  const rosterCandidates = toRosterCandidates(candidatesRes.data);
  const directory = makeDirectory(people, rosterCandidates, site.name);
  const summarise = (r: WeekRow) =>
    summariseWeek(
      { id: r.id, monday: r.week_start_date },
      r.rota_weekly_roster ?? [],
      r.rota_weekly_classes ?? [],
      directory,
      thisMonday
    );
  const currentWeeks = currentRows.map(summarise);
  const pastWeeks = pastRows.map(summarise);

  const selectedMonday =
    requested && !weeksError
      ? requested
      : pickDefaultWeek(currentRows.map(toWeek), pastRows.map(toWeek), thisMonday);
  const selectedRow = [...currentRows, ...pastRows].find(
    (r) => r.week_start_date === selectedMonday
  );
  const selectedWeek = [...currentWeeks, ...pastWeeks].find((w) => w.monday === selectedMonday);

  const maxClasses = Math.max(1, ...currentWeeks.flatMap((w) => w.days.map((d) => d.classes)));
  const noWeeks = currentRows.length === 0 && pastRows.length === 0;

  let exportProps = null;
  if (selectedRow) {
    const parsed = parseWeekDate(selectedRow.week_start_date)!;
    exportProps = {
      siteName: site.name,
      people,
      rosterCandidates,
      roster: selectedRow.rota_weekly_roster ?? [],
      classes: selectedRow.rota_weekly_classes ?? [],
      categories: (categoriesRes.data ?? []) as Category[],
      // Same spec as the week board, so the PDF and its file name match.
      spec: {
        siteName: site.name,
        fileBase: `${site.slug}-week-${selectedRow.week_start_date}`,
        week: { rangeLabel: weekRangeLabel(parsed), dayDates: weekDayLabels(parsed) },
      },
    };
  }

  // Add week, for edit_rota holders only. The options come from the London
  // Monday computed above, never from the browser's clock. Q1 holds every
  // created week from this one on, so it's all the exclusion list needs. Copy
  // sources are the weeks already loaded: upcoming, then past newest first.
  const standardClasses = standardClassesRes.count ?? 0;
  const addOptions = addWeekOptions(
    thisMonday,
    new Set(currentRows.map((r) => r.week_start_date))
  );

  // ?add=, for edit_rota holders only; anyone else's is ignored. Read as the
  // Monday of its week. A week created since the grid was loaded goes to that
  // week; one that can't be added (past, too far ahead, not a date) drops the
  // param.
  let preselect: string | undefined;
  if (addParam !== undefined && canEdit && !weeksError) {
    const parsed = typeof addParam === "string" ? parseWeekDate(addParam) : null;
    const monday = parsed ? formatWeekDate(mondayOf(parsed)) : null;
    if (monday && currentRows.some((r) => r.week_start_date === monday)) {
      redirect(`/rota/${site.slug}?week=${monday}`);
    }
    if (monday && addOptions.some((o) => o.monday === monday)) {
      preselect = monday;
    } else {
      redirect(`/rota/${site.slug}${requested ? `?week=${requested}` : ""}`);
    }
  }

  const addWeek: AddWeekProps | null =
    canEdit && !weeksError
      ? {
          siteId: site.id,
          siteSlug: site.slug,
          siteName: site.name,
          options: addOptions,
          copySources: [...currentWeeks, ...pastWeeks].map((w) => ({
            id: w.id,
            label: `${w.range} · ${w.label}`,
          })),
          standardClasses,
          preselect,
        }
      : null;

  // Only when both counts are known: a failed query never reads as "Not set up".
  // noWeeks is exact here: with no week from this one on and none of the last 8
  // before it, the site has no weeks at all.
  const firstRun =
    !weeksError &&
    !standardClassesRes.error &&
    isNotSetUp(standardClasses > 0, !noWeeks);

  return (
    <main className="mx-auto max-w-[1280px] p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[26px] font-extrabold tracking-[-0.3px] text-slate-dark">Rota</h1>
          <SiteSwitcher sites={access.sites} currentSlug={site.slug} canSwitch={access.canSwitch} />
          {viewAllSites && <RotaAllSitesLink />}
        </div>
        <div className="text-[13px] text-slate-light">
          Home / <b className="font-bold text-orange">Rota</b>
        </div>
      </div>

      {firstRun ? (
        <RotaFirstRun
          siteSlug={site.slug}
          siteName={site.name}
          canEdit={canEdit}
          canManageUsers={canManageUsers}
          rosterCount={rosterCandidates.length}
          standardClasses={standardClasses}
        />
      ) : weeksError ? (
        // Without this the page would wrongly say no weeks have been created.
        <div className="rounded-lg border border-[#f3c9c4] bg-[#fdecea] px-3 py-[9px] text-[12.5px] text-[#a02a1c]">
          Couldn&apos;t load weeks: {weeksError.message}
        </div>
      ) : noWeeks ? (
        <div className="rounded-card border border-line bg-card p-5 shadow-card">
          <p className="text-sm text-slate">No weeks have been created for {site.name} yet.</p>
          {addWeek && (
            <div className="mt-3">
              <AddWeek variant="button" {...addWeek} />
            </div>
          )}
        </div>
      ) : (
        <RotaWeekStrip
          siteSlug={site.slug}
          weeks={currentWeeks}
          selectedMonday={selectedMonday}
          maxClasses={maxClasses}
          addWeek={addWeek}
        >
          <RotaPreviousWeeks
            siteSlug={site.slug}
            weeks={pastWeeks}
            selectedMonday={selectedMonday}
            forceOpen={currentWeeks.length === 0}
          />
        </RotaWeekStrip>
      )}

      {!firstRun && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            {selectedWeek && exportProps && (
              <RotaWeekDetail
                siteSlug={site.slug}
                week={selectedWeek}
                exportProps={exportProps}
                canDelete={canEdit}
              />
            )}
          </div>
          <RotaHomeSidebar
            siteSlug={site.slug}
            canEdit={canEdit}
            canManageUsers={canManageUsers}
            standard={{
              coaches: standardCoachCount(
                (standardRosterRes.data ?? []) as { coach_id: string; status: string }[]
              ),
              classes: standardClasses,
            }}
            rosterCount={rosterCandidates.length}
            restructureExists={!!restructureRes.data}
            attention={needsAttention(currentWeeks)}
          />
        </div>
      )}
    </main>
  );
}
