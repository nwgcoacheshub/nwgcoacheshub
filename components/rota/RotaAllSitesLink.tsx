import Link from "next/link";

/** Back to the all-sites grid, for view_all_sites holders on a site's landing page. */
export default function RotaAllSitesLink() {
  return (
    <Link href="/rota" className="text-[13px] font-semibold text-orange-dark hover:underline">
      ‹ All sites
    </Link>
  );
}
