import { getCurrentProfile } from "@/lib/getCurrentProfile";
import { createClient } from "@/lib/supabaseServer";
import WhatsNewFeed, { type WhatsNewItem } from "@/components/WhatsNewFeed";

// Reachable only from the dashboard panel's "All" button — deliberately not in
// the nav, so there is no NavBar entry for it.
//
// Readable by every active coach, so unlike /admin/users there is no redirect
// here: the (protected) layout already handles signed-out and deactivated
// accounts. `role` only decides whether the write controls render, and 0025's
// insert/update/delete policies re-check is_admin() in the database, so a coach
// who forced isAdmin true in the browser would still be refused.

export default async function WhatsNewPage() {
  const { user, profile } = await getCurrentProfile();
  const isAdmin = profile?.role === "admin";

  // RLS-gated select: whats_new_select_authenticated (0025) requires
  // is_active_coach(). Ordered by published_at — the date the item claims, not
  // the date its row was written — matching the dashboard panel.
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("whats_new")
    .select("id, title, body, link_url, link_label, published_at")
    .order("published_at", { ascending: false });

  return (
    <main className="mx-auto max-w-[920px] p-6">
      <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-[26px] font-extrabold tracking-[-0.3px] text-slate-dark">
          What&apos;s new
        </h1>
        <div className="text-[13px] text-slate-light">
          Home / <b className="font-bold text-orange">What&apos;s new</b>
        </div>
      </div>

      <WhatsNewFeed
        isAdmin={isAdmin}
        currentUserId={user?.id ?? null}
        initialItems={(items ?? []) as WhatsNewItem[]}
      />
    </main>
  );
}
