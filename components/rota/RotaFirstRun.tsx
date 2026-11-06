import Link from "next/link";
import type { ReactNode } from "react";
import { primaryButtonClass, secondaryButtonClass } from "@/components/formStyles";

type Step = {
  title: string;
  text: ReactNode;
  done: boolean;
  locked: boolean;
  /** Only rendered for edit_rota holders. */
  action: ReactNode;
};

/**
 * Shown instead of a site's landing page while the site is "Not set up" (no
 * Standard Rota classes and no created weeks). Once the standard rota has a
 * class the normal landing page, with its "Add a week" empty state, takes over,
 * so step 3 is only ever shown locked here.
 *
 * Read only for anyone without edit_rota at the site: a "hasn't been set up yet"
 * heading and the step status, with no links or buttons.
 */
export default function RotaFirstRun({
  siteSlug,
  siteName,
  canEdit,
  canManageUsers,
  rosterCount,
  standardClasses,
}: {
  siteSlug: string;
  siteName: string;
  canEdit: boolean;
  canManageUsers: boolean;
  /** site_rota_roster's size. */
  rosterCount: number;
  standardClasses: number;
}) {
  const coachesDone = rosterCount >= 1;
  const standardDone = standardClasses >= 1;
  const current = !coachesDone ? 0 : !standardDone ? 1 : 2;

  const steps: Step[] = [
    {
      title: "Coaches on the roster",
      text: `${rosterCount} ${rosterCount === 1 ? "coach has" : "coaches have"} ${siteName} as their site.`,
      done: coachesDone,
      locked: false,
      action: coachesDone ? null : canManageUsers ? (
        <Link href="/admin/users" className={secondaryButtonClass}>
          Admin › Users
        </Link>
      ) : (
        <span className="text-[12.5px] text-slate">Ask an admin to add coaches in Admin › Users</span>
      ),
    },
    {
      title: "Build the standard rota",
      text: "Your normal week: which classes run, when, and whose group each one is.",
      done: standardDone,
      locked: false,
      action: (
        <Link
          href={`/rota/${siteSlug}/standard`}
          className={current === 1 ? primaryButtonClass : secondaryButtonClass}
        >
          Build
        </Link>
      ),
    },
    {
      title: "Add your first week",
      text: "Copy the standard rota into a week and adjust it for absences or cover.",
      done: false,
      locked: !standardDone,
      action: !standardDone ? (
        <button type="button" disabled className={`${secondaryButtonClass} cursor-not-allowed`}>
          Add week
        </button>
      ) : null,
    },
  ];

  return (
    <section className="mx-auto mt-2.5 max-w-[720px]">
      {canEdit ? (
        <>
          <h2 className="text-xl font-extrabold text-slate-dark">Set up {siteName}&apos;s rota</h2>
          <p className="mt-1 text-sm text-slate">
            Three steps. Once the standard rota is in place, each new week starts as a copy of it
            and you only change what&rsquo;s different.
          </p>
        </>
      ) : (
        <h2 className="text-xl font-extrabold text-slate-dark">
          {siteName}&rsquo;s rota hasn&rsquo;t been set up yet
        </h2>
      )}

      <ol className="mt-4 flex flex-col gap-2.5">
        {steps.map((step, i) => {
          const isCurrent = i === current && !step.locked;
          return (
            <li
              key={step.title}
              className={`grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 rounded-card border bg-card p-3.5 shadow-card ${
                isCurrent ? "border-orange" : "border-line"
              } ${step.locked ? "opacity-60" : ""}`}
            >
              <span
                className={`grid h-7 w-7 place-items-center rounded-full text-[13px] font-bold ${
                  step.done
                    ? "bg-[#E6F5EC] text-status-green"
                    : isCurrent
                      ? "bg-orange text-white"
                      : "bg-[#EEF0F2] text-status-grey"
                }`}
              >
                {step.done ? "✓" : i + 1}
                <span className="sr-only">
                  {step.done ? " Done" : step.locked ? " Locked" : " Not done"}
                </span>
              </span>
              <div>
                <h4 className="text-sm font-bold text-ink">{step.title}</h4>
                <p className="mt-0.5 text-[13px] text-slate">{step.text}</p>
              </div>
              <div>{canEdit && step.action}</div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
