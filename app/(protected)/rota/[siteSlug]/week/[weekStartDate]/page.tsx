import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";
import { getSiteAccess } from "@/lib/rota/siteAccess";
import {
  currentMonday,
  formatWeekDate,
  mondayOf,
  parseWeekDate,
  weekRangeLabel,
} from "@/lib/rota/week";
import RotaUnavailable from "@/components/rota/RotaUnavailable";
import SiteSwitcher from "@/components/rota/SiteSwitcher";
import RotaViewTabs from "@/components/rota/RotaViewTabs";
import WeekNav from "@/components/rota/WeekNav";
import WeeklyRotaBoard from "@/components/rota/WeeklyRotaBoard";
import WeeklyRotaEmpty from "@/components/rota/WeeklyRotaEmpty";
import {
  type CatalogueItem,
  type Category,
  type ClassRow,
  type Coach,
  type RosterRow,
} from "@/components/rota/RotaBoard";

export default async function RotaWeekPage({
  params,
}: {
  params: Promise<{ siteSlug: string; weekStartDate: string }>;
}) {
  const { siteSlug, weekStartDate } = await params;

  const access = await getSiteAccess();
  if (!access.ok) {
    return <RotaUnavailable access={access} title="Weekly rota" />;
  }

  // Same check as the standard page: only sites this user may view are in
  // access.sites, so this covers an unknown slug and a coach reaching for
  // someone else's site alike.
  const site = access.sites.find((s) => s.slug === siteSlug);
  if (!site) {
    redirect(`/rota/${access.homeSlug}/week`);
  }

  // A week is only ever addressed by its Monday, so anything else is bounced to
  // the canonical URL rather than rendered — otherwise the same week would be
  // reachable at seven different addresses.
  const parsed = parseWeekDate(weekStartDate);
  if (!parsed) {
    redirect(`/rota/${siteSlug}/week`);
  }
  const monday = formatWeekDate(mondayOf(parsed));
  if (monday !== weekStartDate) {
    redirect(`/rota/${siteSlug}/week/${monday}`);
  }

  const weekRange = weekRangeLabel(parsed);
  const supabase = await createClient();

  const { data: weekly } = await supabase
    .from("rota_weekly_rotas")
    .select("id, generated_at")
    .eq("site_id", site.id)
    .eq("week_start_date", monday)
    .maybeSingle();

  const head = (
    <>
      <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[26px] font-extrabold tracking-[-0.3px] text-slate-dark">
            Weekly rota
          </h1>
          <SiteSwitcher
            sites={access.sites}
            currentSlug={site.slug}
            canSwitch={access.canSwitch}
          />
          <RotaViewTabs siteSlug={site.slug} active="week" />
        </div>
        <div className="text-[13px] text-slate-light">
          Home / <b className="font-bold text-orange">Rota</b>
        </div>
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-slate-light">Week of {weekRange}</div>
        <WeekNav
          siteSlug={site.slug}
          monday={monday}
          currentMonday={currentMonday()}
        />
      </div>
    </>
  );

  if (!weekly) {
    return (
      <main className="mx-auto max-w-[1280px] p-6">
        {head}
        <WeeklyRotaEmpty
          siteId={site.id}
          siteName={site.name}
          weekStart={monday}
          weekRange={weekRange}
        />
      </main>
    );
  }

  const [categoriesRes, catalogueRes, coachesRes, rosterRes, classesRes] =
    await Promise.all([
      supabase
        .from("rota_categories")
        .select("key, label, color_hex")
        .eq("active", true)
        .order("sort_order"),
      supabase
        .from("rota_class_catalogue")
        .select("id, title, category_key, default_meta, default_duration_mins")
        .eq("active", true)
        .order("sort_order"),
      // Coaches stay site-scoped: a week's roster points at the site's coaches,
      // and adding one on the week board adds them to the site.
      supabase
        .from("rota_coaches")
        .select("id, name, active")
        .eq("site_id", site.id)
        .order("name"),
      supabase
        .from("rota_weekly_roster")
        .select(
          "id, day_of_week, coach_id, sort_order, shift_start_mins, shift_end_mins, status, is_key_holder, is_lead, is_cashing_up"
        )
        .eq("weekly_rota_id", weekly.id)
        .order("sort_order"),
      supabase
        .from("rota_weekly_classes")
        .select(
          "id, day_of_week, coach_id, set_coach_id, class_catalogue_id, title, category_key, meta, start_mins, duration_mins"
        )
        .eq("weekly_rota_id", weekly.id)
        .order("start_mins"),
    ]);

  return (
    <main className="mx-auto max-w-[1280px] p-6">
      {head}
      <WeeklyRotaBoard
        siteId={site.id}
        siteName={site.name}
        weeklyRotaId={weekly.id}
        generatedAt={weekly.generated_at}
        weekStart={monday}
        weekRange={weekRange}
        categories={(categoriesRes.data ?? []) as Category[]}
        catalogue={(catalogueRes.data ?? []) as CatalogueItem[]}
        initialCoaches={(coachesRes.data ?? []) as Coach[]}
        initialRoster={(rosterRes.data ?? []) as RosterRow[]}
        initialClasses={(classesRes.data ?? []) as ClassRow[]}
      />
    </main>
  );
}
