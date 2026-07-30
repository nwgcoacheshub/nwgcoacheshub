import Link from "next/link";

/**
 * Standard-rota / this-week switch for one site.
 *
 * The week tab always points at /week rather than a specific date, so it
 * lands on the current real-world week however far the user has paged away.
 */
export default function RotaViewTabs({
  siteSlug,
  active,
}: {
  siteSlug: string;
  active: "standard" | "week";
}) {
  const tabs = [
    { key: "standard", label: "Standard rota", href: `/rota/${siteSlug}` },
    { key: "week", label: "This week", href: `/rota/${siteSlug}/week` },
  ] as const;

  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-white p-0.5">
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={`rounded-md px-2.5 py-1.5 text-[13px] font-semibold ${
              isActive
                ? "bg-orange-pale text-orange-dark"
                : "text-slate hover:text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
