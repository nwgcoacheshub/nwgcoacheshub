// Shared class strings for form controls, at the density agreed in CLAUDE.md's
// sizing tokens table. Extracted verbatim from UsersTable so Club Profile's
// forms match the Users page exactly rather than re-deriving the values — if
// the density changes again, it changes in one place.

export const inputClass =
  "w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink placeholder:text-slate-light focus:border-orange focus:outline-none";

export const labelClass = "mb-1.5 block text-[12.5px] font-semibold text-slate-dark";

export const primaryButtonClass =
  "rounded-lg bg-orange px-3.5 py-2 text-[13px] font-bold text-white hover:bg-orange-dark disabled:cursor-not-allowed disabled:opacity-60";

export const secondaryButtonClass =
  "rounded-lg border border-line bg-white px-3.5 py-2 text-[13px] font-bold text-slate-dark hover:bg-background";

export const rowActionClass =
  "rounded-md border border-line bg-white px-2 py-1 text-xs font-semibold text-slate-dark hover:bg-background disabled:cursor-not-allowed disabled:opacity-60";
