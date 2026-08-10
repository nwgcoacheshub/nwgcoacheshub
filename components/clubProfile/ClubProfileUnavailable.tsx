import type { SiteAccess } from "@/lib/rota/siteAccess";

type Unavailable = Extract<SiteAccess, { ok: false }>;

/**
 * Shown instead of the page when we can't resolve a site for this user — so
 * they get an explanation rather than an empty page that looks broken. Mirrors
 * RotaUnavailable; separate because the copy and breadcrumb differ, and Head
 * Office staff will land here by design (there's no Head Office rota site).
 */
export default function ClubProfileUnavailable({ access }: { access: Unavailable }) {
  const isUnmatched = access.reason === "profile-site-unmatched";

  return (
    <main className="mx-auto max-w-[1280px] p-6">
      <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-[26px] font-extrabold tracking-[-0.3px] text-slate-dark">
          Club Profile
        </h1>
        <div className="text-[13px] text-slate-light">
          Home / <b className="font-bold text-orange">Club Profile</b>
        </div>
      </div>

      <div className="mt-4 max-w-xl rounded-card border border-line bg-card p-5 shadow-card">
        {isUnmatched ? (
          <>
            <h2 className="text-base font-bold text-ink">
              No club matches your profile
            </h2>
            <p className="mt-2 text-sm text-slate">
              {access.profileSite ? (
                <>
                  Your profile site is set to{" "}
                  <b className="font-semibold text-ink">{access.profileSite}</b>, which
                  doesn&apos;t have a Club Profile. Head Office roles don&apos;t have one —
                  it&apos;s a per-gym page.
                </>
              ) : (
                <>Your profile doesn&apos;t have a site set.</>
              )}{" "}
              Contact an admin if you think that&apos;s wrong.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-base font-bold text-ink">No clubs set up yet</h2>
            <p className="mt-2 text-sm text-slate">
              No active sites exist yet. An admin needs to add them before Club
              Profiles can be used.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
