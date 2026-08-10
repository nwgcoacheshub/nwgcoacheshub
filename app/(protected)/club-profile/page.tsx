import { redirect } from "next/navigation";
import { getSiteAccess } from "@/lib/rota/siteAccess";
import ClubProfileUnavailable from "@/components/clubProfile/ClubProfileUnavailable";

/**
 * /club-profile has no site of its own — send people to one they can actually
 * see: admins to the first site by sort_order, coaches to their own. Same
 * shape as /rota's index redirect.
 */
export default async function ClubProfileIndexPage() {
  const access = await getSiteAccess();

  if (!access.ok) {
    return <ClubProfileUnavailable access={access} />;
  }

  redirect(`/club-profile/${access.homeSlug}`);
}
