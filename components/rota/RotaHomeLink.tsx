import Link from "next/link";

/** Back to the site's rota landing page, in the slot the view tabs used. */
export default function RotaHomeLink({ siteSlug }: { siteSlug: string }) {
  return (
    <Link
      href={`/rota/${siteSlug}`}
      className="text-[13px] font-semibold text-orange-dark hover:underline"
    >
      ‹ Rota home
    </Link>
  );
}
