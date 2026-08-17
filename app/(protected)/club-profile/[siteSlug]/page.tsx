import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";
import { getCurrentProfile } from "@/lib/getCurrentProfile";
import { getCanEditRota } from "@/lib/rota/canEdit";
import { getSiteAccess } from "@/lib/rota/siteAccess";
import { currentMonday, londonToday, parseWeekDate, weekRangeLabel } from "@/lib/rota/week";
import { resolveProfileNames, displayName } from "@/lib/clubProfile/names";
import {
  buildAttendanceRows,
  sumWorkedMinutes,
  type RosterRow,
  type RosterCoach,
} from "@/lib/clubProfile/attendance";
import {
  buildMeetingViews,
  buildMonthlyOccurrenceGroups,
  cycleWeekNumberFor,
  cycleWeeksInMonth,
  groupMeetingsByCategory,
  meetingRunsInCycleWeek,
  type ClubMeeting,
  type CycleWeek,
  type MeetingAttendee,
  type MeetingCycleWeek,
} from "@/lib/clubProfile/meetings";
import ClubProfileUnavailable from "@/components/clubProfile/ClubProfileUnavailable";
import ClubSiteSwitcher from "@/components/clubProfile/ClubSiteSwitcher";
import ClubUpdates, { type ClubUpdate } from "@/components/clubProfile/ClubUpdates";
import AttendanceGrid from "@/components/clubProfile/AttendanceGrid";
import ClubQuickLinks from "@/components/clubProfile/ClubQuickLinks";
import ClubMeetings from "@/components/clubProfile/ClubMeetings";
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
  const canEditMeetings = await getCanEditRota();
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

  const [
    updatesRes,
    coachesRes,
    heroesRes,
    categoriesRes,
    rolesRes,
    assignmentsRes,
    rosterRes,
    cycleWeeksRes,
    meetingsRes,
  ] = await Promise.all([
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
    supabase.from("cycle_weeks").select("id, week_commencing, week_number").order("week_number"),
    supabase
      .from("club_meetings")
      .select("id, category, title, day_of_week, start_time, end_time, location, display_order")
      .eq("site_id", site.id)
      .eq("active", true)
      .order("display_order"),
  ]);

  const updates = updatesRes.data ?? [];
  const coaches = (coachesRes.data ?? []) as RosterCoach[];
  const heroes = heroesRes.data ?? [];
  const assignments = assignmentsRes.data ?? [];
  const roster = (rosterRes.data ?? []) as RosterRow[];
  const cycleWeeks = (cycleWeeksRes.data ?? []) as CycleWeek[];
  const meetings = (meetingsRes.data ?? []) as ClubMeeting[];

  // club_meeting_attendees/cycle_weeks have no site_id of their own (they reach
  // it through club_meetings, per 0022's RLS) — so, like heroIds below, they're
  // fetched here once the meeting ids they key off are known, rather than
  // joined into the Promise.all above. Both feed the weekly and the monthly
  // view alike, so this one pass covers whichever the client toggle lands on.
  const meetingIds = meetings.map((m) => m.id);
  const [attendeeRes, meetingWeekRes] = meetingIds.length
    ? await Promise.all([
        supabase
          .from("club_meeting_attendees")
          .select("meeting_id, coach_id")
          .in("meeting_id", meetingIds),
        supabase
          .from("club_meeting_cycle_weeks")
          .select("meeting_id, cycle_week_number")
          .in("meeting_id", meetingIds),
      ])
    : [{ data: [] as MeetingAttendee[] }, { data: [] as MeetingCycleWeek[] }];
  const meetingAttendees = (attendeeRes.data ?? []) as MeetingAttendee[];
  const meetingCycleWeeks = (meetingWeekRes.data ?? []) as MeetingCycleWeek[];

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

  // rota_coaches is site-readable by any coach (see lib/clubProfile/names.ts),
  // so attendee names come straight off the roster already fetched above
  // rather than through resolve_profile_names().
  const coachNameById = new Map(coaches.map((c) => [c.id, c.name]));

  const meetingViews = buildMeetingViews({
    meetings,
    attendees: meetingAttendees,
    cycleWeeks: meetingCycleWeeks,
    coachNameById,
  });

  // Both read views are built here so the Weekly/Monthly toggle is a pure
  // client-side switch — no second fetch, no navigation.
  const currentCycleWeekNumber = cycleWeekNumberFor(cycleWeeks, monday);
  const weeklyMeetingGroups = groupMeetingsByCategory(
    meetingViews.filter((m) => meetingRunsInCycleWeek(m, currentCycleWeekNumber))
  );
  const monthlyMeetingGroups = buildMonthlyOccurrenceGroups(
    meetingViews,
    cycleWeeksInMonth(cycleWeeks, londonToday())
  );
  // Manage meetings edits the definitions themselves, so it sees every active
  // meeting regardless of which weeks it runs in.
  const manageMeetingGroups = groupMeetingsByCategory(meetingViews);

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

      <ClubMeetings
        siteId={site.id}
        canEdit={canEditMeetings}
        cycleWeekNumber={currentCycleWeekNumber}
        weeklyGroups={weeklyMeetingGroups}
        monthlyGroups={monthlyMeetingGroups}
        manageGroups={manageMeetingGroups}
        coaches={coaches}
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
