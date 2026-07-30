import { redirect } from "next/navigation";
import { currentMonday } from "@/lib/rota/week";

/**
 * /rota/{site}/week with no date — the canonical "this week" link. Sends the
 * user to the current real-world week, which is the only URL the board itself
 * ever renders. Access is checked there.
 */
export default async function RotaWeekIndexPage({
  params,
}: {
  params: Promise<{ siteSlug: string }>;
}) {
  const { siteSlug } = await params;
  redirect(`/rota/${siteSlug}/week/${currentMonday()}`);
}
