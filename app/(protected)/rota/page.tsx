import { createClient } from "@/lib/supabaseServer";
import StandardRotaBoard, {
  type Category,
  type ClassRow,
  type Coach,
  type RosterRow,
} from "@/components/rota/StandardRotaBoard";

// Phase 2 is one site only — no site switcher yet. Looked up by slug so the
// hardcoded value stays readable and swapping it doesn't touch anything else.
const SITE_SLUG = "leeds";

export default async function RotaPage() {
  const supabase = await createClient();

  const { data: site } = await supabase
    .from("rota_sites")
    .select("id, name")
    .eq("slug", SITE_SLUG)
    .single();

  if (!site) {
    return (
      <main className="mx-auto max-w-[1280px] p-6">
        <h1 className="text-[26px] font-extrabold tracking-[-0.3px] text-slate-dark">
          Standard rota
        </h1>
        <p className="mt-2 text-sm text-slate-light">
          Site “{SITE_SLUG}” wasn&apos;t found, or you don&apos;t have access to it.
        </p>
      </main>
    );
  }

  const [categoriesRes, coachesRes, rosterRes, classesRes] = await Promise.all([
    supabase
      .from("rota_categories")
      .select("key, label, color_hex")
      .eq("active", true)
      .order("sort_order"),
    supabase.from("rota_coaches").select("id, name").eq("site_id", site.id).order("name"),
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
        "id, day_of_week, coach_id, set_coach_id, title, category_key, meta, start_mins, duration_mins"
      )
      .eq("site_id", site.id)
      .order("start_mins"),
  ]);

  return (
    <main className="mx-auto max-w-[1280px] p-6">
      <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-[26px] font-extrabold tracking-[-0.3px] text-slate-dark">
          Standard rota
        </h1>
        <div className="text-[13px] text-slate-light">
          Home / <b className="font-bold text-orange">Rota</b>
        </div>
      </div>
      <div className="mb-5 text-sm text-slate-light">
        {site.name} · the repeating weekly template this site works to.
      </div>

      <StandardRotaBoard
        siteId={site.id}
        siteName={site.name}
        categories={(categoriesRes.data ?? []) as Category[]}
        initialCoaches={(coachesRes.data ?? []) as Coach[]}
        initialRoster={(rosterRes.data ?? []) as RosterRow[]}
        initialClasses={(classesRes.data ?? []) as ClassRow[]}
      />
    </main>
  );
}
