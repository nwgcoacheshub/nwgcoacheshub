const tiles = [
  {
    title: "Progression framework",
    description: 'Levels, stages and what "good" looks like at each step.',
    iconBg: "bg-orange",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
      </svg>
    ),
  },
  {
    title: "Awards scheme",
    description: "Badge criteria and how to assess & award.",
    iconBg: "bg-status-amber",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="8" r="6" />
        <path d="M8.2 13.9 7 22l5-3 5 3-1.2-8.1" />
      </svg>
    ),
  },
  {
    title: "Skill progressions",
    description: "Step-by-step drills & coaching points by skill.",
    iconBg: "bg-status-green",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 20V10M18 20V4M6 20v-4" />
      </svg>
    ),
  },
  {
    title: "Session resources",
    description: "Plan templates, station ideas and lesson structures.",
    iconBg: "bg-slate",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </svg>
    ),
  },
  {
    title: "Pre-school cycle",
    description: "All 9 themes, in order, with full packs.",
    iconBg: "bg-orange-light",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
  },
  {
    title: "Coaching masterclasses",
    description: "Technical video & CPD from the coaching team.",
    iconBg: "bg-slate-dark",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" />
      </svg>
    ),
  },
];

export default function ProgrammeTiles() {
  return (
    <>
      <div className="mb-3 ml-0.5 flex items-center gap-2 text-xs font-bold uppercase tracking-[1.2px] text-slate-light">
        Programme content
        <span className="h-px flex-1 bg-line" />
      </div>

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3">
        {tiles.map((tile) => (
          <a
            key={tile.title}
            href="#"
            className="block rounded-card border border-line bg-card p-[18px] shadow-card transition hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(40,48,56,.1)]"
          >
            <div className={`mb-3.5 flex h-[42px] w-[42px] items-center justify-center rounded-[11px] text-white ${tile.iconBg}`}>
              {tile.icon}
            </div>
            <h4 className="mb-[3px] text-[15px] font-bold text-ink">{tile.title}</h4>
            <p className="text-[12.5px] leading-[1.45] text-slate-light">{tile.description}</p>
          </a>
        ))}
      </div>
    </>
  );
}
