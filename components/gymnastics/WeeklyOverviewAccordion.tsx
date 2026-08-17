"use client";

import { useState } from "react";

export type WeekRow = {
  weekCommencing: string;
  weekLabel: string;
  wcLabel: string;
  warmUp: string | null;
  skillFocus: string | null;
  miniTheme: string | null;
};

export type MonthGroup = {
  key: string;
  label: string;
  rows: WeekRow[];
};

export default function WeeklyOverviewAccordion({
  months,
  currentMonthKey,
  currentWeekCommencing,
}: {
  months: MonthGroup[];
  currentMonthKey: string;
  currentWeekCommencing: string;
}) {
  const [openMonths, setOpenMonths] = useState<Set<string>>(() => new Set([currentMonthKey]));

  function toggleMonth(key: string) {
    setOpenMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <div className="mt-[26px]">
      <div className="mb-3 ml-0.5 flex items-center gap-2 text-xs font-bold uppercase tracking-[1.2px] text-slate-light">
        Full year schedule
        <span className="h-px flex-1 bg-line" />
      </div>

      <div className="flex flex-col gap-3">
        {months.map((month) => {
          const isOpen = openMonths.has(month.key);
          return (
            <div
              key={month.key}
              className="overflow-hidden rounded-card border border-line bg-card shadow-card"
            >
              <button
                type="button"
                onClick={() => toggleMonth(month.key)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between px-5 py-3.5 text-left text-[15px] font-bold text-ink"
              >
                {month.label}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  className={`shrink-0 text-slate-light transition-transform ${isOpen ? "rotate-180" : ""}`}
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {isOpen && (
                <div className="overflow-x-auto border-t border-line">
                  <table className="w-full text-left text-[13px]">
                    <thead>
                      <tr className="text-xs font-bold uppercase tracking-wide text-slate-light">
                        <th className="whitespace-nowrap px-5 py-2.5">Week</th>
                        <th className="whitespace-nowrap px-3 py-2.5">W/c</th>
                        <th className="px-3 py-2.5">Warm up</th>
                        <th className="px-3 py-2.5">Skill focus</th>
                        <th className="px-3 py-2.5">Pre-school theme</th>
                      </tr>
                    </thead>
                    <tbody>
                      {month.rows.map((row) => {
                        const isCurrent = row.weekCommencing === currentWeekCommencing;
                        return (
                          <tr
                            key={row.weekCommencing}
                            className={`border-t border-line ${isCurrent ? "bg-orange-pale" : ""}`}
                          >
                            <td className="whitespace-nowrap px-5 py-2.5 font-semibold text-ink">
                              {row.weekLabel}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-slate">{row.wcLabel}</td>
                            <td className="px-3 py-2.5 text-slate">{row.warmUp ?? "—"}</td>
                            <td className="px-3 py-2.5 text-slate">{row.skillFocus ?? "—"}</td>
                            <td className="px-3 py-2.5 text-slate">{row.miniTheme ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
