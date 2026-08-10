import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";
import { getSiteAccess } from "@/lib/rota/siteAccess";
import { getCanEditRota } from "@/lib/rota/canEdit";
import RotaUnavailable from "@/components/rota/RotaUnavailable";
import SiteSwitcher from "@/components/rota/SiteSwitcher";
import RotaViewTabs from "@/components/rota/RotaViewTabs";
import StandardRotaView from "@/components/rota/StandardRotaView";
import {
  type CatalogueItem,
  type Category,
  type ClassRow,
  type Coach,
  type RosterRow,
} from "@/components/rota/RotaBoard";

export default async function RotaSitePage({
  params,
}: {
  params: Promise<{ siteSlug: string }>;
}) {
  const { siteSlug } = await params;

  const access = await getSiteAccess();
  if (!access.ok) {
    return <RotaUnavailable access={access} />;
  }

  // Only sites this user may view are in `access.sites`, so this one check
  // covers both an unknown slug and a coach reaching for someone else's site.
  const site = access.sites.find((s) => s.slug === siteSlug);
  if (!site) {
    redirect(`/rota/${access.homeSlug}`);
  }

  // Which sites you may see and whether you may write are separate questions —
  // the same split migration 0013 makes, where the job_title check and the site
  // match are separate conjuncts. getCurrentProfile() is cached per request, so
  // this reuses the profile getSiteAccess() already read.
  const canEdit = await getCanEditRota();

  const supabase = await createClient();

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
      supabase
        .from("rota_coaches")
        .select("id, name, active")
        .eq("site_id", site.id)
        .order("name"),
      supabase
        .from("rota_standard_roster")
        .select(
          "id, day_of_week, coach_id, sort_order, shift_start_mins, shift_end_mins, status, is_key_holder, is_lead, is_cashing_up"
        )
        .eq("site_id", site.id)
        .order("sort_order"),
      supabase
        .from("rota_standard_classes")
        .select(
          "id, day_of_week, coach_id, set_coach_id, class_catalogue_id, title, category_key, meta, start_mins, duration_mins"
        )
        .eq("site_id", site.id)
        .order("start_mins"),
    ]);

  // Full width and full height: the board is the page, and it scrolls itself.
  // Only the heading block carries padding — the grid below runs edge to edge.
  return (
    <main className="fills-viewport flex min-h-0 flex-1 flex-col">
      <div className="px-5 pt-4">
        <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[26px] font-extrabold tracking-[-0.3px] text-slate-dark">
              Standard rota
            </h1>
            <SiteSwitcher
              sites={access.sites}
              currentSlug={site.slug}
              canSwitch={access.canSwitch}
            />
            <RotaViewTabs siteSlug={site.slug} active="standard" />
          </div>
          <div className="text-[13px] text-slate-light">
            Home / <b className="font-bold text-orange">Rota</b>
          </div>
        </div>
        <div className="mb-3 text-sm text-slate-light">
          The repeating weekly template this site works to.
        </div>
      </div>

      {/* Keyed on the site so switching remounts the board with fresh state —
          without this, React would keep the previous site's rows in useState. */}
      <StandardRotaView
        key={site.id}
        siteId={site.id}
        siteName={site.name}
        categories={(categoriesRes.data ?? []) as Category[]}
        catalogue={(catalogueRes.data ?? []) as CatalogueItem[]}
        initialCoaches={(coachesRes.data ?? []) as Coach[]}
        initialRoster={(rosterRes.data ?? []) as RosterRow[]}
        initialClasses={(classesRes.data ?? []) as ClassRow[]}
        canEdit={canEdit}
        // `week: null` is what makes this the undated export: no date range in
        // the header, no dates on the day columns, and a file name that says
        // template rather than naming a week.
        exportSpec={{
          siteName: site.name,
          fileBase: `${site.slug}-standard-rota`,
          week: null,
        }}
      />
    </main>
  );
}
