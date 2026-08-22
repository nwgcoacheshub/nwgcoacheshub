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

// ?id=<uuid> comes from clicking an item in the dashboard panel, and means
// "open this one on arrival". It is read here rather than with
// useSearchParams() in the feed for two reasons: this page already does its
// derivation server-side and hands the client component props (the same shape
// as PoliciesPage), and reading it here means the row arrives already expanded
// in the server-rendered HTML instead of flashing collapsed and then opening.
//
// It seeds initial state only. The feed never writes the param back as rows are
// toggled — see the note on expandedIds there.

export default async function WhatsNewPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const { user, profile } = await getCurrentProfile();
  const isAdmin = profile?.role === "admin";
  const { id } = await searchParams;

  // RLS-gated select: whats_new_select_authenticated (0025) requires
  // is_active_coach(). Ordered by published_at — the date the item claims, not
  // the date its row was written — matching the dashboard panel.
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("whats_new")
    .select("id, title, body, link_url, link_label, published_at")
    .order("published_at", { ascending: false });

  // Resolved against the rows actually on the page, so a stale link — an item
  // deleted since the dashboard rendered — quietly becomes null and the page
  // loads with nothing expanded. A repeated ?id= arrives as an array, which is
  // not a meaningful request either way, so only a lone string is honoured.
  const focusId =
    typeof id === "string" && (items ?? []).some((item) => item.id === id) ? id : null;

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
        focusId={focusId}
      />
    </main>
  );
}
