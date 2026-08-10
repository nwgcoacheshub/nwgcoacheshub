import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";
import { getCurrentProfile } from "@/lib/getCurrentProfile";
import { getSiteAccess } from "@/lib/rota/siteAccess";
import { currentMonday, parseWeekDate, weekRangeLabel } from "@/lib/rota/week";
import { resolveProfileNames, displayName } from "@/lib/clubProfile/names";
import {
  buildAttendanceRows,
  sumWorkedMinutes,
  type RosterRow,
  type RosterCoach,
} from "@/lib/clubProfile/attendance";
import ClubProfileUnavailable from "@/components/clubProfile/ClubProfileUnavailable";
import ClubSiteSwitcher from "@/components/clubProfile/ClubSiteSwitcher";
import ClubUpdates, { type ClubUpdate } from "@/components/clubProfile/ClubUpdates";
import AttendanceGrid from "@/components/clubProfile/AttendanceGrid";
import ClubQuickLinks from "@/components/clubProfile/ClubQuickLinks";
import type { HeroSummary } from "@/components/clubProfile/HeroesModal";
import type { RoleGroup } from "@/components/clubProfile/StaffRolesModal";

export default async function ClubProfileSitePage({
  params,
}: {
  params: Promise<{ siteSlug: string }>;
}) {
  const { siteSlug } = await params;

  const access = await getSiteAccess();
  if (!access.ok) {
    return <ClubProfileUnavailable access={access} />;
  }

  // Only sites this user may view are in access.sites, so this covers an
  // unknown slug and a coach reaching for someone else's club alike.
  const site = access.sites.find((s) => s.slug === siteSlug);
  if (!site) {
    redirect(`/club-profile/${access.homeSlug}`);
  }

  const { user, profile } = await getCurrentProfile();
  const isAdmin = profile?.role === "admin";
  const supabase = await createClient();

  const monday = currentMonday();
  const weekRange = weekRangeLabel(parseWeekDate(monday)!);

  // The week has to be resolved before its roster can be: rota_weekly_roster
  // has no site_id of its own and is only reachable through rota_weekly_rotas.
  const { data: weekly } = await supabase
    .from("rota_weekly_rotas")
    .select("id")
    .eq("site_id", site.id)
    .eq("week_start_date", monday)
    .maybeSingle();

  const [updatesRes, coachesRes, heroesRes, categoriesRes, rolesRes, assignmentsRes, rosterRes] =
    await Promise.all([
      supabase
        .from("club_updates")
        .select("id, title, body, pinned, created_by, created_at, updated_at")
        .eq("site_id", site.id)
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("rota_coaches")
        .select("id, name")
        .eq("site_id", site.id)
        .order("name"),
      supabase
        .from("heroes")
        .select("id, name, dob")
        .eq("site_id", site.id)
        .eq("active", true)
        .order("name"),
      supabase
        .from("club_role_categories")
        .select("id, name")
        .eq("active", true)
        .order("sort_order"),
      supabase
        .from("club_roles")
        .select("id, category_id, name")
        .eq("active", true)
        .order("sort_order"),
      supabase
        .from("club_role_assignments")
        .select("id, club_role_id, coach_id")
        .eq("site_id", site.id),
      weekly
        ? supabase
            .from("rota_weekly_roster")
            .select("day_of_week, coach_id, shift_start_mins, shift_end_mins, status")
            .eq("weekly_rota_id", weekly.id)
        : Promise.resolve({ data: [] as RosterRow[] }),
    ]);

  const updates = updatesRes.data ?? [];
  const coaches = (coachesRes.data ?? []) as RosterCoach[];
  const heroes = heroesRes.data ?? [];
  const assignments = assignmentsRes.data ?? [];
  const roster = (rosterRes.data ?? []) as RosterRow[];

  // Hero hours are summed here rather than in SQL — supabase-js has no group-by,
  // and a site's log is small enough that pulling the rows is cheaper than the
  // view or RPC it would otherwise take.
  const heroIds = heroes.map((h) => h.id);
  const { data: hourRows } = heroIds.length
    ? await supabase
        .from("hero_hours")
        .select("hero_id, duration_minutes")
        .in("hero_id", heroIds)
    : { data: [] as { hero_id: string; duration_minutes: number }[] };

  const minutesByHero = new Map<string, number>();
  for (const row of hourRows ?? []) {
    minutesByHero.set(
      row.hero_id,
      (minutesByHero.get(row.hero_id) ?? 0) + row.duration_minutes
    );
  }

  // Every profiles id shown anywhere on this page goes through the RPC in one
  // batch. A direct join would come back empty for non-admins — see
  // lib/clubProfile/names.ts.
  const names = await resolveProfileNames(supabase, [
    ...updates.map((u) => u.created_by),
    ...assignments.map((a) => a.coach_id),
  ]);

  // The add-coach picker in Staff Roles lists accounts at this site. Only
  // fetched for admins: they're the only ones who can write an assignment, and
  // profiles RLS would return nothing but their own row for anyone else.
  const { data: siteAccounts } = isAdmin
    ? await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("site", site.name)
        .eq("active", true)
        .order("full_name")
    : { data: [] as { id: string; full_name: string | null }[] };

  const initialUpdates: ClubUpdate[] = updates.map((u) => ({
    id: u.id,
    title: u.title,
    body: u.body,
    pinned: u.pinned,
    created_at: u.created_at,
    authorName: displayName(names, u.created_by),
  }));

  const heroSummaries: HeroSummary[] = heroes.map((h) => ({
    id: h.id,
    name: h.name,
    dob: h.dob,
    totalMinutes: minutesByHero.get(h.id) ?? 0,
  }));

  const roleGroups: RoleGroup[] = (categoriesRes.data ?? []).map((category) => ({
    id: category.id,
    name: category.name,
    roles: (rolesRes.data ?? [])
      .filter((role) => role.category_id === category.id)
      .map((role) => ({
        id: role.id,
        name: role.name,
        assignments: assignments
          .filter((a) => a.club_role_id === role.id)
          .map((a) => ({
            id: a.id,
            coachId: a.coach_id,
            name: displayName(names, a.coach_id),
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      })),
  }));

  return (
    <main className="mx-auto max-w-[1280px] p-6">
      <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[26px] font-extrabold tracking-[-0.3px] text-slate-dark">
            {site.name}
          </h1>
          <ClubSiteSwitcher
            sites={access.sites}
            currentSlug={site.slug}
            canSwitch={access.canSwitch}
          />
        </div>
        <div className="text-[13px] text-slate-light">
          Home / <b className="font-bold text-orange">Club Profile</b>
        </div>
      </div>
      <div className="mb-6 text-sm text-slate-light">
        Club updates, this week&apos;s attendance, and the club&apos;s working lists.
      </div>

      <ClubUpdates
        siteId={site.id}
        isAdmin={isAdmin}
        currentUserId={user?.id ?? null}
        initialUpdates={initialUpdates}
      />

      <AttendanceGrid
        rows={buildAttendanceRows(roster, coaches)}
        weekRange={weekRange}
        weekGenerated={Boolean(weekly)}
        siteSlug={site.slug}
      />

      <ClubQuickLinks
        siteId={site.id}
        isAdmin={isAdmin}
        currentUserId={user?.id ?? null}
        heroes={heroSummaries}
        workedTotals={sumWorkedMinutes(roster, coaches)}
        weekRange={weekRange}
        weekGenerated={Boolean(weekly)}
        roleGroups={roleGroups}
        siteAccounts={(siteAccounts ?? []).map((a) => ({
          id: a.id,
          name: a.full_name?.trim() || "Unnamed account",
        }))}
      />
    </main>
  );
}
