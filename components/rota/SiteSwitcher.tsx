"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { SiteOption } from "@/lib/rota/siteAccess";

/**
 * Site selector for the rota header. Coaches only ever have their own site, so
 * they get a plain label instead of a one-option dropdown.
 *
 * Switching keeps the Standard and Restructure boards on the same board at the
 * other site. Every other rota page (landing, a week) goes to the other site's
 * landing page: weeks belong to a site, so there's no same week to keep.
 */
export default function SiteSwitcher({
  sites,
  currentSlug,
  canSwitch,
  view,
}: {
  sites: SiteOption[];
  currentSlug: string;
  canSwitch: boolean;
  /** The board to stay on at the other site; omitted = its landing page. */
  view?: "standard" | "restructure";
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
      aria-label="Site"
      value={currentSlug}
      disabled={pending}
      // router.push keeps this a client-side navigation — the board remounts
      // with the new site's data, but the app shell isn't reloaded.
      onChange={(e) =>
        startTransition(() =>
          router.push(`/rota/${e.target.value}${view ? `/${view}` : ""}`)
        )
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
