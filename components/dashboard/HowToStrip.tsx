type Status = "Published" | "Draft" | "Not written";

const statusClasses: Record<Status, string> = {
  Published: "bg-[#E6F5EC] text-status-green",
  Draft: "bg-[#FCF3DD] text-[#B07C0C]",
  "Not written": "bg-[#EEF0F2] text-status-grey",
};

function StatusPill({ status }: { status: Status }) {
  return (
    <span className={`whitespace-nowrap rounded-full px-[9px] py-[3px] text-[10.5px] font-bold tracking-[0.3px] ${statusClasses[status]}`}>
      {status}
    </span>
  );
}

const columns: {
  title: string;
  subtitle: string;
  iconBg: string;
  icon: React.ReactNode;
  rows: { name: string; status: Status }[];
}[] = [
  {
    title: "BARS how-tos",
    subtitle: "Doing it in the system",
    iconBg: "bg-orange",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 10h18M8 4v16" />
      </svg>
    ),
    rows: [
      { name: "Take a register", status: "Published" },
      { name: "Record an award", status: "Published" },
      { name: "Move a gymnast / group change", status: "Draft" },
      { name: "Check a waiting list", status: "Not written" },
    ],
  },
  {
    title: "Other systems",
    subtitle: "Rota, comms, incident tool",
    iconBg: "bg-slate",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
    rows: [
      { name: "View your rota", status: "Published" },
      { name: "Log an incident / injury", status: "Published" },
      { name: "Request time off", status: "Draft" },
      { name: "Book onto a CPD course", status: "Not written" },
    ],
  },
  {
    title: "Off-system processes",
    subtitle: "No software — how we do it",
    iconBg: "bg-status-green",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 7h-9M14 17H5M17 14l3 3-3 3M7 4 4 7l3 3" />
      </svg>
    ),
    rows: [
      { name: "Open & close the gym", status: "Published" },
      { name: "Equipment safety checks", status: "Published" },
      { name: "Handle a parent at the desk", status: "Draft" },
      { name: "What to do if a gymnast is hurt", status: "Published" },
    ],
  },
];

export default function HowToStrip() {
  return (
    <div className="mt-[30px]">
      <div className="mb-3 ml-0.5 flex items-center gap-2 text-xs font-bold uppercase tracking-[1.2px] text-slate-light">
        How do I…?
        <span className="h-px flex-1 bg-line" />
      </div>

      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-3">
        {columns.map((col) => (
          <div key={col.title} className="overflow-hidden rounded-card border border-line bg-card shadow-card">
            <div className="flex items-center gap-2.5 border-b border-line px-[18px] py-[15px]">
              <div className={`flex h-9 w-9 items-center justify-center rounded-[9px] text-white ${col.iconBg}`}>
                {col.icon}
              </div>
              <div>
                <div className="text-[14.5px] font-bold text-ink">{col.title}</div>
                <div className="text-[11.5px] text-slate-light">{col.subtitle}</div>
              </div>
            </div>
            {col.rows.map((row) => (
              <a
                key={row.name}
                href="#"
                className="flex items-center justify-between gap-2.5 border-b border-line px-[18px] py-[11px] last:border-b-0 hover:bg-background"
              >
                <span className="text-[13px] font-semibold text-ink">{row.name}</span>
                <StatusPill status={row.status} />
              </a>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
