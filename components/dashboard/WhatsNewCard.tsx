import { createClient } from "@/lib/supabaseServer";
import { formatPublished } from "@/lib/whatsNew/format";

// Self-fetching async server component, the same shape as WeeklyFocusHero: the
// dashboard renders <WhatsNewCard /> with no props and this component owns its
// own query.
//
// The select is RLS-gated by whats_new_select_authenticated (0025), which
// requires is_active_coach() — a deactivated session with a still-valid JWT
// reads nothing here.
//
// The three items shown are the three most recent by published_at, which is the
// date the announcement claims rather than the date its row was written (0025).
// "All" is the only route into /whats-new; that page is deliberately not in the
// nav.

export default async function WhatsNewCard() {
  const supabase = await createClient();

  const { data: items } = await supabase
    .from("whats_new")
    .select("id, title, body, link_url, link_label, published_at")
    .order("published_at", { ascending: false })
    .limit(3);

  const newsItems = items ?? [];

  return (
    <div className="mb-5 overflow-hidden rounded-card border border-line bg-card shadow-card">
      <h4 className="flex items-center justify-between border-b border-line px-[18px] py-[15px] text-sm font-bold text-ink">
        What&apos;s new
        <a href="/whats-new" className="text-xs font-bold text-orange">
          All
        </a>
      </h4>

      {newsItems.length === 0 ? (
        <div className="px-[18px] py-6 text-center text-[12.5px] text-slate-light">
          Nothing new right now.
        </div>
      ) : (
        newsItems.map((item) => (
          <div key={item.id} className="border-b border-line px-[18px] py-3 last:border-b-0">
            <div className="flex items-start gap-2 text-[13.5px] font-semibold leading-[1.35] text-ink">
              {/* Decorative only, and deliberately fixed: the placeholder's dot
                  was colour-coded by a category whats_new has no column for, so
                  this is one accent shared by every item rather than a signal. */}
              <span className="mt-[6px] h-[7px] w-[7px] shrink-0 rounded-full bg-orange" />
              <span className="min-w-0">{item.title}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-[12.5px] leading-[1.45] text-slate">
              {item.body}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="text-[11.5px] text-slate-light">
                {formatPublished(item.published_at)}
              </span>
              {item.link_url && (
                <a
                  href={item.link_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-orange-pale px-2 py-0.5 text-[11px] font-bold text-orange-dark"
                >
                  {item.link_label || "Open link"}
                </a>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
