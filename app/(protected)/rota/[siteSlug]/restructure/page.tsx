import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabaseServer";
import { getSiteAccess } from "@/lib/rota/siteAccess";
import { getCanEditRota } from "@/lib/rota/canEdit";
import RotaUnavailable from "@/components/rota/RotaUnavailable";
import SiteSwitcher from "@/components/rota/SiteSwitcher";
import RotaViewTabs from "@/components/rota/RotaViewTabs";
import RestructureBoard from "@/components/rota/RestructureBoard";
import RestructureEmpty from "@/components/rota/RestructureEmpty";
import {
  type CatalogueItem,
  type Category,
  type ClassRow,
  type Coach,
  type RosterRow,
} from "@/components/rota/RotaBoard";

export default async function RotaRestructurePage({
  params,
}: {
  params: Promise<{ siteSlug: string }>;
}) {
  const { siteSlug } = await params;

  const access = await getSiteAccess();
  if (!access.ok) {
    return <RotaUnavailable access={access} title="Restructure" />;
  }

  // Same check as the other two rota pages: only sites this user may view are
  // in access.sites, so this covers an unknown slug and a coach reaching for
  // someone else's site alike.
  const site = access.sites.find((s) => s.slug === siteSlug);
  if (!site) {
    redirect(`/rota/${access.homeSlug}/restructure`);
  }

  // Same split as the other two pages: site visibility and write rights are
  // separate questions, and getCurrentProfile() is cached per request.
  const canEdit = await getCanEditRota();
  const supabase = await createClient();

  // Keyed on site_id alone — there is never more than one Restructure per
  // site, so no date to also match on.
  const { data: restructure } = await supabase
    .from("rota_restructures")
    .select("id, generated_at")
    .eq("site_id", site.id)
    .maybeSingle();

  const head = (
    <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-[26px] font-extrabold tracking-[-0.3px] text-slate-dark">
          Restructure
        </h1>
        <SiteSwitcher
          sites={access.sites}
          currentSlug={site.slug}
          canSwitch={access.canSwitch}
        />
        <RotaViewTabs siteSlug={site.slug} active="restructure" />
      </div>
      <div className="text-[13px] text-slate-light">
        Home / <b className="font-bold text-orange">Rota</b>
      </div>
    </div>
  );

  if (!restructure) {
    return (
      <main className="mx-auto max-w-[1280px] p-6">
        {head}
        <div className="mb-3 text-sm text-slate-light">
          A one-off editable snapshot, built on demand from the Standard Rota.
        </div>
        <RestructureEmpty siteId={site.id} siteName={site.name} canEdit={canEdit} />
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
      // Coaches stay site-scoped: the restructure's roster points at the
      // site's coaches, same as the Standard Rota and every week.
      supabase
        .from("rota_coaches")
        .select("id, name, active")
        .eq("site_id", site.id)
        .order("name"),
      supabase
        .from("rota_restructure_roster")
        .select(
          "id, day_of_week, coach_id, sort_order, shift_start_mins, shift_end_mins, status, is_key_holder, is_lead, is_cashing_up"
        )
        .eq("restructure_id", restructure.id)
        .order("sort_order"),
      supabase
        .from("rota_restructure_classes")
        .select(
          "id, day_of_week, coach_id, set_coach_id, class_catalogue_id, title, category_key, meta, start_mins, duration_mins"
        )
        .eq("restructure_id", restructure.id)
        .order("start_mins"),
    ]);

  // Same full-bleed, self-scrolling shell as the Standard Rota and a
  // generated week — it's the same board. The no-restructure-yet branch above
  // stays a normal boxed page: there's no grid on it, just a card.
  return (
    <main className="fills-viewport flex min-h-0 flex-1 flex-col">
      <div className="px-5 pt-4">
        {head}
        <div className="mb-3 text-sm text-slate-light">
          A one-off editable snapshot, built on demand from the Standard Rota.
        </div>
      </div>
      <RestructureBoard
        siteId={site.id}
        siteName={site.name}
        restructureId={restructure.id}
        generatedAt={restructure.generated_at}
        categories={(categoriesRes.data ?? []) as Category[]}
        catalogue={(catalogueRes.data ?? []) as CatalogueItem[]}
        initialCoaches={(coachesRes.data ?? []) as Coach[]}
        initialRoster={(rosterRes.data ?? []) as RosterRow[]}
        initialClasses={(classesRes.data ?? []) as ClassRow[]}
        canEdit={canEdit}
      />
    </main>
  );
}
