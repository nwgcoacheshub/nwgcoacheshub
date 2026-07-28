const rows = [
  { label: "Safeguarding", sub: "Expires 12 Mar 2027", pill: "Valid", pillClass: "bg-[#E6F5EC] text-status-green" },
  { label: "First Aid", sub: "Expires 28 Aug 2026", pill: "32 days", pillClass: "bg-[#FCF3DD] text-[#B07C0C]" },
  { label: "DBS", sub: "Renewal overdue", pill: "Action", pillClass: "bg-[#FDEAE0] text-[#C25218]" },
  { label: "CPD hours", sub: "6 of 12 this year", pill: "On track", pillClass: "bg-[#E6F5EC] text-status-green" },
];

export default function ComplianceCard() {
  return (
    <div className="mb-5 overflow-hidden rounded-card border border-line bg-card shadow-card">
      <h4 className="flex items-center justify-between border-b border-line px-[18px] py-[15px] text-sm font-bold text-ink">
        My compliance
        <a href="#" className="text-xs font-bold text-orange">
          View
        </a>
      </h4>
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between border-b border-line px-[18px] py-3 last:border-b-0"
        >
          <div>
            <div className="text-[13.5px] font-semibold text-ink">{row.label}</div>
            <div className="mt-[1px] text-[11.5px] text-slate-light">{row.sub}</div>
          </div>
          <span className={`whitespace-nowrap rounded-full px-[10px] py-1 text-[11px] font-bold ${row.pillClass}`}>
            {row.pill}
          </span>
        </div>
      ))}
    </div>
  );
}
