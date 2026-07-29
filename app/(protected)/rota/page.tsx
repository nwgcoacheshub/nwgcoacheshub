import { redirect } from "next/navigation";
import { getSiteAccess } from "@/lib/rota/siteAccess";
import RotaUnavailable from "@/components/rota/RotaUnavailable";

/**
 * /rota has no site of its own — send people to one they can actually see:
 * admins to the first site by sort_order, coaches to their own.
 */
export default async function RotaIndexPage() {
  const access = await getSiteAccess();

  if (!access.ok) {
    return <RotaUnavailable access={access} />;
  }

  redirect(`/rota/${access.homeSlug}`);
}
