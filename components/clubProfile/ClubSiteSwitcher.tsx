"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { SiteOption } from "@/lib/rota/siteAccess";

/**
 * Site selector for the Club Profile header. Same behaviour as the rota's
 * SiteSwitcher — coaches only ever have their own club, so they get a plain
 * label instead of a one-option dropdown — but pointed at /club-profile.
 */
export default function ClubSiteSwitcher({
  sites,
  currentSlug,
  canSwitch,
}: {
  sites: SiteOption[];
  currentSlug: string;
  canSwitch: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const current = sites.find((s) => s.slug === currentSlug);

  if (!canSwitch || sites.length < 2) {
    return (
      <span className="rounded-lg bg-background px-2.5 py-1.5 text-sm font-semibold text-slate-dark">
        {current?.name ?? "Unknown site"}
      </span>
    );
  }

  return (
    <select
      aria-label="Club"
      value={currentSlug}
      disabled={pending}
      onChange={(e) =>
        startTransition(() => router.push(`/club-profile/${e.target.value}`))
      }
      className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm font-semibold text-ink focus:border-orange focus:outline-none disabled:opacity-60"
    >
      {sites.map((s) => (
        <option key={s.id} value={s.slug}>
          {s.name}
        </option>
      ))}
    </select>
  );
}
