import Link from "next/link";
import type { AttentionItem } from "@/lib/rota/landing";
import { secondaryButtonClass } from "@/components/formStyles";

const CARD = "rounded-card border border-line bg-card p-4 shadow-card";
const LINK_BUTTON = `mt-3 inline-block ${secondaryButtonClass}`;

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between border-t border-line py-1.5 text-[13px] first:border-t-0">
      <span className="text-slate">{label}</span>
      <b className="font-bold text-ink">{value}</b>
    </div>
  );
}

/** Standard rota, Needs attention, Roster and Restructure, in that order. */
export default function RotaHomeSidebar({
  siteSlug,
  canEdit,
  canManageUsers,
  standard,
  rosterCount,
  restructureExists,
  attention,
}: {
  siteSlug: string;
  canEdit: boolean;
  canManageUsers: boolean;
  standard: { coaches: number; classes: number };
  rosterCount: number;
  restructureExists: boolean;
  attention: AttentionItem[];
}) {
  const usersLabel = "Admin › Users";

  return (
    <aside className="flex flex-col gap-4">
      <div className={CARD}>
        <h3 className="text-[15px] font-bold text-ink">Standard rota</h3>
        <p className="mb-2 text-[12.5px] text-slate-light">
          The repeating template new weeks start from.
        </p>
        <Row label="Coaches" value={standard.coaches} />
        <Row label="Classes per week" value={standard.classes} />
        <Link href={`/rota/${siteSlug}/standard`} className={LINK_BUTTON}>
          {canEdit ? "Edit standard rota" : "View standard rota"}
        </Link>
      </div>

      <div className={CARD}>
        <h3 className="text-[15px] font-bold text-ink">Needs attention</h3>
        {attention.length === 0 ? (
          <p className="mt-1 text-[13px] text-slate">Nothing needs attention.</p>
        ) : (
          <ul className="mt-2">
            {attention.map((item) => (
              <li
                key={`${item.monday}-${item.day}`}
                className="flex gap-2 border-t border-line py-[7px] text-[13px] first:border-t-0"
              >
                <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-[#a02a1c]" />
                <Link
                  href={`/rota/${siteSlug}?week=${item.monday}#week-detail`}
                  className="text-left text-ink hover:underline"
                >
                  {item.text}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={CARD}>
        <h3 className="text-[15px] font-bold text-ink">Roster</h3>
        <p className="mt-1 text-[13px] text-ink">
          {rosterCount === 1 ? "1 coach" : `${rosterCount} coaches`} on the roster
        </p>
        <p className="mt-1 text-[13px] text-slate">
          Coaches are added in{" "}
          {canManageUsers ? (
            <Link href="/admin/users" className="font-semibold text-orange-dark hover:underline">
              {usersLabel}
            </Link>
          ) : (
            usersLabel
          )}
          .
        </p>
      </div>

      <div className={CARD}>
        <h3 className="text-[15px] font-bold text-ink">Restructure</h3>
        {restructureExists ? (
          <>
            <p className="mt-1 text-[13px] text-slate">Restructure in progress</p>
            <Link href={`/rota/${siteSlug}/restructure`} className={LINK_BUTTON}>
              Open
            </Link>
          </>
        ) : (
          <>
            <p className="mt-1 text-[13px] text-slate">No restructure in progress.</p>
            {canEdit && (
              <Link href={`/rota/${siteSlug}/restructure`} className={LINK_BUTTON}>
                Start a restructure
              </Link>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
