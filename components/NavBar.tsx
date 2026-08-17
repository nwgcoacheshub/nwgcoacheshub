"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type DropdownItem = { label: string; href: string } | { label: string; disabled: true };

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

function NavDropdown({
  id,
  icon,
  label,
  active,
  items,
  open,
  onToggle,
  containerRef,
  triggerRef,
}: {
  id: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  items: DropdownItem[];
  open: boolean;
  onToggle: (id: string) => void;
  containerRef: (el: HTMLDivElement | null) => void;
  triggerRef: (el: HTMLButtonElement | null) => void;
}) {
  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => onToggle(id)}
        className={`flex items-center gap-2 whitespace-nowrap border-b-[3px] px-4 py-3.5 text-sm font-semibold ${
          active
            ? "border-orange text-orange"
            : "border-transparent text-slate hover:text-ink"
        }`}
      >
        {icon}
        {label}
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 min-w-[190px] rounded-lg border border-line bg-white py-1 shadow-[0_1px_3px_rgba(40,48,56,.06),0_6px_20px_rgba(40,48,56,.05)]">
          {items.map((item) =>
            "href" in item ? (
              <a
                key={item.label}
                href={item.href}
                onClick={() => onToggle(id)}
                className="block px-3 py-2 text-sm text-slate hover:bg-background hover:text-ink"
              >
                {item.label}
              </a>
            ) : (
              <span
                key={item.label}
                aria-disabled="true"
                className="block cursor-default px-3 py-2 text-sm text-slate-light"
              >
                {item.label}
              </span>
            )
          )}
        </div>
      )}
    </div>
  );
}

export default function NavBar({
  isAdmin,
  fullName,
  clubSites,
}: {
  isAdmin: boolean;
  fullName: string;
  /**
   * Sites the current user may open a Club Profile for, from rota_sites via
   * getSiteAccess(). Head Office isn't among them — it has no rota_sites row
   * and no Club Profile page.
   */
  clubSites: { id: string; name: string; slug: string }[];
}) {
  const pathname = usePathname();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const containerRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (!openMenu) return;

    function handlePointerDown(e: MouseEvent) {
      const container = containerRefs.current[openMenu!];
      if (container && !container.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        triggerRefs.current[openMenu!]?.focus();
        setOpenMenu(null);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenu]);

  function toggleMenu(id: string) {
    setOpenMenu((prev) => (prev === id ? null : id));
  }

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
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-light"
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
              className="w-full rounded-lg border border-line bg-background py-2 pl-9 pr-3.5 text-sm text-ink placeholder:text-slate-light"
            />
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            <button className="flex items-center gap-1.5 rounded-lg bg-orange px-3.5 py-2 text-[13px] font-bold text-white shadow-[0_2px_8px_rgba(245,130,32,.35)] hover:bg-orange-dark">
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
        <div className="mx-auto flex max-w-[1280px] items-center gap-1 px-6">
          <NavLink href="/" active={pathname === "/"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z" />
            </svg>
            Home
          </NavLink>
          <NavDropdown
            id="club-profile"
            active={pathname.startsWith("/club-profile")}
            open={openMenu === "club-profile"}
            onToggle={toggleMenu}
            containerRef={(el) => { containerRefs.current["club-profile"] = el; }}
            triggerRef={(el) => { triggerRefs.current["club-profile"] = el; }}
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 21V8l9-5 9 5v13" />
                <path d="M9 21v-6h6v6" />
              </svg>
            }
            label="Club Profile"
            items={
              clubSites.length > 0
                ? clubSites.map((site) => ({
                    label: site.name,
                    href: `/club-profile/${site.slug}`,
                  }))
                : [{ label: "No sites available", disabled: true as const }]
            }
          />
          <NavDropdown
            id="gymnastics"
            active={pathname.startsWith("/gymnastics")}
            open={openMenu === "gymnastics"}
            onToggle={toggleMenu}
            containerRef={(el) => { containerRefs.current["gymnastics"] = el; }}
            triggerRef={(el) => { triggerRefs.current["gymnastics"] = el; }}
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="4.5" r="2" />
                <path d="M12 6.5v6l-4 8M12 12.5l4 8M8 9.5l-3 2M16 9.5l3 2" />
              </svg>
            }
            label="Gymnastics"
            items={[
              { label: "Weekly Overview", href: "/gymnastics/weekly-overview" },
              { label: "Programme Resources", disabled: true },
              { label: "Coaching Guides", disabled: true },
            ]}
          />
          <NavDropdown
            id="operations"
            active={pathname.startsWith("/operations") || pathname.startsWith("/rota")}
            open={openMenu === "operations"}
            onToggle={toggleMenu}
            containerRef={(el) => { containerRefs.current["operations"] = el; }}
            triggerRef={(el) => { triggerRefs.current["operations"] = el; }}
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
            }
            label="Operations"
            items={[
              { label: "Rota", href: "/rota" },
              { label: "Site SOPs", href: "/operations/site-sops" },
            ]}
          />
          <NavDropdown
            id="people"
            active={pathname.startsWith("/people")}
            open={openMenu === "people"}
            onToggle={toggleMenu}
            containerRef={(el) => { containerRefs.current["people"] = el; }}
            triggerRef={(el) => { triggerRefs.current["people"] = el; }}
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              </svg>
            }
            label="People"
            items={[
              { label: "HR Links", disabled: true },
              { label: "My Compliance", disabled: true },
            ]}
          />
          {isAdmin && (
            <NavDropdown
              id="admin"
              active={pathname.startsWith("/admin")}
              open={openMenu === "admin"}
              onToggle={toggleMenu}
              containerRef={(el) => { containerRefs.current["admin"] = el; }}
              triggerRef={(el) => { triggerRefs.current["admin"] = el; }}
              icon={
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5Z" />
                </svg>
              }
              label="Admin"
              items={[{ label: "Users", href: "/admin/users" }]}
            />
          )}
          <NavLink href="/settings" active={pathname.startsWith("/settings")}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.96 19a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.04H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.96a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.04-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.56 1.04H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z" />
            </svg>
            Settings
          </NavLink>
        </div>
      </nav>
    </>
  );
}
