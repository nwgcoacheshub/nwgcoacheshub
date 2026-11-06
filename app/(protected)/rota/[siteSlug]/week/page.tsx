import { redirect } from "next/navigation";

/**
 * /rota/{site}/week with no date. Kept for old bookmarks: the landing page
 * picks the week to show, since this week may not have been created. Access is
 * checked there.
 */
export default async function RotaWeekIndexPage({
  params,
}: {
  params: Promise<{ siteSlug: string }>;
}) {
  const { siteSlug } = await params;
  redirect(`/rota/${siteSlug}`);
}
