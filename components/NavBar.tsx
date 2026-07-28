"use client";

import { usePathname } from "next/navigation";

function initialsFrom(fullName: string) {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className={`flex items-center gap-2 whitespace-nowrap border-b-[3px] px-4 py-3.5 text-sm font-semibold ${
        active
          ? "border-orange text-orange"
          : "border-transparent text-slate hover:text-ink"
      }`}
    >
      {children}
    </a>
  );
}

export default function NavBar({
  isAdmin,
  fullName,
}: {
  isAdmin: boolean;
  fullName: string;
}) {
  const pathname = usePathname();

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-line bg-white">
        <div className="mx-auto flex max-w-[1280px] items-center gap-6 px-6 py-3.5">
          <div className="flex flex-shrink-0 items-center gap-2.5">
            <span className="text-xl font-extrabold text-slate-dark">
              <span className="text-orange">NWG</span> Coaches Hub
            </span>
          </div>

          <div className="relative max-w-[520px] flex-1">
            <svg
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-light"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              placeholder="Search how-tos, policies, quick links…"
              className="w-full rounded-lg border border-line bg-background py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-slate-light"
            />
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            <button className="flex items-center gap-1.5 rounded-lg bg-orange px-4 py-2.5 text-[13.5px] font-bold text-white shadow-[0_2px_8px_rgba(245,130,32,.35)] hover:bg-orange-dark">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
                <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
              </svg>
              Report a concern
            </button>
            <div className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-full bg-background text-slate">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
            </div>
            <div className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange to-orange-light text-sm font-bold text-white">
              {initialsFrom(fullName)}
            </div>
          </div>
        </div>
      </header>

      <nav className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-[1280px] items-center gap-1 overflow-x-auto px-6">
          <NavLink href="/" active={pathname === "/"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" />
            </svg>
            Home
          </NavLink>
          {isAdmin && (
            <NavLink href="/users" active={pathname.startsWith("/users")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              </svg>
              Users
            </NavLink>
          )}
          <NavLink href="#" active={false}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            Rota
          </NavLink>
        </div>
      </nav>
    </>
  );
}
