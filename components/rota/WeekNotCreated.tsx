import RotaHomeLink from "./RotaHomeLink";

/**
 * Shown for a valid Monday with no rota_weekly_rotas row at this site. Weeks are
 * created from the rota landing page, so nothing here writes, whatever the
 * viewer's job title.
 */
export default function WeekNotCreated({
  siteName,
  siteSlug,
  weekRange,
}: {
  siteName: string;
  siteSlug: string;
  /** e.g. "4–10 Aug 2026" */
  weekRange: string;
}) {
  return (
    <div className="max-w-xl rounded-card border border-line bg-card p-5 shadow-card">
      <h2 className="text-base font-bold text-ink">This week hasn&apos;t been created</h2>
      <p className="mt-2 text-sm text-slate">
        {siteName} has no rota for the week of {weekRange}.
      </p>
      <div className="mt-4">
        <RotaHomeLink siteSlug={siteSlug} />
      </div>
    </div>
  );
}
