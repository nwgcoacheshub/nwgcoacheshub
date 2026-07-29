import type { SiteAccess } from "@/lib/rota/siteAccess";

type Unavailable = Extract<SiteAccess, { ok: false }>;

/**
 * Shown instead of the board when we can't resolve a site for this user — so
 * they get an explanation rather than an empty grid that looks broken.
 */
export default function RotaUnavailable({ access }: { access: Unavailable }) {
  const isUnmatched = access.reason === "profile-site-unmatched";

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

      <div className="mt-4 max-w-xl rounded-card border border-line bg-card p-5 shadow-card">
        {isUnmatched ? (
          <>
            <h2 className="text-base font-bold text-ink">
              No rota site matches your profile
            </h2>
            <p className="mt-2 text-sm text-slate">
              {access.profileSite ? (
                <>
                  Your profile site is set to{" "}
                  <b className="font-semibold text-ink">{access.profileSite}</b>, which
                  doesn&apos;t match a rota site that&apos;s been set up.
                </>
              ) : (
                <>Your profile doesn&apos;t have a site set.</>
              )}{" "}
              Contact an admin to get this corrected.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-base font-bold text-ink">No rota sites set up yet</h2>
            <p className="mt-2 text-sm text-slate">
              No active sites exist in the rota yet. An admin needs to add them before
              rotas can be built.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
