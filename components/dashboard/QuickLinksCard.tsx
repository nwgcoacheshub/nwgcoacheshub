const quickLinks = [
  {
    title: "Open BARS",
    subtitle: "Registers, payments, tracking",
    href: "#",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 4v16" />
      </svg>
    ),
  },
  {
    title: "ProActive",
    subtitle: "Membership platform",
    href: "#",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M3 3v18h18" />
        <path d="M7 14l3-4 4 3 5-6" />
      </svg>
    ),
  },
  {
    title: "British Gymnastics",
    subtitle: "Governing body",
    href: "#",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20" />
      </svg>
    ),
  },
];

export default function QuickLinksCard() {
  return (
    <div className="mb-5 overflow-hidden rounded-card border border-line bg-card shadow-card">
      <h4 className="border-b border-line px-[18px] py-[15px] text-sm font-bold text-ink">
        Quick links
      </h4>
      {quickLinks.map((link) => (
        <a
          key={link.title}
          href={link.href}
          className="flex items-center gap-3 border-b border-line px-[18px] py-3 last:border-b-0 hover:bg-background"
        >
          <span className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[9px] bg-background text-slate">
            {link.icon}
          </span>
          <div>
            <div className="text-[13.5px] font-semibold text-ink">{link.title}</div>
            <div className="text-[11.5px] text-slate-light">{link.subtitle}</div>
          </div>
          <span className="ml-auto text-slate-light">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 17 17 7M7 7h10v10" />
            </svg>
          </span>
        </a>
      ))}
    </div>
  );
}
